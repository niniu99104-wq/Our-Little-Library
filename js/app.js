/** 網站啟動與頁面註冊 */
import { route, render, go, parseHash } from './router.js';
import { forgetAll } from './store.js';
import { toast } from './ui.js';

route('/login', () => import('./pages/login.js'), { public: true });
route('/home', () => import('./pages/home.js'), { nav: 'home' });
route('/shelves', () => import('./pages/shelves.js'), { nav: 'shelves' });
route('/shelves/:id', () => import('./pages/shelf.js'), { nav: 'shelves' });
route('/add', () => import('./pages/pending.js').then((m) => m.addPage), { nav: 'add' });
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
