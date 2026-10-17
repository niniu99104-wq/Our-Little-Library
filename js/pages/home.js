/** 家庭首頁：刊頭、書房、家庭帳本、最近新增 */
import { api } from '../api.js?v=2.0.1';
import { remember, recall } from '../store.js?v=2.0.1';
import { esc, formatCount, formatLongDate, formatDate } from '../utils/format.js?v=2.0.1';
import { shelfStack, shelvesFrom, stackSkeleton } from '../components/shelf-stack.js?v=2.0.1';
import { errorView, skeletonLines } from '../ui.js?v=2.0.1';
import { loadImages } from '../components/photos.js?v=2.0.1';
import { coverHtml } from '../components/book-grid.js?v=2.0.1';

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
    <a class="cover-card" href="#/book/${encodeURIComponent(b.work_id)}">
      ${coverHtml(b)}
      <p class="cover-title">${esc(b.title)}</p>
      ${b.authors ? `<p class="cover-author">${esc(b.authors)}</p>` : ''}
    </a>`).join('')}</div>`;
}

/** 功能入口：閱讀、計畫、探索、統計 */
function exploreSection(d) {
  const child = d.members.find((m) => m.member_type === 'child');
  const items = [
    ['#/journal', '閱讀日記', 'Reading Journal'],
    ['#/plans', '閱讀計畫', 'Reading Plans'],
    child ? [`#/kids/${encodeURIComponent(child.member_id)}`, '兒童選書模式', '今天想讀什麼？'] : null,
    ['#/activities', '小小探索家', 'Little Explorers'],
    ['#/recipes', '甜點櫃食譜', "Dad's Dessert Shelf"],
    ['#/insights', '閱讀統計', 'Reading Insights'],
    ['#/budget', '購書預算', 'Book Budget']
  ].filter(Boolean);
  return `
    <section class="section" aria-labelledby="explore-title">
      <div class="section-head"><h2 class="section-title" id="explore-title">在圖書館裡</h2></div>
      <nav class="explore">${items.map(([h, t, s]) => `<a class="explore-item" href="${h}"><span>${esc(t)}</span><span class="explore-sub">${esc(s)}</span></a>`).join('')}</nav>
    </section>`;
}

function readingSection(r) {
  if (!r || !r.recent.length) return '';
  return `
    <section class="section" aria-labelledby="reading-title">
      <div class="section-head"><h2 class="section-title" id="reading-title">最近閱讀</h2><a class="btn btn-text" href="#/journal">閱讀日記</a></div>
      <ul class="list">${r.recent.map((l) => `
        <li class="list-row"><a class="list-name" href="#/book/${encodeURIComponent(l.work_id)}">${esc(l.title)}
          <span class="hint" style="display:block">${esc([l.member, l.method, formatDate(l.read_date)].filter(Boolean).join('，'))}</span></a></li>`).join('')}</ul>
    </section>`;
}

function renderBody(el, d) {
  const shelves = shelvesFrom(d.members, d.family);
  const r = d.reading || {};
  el.innerHTML = `
    ${shelfStack(shelves, d.shelf_counts, d.today)}

    ${r.themes?.length ? `<p class="month-theme-line">本月閱讀主題　${r.themes.map((t) => `<a href="#/plans?member=${encodeURIComponent(t.member_id)}">${esc(t.theme)}</a>${r.themes.length > 1 ? `<span class="hint">（${esc(t.member)}）</span>` : ''}`).join('　')}</p>` : ''}

    <section class="ledger" aria-label="家庭藏書統計">
      ${ledgerRow('家庭藏書', d.counts.total, '本', '#/library',
        d.counts.total ? `實體書 ${d.counts.physical} 本，電子書 ${d.counts.ebook} 本，有聲書 ${d.counts.audiobook} 本` : '')}
      ${ledgerRow('本月新增', d.counts.month_new, '本', '#/library')}
      ${ledgerRow('本月閱讀', r.month_books ?? 0, '本', '#/insights', r.month_times ? `共 ${r.month_times} 次閱讀紀錄` : '')}
      ${ledgerRow('想買的書', d.counts.wishlist_open, '本', '#/wishlist')}
    </section>

    ${readingSection(r)}

    <section class="section" aria-labelledby="recent-title">
      <div class="section-head"><h2 class="section-title" id="recent-title">最近新增</h2>${d.recent.length ? '<a class="btn btn-text" href="#/library">全部藏書</a>' : ''}</div>
      ${recentSection(d.recent)}
    </section>

    ${exploreSection(d)}`;
  loadImages(el);
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
