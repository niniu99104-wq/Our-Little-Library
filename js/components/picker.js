/** 選擇書籍的視窗：從家中藏書搜尋 */
import { getBooks } from '../data.js?v=2.0.1';
import { esc } from '../utils/format.js?v=2.0.1';
import { matchesQuery } from './book-grid.js?v=2.0.1';

/**
 * @param {{ shelf?: string, title?: string, exclude?: string[] }} opts
 * @returns {Promise<{work_id, title} | null>}
 */
export async function pickBook({ shelf = '', title = '選擇書籍', exclude = [] } = {}) {
  const { books } = await getBooks();
  const skip = new Set(exclude);
  const pool = books.filter((b) => !skip.has(b.work_id));
  return new Promise((resolve) => {
    const dlg = document.createElement('dialog');
    dlg.className = 'dialog dialog-picker';
    dlg.innerHTML = `
      <p class="dialog-title">${esc(title)}</p>
      <input class="input" type="search" placeholder="搜尋書名、作者或 ISBN" autocomplete="off">
      ${shelf ? `<label class="check"><input type="checkbox" checked data-only-shelf><span>只顯示這個書房的書</span></label>` : ''}
      <ul class="pick-list"></ul>
      <div class="dialog-actions"><button type="button" class="btn btn-text" data-act="cancel">取消</button></div>`;
    document.body.appendChild(dlg);
    const list = dlg.querySelector('.pick-list');
    const q = dlg.querySelector('input[type=search]');
    const only = dlg.querySelector('[data-only-shelf]');
    const draw = () => {
      let items = pool;
      if (shelf && only?.checked) {
        items = items.filter((b) => (shelf === 'FAMILY' ? b.owners.includes('FAMILY') : b.shelf_ids.includes(shelf)));
      }
      items = items.filter((b) => matchesQuery(b, q.value)).slice(0, 60);
      list.innerHTML = items.length
        ? items.map((b) => `<li><button type="button" class="pick-item" data-id="${esc(b.work_id)}"><span>${esc(b.title)}</span><span class="hint">${esc(b.authors)}</span></button></li>`).join('')
        : '<li class="hint" style="padding:12px 0">找不到符合的書。可以先到「新增書籍」建檔。</li>';
    };
    const done = (v) => { dlg.close(); dlg.remove(); resolve(v); };
    q.addEventListener('input', draw);
    only?.addEventListener('change', draw);
    dlg.addEventListener('click', (e) => {
      const it = e.target.closest('.pick-item');
      if (it) {
        const b = pool.find((x) => x.work_id === it.dataset.id);
        done({ work_id: b.work_id, title: b.title });
      }
      if (e.target.closest('[data-act=cancel]')) done(null);
    });
    dlg.addEventListener('cancel', (e) => { e.preventDefault(); done(null); });
    draw();
    dlg.showModal();
    q.focus();
  });
}

/** 表單中的書籍欄位：按「選擇書籍」開啟視窗 */
export function bindBookPickers(form, onChange) {
  form.addEventListener('click', async (e) => {
    const pickBtn = e.target.closest('[data-pick-book]');
    const clearBtn = e.target.closest('[data-clear-book]');
    if (pickBtn) {
      const name = pickBtn.dataset.pickBook;
      const res = await pickBook({ shelf: pickBtn.dataset.shelf });
      if (!res) return;
      form.elements[name].value = res.work_id;
      form.querySelector(`[data-pick-title="${CSS.escape(name)}"]`).textContent = res.title;
      pickBtn.textContent = '更換';
      form.querySelector(`[data-clear-book="${CSS.escape(name)}"]`)?.removeAttribute('hidden');
      onChange?.(name, res);
    }
    if (clearBtn) {
      const name = clearBtn.dataset.clearBook;
      form.elements[name].value = '';
      form.querySelector(`[data-pick-title="${CSS.escape(name)}"]`).textContent = '尚未選擇';
      clearBtn.hidden = true;
      onChange?.(name, null);
    }
  });
}
