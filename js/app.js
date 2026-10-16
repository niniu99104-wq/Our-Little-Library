/** 網站啟動與頁面註冊 */
import { route, render, go, parseHash } from './router.js';
import { forgetAll } from './store.js';
import { toast } from './ui.js';

route('/login', () => import('./pages/login.js'), { public: true });
route('/home', () => import('./pages/home.js'), { nav: 'home' });
route('/shelves', () => import('./pages/shelves.js'), { nav: 'shelves' });
route('/shelves/:id', () => import('./pages/shelf.js'), { nav: 'shelves' });
// 同一個表單頁面，依網址決定是新增書籍、編輯作品、版本或收藏
const bookForm = (mode) => () => import('./pages/book-form.js').then((m) => ({
  mount: (view, opts) => m.mount(view, { ...opts, params: { ...opts.params, mode } })
}));
route('/library', () => import('./pages/library.js'), { nav: 'shelves' });
route('/book/:id', () => import('./pages/book.js'), { nav: 'shelves' });
route('/add', bookForm('add'), { nav: 'add' });
route('/book/:id/edit', bookForm('edit-work'), { nav: 'shelves' });
route('/book/:id/edition/new', bookForm('add-edition'), { nav: 'shelves' });
route('/book/:id/edition/:eid/edit', bookForm('edit-edition'), { nav: 'shelves' });
route('/book/:id/edition/:eid/copy/new', bookForm('add-copy'), { nav: 'shelves' });
route('/book/:id/copy/:cid/edit', bookForm('edit-copy'), { nav: 'shelves' });
route('/settings/taxonomy', () => import('./pages/taxonomy.js'), { nav: 'me' });
route('/members/new', () => import('./pages/member-form.js'), { nav: 'me' });
route('/members/:id/edit', () => import('./pages/member-form.js'), { nav: 'me' });
route('/trash', () => import('./pages/trash.js'), { nav: 'me' });
route('/wishlist', () => import('./pages/pending.js').then((m) => m.wishlistPage), { nav: 'wishlist' });
route('/me', () => import('./pages/me.js'), { nav: 'me' });

window.addEventListener('hashchange', render);

// 任何 API 回報登入失效時，回到登入頁，登入後回到原本頁面
window.addEventListener('auth:expired', (e) => {
  forgetAll();
  const { path } = parseHash();
  if (path === '/login') return;
  toast(e.detail || '登入已失效，請重新登入。', { error: true });
  go('/login?next=' + encodeURIComponent(path));
});

render();
