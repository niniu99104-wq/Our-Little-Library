/**
 * 共用資料：書籍索引、分類標籤位置、成員
 *
 * 讀取後暫存在記憶體，切換頁面時不必重新等待；任何寫入成功後都會清除相關暫存。
 */
import { api } from './api.js?v=2.0.1';
import { remember, recall, forget } from './store.js?v=2.0.1';

async function cached(key, action, force) {
  if (!force) {
    const hit = recall(key);
    if (hit) return hit;
  }
  const data = await api(action);
  remember(key, data);
  return data;
}

export const getBooks = (force) => cached('books', 'books.list', force);
export const getTaxonomy = (force) => cached('taxonomy', 'taxonomy.list', force);
export const getMembers = (force) => cached('members', 'members.list', force);

/** 書籍有變動：清除書籍索引與首頁統計 */
export function booksChanged() {
  forget('books');
  forget('home');
}

export function taxonomyChanged() {
  forget('taxonomy');
}

export function membersChanged() {
  forget('members');
  forget('home');
}

/** 寫入操作的統一入口：成功後清除指定的暫存 */
export async function write(action, data, after = []) {
  const result = await api(action, data, { write: true });
  after.forEach((fn) => fn());
  return result;
}

/* ---------- 顯示用的對照與文字 ---------- */

export const FORMAT_LABEL = { physical: '實體書', ebook: '電子書', audiobook: '有聲書' };
export const SCOPE_LABEL = { liam: "Liam's Little Library", mom: "Mom's Library", dad: "Dad's Dessert Shelf", family: 'Family Collection' };
export const INVENTORY_STATUS = ['已完成建檔', '待確認', '已辨識', '待整理'];
export const CONDITIONS = ['全新', '良好', '有使用痕跡', '破損'];
export const ACQUIRED_VIA = ['購買', '贈送', '二手', '其他'];

export function indexBy(list, key) {
  const out = {};
  (list || []).forEach((x) => { out[x[key]] = x; });
  return out;
}

/** 24 → 「2 歲」，30 → 「2 歲半」，18 → 「1 歲半」，8 → 「8 個月」 */
function monthsLabel(m) {
  const n = Number(m);
  if (n < 12) return `${n} 個月`;
  const y = Math.floor(n / 12), r = n % 12;
  if (r === 0) return `${y} 歲`;
  if (r === 6) return `${y} 歲半`;
  return `${y} 歲 ${r} 個月`;
}

export function ageRangeLabel(min, max) {
  const a = min === '' || min === undefined ? null : Number(min);
  const b = max === '' || max === undefined ? null : Number(max);
  if (a === null && b === null) return '';
  if (a !== null && b !== null) {
    if (a === b) return monthsLabel(a);
    // 兩端都是整歲時寫成「2 至 5 歲」
    if (a % 12 === 0 && b % 12 === 0 && a > 0) return `${a / 12} 至 ${b / 12} 歲`;
    return `${monthsLabel(a)} 至 ${monthsLabel(b)}`;
  }
  return a !== null ? `${monthsLabel(a)}以上` : `${monthsLabel(b)}以下`;
}

/** 書房名稱：成員 ID 或 FAMILY */
export function shelfName(id, membersById) {
  if (id === 'FAMILY') return 'Family Collection';
  return membersById[id]?.shelf_name || '（已移除的成員）';
}
