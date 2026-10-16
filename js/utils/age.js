/**
 * 年齡計算
 *
 * 規則：
 * 1. 「今天」一律以台北時區判定。
 * 2. 從出生日起算經過幾個完整月份，再換算成歲與月。
 * 3. 出生日在當月不存在時（例如 31 日、2 月 29 日），以當月最後一天視為滿月日。
 */

export function todayInTaipei(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(date);
}

function parseDate(str) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(str || '').trim());
  if (!m) return null;
  const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > daysInMonth(y, mo)) return null;
  return { y, m: mo, d };
}

function daysInMonth(y, m) {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** 在出生日加上 n 個月，回傳該次滿月日（不存在的日期改為當月最後一天） */
function addMonths(b, n) {
  const total = b.m - 1 + n;
  const y = b.y + Math.floor(total / 12);
  const m = (total % 12) + 1;
  return { y, m, d: Math.min(b.d, daysInMonth(y, m)) };
}

function toUtc(p) {
  return Date.UTC(p.y, p.m - 1, p.d);
}

/**
 * 回傳 { years, months, days, totalMonths }；出生日期無效或晚於今天時回傳 null。
 */
export function ageParts(birthStr, todayStr = todayInTaipei()) {
  const b = parseDate(birthStr);
  const t = parseDate(todayStr);
  if (!b || !t) return null;
  if (toUtc(b) > toUtc(t)) return null;

  let totalMonths = (t.y - b.y) * 12 + (t.m - b.m);
  const thisMonthAnniv = Math.min(b.d, daysInMonth(t.y, t.m));
  if (t.d < thisMonthAnniv) totalMonths -= 1;

  const anchor = addMonths(b, totalMonths);
  const days = Math.round((toUtc(t) - toUtc(anchor)) / 86400000);

  return {
    years: Math.floor(totalMonths / 12),
    months: totalMonths % 12,
    days,
    totalMonths
  };
}

/** 顯示用：「3 歲 11 個月」；未滿一歲顯示「8 個月」；未滿一個月顯示「出生 12 天」 */
export function formatAge(birthStr, todayStr) {
  const p = ageParts(birthStr, todayStr);
  if (!p) return '';
  if (p.totalMonths === 0) return `出生 ${p.days} 天`;
  if (p.years === 0) return `${p.months} 個月`;
  return `${p.years} 歲 ${p.months} 個月`;
}

/** 詳細顯示：「3 歲 11 個月又 19 天」 */
export function formatAgeDetailed(birthStr, todayStr) {
  const p = ageParts(birthStr, todayStr);
  if (!p) return '';
  const base = formatAge(birthStr, todayStr);
  return p.totalMonths === 0 || p.days === 0 ? base : `${base}又 ${p.days} 天`;
}
