/** 登入頁 */
import { api } from '../api.js?v=2.0.1';
import { saveSession, isLoggedIn } from '../auth.js?v=2.0.1';
import { go } from '../router.js?v=2.0.1';
import { setBusy } from '../ui.js?v=2.0.1';

function deviceNote() {
  const ua = navigator.userAgent;
  const device = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Macintosh/.test(ua) ? 'Mac' : /Android/.test(ua) ? 'Android' : /Windows/.test(ua) ? 'Windows' : '其他裝置';
  const browser = /CriOS|Chrome/.test(ua) ? 'Chrome' : /Safari/.test(ua) ? 'Safari' : /Firefox/.test(ua) ? 'Firefox' : '瀏覽器';
  return `${device} ${browser}`;
}

function safeNext(next) {
  // 只允許站內路徑，避免被導到外部網站
  return next && /^\/[a-z0-9/_-]*$/i.test(next) && next !== '/login' ? next : '/home';
}

export function mount(view, { query }) {
  if (isLoggedIn()) { go(safeNext(query.get('next'))); return; }

  view.innerHTML = `
    <section class="login">
      <h1 class="login-mark">Our Little<br>Library</h1>
      <p class="login-tagline">Every book holds a piece of our story.</p>
      <form id="login-form" novalidate>
        <label class="field">
          <span class="field-label">帳號</span>
          <input class="input" name="username" autocomplete="username" autocapitalize="none" spellcheck="false" required>
        </label>
        <label class="field">
          <span class="field-label">密碼</span>
          <input class="input" name="password" type="password" autocomplete="current-password" required>
        </label>
        <label class="check">
          <input type="checkbox" name="remember" checked>
          <span>記住此裝置 30 天</span>
        </label>
        <p class="form-error" id="login-error" role="alert"></p>
        <button class="btn btn-primary btn-block" type="submit">登入</button>
      </form>
    </section>`;

  const form = view.querySelector('#login-form');
  const errorEl = view.querySelector('#login-error');
  form.username.focus();

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorEl.textContent = '';
    const username = form.username.value.trim();
    const password = form.password.value;
    if (!username || !password) {
      errorEl.textContent = '請輸入帳號和密碼。';
      return;
    }
    const remember = form.remember.checked;
    const restore = setBusy(form.querySelector('button[type=submit]'), '登入中…');
    try {
      // 登入不自動重試，避免網路不穩時被多算一次失敗次數
      const result = await api('auth.login', { username, password, remember, device_note: deviceNote() }, { retry: false });
      saveSession(result, remember);
      go(safeNext(query.get('next')));
    } catch (err) {
      errorEl.textContent = err.message;
      form.password.value = '';
      form.password.focus();
      restore();
    }
  });
}
