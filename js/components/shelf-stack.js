/** 書房入口：像一疊書，每一本是一個書房 */
import { esc, formatCount } from '../utils/format.js';
import { formatAge } from '../utils/age.js';

const THEMES = new Set(['liam', 'mom', 'dad', 'family']);

export function shelvesFrom(members, family) {
  return [...members, family];
}

function metaFor(shelf, today) {
  if (shelf.member_id === 'FAMILY') return '全家共用的藏書';
  const name = shelf.nickname || shelf.name_zh || shelf.name_en || '';
  if (shelf.member_type === 'child' && shelf.birth_date) {
    const age = formatAge(shelf.birth_date, today);
    return age ? `${name}　${age}` : name;
  }
  return name;
}

export function shelfStack(shelves, counts = {}, today) {
  const items = shelves.map((s) => {
    const theme = THEMES.has(s.theme_key) ? s.theme_key : 'family';
    const n = counts[s.member_id];
    const count = n === undefined ? '' : `${formatCount(n)}<small>本</small>`;
    return `
      <a class="spine" data-theme="${theme}" href="#/shelves/${encodeURIComponent(s.member_id)}">
        <span class="spine-title">${esc(s.shelf_name)}</span>
        <span class="spine-meta">${esc(metaFor(s, today))}</span>
        <span class="spine-count" aria-label="${esc(n ?? 0)} 本">${count}</span>
      </a>`;
  }).join('');
  return `<nav class="stack" aria-label="書房">${items}<div class="stack-base" aria-hidden="true"></div></nav>`;
}

export function stackSkeleton(n = 4) {
  return `<div class="stack" aria-hidden="true">${Array.from({ length: n }, () =>
    '<span class="skeleton" style="height:76px;border-radius:4px"></span>').join('')}</div>`;
}
