/** 全部藏書：多條件搜尋與篩選 */
import { getBooks, getTaxonomy, getMembers, write, booksChanged, FORMAT_LABEL, SCOPE_LABEL, INVENTORY_STATUS } from '../data.js?v=2.0.1';
import { esc } from '../utils/format.js?v=2.0.1';
import { bookGrid, matchesQuery, resultCount, selectHtml } from '../components/book-grid.js?v=2.0.1';
import { loadImages } from '../components/photos.js?v=2.0.1';
import { toast, setBusy, errorView, skeletonLines } from '../ui.js?v=2.0.1';

// 篩選條件只保留在這次開啟網站的期間
const state = { q: '', shelf: '', category: '', tag: '', format: '', location: '', status: '', sort: 'new' };

function applyFilters(books) {
  let out = books.filter((b) => {
    if (state.shelf === 'FAMILY' && !b.owners.includes('FAMILY')) return false;
    if (state.shelf && state.shelf !== 'FAMILY' && !b.shelf_ids.includes(state.shelf)) return false;
    if (state.category && b.primary_category_id !== state.category) return false;
    if (state.tag && !b.tag_ids.includes(state.tag)) return false;
    if (state.format && !b.formats.includes(state.format)) return false;
    if (state.location && !b.location_ids.includes(state.location)) return false;
    if (state.status && !b.statuses.includes(state.status)) return false;
    return matchesQuery(b, state.q);
  });
  if (state.sort === 'title') out = out.slice().sort((a, b) => a.title.localeCompare(b.title, 'zh-Hant'));
  return out;
}

