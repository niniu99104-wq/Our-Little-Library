/**
 * 兒童選書模式：大封面、大按鈕、少量文字
 * 這個模式只能選書和記錄「讀完了」，沒有購物、刪除或管理功能。
 */
import { api } from '../api.js?v=2.0.0';
import { go } from '../router.js?v=2.0.0';
import { getMembers, getBooks, getTaxonomy, write, booksChanged, indexBy } from '../data.js?v=2.0.0';
import { esc } from '../utils/format.js?v=2.0.0';
import { todayInTaipei } from '../utils/age.js?v=2.0.0';
import { coverHtml } from '../components/book-grid.js?v=2.0.0';
import { loadImages } from '../components/photos.js?v=2.0.0';
import { errorView, skeletonLines, toast } from '../ui.js?v=2.0.0';

const ICON = {
  car: '<path d="M5 15h14l-1.6-4.6A2 2 0 0 0 15.5 9h-7a2 2 0 0 0-1.9 1.4zM4 15v3h2M18 18h2v-3"/><circle cx="8" cy="18" r="1.6"/><circle cx="16" cy="18" r="1.6"/>',
  paw: '<circle cx="8" cy="8" r="1.6"/><circle cx="12" cy="6.5" r="1.6"/><circle cx="16" cy="8" r="1.6"/><path d="M8.5 16c0-2.4 1.6-4.5 3.5-4.5s3.5 2.1 3.5 4.5c0 1.6-1.2 2.5-3.5 2.5S8.5 17.6 8.5 16z"/>',
  smile: '<circle cx="12" cy="12" r="8"/><path d="M8.5 13.5c.9 1.4 2.1 2 3.5 2s2.6-.6 3.5-2M9 9.5h.01M15 9.5h.01"/>',
  moon: '<path d="M16.5 15.5A6.5 6.5 0 0 1 9 5.6a7 7 0 1 0 9.4 9.4 6.4 6.4 0 0 1-1.9.5z"/>',
  leaf: '<path d="M5 19c0-8 5-13 14-14 0 9-5 14-13 14M5 19l7-7"/>',
  dice: '<rect x="5" y="5" width="14" height="14" rx="3"/><path d="M9 9h.01M15 15h.01M12 12h.01"/>'
};

const TOPICS = [
  { key: 'car', label: '車車', match: (b, c, t) => c.includes('交通與工程') || t.some((x) => /車|交通/.test(x)) },
  { key: 'paw', label: '動物', match: (b, c) => c.includes('動物與昆蟲') },
  { key: 'smile', label: '好笑的故事', match: (b, c, t) => t.includes('幽默故事') },
  { key: 'moon', label: '睡前故事', match: (b, c, t) => t.includes('睡前故事') },
  { key: 'leaf', label: '自然探索', match: (b, c) => c.includes('自然與植物') || c.includes('科學與探索') },
  { key: 'dice', label: '隨便選一本', match: () => true }
];

const svg = (k) => `<svg viewBox="0 0 24 24" aria-hidden="true">${ICON[k]}</svg>`;

