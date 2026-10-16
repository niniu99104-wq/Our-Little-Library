/**
 * 畫面資料暫存
 *
 * 只存在記憶體中（重新整理就清空），用來讓切換頁面時先顯示上次的內容，
 * 同時在背景向伺服器取得最新資料。不會把家庭資料存進瀏覽器的長期儲存空間。
 */
const cache = new Map();

export function remember(key, value) {
  cache.set(key, { value, at: Date.now() });
}

export function recall(key, maxAgeMs = 5 * 60 * 1000) {
  const hit = cache.get(key);
  if (!hit || Date.now() - hit.at > maxAgeMs) return null;
  return hit.value;
}

export function forget(key) {
  cache.delete(key);
}

export function forgetAll() {
  cache.clear();
}