export function mount(view, { isCurrent }) {
  view.innerHTML = `
    <header class="page-head">
      <div>
        <h1 class="page-title">全部藏書</h1>
        <p class="page-sub">Everything on our shelves.</p>
      </div>
      <a class="btn btn-primary" href="#/add">新增書籍</a>
    </header>
    <div id="lib-body">${skeletonLines(4, 36)}</div>`;
  const body = view.querySelector('#lib-body');

  const load = async () => {
    try {
      const [{ books }, tax, mem] = await Promise.all([getBooks(), getTaxonomy(), getMembers()]);
      if (!isCurrent()) return;
      draw(books, tax, mem.members);
    } catch (err) {
      if (!isCurrent() || err.code === 'AUTH_REQUIRED') return;
      body.innerHTML = '';
      body.appendChild(errorView(err, () => { body.innerHTML = skeletonLines(4, 36); load(); }));
    }
  };

  function draw(books, tax, members) {
    if (!books.length) {
      body.innerHTML = `
        <div class="empty">
          <p class="empty-text">你的第一本書，正等著被收藏。</p>
          <a class="btn btn-primary" href="#/add">新增第一本書</a>
        </div>`;
      return;
    }
    const shelfOpts = [...members.map((m) => ({ value: m.member_id, label: m.shelf_name })), { value: 'FAMILY', label: 'Family Collection' }];
    const catOpts = tax.categories.map((c) => ({ value: c.category_id, label: `${c.name}（${SCOPE_LABEL[c.scope] || c.scope}）` }));
    const tagOpts = tax.tags.map((t) => ({ value: t.tag_id, label: t.name }));
    const fmtOpts = Object.entries(FORMAT_LABEL).map(([value, label]) => ({ value, label }));
    const locOpts = tax.locations.map((l) => ({ value: l.location_id, label: l.label }));
    const stOpts = INVENTORY_STATUS.map((s) => ({ value: s, label: s }));

    body.innerHTML = `
      <form class="toolbar" id="filters" role="search" onsubmit="return false">
        <label class="search">
          <span class="visually-hidden">搜尋</span>
          <input class="input" type="search" name="q" value="${esc(state.q)}" placeholder="書名、作者、ISBN、出版社" autocomplete="off">
        </label>
        <details class="filter-panel"${window.innerWidth >= 600 || Object.entries(state).some(([k, v]) => k !== 'q' && k !== 'sort' && v) ? ' open' : ''}>
        <summary class="btn">篩選與排序</summary>
        <div class="filters">
          ${selectHtml('shelf', '所有書房', shelfOpts, state.shelf)}
          ${selectHtml('category', '所有分類', catOpts, state.category)}
          ${selectHtml('tag', '所有標籤', tagOpts, state.tag)}
          ${selectHtml('format', '所有形式', fmtOpts, state.format)}
          ${selectHtml('location', '所有位置', locOpts, state.location)}
          ${selectHtml('status', '所有建檔狀態', stOpts, state.status)}
          ${selectHtml('sort', '排序：最近新增', [{ value: 'title', label: '排序：書名' }], state.sort === 'title' ? 'title' : '')}
        </div>
        </details>
      </form>
      <div class="result-line">
        <p class="hint" id="count"></p>
        <span>
          <button type="button" class="btn-text btn" id="clear" hidden>清除篩選</button>
          <button type="button" class="btn-text btn" id="batch-toggle">批次設定</button>
        </span>
      </div>
      <div id="grid"></div>
      <div class="batch-bar" id="batch-bar" hidden>
        <p class="hint" id="batch-count">已選 0 本</p>
        <div class="batch-controls">
          <select class="input input-sm" id="batch-field" aria-label="要設定的項目">
            <option value="category">設定分類</option>
            <option value="add_shelf">加入書房</option>
            <option value="remove_shelf">移出書房</option>
            <option value="location">設定收納位置</option>
            <option value="status">設定建檔狀態</option>
          </select>
          <select class="input input-sm" id="batch-value" aria-label="設定值"></select>
          <button type="button" class="btn btn-primary btn-sm" id="batch-apply">套用</button>
          <button type="button" class="btn btn-text btn-sm" id="batch-all">全選目前結果</button>
        </div>
      </div>`;

    const form = body.querySelector('#filters');
    const grid = body.querySelector('#grid');
    const count = body.querySelector('#count');
    const clear = body.querySelector('#clear');

    const refresh = () => {
      const list = applyFilters(books);
      count.textContent = resultCount(list.length, books.length);
      const filtered = Object.entries(state).some(([k, v]) => k !== 'sort' && v);
      clear.hidden = !filtered;
      current = list;
      grid.innerHTML = list.length
        ? bookGrid(list, { selectable: batch, selected })
        : `<div class="empty"><p class="empty-text">沒有符合條件的書。</p></div>`;
      loadImages(grid);
      updateBatch();
    };

    /* ---------- 批次設定（盤點用） ---------- */
    let batch = false, current = [];
    const selected = new Set();
    const bar = body.querySelector('#batch-bar');
    const fieldSel = body.querySelector('#batch-field');
    const valueSel = body.querySelector('#batch-value');
    const valueOptions = {
      category: [['', '未分類'], ...tax.categories.map((c) => [c.category_id, `${c.name}（${SCOPE_LABEL[c.scope] || c.scope}）`])],
      add_shelf: members.map((m) => [m.member_id, m.shelf_name]),
      remove_shelf: members.map((m) => [m.member_id, m.shelf_name]),
      location: [['', '未設定位置'], ...tax.locations.map((l) => [l.location_id, l.label])],
      status: INVENTORY_STATUS.map((x) => [x, x])
    };
    const fillValues = () => {
      valueSel.innerHTML = valueOptions[fieldSel.value].map(([v, l]) => `<option value="${esc(v)}">${esc(l)}</option>`).join('');
    };
    const updateBatch = () => { body.querySelector('#batch-count').textContent = `已選 ${selected.size} 本`; };
    fillValues();
    fieldSel.addEventListener('change', fillValues);
    body.querySelector('#batch-toggle').addEventListener('click', (e) => {
      batch = !batch;
      e.target.textContent = batch ? '結束批次設定' : '批次設定';
      bar.hidden = !batch;
      if (!batch) selected.clear();
      refresh();
    });
    grid.addEventListener('change', (e) => {
      const id = e.target.dataset?.select;
      if (!id) return;
      if (e.target.checked) selected.add(id); else selected.delete(id);
      updateBatch();
    });
    body.querySelector('#batch-all').addEventListener('click', () => { current.forEach((b) => selected.add(b.work_id)); refresh(); });
    body.querySelector('#batch-apply').addEventListener('click', async (e) => {
      if (!selected.size) { toast('請先勾選書籍。', { error: true }); return; }
      const f = fieldSel.value, v = valueSel.value;
      const set = f === 'category' ? { primary_category_id: v } : f === 'add_shelf' ? { add_shelf_id: v } : f === 'remove_shelf' ? { remove_shelf_id: v } : f === 'location' ? { location_id: v } : { inventory_status: v };
      const restore = setBusy(e.target, '套用中…');
      try {
        const r = await write('books.batchUpdate', { work_ids: [...selected], set }, [booksChanged]);
        toast(`已更新 ${r.updated} 筆資料`);
        const fresh = await getBooks(true);
        books.splice(0, books.length, ...fresh.books);
        refresh();
      } catch (err) { toast(err.message, { error: true }); } finally { restore(); }
    });

    form.addEventListener('input', (e) => {
      const el = e.target;
      if (!el.name) return;
      state[el.name] = el.name === 'sort' ? (el.value || 'new') : el.value;
      refresh();
    });
    clear.addEventListener('click', () => {
      Object.assign(state, { q: '', shelf: '', category: '', tag: '', format: '', location: '', status: '' });
      form.reset();
      form.querySelectorAll('select').forEach((s) => { if (s.name !== 'sort') s.value = ''; });
      form.q.value = '';
      refresh();
    });
    refresh();
  }

  load();
}
