/**
 * ISBN 條碼掃描
 *
 * 使用手機鏡頭即時掃描；辨識在手機上進行，畫面不會上傳到任何地方。
 * 掃描程式庫只在第一次使用時才下載（ZXing，開源免費）。
 * 瀏覽器不允許使用鏡頭時，改成拍一張條碼照片來辨識。
 */
const ZXING_URL = 'https://unpkg.com/@zxing/library@0.23.0/umd/index.min.js';
let loading = null;

function loadZxing() {
  if (window.ZXing) return Promise.resolve(window.ZXing);
  if (!loading) {
    loading = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = ZXING_URL;
      s.onload = () => resolve(window.ZXing);
      s.onerror = () => { loading = null; reject(new Error('掃描工具下載失敗，請確認網路，或直接輸入 ISBN。')); };
      document.head.appendChild(s);
    });
  }
  return loading;
}

function readerFor(ZXing) {
  const hints = new Map();
  hints.set(ZXing.DecodeHintType.POSSIBLE_FORMATS, [ZXing.BarcodeFormat.EAN_13, ZXing.BarcodeFormat.EAN_8, ZXing.BarcodeFormat.UPC_A]);
  return new ZXing.BrowserMultiFormatReader(hints);
}

const isIsbn = (t) => /^(97[89])\d{10}$/.test(t);

/** 開啟掃描視窗，回傳 ISBN 字串或 null */
export async function scanIsbn() {
  const ZXing = await loadZxing();
  return new Promise((resolve) => {
    const dlg = document.createElement('dialog');
    dlg.className = 'dialog dialog-scan';
    dlg.innerHTML = `
      <p class="dialog-title">掃描書背的 ISBN 條碼</p>
      <div class="scan-view"><video playsinline muted></video><span class="scan-frame" aria-hidden="true"></span></div>
      <p class="hint" id="scan-msg">把條碼放進框內，保持穩定。</p>
      <div class="dialog-actions">
        <label class="btn btn-text"><input type="file" accept="image/*" capture="environment" hidden><span>改用拍照</span></label>
        <button type="button" class="btn" data-act="cancel">取消</button>
      </div>`;
    document.body.appendChild(dlg);
    const video = dlg.querySelector('video');
    const msg = dlg.querySelector('#scan-msg');
    const reader = readerFor(ZXing);
    let finished = false;
    const done = (v) => {
      if (finished) return;
      finished = true;
      try { reader.reset(); } catch { /* 忽略 */ }
      dlg.close(); dlg.remove(); resolve(v);
    };
    reader.decodeFromConstraints({ video: { facingMode: 'environment' } }, video, (result) => {
      const t = result?.getText?.();
      if (t && isIsbn(t)) done(t);
      else if (t) msg.textContent = '這不是 ISBN 條碼（應以 978 或 979 開頭），請掃描書背上方的條碼。';
    }).catch(() => { msg.textContent = '無法開啟鏡頭，請允許使用相機，或按「改用拍照」。'; });

    dlg.querySelector('input[type=file]').addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      msg.textContent = '辨識中…';
      const url = URL.createObjectURL(file);
      try {
        const r = await readerFor(ZXing).decodeFromImageUrl(url);
        const t = r.getText();
        if (isIsbn(t)) done(t);
        else msg.textContent = '這不是 ISBN 條碼，請再拍一次書背上方的條碼。';
      } catch {
        msg.textContent = '看不清楚條碼，請靠近一點、避免反光後再拍一次。';
      } finally {
        URL.revokeObjectURL(url);
      }
    });
    dlg.querySelector('[data-act=cancel]').addEventListener('click', () => done(null));
    dlg.addEventListener('cancel', (e) => { e.preventDefault(); done(null); });
    dlg.showModal();
  });
}
