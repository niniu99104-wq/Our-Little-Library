/**
 * 井字號路由：#/home、#/shelves/MEM-XXXX、#/login?next=...
 * GitHub Pages 不需要額外設定，重新整理也不會找不到頁面。
 */
import { isLoggedIn } from './auth.js';

const routes = [];

export function route(pattern, load, { public: isPublic = false, nav } = {}) {
  // pattern 例如 '/shelves/:id'
  const keys = [];
  const re = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '$');
  routes.push({ re, keys, load, isPublic, nav });
}

export function parseHash() {
  const raw = location.hash.replace(/^#/, '') || '/home';
  const [path, query = ''] = raw.split('?');
  return { path, query: new URLSearchParams(query) };
}

export function go(path) {
  if (location.hash === '#' + path) render();
  else location.hash = path;
}

let currentCleanup = null;
let renderSeq = 0;

export async function render() {
  const seq = ++renderSeq;
  const { path, query } = parseHash();
  const match = routes.map((r) => ({ r, m: r.re.exec(path) })).find((x) => x.m);
  const view = document.getElementById('view');

  if (!match) { go('/home'); return; }
  const { r, m } = match;

  if (!r.isPublic && !isLoggedIn()) {
    go('/login?next=' + encodeURIComponent(path));
    return;
  }

  const params = {};
  r.keys.forEach((k, i) => { params[k] = decodeURIComponent(m[i + 1]); });

  document.body.classList.toggle('is-auth', r.isPublic);
  document.body.classList.remove('is-booting');
  document.querySelectorAll('[data-nav]').forEach((a) => {
    if (a.dataset.nav === r.nav) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });

  if (typeof currentCleanup === 'function') currentCleanup();
  currentCleanup = null;
  view.removeAttribute('data-theme');

  const page = await r.load();
  if (seq !== renderSeq) return; // 使用者已經切換到別頁
  view.innerHTML = '';
  window.scrollTo(0, 0);
  currentCleanup = page.mount(view, { params, query, isCurrent: () => seq === renderSeq });
}
