/** 我的：帳號、家庭成員、修改密碼、登出 */
import { api } from '../api.js';
import { getSession, clearSession } from '../auth.js';
import { go } from '../router.js';
import { forgetAll, recall, remember } from '../store.js';
import { esc, formatDate } from '../utils/format.js';
import { formatAge } from '../utils/age.js';
import { toast, setBusy, confirmDialog, errorView, skeletonLines } from '../ui.js';

const ROLE_LABEL = { admin: '管理員', member: '一般成員' };
const THEMES = new Set(['liam', 'mom', 'dad', 'family']);

function peopleList(members, today) {
  if (!members.length) return '<div class="empty"><p class="empty-text">還沒有家庭成員資料。</p></div>';
  return `<ul class="people">${members.map((m) => {
    const theme = THEMES.has(m.theme_key) ? m.theme_key : 'family';
    const age = m.birth_date ? formatAge(m.birth_date, today) : '';
    return `
      <li class="person" data-theme="${theme}">
        <span class="person-dot" aria-hidden="true"></span>
        <span>
          <span class="person-name">${esc(m.nickname || m.name_zh)}${m.name_en ? ` <span class="hint">${esc(m.name_en)}</span>` : ''}</span>
          <span class="person-shelf">${esc(m.shelf_name)}</span>
        </span>
        <span class="person-age">
          ${age ? `<strong>${esc(age)}</strong>${esc(formatDate(m.birth_date))}` : (m.birth_date ? '' : '未填生日')}
        </span>
      </li>`;
  }).join('')}</ul>
  <p class="hint" style="margin-top:12px">成員資料目前在試算表「Members」分頁修改，網站上的編輯功能會在下一個步驟加入。</p>`;
}

export function mount(view, { isCurrent }) {
  const session = getSession();
  const account = session?.account || {};

  view.innerHTML = `
    <header style="margin-bottom:8px">
      <h1 class="page-title">我的</h1>
      <p class="page-sub">The keeper of the shelves.</p>
    </header>

    <section class="section" aria-labelledby="acc-title">
      <div class="section-head"><h2 class="section-title" id="acc-title">帳號</h2></div>
      <div class="account-line"><span>帳號</span><span>${esc(account.username || '')}</span></div>
      <div class="account-line"><span>角色</span><span>${esc(ROLE_LABEL[account.role] || account.role || '')}</span></div>
    </section>

    <section class="section" aria-labelledby="people-title">
      <div class="section-head"><h2 class="section-title" id="people-title">家庭成員</h2></div>
      <div id="people">${skeletonLines(3, 40)}</div>
    </section>

    <section class="section" aria-labelledby="pw-title">
      <div class="section-head"><h2 class="section-title" id="pw-title">修改密碼</h2></div>
      <form id="pw-form" class="form-narrow" novalidate>
        <label class="field">
          <span class="field-label">目前密碼</span>
          <input class="input" type="password" name="old" autocomplete="current-password">
        </label>
        <label class="field">
          <span class="field-label">新密碼（至少 8 個字元）</span>
          <input class="input" type="password" name="new1" autocomplete="new-password">
        </label>
        <label class="field">
          <span class="field-label">再輸入一次新密碼</span>
          <input class="input" type="password" name="new2" autocomplete="new-password">
        </label>
        <p class="form-error" id="pw-error" role="alert"></p>
        <button class="btn btn-primary" type="submit">更新密碼</button>
        <p class="hint" style="margin-top:12px">更新後，其他裝置上的登入會全部失效，這台裝置會保持登入。</p>
      </form>
    </section>

    <section class="section" aria-labelledby="out-title">
      <div class="section-head"><h2 class="section-title" id="out-title">登出</h2></div>
      <div class="actions-row">
        <button class="btn" type="button" id="logout">登出這台裝置</button>
        <button class="btn btn-danger" type="button" id="logout-all">登出所有裝置</button>
      </div>
    </section>`;

  // 家庭成員
  const people = view.querySelector('#people');
  const drawPeople = (d) => { people.innerHTML = peopleList(d.members, d.today); };
  const cached = recall('members');
  if (cached) drawPeople(cached);
  api('members.list').then((d) => {
    if (!isCurrent()) return;
    remember('members', d);
    drawPeople(d);
  }).catch((err) => {
    if (!isCurrent() || err.code === 'AUTH_REQUIRED' || cached) return;
    people.innerHTML = '';
    people.appendChild(errorView(err, () => mount(view, { isCurrent })));
  });

  // 修改密碼
  const form = view.querySelector('#pw-form');
  const pwError = view.querySelector('#pw-error');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    pwError.textContent = '';
    const oldPw = form.old.value, n1 = form.new1.value, n2 = form.new2.value;
    if (!oldPw || !n1) { pwError.textContent = '請填寫目前密碼和新密碼。'; return; }
    if (n1.length < 8) { pwError.textContent = '新密碼至少需要 8 個字元。'; return; }
    if (n1 !== n2) { pwError.textContent = '兩次輸入的新密碼不一致。'; return; }
    const restore = setBusy(form.querySelector('button[type=submit]'), '更新中…');
    try {
      await api('auth.changePassword', { old_password: oldPw, new_password: n1 }, { write: true });
      form.reset();
      toast('密碼已更新');
    } catch (err) {
      pwError.textContent = err.message;
    } finally {
      restore();
    }
  });

  // 登出
  const logout = async (all) => {
    if (all) {
      const ok = await confirmDialog({
        title: '登出所有裝置',
        text: '所有裝置（包含這台）都需要重新登入。',
        confirmText: '全部登出',
        danger: true
      });
      if (!ok) return;
    }
    const btn = view.querySelector(all ? '#logout-all' : '#logout');
    const restore = setBusy(btn, '登出中…');
    try {
      await api(all ? 'auth.logoutAll' : 'auth.logout', {}, { write: true });
    } catch (err) {
      if (err.code !== 'AUTH_REQUIRED') {
        restore();
        toast(`${err.message}（這台裝置仍會登出，但伺服器上的登入可能尚未失效）`, { error: true });
      }
    }
    clearSession();
    forgetAll();
    go('/login');
  };
  view.querySelector('#logout').addEventListener('click', () => logout(false));
  view.querySelector('#logout-all').addEventListener('click', () => logout(true));
}
