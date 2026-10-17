/**
 * 與 Apps Script API 溝通的唯一出口
 *
 * - 一律以 POST 傳送，Content-Type 為 text/plain（Apps Script 不支援跨網域預檢請求）
 * - 登入憑證放在請求內容中，不放在網址上
 * - 寫入操作附上 request_id；網路中斷重送時，伺服器不會重複寫入
 * - 只有伺服器回應成功，才回傳結果；其他情況一律丟出錯誤
 */
import { API_URL } from '../config.js?v=2.0.1';
import { getToken, clearSession } from './auth.js?v=2.0.1';

const TIMEOUT_MS = 30000;

export class ApiError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

export function newRequestId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('').replace(/^(.{8})(.{4})(.{4})(.{4})/, '$1-$2-$3-$4-');
}

async function send(body) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(body),
      redirect: 'follow',
      cache: 'no-store',
      signal: controller.signal
    });
    if (!res.ok) throw new ApiError('NETWORK', `伺服器沒有正常回應（${res.status}）。`);
    try {
      return await res.json();
    } catch {
      throw new ApiError('NETWORK', '伺服器回應格式錯誤，請確認 API 網址是否正確。');
    }
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw new ApiError('NETWORK', err.name === 'AbortError'
      ? '連線逾時，資料可能沒有送出成功，請再試一次。'
      : '網路連線中斷，資料沒有送出成功，請確認網路後再試一次。');
  } finally {
    clearTimeout(timer);
  }
}

/**
 * @param {string} action  例如 'home.summary'
 * @param {object} data
 * @param {{ write?: boolean, requestId?: string, retry?: boolean }} options
 */
export async function api(action, data = {}, { write = false, requestId, retry = true } = {}) {
  if (!API_URL || API_URL.startsWith('PASTE_')) {
    throw new ApiError('CONFIG', '尚未設定 API 網址，請在 config.js 貼上 Apps Script 的網頁應用程式網址。');
  }
  const body = { action, data, token: getToken() };
  if (write) body.request_id = requestId || newRequestId();

  let json;
  try {
    json = await send(body);
  } catch (err) {
    // 網路錯誤自動重試一次。寫入操作帶同一個 request_id，伺服器不會重複寫入。
    if (!retry || err.code !== 'NETWORK') throw err;
    await new Promise((r) => setTimeout(r, 800));
    json = await send(body);
  }

  if (!json || json.ok !== true) {
    const e = json?.error || { code: 'SERVER', message: '系統發生錯誤，請稍後再試。' };
    if (e.code === 'AUTH_REQUIRED') {
      clearSession();
      window.dispatchEvent(new CustomEvent('auth:expired', { detail: e.message }));
    }
    throw new ApiError(e.code, e.message);
  }
  return json.data;
}
