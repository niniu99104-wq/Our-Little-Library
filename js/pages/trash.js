/** 回收桶：被刪除的書與收藏，可以還原 */
import { api } from '../api.js';
import { write, booksChanged } from '../data.js';
import { esc, formatDate } from '../utils/format.js';
import { toast, setBusy, errorView, skeletonLines } from '../ui.js';

export function mount(view, { isCurrent }) {
  view.innerHTML = `
    <p class="crumb"><a href="#/me">我的</a></p>
    <header class="page-head"><div><h1 class="page-title">回收桶</h1><p class="page-sub">Nothing is ever really lost.</p></div></header>
    <div id="trash-body">${skeletonLines(4, 40)}</div>`;
  const body = view.querySelector('#trash-body');

  const load = async () => {
    try {
      const { items } = await api('trash.list');
      if (!isCurrent()) return;
      if (!items.length) {
        body.innerHTML = '<div class="empty"><p class="empty-text">回收桶是空的。</p></div>';
        return;
      }
      body.innerHTML = `<ul class="list">${items.map((it) => `
        <li class="list-row">
          <span class="list-name">${esc(it.title)}
            <span class="hint" style="display:block">${it.kind === 'work' ? '整本書' : `一筆收藏${it.detail ? `（${esc(it.detail)}）` : ''}`}，${esc(formatDate(it.deleted_at))} 刪除</span>
          </span>
          <span class="list-actions"><button type="button" class="btn" data-kind="${it.kind}" data-id="${esc(it.id)}">還原</button></span>
        </li>`).join('')}</ul>`;
    } catch (err) {
      if (!isCurrent() || err.code === 'AUTH_REQUIRED') return;
      body.innerHTML = '';
      body.appendChild(errorView(err, load));
    }
  };

  body.addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-kind]');
    if (!btn) return;
    const restore = setBusy(btn, '還原中…');
    try {
      const res = btn.dataset.kind === 'work'
        ? await write('books.restore', { work_id: btn.dataset.id }, [booksChanged])
        : await write('copies.restore', { copy_id: btn.dataset.id }, [booksChanged]);
      toast(`已還原《${res.work.title}》`);
      load();
    } catch (err) {
      restore();
      toast(err.message, { error: true });
    }
  });

  load();
}
