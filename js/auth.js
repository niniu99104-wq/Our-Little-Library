/**
 * 登入狀態
 *
 * 勾選「記住此裝置」時存在 localStorage（關閉瀏覽器仍保持登入），
 * 否則存在 sessionStorage（關閉分頁就登出）。瀏覽器只保存登入憑證，不保存密碼。
 */

const KEY = 'oll.session';

function safeGet(storage) {
  try { return JSON.parse(storage.getItem(KEY) || 'null'); } catch { return null; }
}

function safeRemove(storage) {
  try { storage.removeItem(KEY); } catch { /* 無法存取時忽略 */ }
}

export function getSession() {
  const s = safeGet(sessionStorage) || safeGet(localStorage);
  if (!s || !s.token) return null;
  if (s.expires_at && new Date(s.expires_at) <= new Date()) {
    clearSession();
    return null;
  }
  return s;
}

export function getToken() {
  return getSession()?.token || '';
}

export function saveSession({ token, expires_at, account }, remember) {
  clearSession();
  const value = JSON.stringify({ token, expires_at, account });
  try {
    (remember ? localStorage : sessionStorage).setItem(KEY, value);
  } catch {
    // 私密瀏覽等情況無法儲存時，退回只在這個分頁有效
    try { sessionStorage.setItem(KEY, value); } catch { /* 忽略 */ }
  }
}

export function clearSession() {
  safeRemove(localStorage);
  safeRemove(sessionStorage);
}

export function isLoggedIn() {
  return !!getSession();
}
