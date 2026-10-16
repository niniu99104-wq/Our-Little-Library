/** 家庭首頁：刊頭、書房、家庭帳本、最近新增 */
import { api } from '../api.js';
import { remember, recall } from '../store.js';
import { esc, formatCount, formatLongDate } from '../utils/format.js';
import { shelfStack, shelvesFrom, stackSkeleton } from '../components/shelf-stack.js';
import { errorView, skeletonLines } from '../ui.js';

function ledgerRow(label, value, unit, href, note = '') {
  const v = value === null
    ? `<span class="ledger-value is-muted">${esc(unit)}</span>`
    : `<span class="ledger-value">${formatCount(value)}<small>${esc(unit)}</small></span>`;
  const inner = `<span><span class="ledger-label">${esc(label)}</span>${note ? `<span class="ledger-note">${esc(note)}</span>` : ''}</span>${v}`;
  return href
    ? `<a class="ledger-row" href="${href}" style="text-decoration:none">${inner}</a>`
    : `<div class="ledger-row">${inner}</div>`;
}

function recentSection(recent) {
  if (!recent.length) {
    return `
      <div class="empty">
        <p class="empty-text">你的第一本書，正等著被收藏。</p>
        <a class="btn btn-primary" href="#/add">新增第一本書</a>
      </div>`;
  }
  return `<div class="covers">${recent.map((b) => `
    <a class="cover-card" href="#/shelves/FAMILY">
      ${b.cover_url
        ? `<img class="cover-img" src="${esc(b.cover_url)}" alt="" loading="lazy" referrerpolicy="no-referrer">`
        : `<div class="cover-fallback" data-theme="family">${esc(b.title)}</div>`}
      <p class="cover-title">${esc(b.title)}</p>
      ${b.authors ? `<p class="cover-author">${esc(b.authors)}</p>` : ''}
    </a>`).join('')}</div>`;
}

function renderBody(el, d) {
  const shelves = shelvesFrom(d.members, d.family);
  el.innerHTML = `
    ${shelfStack(shelves, d.shelf_counts, d.today)}

    <section class="ledger" aria-label="家庭藏書統計">
      ${ledgerRow('家庭藏書', d.counts.total, '本', '#/shelves/FAMILY',
        d.counts.total ? `實體書 ${d.counts.physical} 本，電子書 ${d.counts.ebook} 本，有聲書 ${d.counts.audiobook} 本` : '')}
      ${ledgerRow('本月新增', d.counts.month_new, '本', '#/shelves/FAMILY')}
      ${ledgerRow('想買的書', d.counts.wishlist_open, '本', '#/wishlist')}
      ${ledgerRow('本月閱讀', null, '閱讀紀錄功能開放後顯示', '', '')}
    </section>

    <section class="section" aria-labelledby="recent-title">
      <div class="section-head"><h2 class="section-title" id="recent-title">最近新增</h2></div>
      ${recentSection(d.recent)}
    </section>`;
}

export function mount(view, { isCurrent }) {
  view.innerHTML = `
    <header class="masthead">
      <p class="masthead-date">${esc(formatLongDate())}</p>
      <h1 class="masthead-title">Our Little Library</h1>
      <p class="masthead-tagline">Every book holds a piece of our story.</p>
    </header>
    <div id="home-body"></div>`;
  const body = view.querySelector('#home-body');

  const cached = recall('home');
  if (cached) renderBody(body, cached);
  else body.innerHTML = `${stackSkeleton()}<div class="ledger">${skeletonLines(4, 28)}</div>`;

  const load = async () => {
    try {
      const data = await api('home.summary');
      if (!isCurrent()) return;
      remember('home', data);
      renderBody(body, data);
    } catch (err) {
      if (!isCurrent() || err.code === 'AUTH_REQUIRED') return;
      if (cached) return; // 已顯示上次的內容，背景更新失敗不打斷畫面
      body.innerHTML = '';
      body.appendChild(errorView(err, () => { body.innerHTML = stackSkeleton(); load(); }));
    }
  };
  load();
}
