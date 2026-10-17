/**
 * 私人照片：上傳前在手機上先壓縮，顯示時帶登入憑證向 API 取得
 * 照片不會產生公開網址，也不會存進瀏覽器的長期儲存空間。
 */
import { api } from '../api.js?v=2.0.1';
import { write } from '../data.js?v=2.0.1';
import { esc } from '../utils/format.js?v=2.0.1';
import { toast } from '../ui.js?v=2.0.1';

const cache = new Map(); // file_id → data URL（只存在這次開啟網站的記憶體中）
const pending = new Set();

/** 縮小到長邊 1600px、JPEG 品質 0.82，通常約 200 至 400KB */
export async function compressImage(file, maxSide = 1600) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error('無法讀取這張照片，請換一張或改用 JPEG 格式。'));
      i.src = url;
    });
    const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.round(img.naturalWidth * scale), h = Math.round(img.naturalHeight * scale);
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    canvas.getContext('2d').drawImage(img, 0, 0, w, h);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.82);
    return { mime: 'image/jpeg', data: dataUrl.split(',')[1], dataUrl };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function uploadImage(file, kind) {
  const img = await compressImage(file);
  const { file_id } = await write('files.upload', { kind, mime: img.mime, data: img.data });
  cache.set(file_id, img.dataUrl);
  return file_id;
}

/** 把容器中所有 [data-file-id] 的圖片載入 */
export async function loadImages(root) {
  const els = Array.from(root.querySelectorAll('img[data-file-id]'));
  els.forEach((el) => { const hit = cache.get(el.dataset.fileId); if (hit) el.src = hit; });
  const need = [...new Set(els.map((el) => el.dataset.fileId).filter((id) => id && !cache.has(id) && !pending.has(id)))];
  for (let i = 0; i < need.length; i += 12) {
    const batch = need.slice(i, i + 12);
    batch.forEach((id) => pending.add(id));
    try {
      const { files } = await api('files.get', { file_ids: batch });
      Object.entries(files).forEach(([id, url]) => { if (url) cache.set(id, url); });
    } catch { /* 圖片讀取失敗時保留空白，不影響其他內容 */ }
    batch.forEach((id) => pending.delete(id));
  }
  root.querySelectorAll('img[data-file-id]').forEach((el) => {
    const hit = cache.get(el.dataset.fileId);
    if (hit) el.src = hit;
    else el.closest('.photo-thumb')?.classList.add('is-missing');
  });
}

export function photoThumbs(ids = []) {
  const list = (Array.isArray(ids) ? ids : String(ids).split(',')).filter(Boolean);
  if (!list.length) return '';
  return `<div class="photo-grid">${list.map((id) => `<span class="photo-thumb"><img data-file-id="${esc(id)}" alt=""></span>`).join('')}</div>`;
}

/** 表單中的照片欄位 */
export function bindPhotoFields(form) {
  form.querySelectorAll('[data-photos]').forEach((box) => {
    const hidden = box.querySelector('input[type=hidden]');
    const list = box.querySelector('.photo-list');
    const fileInput = box.querySelector('input[type=file]');
    const kind = box.dataset.kind;
    const ids = () => hidden.value.split(',').filter(Boolean);
    const draw = () => {
      list.innerHTML = ids().map((id) => `
        <span class="photo-thumb"><img data-file-id="${esc(id)}" alt=""><button type="button" class="photo-remove" data-remove="${esc(id)}" aria-label="移除這張照片">×</button></span>`).join('');
      loadImages(list);
    };
    list.addEventListener('click', async (e) => {
      const id = e.target.closest('[data-remove]')?.dataset.remove;
      if (!id) return;
      hidden.value = ids().filter((x) => x !== id).join(',');
      draw();
      try { await write('files.delete', { file_id: id }); } catch { /* 已從表單移除；檔案可之後再清理 */ }
    });
    fileInput.addEventListener('change', async () => {
      const files = Array.from(fileInput.files || []);
      fileInput.value = '';
      const label = box.querySelector('.photo-add span');
      for (const f of files) {
        label.textContent = '上傳中…';
        try {
          const id = await uploadImage(f, kind);
          // 單張照片欄位（例如封面）：新照片取代舊照片
          if (box.dataset.single) {
            const old = ids();
            hidden.value = id;
            old.forEach((x) => write('files.delete', { file_id: x }).catch(() => {}));
          } else {
            hidden.value = [...ids(), id].join(',');
          }
          draw();
        } catch (err) {
          toast(err.message, { error: true });
        }
      }
      label.textContent = '加入照片';
    });
    draw();
  });
}
