/** 共用介面工具：提示訊息、按鈕狀態、確認視窗、錯誤畫面 */
import { esc } from './utils/format.js?v=2.0.0';

let toastTimer;

export function toast(message, { error = false } = {}) {
  const el = document.getElementById('toast');
  el.textContent = message;
  el.classList.toggle('is-error', error);
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), error ? 5000 : 2600);
}

/** 按鈕進入「處理中」狀態，回傳還原函式。處理中按鈕不可再按，避免重複送出。 */
export function setBusy(button, busyText) {
  const original = button.textContent;
  button.disabled = true;
  button.setAttribute('aria-busy', 'true');
  button.textContent = busyText;
  return () => {
    button.disabled = false;
    button.removeAttribute('aria-busy');
    button.textContent = original;
  };
}

/** 二次確認視窗，回傳 Promise<boolean> */
export function confirmDialog({ title, text, confirmText = '確定', danger = false }) {
  return new Promise((resolve) => {
    const dlg = document.createElement('dialog');
    dlg.className = 'dialog';
    dlg.innerHTML = `
      <p class="dialog-title">${esc(title)}</p>
      <p class="dialog-text">${esc(text)}</p>
      <div class="dialog-actions">
        <button type="button" class="btn btn-text" data-act="cancel">取消</button>
        <button type="button" class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-act="ok">${esc(confirmText)}</button>
      </div>`;
    document.body.appendChild(dlg);
    const done = (value) => { dlg.close(); dlg.remove(); resolve(value); };
    dlg.addEventListener('click', (e) => {
      const act = e.target.closest('[data-act]')?.dataset.act;
      if (act) done(act === 'ok');
    });
    dlg.addEventListener('cancel', (e) => { e.preventDefault(); done(false); });
    dlg.showModal();
  });
}

/** 讀取失敗時的畫面，附重試按鈕 */
export function errorView(err, onRetry) {
  const wrap = document.createElement('div');
  wrap.className = 'error-box';
  wrap.innerHTML = `<p>${esc(err.message || '讀取失敗。')}</p><button type="button" class="btn">重新讀取</button>`;
  wrap.querySelector('button').addEventListener('click', onRetry);
  return wrap;
}

export function skeletonLines(count = 3, height = 20) {
  return Array.from({ length: count }, () =>
    `<span class="skeleton" style="height:${height}px;margin-bottom:12px"></span>`).join('');
}