export function mount(view, { params, isCurrent }) {
  document.body.classList.add('is-kids');
  view.innerHTML = skeletonLines(4, 80);
  let state = null;

  const load = async () => {
    try {
      const [{ members }, { books }, tax, rd] = await Promise.all([getMembers(), getBooks(), getTaxonomy(), api('reading.forMember', { member_id: params.id })]);
      if (!isCurrent()) return;
      const kid = members.find((m) => m.member_id === params.id);
      if (!kid) { view.innerHTML = '<div class="pending"><p class="pending-title">找不到這個書房</p></div>'; return; }
      const catById = indexBy(tax.categories, 'category_id');
      const tagById = indexBy(tax.tags, 'tag_id');
      const shelf = books.filter((b) => b.shelf_ids.includes(kid.member_id) || b.owners.includes(kid.member_id));
      state = { kid, shelf, rd, catOf: (b) => [catById[b.primary_category_id]?.name || ''], tagsOf: (b) => b.tag_ids.map((id) => tagById[id]?.name).filter(Boolean) };
      view.dataset.theme = kid.theme_key;
      home();
    } catch (err) {
      if (!isCurrent() || err.code === 'AUTH_REQUIRED') return;
      view.innerHTML = '';
      view.appendChild(errorView(err, load));
    }
  };

  function exitBar() {
    return `<div class="kids-top"><button type="button" class="btn btn-text kids-exit" data-exit>離開兒童模式</button></div>`;
  }

  function bindExit() {
    view.querySelector('[data-exit]').addEventListener('click', () => go(`/shelves/${encodeURIComponent(params.id)}`));
  }

  function home() {
    const name = state.kid.nickname || state.kid.name_zh;
    view.innerHTML = `
      ${exitBar()}
      <h1 class="kids-title">${esc(name)}，今天想讀什麼？</h1>
      <div class="kids-grid">${TOPICS.map((t) => {
        const n = state.shelf.filter((b) => t.match(b, state.catOf(b), state.tagsOf(b))).length;
        return `<button type="button" class="kids-tile" data-topic="${t.key}"${n ? '' : ' disabled'}>${svg(t.key)}<span>${esc(t.label)}</span>${n ? '' : '<small>還沒有這種書</small>'}</button>`;
      }).join('')}</div>`;
    bindExit();
    view.querySelectorAll('[data-topic]').forEach((b) => b.addEventListener('click', () => pick(b.dataset.topic, [])));
  }

  /** 優先推薦還沒讀過、或很久沒讀的書 */
  function pick(topicKey, seen) {
    const t = TOPICS.find((x) => x.key === topicKey);
    let pool = state.shelf.filter((b) => t.match(b, state.catOf(b), state.tagsOf(b)) && !seen.includes(b.work_id));
    if (!pool.length) pool = state.shelf.filter((b) => t.match(b, state.catOf(b), state.tagsOf(b)));
    const score = (b) => (state.rd.counts[b.work_id] || 0) * 10 + (state.rd.last_read[b.work_id] ? 1 : 0);
    pool.sort((a, b) => score(a) - score(b) || String(state.rd.last_read[a.work_id] || '').localeCompare(String(state.rd.last_read[b.work_id] || '')));
    const top = pool.slice(0, Math.max(1, Math.min(5, pool.length)));
    const book = top[Math.floor(Math.random() * top.length)];
    const times = state.rd.counts[book.work_id] || 0;
    view.innerHTML = `
      ${exitBar()}
      <div class="kids-pick">
        <div class="kids-cover">${coverHtml(book, state.kid.theme_key)}</div>
        <h1 class="kids-book">${esc(book.title)}</h1>
        <p class="kids-note">${times ? `已經讀過 ${times} 次` : '還沒有讀過喔'}</p>
        <div class="kids-actions">
          <button type="button" class="kids-btn kids-btn-main" data-read>就讀這本</button>
          <button type="button" class="kids-btn" data-again>換一本</button>
          <button type="button" class="kids-btn" data-back>回去選</button>
        </div>
      </div>`;
    loadImages(view);
    bindExit();
    view.querySelector('[data-again]').addEventListener('click', () => pick(topicKey, [...seen, book.work_id]));
    view.querySelector('[data-back]').addEventListener('click', home);
    view.querySelector('[data-read]').addEventListener('click', async (e) => {
      e.target.disabled = true;
      e.target.textContent = '記下來…';
      try {
        await write('logs.create', { member_id: state.kid.member_id, work_id: book.work_id, read_date: todayInTaipei(), method: '親子共讀' }, [booksChanged]);
        state.rd.counts[book.work_id] = times + 1;
        state.rd.last_read[book.work_id] = todayInTaipei();
        view.querySelector('.kids-actions').innerHTML = `
          <p class="kids-done">讀完了，好棒！</p>
          <button type="button" class="kids-btn kids-btn-main" data-more>再選一本</button>`;
        view.querySelector('[data-more]').addEventListener('click', home);
      } catch (err) {
        e.target.disabled = false;
        e.target.textContent = '就讀這本';
        toast(err.message, { error: true });
      }
    });
  }

  load();
  return () => {
    document.body.classList.remove('is-kids');
    delete view.dataset.theme;
  };
}
