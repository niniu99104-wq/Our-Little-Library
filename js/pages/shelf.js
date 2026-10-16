/** 單一書房：主題色、書籍列表、分類篩選、搜尋 */
import { getBooks, getTaxonomy, getMembers } from '../data.js?v=2.0.0';
import { esc, formatDate } from '../utils/format.js?v=2.0.0';
import { formatAgeDetailed } from '../utils/age.js?v=2.0.0';
import { bookGrid, matchesQuery, resultCount } from '../components/book-grid.js?v=2.0.0';
import { errorView, skeletonLines } from '../ui.js?v=2.0.0';
import { loadImages } from '../components/photos.js?v=2.0.0';

const THEMES = new Set(['liam', 'mom', 'dad', 'family']);
const FAMILY = { member_id: 'FAMILY', shelf_name: 'Family Collection', theme_key: 'family', member_type: 'shared' };

/** 每個書房的專屬功能入口 */
function shelfLinks(shelf) {
  if (shelf.member_id === 'FAMILY') return '';
  const id = encodeURIComponent(shelf.member_id);
  const links = shelf.member_type === 'child'
    ? [[`#/kids/${id}`, '兒童選書模式'], [`#/plans?member=${id}`, '閱讀計畫'], ['#/activities', '小小探索家'], [`#/journal?member=${id}`, '閱讀日記']]
    : [[`#/reading/${id}`, '閱讀室與待讀清單'], [`#/journal?member=${id}`, '閱讀日記']];
  if (shelf.theme_key === 'dad') links.unshift(['#/recipes', '甜點櫃食譜']);
  return `<nav class="shelf-links" aria-label="${esc(shelf.shelf_name)} 功能">${links.map(([h, l]) => `<a class="btn btn-sm" href="${h}">${esc(l)}</a>`).join('')}</nav>`;
}

export function mount(view, { params, isCurrent }) {
  const id = params.id;
  view.innerHTML = skeletonLines(3, 36);

  const load = async () => {
    try {
      const [{ books }, tax, mem] = await Promise.all([getBooks(), getTaxonomy(), getMembers()]);
      if (!isCurrent()) return;
      const shelf = id === 'FAMILY' ? FAMILY : mem.members.find((m) => m.member_id === id);
      if (!shelf) {
        view.innerHTML = `<div class="pending"><p class="pending-title">找不到這個書房</p><p class="pending-text">它可能已被移除。</p></div>
          <p style="margin-top:24px"><a class="btn" href="#/shelves">回到書房列表</a></p>`;
        return;
      }
      draw(shelf, books, tax, mem.today);
    } catch (err) {
      if (!isCurrent() || err.code === 'AUTH_REQUIRED') return;
      view.innerHTML = '';
      view.appendChild(errorView(err, () => { view.innerHTML = skeletonLines(3, 36); load(); }));
    }
  };

  function draw(shelf, allBooks, tax, today) {
    const theme = THEMES.has(shelf.theme_key) ? shelf.theme_key : 'family';
    view.dataset.theme = theme;
    const books = shelf.member_id === 'FAMILY'
      ? allBooks.filter((b) => b.owners.includes('FAMILY'))
      : allBooks.filter((b) => b.shelf_ids.includes(shelf.member_id));

    // 分類：只列出這個書房裡實際有書的分類，依分類設定的順序排列
    const used = new Set(books.map((b) => b.primary_category_id).filter(Boolean));
    const cats = tax.categories.filter((c) => used.has(c.category_id))
      .sort((a, b) => (a.scope === theme ? 0 : 1) - (b.scope === theme ? 0 : 1) || a.sort_order - b.sort_order);
    const counts = {};
    books.forEach((b) => { counts[b.primary_category_id || ''] = (counts[b.primary_category_id || ''] || 0) + 1; });

    const isChild = shelf.member_type === 'child' && shelf.birth_date;
    const owner = shelf.member_id === 'FAMILY'
      ? '全家共用的藏書'
      : [shelf.nickname || shelf.name_zh, isChild ? formatAgeDetailed(shelf.birth_date, today) : ''].filter(Boolean).join('，');
    const addHref = `#/add?shelf=${encodeURIComponent(shelf.member_id)}`;

    view.innerHTML = `
      <header class="shelf-head">
        <p class="masthead-date">${esc(owner)}</p>
        <h1 class="masthead-title">${esc(shelf.shelf_name)}</h1>
        ${isChild ? `<p class="hint" style="margin-top:8px">生日 ${esc(formatDate(shelf.birth_date))}</p>` : ''}
        ${shelfLinks(shelf)}
      </header>
      ${books.length ? `
        <div class="toolbar">
          <label class="search">
            <span class="visually-hidden">在這個書房搜尋</span>
            <input class="input" type="search" id="q" placeholder="在這個書房搜尋" autocomplete="off">
          </label>
          <a class="btn btn-primary" href="${addHref}">新增書籍</a>
        </div>
        <div class="chips" role="group" aria-label="分類">
          <button type="button" class="chip" aria-pressed="true" data-cat="">全部 <span>${books.length}</span></button>
          ${cats.map((c) => `<button type="button" class="chip" aria-pressed="false" data-cat="${esc(c.category_id)}">${esc(c.name)} <span>${counts[c.category_id] || 0}</span></button>`).join('')}
          ${counts[''] ? `<button type="button" class="chip" aria-pressed="false" data-cat="none">未分類 <span>${counts['']}</span></button>` : ''}
        </div>
        <p class="hint result-line" id="count"></p>
        <div id="grid"></div>` : `
        <div class="empty">
          <p class="empty-text">這個書房還沒有書，第一本書正等著被收藏。</p>
          <a class="btn btn-primary" href="${addHref}">新增書籍</a>
        </div>`}`;

    if (!books.length) return;
    let cat = '';
    const grid = view.querySelector('#grid');
    const count = view.querySelector('#count');
    const q = view.querySelector('#q');
    const refresh = () => {
      const list = books.filter((b) => {
        if (cat === 'none' && b.primary_category_id) return false;
        if (cat && cat !== 'none' && b.primary_category_id !== cat) return false;
        return matchesQuery(b, q.value);
      });
      count.textContent = resultCount(list.length, books.length);
      grid.innerHTML = list.length ? bookGrid(list, { theme }) : '<div class="empty"><p class="empty-text">沒有符合條件的書。</p></div>';
      loadImages(grid);
    };
    view.querySelector('.chips').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-cat]');
      if (!btn) return;
      cat = btn.dataset.cat;
      view.querySelectorAll('.chip').forEach((c) => c.setAttribute('aria-pressed', String(c === btn)));
      refresh();
    });
    q.addEventListener('input', refresh);
    refresh();
  }

  load();
  return () => { delete view.dataset.theme; };
}
