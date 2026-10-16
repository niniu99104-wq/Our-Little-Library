/** 書籍封面牆、搜尋與篩選 */
import { esc, formatCount } from '../utils/format.js';
import { FORMAT_LABEL } from '../data.js';

export function coverHtml(book, theme = 'family') {
  return book.cover_url
    ? `<img class="cover-img" src="${esc(book.cover_url)}" alt="" loading="lazy" referrerpolicy="no-referrer">`
    : `<div class="cover-fallback" data-theme="${esc(theme)}">${esc(book.title)}</div>`;
}

export function bookGrid(books, { theme = 'family' } = {}) {
  return `<div class="covers">${books.map((b) => {
    const notes = [];
    if (b.formats?.length && !(b.formats.length === 1 && b.formats[0] === 'physical')) {
      notes.push(b.formats.map((f) => FORMAT_LABEL[f]).join('、'));
    }
    const pending = (b.statuses || []).find((s) => s && s !== '已完成建檔');
    return `
      <a class="cover-card" href="#/book/${encodeURIComponent(b.work_id)}">
        ${coverHtml(b, theme)}
        <p class="cover-title">${esc(b.title)}</p>
        ${b.authors ? `<p class="cover-author">${esc(b.authors)}</p>` : ''}
        ${notes.length || pending ? `<p class="cover-note">${esc([...notes, pending].filter(Boolean).join('，'))}</p>` : ''}
      </a>`;
  }).join('')}</div>`;
}

/** 正規化：全半形、大小寫、空白、常見標點都不影響搜尋 */
export function normalize(s) {
  return String(s || '').normalize('NFKC').toLowerCase().replace(/[\s　·・•．.,，、:：;；!！?？'"「」『』《》〈〉\-—_~～()（）]/g, '');
}

export function matchesQuery(book, q, extra = []) {
  if (!q) return true;
  const needle = normalize(q);
  const isbnNeedle = String(q).replace(/[^0-9xX]/g, '');
  if (isbnNeedle.length >= 4 && (book.isbns || []).some((i) => i.includes(isbnNeedle.toUpperCase()))) return true;
  const hay = normalize([book.title, book.original_title, book.authors, book.illustrators, ...(book.publishers || []), ...extra].join('|'));
  return hay.includes(needle);
}

export function resultCount(n, total) {
  return n === total ? `共 ${formatCount(total)} 本` : `找到 ${formatCount(n)} 本，共 ${formatCount(total)} 本`;
}

/** 下拉式篩選 */
export function selectHtml(name, label, options, value) {
  return `
    <label class="filter">
      <span class="visually-hidden">${esc(label)}</span>
      <select class="input input-sm" name="${esc(name)}">
        <option value="">${esc(label)}</option>
        ${options.map((o) => `<option value="${esc(o.value)}"${o.value === value ? ' selected' : ''}>${esc(o.label)}</option>`).join('')}
      </select>
    </label>`;
}
