/** 網站啟動與頁面註冊 */
import { route, render, go, parseHash } from './router.js?v=2.0.0';
import { forgetAll } from './store.js?v=2.0.0';
import { toast } from './ui.js?v=2.0.0';
import { VERSION } from './version.js?v=2.0.0';

route('/login', () => import('./pages/login.js?v=2.0.0'), { public: true });
route('/home', () => import('./pages/home.js?v=2.0.0'), { nav: 'home' });
route('/shelves', () => import('./pages/shelves.js?v=2.0.0'), { nav: 'shelves' });
route('/shelves/:id', () => import('./pages/shelf.js?v=2.0.0'), { nav: 'shelves' });
// 同一個表單頁面，依網址決定是新增書籍、編輯作品、版本或收藏
const bookForm = (mode) => () => import('./pages/book-form.js?v=2.0.0').then((m) => ({
  mount: (view, opts) => m.mount(view, { ...opts, params: { ...opts.params, mode } })
}));
route('/library', () => import('./pages/library.js?v=2.0.0'), { nav: 'shelves' });
route('/book/:id', () => import('./pages/book.js?v=2.0.0'), { nav: 'shelves' });
route('/add', bookForm('add'), { nav: 'add' });
route('/book/:id/edit', bookForm('edit-work'), { nav: 'shelves' });
route('/book/:id/edition/new', bookForm('add-edition'), { nav: 'shelves' });
route('/book/:id/edition/:eid/edit', bookForm('edit-edition'), { nav: 'shelves' });
route('/book/:id/edition/:eid/copy/new', bookForm('add-copy'), { nav: 'shelves' });
route('/book/:id/copy/:cid/edit', bookForm('edit-copy'), { nav: 'shelves' });
route('/settings/taxonomy', () => import('./pages/taxonomy.js?v=2.0.0'), { nav: 'me' });
route('/members/new', () => import('./pages/member-form.js?v=2.0.0'), { nav: 'me' });
route('/members/:id/edit', () => import('./pages/member-form.js?v=2.0.0'), { nav: 'me' });
route('/trash', () => import('./pages/trash.js?v=2.0.0'), { nav: 'me' });
// 一個檔案裡有多個頁面時，指定要用哪一個
const page = (file, fn) => () => import(`${file}?v=${VERSION}`).then((m) => ({ mount: m[fn] }));
route('/wishlist', page('./pages/wishlist.js', 'listMount'), { nav: 'wishlist' });
route('/wishlist/new', page('./pages/wishlist.js', 'formMount'), { nav: 'wishlist' });
route('/wishlist/:id', page('./pages/wishlist.js', 'detailMount'), { nav: 'wishlist' });
route('/wishlist/:id/edit', page('./pages/wishlist.js', 'formMount'), { nav: 'wishlist' });
route('/wishlist/:id/buy', page('./pages/wishlist.js', 'buyMount'), { nav: 'wishlist' });
route('/journal', page('./pages/journal.js', 'listMount'), { nav: 'journal' });
route('/journal/new', page('./pages/journal.js', 'formMount'), { nav: 'journal' });
route('/journal/:id/edit', page('./pages/journal.js', 'formMount'), { nav: 'journal' });
route('/reading/:id', () => import('./pages/reading-room.js?v=2.0.0'), { nav: 'shelves' });
route('/plans', page('./pages/plans.js', 'yearMount'), { nav: 'plans' });
route('/plans/:member/:year/:month', page('./pages/plans.js', 'monthMount'), { nav: 'plans' });
route('/kids/:id', () => import('./pages/kids.js?v=2.0.0'), { nav: 'shelves' });
route('/activities', page('./pages/activities.js', 'listMount'), { nav: 'activities' });
route('/activities/new', page('./pages/activities.js', 'formMount'), { nav: 'activities' });
route('/activities/:id', page('./pages/activities.js', 'detailMount'), { nav: 'activities' });
route('/activities/:id/edit', page('./pages/activities.js', 'formMount'), { nav: 'activities' });
route('/recipes', page('./pages/recipes.js', 'listMount'), { nav: 'recipes' });
route('/recipes/new', page('./pages/recipes.js', 'formMount'), { nav: 'recipes' });
route('/recipes/:id', page('./pages/recipes.js', 'detailMount'), { nav: 'recipes' });
route('/recipes/:id/edit', page('./pages/recipes.js', 'formMount'), { nav: 'recipes' });
route('/budget', () => import('./pages/budget.js?v=2.0.0'), { nav: 'budget' });
route('/insights', () => import('./pages/insights.js?v=2.0.0'), { nav: 'insights' });
route('/import', () => import('./pages/import.js?v=2.0.0'), { nav: 'me' });
route('/me', () => import('./pages/me.js?v=2.0.0'), { nav: 'me' });

window.addEventListener('hashchange', render);

// 手機底部的「＋」：選擇要新增什麼
document.querySelector('.nav-add').addEventListener('click', (e) => {
  if (window.matchMedia('(min-width: 1024px)').matches) return; // 電腦版側欄另有個別連結
  e.preventDefault();
  const dlg = document.createElement('dialog');
  dlg.className = 'dialog sheet';
  dlg.innerHTML = `
    <p class="dialog-title">要新增什麼？</p>
    <nav class="sheet-list">
      <a href="#/add">新增書籍</a>
      <a href="#/journal/new">新增閱讀紀錄</a>
      <a href="#/wishlist/new">加入願望清單</a>
      <a href="#/import">批次匯入藏書</a>
    </nav>
    <div class="dialog-actions"><button type="button" class="btn btn-text">取消</button></div>`;
  document.body.appendChild(dlg);
  const close = () => { dlg.close(); dlg.remove(); };
  dlg.addEventListener('click', (ev) => { if (ev.target.closest('a, button') || ev.target === dlg) close(); });
  dlg.addEventListener('cancel', close);
  dlg.showModal();
});

// 任何 API 回報登入失效時，回到登入頁，登入後回到原本頁面
window.addEventListener('auth:expired', (e) => {
  forgetAll();
  const { path } = parseHash();
  if (path === '/login') return;
  toast(e.detail || '登入已失效，請重新登入。', { error: true });
  go('/login?next=' + encodeURIComponent(path));
});

render();
checkForUpdate();

/**
 * 檢查網站是否有新版本
 * 每次開啟時讀取 version.json（不使用暫存），版本不同就顯示更新提示。
 */
async function checkForUpdate() {
  try {
    const res = await fetch(`version.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) return;
    const latest = await res.json();
    if (latest.version && latest.version !== VERSION) showUpdateBar(latest);
  } catch { /* 離線時不檢查 */ }
}

function showUpdateBar(latest) {
  const bar = document.createElement('div');
  bar.className = 'update-bar';
  bar.setAttribute('role', 'status');
  bar.innerHTML = `<span>網站有新版本 ${latest.version}</span><button type="button" class="btn">立即更新</button>`;
  bar.querySelector('button').addEventListener('click', async (e) => {
    e.target.disabled = true;
    e.target.textContent = '更新中…';
    // 重新下載首頁與所有程式檔案，取代瀏覽器裡的舊檔案
    const urls = ['./', 'index.html', ...(latest.files || []).map((f) => `${f}?v=${latest.version}`)];
    await Promise.allSettled(urls.map((u) => fetch(u, { cache: 'reload' })));
    location.reload();
  });
  document.body.appendChild(bar);
}
