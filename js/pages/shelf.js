/** 單一書房（第一階段第二步會加入書籍列表、分類篩選與搜尋） */
import { api } from '../api.js';
import { remember, recall } from '../store.js';
import { esc, formatDate } from '../utils/format.js';
import { formatAgeDetailed } from '../utils/age.js';
import { errorView, skeletonLines } from '../ui.js';

const THEMES = new Set(['liam', 'mom', 'dad', 'family']);

function draw(view, d, id) {
  const shelf = id === 'FAMILY' ? d.family : d.members.find((m) => m.member_id === id);
  if (!shelf) {
    view.innerHTML = `<div class="pending"><p class="pending-title">找不到這個書房</p><p class="pending-text">它可能已被移除。</p></div>
      <p style="margin-top:24px"><a class="btn" href="#/shelves">回到書房列表</a></p>`;
    return;
  }
  view.dataset.theme = THEMES.has(shelf.theme_key) ? shelf.theme_key : 'family';
  const isChild = shelf.member_type === 'child' && shelf.birth_date;
  const owner = shelf.member_id === 'FAMILY'
    ? '全家共用的藏書'
    : [shelf.nickname || shelf.name_zh, isChild ? formatAgeDetailed(shelf.birth_date, d.today) : ''].filter(Boolean).join('，');
  const count = d.shelf_counts[shelf.member_id] || 0;

  view.innerHTML = `
    <header class="shelf-head">
      <p class="masthead-date">${esc(owner)}</p>
      <h1 class="masthead-title">${esc(shelf.shelf_name)}</h1>
      ${isChild ? `<p class="hint" style="margin-top:8px">生日 ${esc(formatDate(shelf.birth_date))}</p>` : ''}
    </header>
    ${count === 0 ? `
      <div class="empty">
        <p class="empty-text">這個書房還沒有書，第一本書正等著被收藏。</p>
        <a class="btn btn-primary" href="#/add">新增書籍</a>
      </div>` : `
      <div class="pending">
        <p class="pending-title">這裡有 ${count} 本書</p>
        <p class="pending-text">書籍列表、分類篩選與搜尋會在下一個開發步驟加入。</p>
      </div>`}`;
}

export function mount(view, { params, isCurrent }) {
  const id = params.id;
  const cached = recall('home');
  if (cached) draw(view, cached, id);
  else view.innerHTML = skeletonLines(3, 32);

  api('home.summary').then((data) => {
    if (!isCurrent()) return;
    remember('home', data);
    draw(view, data, id);
  }).catch((err) => {
    if (!isCurrent() || err.code === 'AUTH_REQUIRED' || cached) return;
    view.innerHTML = '';
    view.appendChild(errorView(err, () => mount(view, { params, isCurrent })));
  });

  return () => { delete view.dataset.theme; };
}
