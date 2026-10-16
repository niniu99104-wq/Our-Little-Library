/** 文字、日期、金額格式 */

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** 所有放進畫面的資料都必須先經過這裡，避免惡意內容被當成網頁程式執行 */
export function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ESC[c]);
}

/** 2026-10-16 → 2026/10/16 */
export function formatDate(str) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(str || ''));
  return m ? `${m[1]}/${m[2]}/${m[3]}` : '';
}

/** 首頁刊頭日期：2026 年 10 月 16 日 星期五 */
export function formatLongDate(date = new Date()) {
  const parts = new Intl.DateTimeFormat('zh-TW', {
    timeZone: 'Asia/Taipei', year: 'numeric', month: 'numeric', day: 'numeric', weekday: 'long'
  }).formatToParts(date).reduce((o, p) => ((o[p.type] = p.value), o), {});
  return `${parts.year} 年 ${parts.month} 月 ${parts.day} 日 ${parts.weekday}`;
}

export function formatMoney(n, currency = 'TWD') {
  const num = Number(n);
  if (!Number.isFinite(num)) return '';
  return new Intl.NumberFormat('zh-TW', { style: 'currency', currency, maximumFractionDigits: 0 }).format(num);
}

export function formatCount(n) {
  return new Intl.NumberFormat('zh-TW').format(Number(n) || 0);
}
