/**
 * 大量藏書盤點：CSV 批次匯入
 * 先預覽檢查（不寫入），確認後分批寫入。重複的書預設略過，不會產生大量重複資料。
 */
import { api } from '../api.js?v=2.0.1';
import { write, booksChanged, taxonomyChanged } from '../data.js?v=2.0.1';
import { esc } from '../utils/format.js?v=2.0.1';
import { toast, setBusy } from '../ui.js?v=2.0.1';

const COLUMNS = [
  ['title', '書名'], ['authors', '作者'], ['illustrators', '繪者'], ['publisher', '出版社'], ['isbn', 'ISBN'],
  ['format', '形式'], ['owner', '歸屬'], ['shelves', '書房'], ['category', '分類'], ['tags', '標籤'],
  ['location', '位置'], ['quantity', '數量'], ['status', '建檔狀態'], ['published_date', '出版日期'], ['notes', '備註']
];
const BATCH = 20;

/** 支援雙引號、逗號、換行的 CSV 解析 */
export function parseCsv(text) {
  const rows = [];
  let row = [], cell = '', q = false;
  const s = text.replace(/^﻿/, '');
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) {
      if (c === '"' && s[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((x) => x.trim() !== ''));
}

function toRecords(table) {
  const header = table[0].map((h) => h.trim());
  const idx = {};
  COLUMNS.forEach(([key, label]) => {
    const i = header.findIndex((h) => h === label || h.toLowerCase() === key);
    if (i !== -1) idx[key] = i;
  });
  if (idx.title === undefined) throw new Error('找不到「書名」欄位。請使用下載的範本，第一列是欄位名稱。');
  return table.slice(1).map((r) => {
    const o = {};
    Object.entries(idx).forEach(([k, i]) => { o[k] = (r[i] || '').trim(); });
    return o;
  });
}

function templateCsv() {
  const head = COLUMNS.map(([, l]) => l).join(',');
  const sample = ['好餓的毛毛蟲', '艾瑞．卡爾', '艾瑞．卡爾', '上誼', '', '實體書', "Liam's Little Library", "Liam's Little Library、Mom's Library", '食物與食育', '互動繪本', '二樓書房／A 書櫃／第 3 層', '1', '已完成建檔', '', ''];
  return '﻿' + head + '\n' + sample.map((x) => (/[",\n]/.test(x) ? `"${x.replace(/"/g, '""')}"` : x)).join(',') + '\n';
}

export function mount(view) {
  view.innerHTML = `
    <p class="crumb"><a href="#/me">我的</a></p>
    <header class="page-head"><div><h1 class="page-title">批次匯入藏書</h1><p class="page-sub">For the big shelf inventory.</p></div></header>
    <ol class="steps">
      <li>下載範本，用 Google 試算表、Numbers 或 Excel 填寫（第一列欄位名稱不要改）。只有「書名」必填。</li>
      <li>匯出成 CSV（UTF-8）後，在下方選擇檔案。也可以直接貼上 CSV 內容。</li>
      <li>系統會先檢查每一列，標示「新書、已收藏、可能重複、格式錯誤」，確認後才寫入。</li>
    </ol>
    <div class="actions-row"><button type="button" class="btn" id="tpl">下載範本</button></div>
    <section class="form-section" style="margin-top:24px">
      <label class="btn"><input type="file" accept=".csv,text/csv" id="csv-file" hidden><span>選擇 CSV 檔案</span></label>
      <details class="form-more" style="margin-top:12px"><summary class="hint">或貼上 CSV 內容</summary>
        <textarea class="input" id="csv-text" rows="6" placeholder="書名,作者,出版社,ISBN"></textarea>
        <button type="button" class="btn" id="csv-go" style="margin-top:8px">檢查內容</button>
      </details>
    </section>
    <div id="imp-body"></div>`;
  const body = view.querySelector('#imp-body');

  view.querySelector('#tpl').addEventListener('click', () => {
    const blob = new Blob([templateCsv()], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = '藏書匯入範本.csv';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  });

  const preview = async (text) => {
    let records;
    try {
      const table = parseCsv(text);
      if (table.length < 2) throw new Error('檔案裡沒有資料列。');
      records = toRecords(table);
    } catch (err) { body.innerHTML = `<p class="form-error">${esc(err.message)}</p>`; return; }
    body.innerHTML = `<p class="hint">檢查 ${records.length} 列中…</p>`;
    let rows;
    try { rows = (await api('books.importPreview', { rows: records })).rows; }
    catch (err) { body.innerHTML = `<p class="form-error">${esc(err.message)}</p>`; return; }

    const count = (s) => rows.filter((r) => r.status === s).length;
    const label = { new: '新書', duplicate: '已收藏或重複', possible: '可能重複', error: '格式錯誤' };
    body.innerHTML = `
      <section class="section">
        <div class="section-head"><h2 class="section-title">檢查結果</h2></div>
        <p>新書 ${count('new')} 本，已收藏或重複 ${count('duplicate')} 列，可能重複 ${count('possible')} 列，格式錯誤 ${count('error')} 列。</p>
        <p class="hint">重複與可能重複的列預設「略過」，需要時可以逐列改成新增。格式錯誤的列不會匯入，請修正檔案後重新上傳。</p>
        <div class="table-wrap"><table class="data-table">
          <thead><tr><th>列</th><th>書名</th><th>結果</th><th>處理方式</th></tr></thead>
          <tbody>${rows.map((r) => {
            const rec = records[r.index];
            const opts = r.status === 'error' ? '' : r.status === 'new'
              ? '<option value="new">新增</option><option value="skip">略過</option>'
              : `<option value="skip">略過</option>${r.edition_id ? '<option value="add_copy">增加一筆收藏</option>' : ''}<option value="new">仍新增為新書</option>`;
            return `<tr class="imp-${r.status}">
              <td>${r.index + 2}</td>
              <td>${esc(rec.title || '（空白）')}${rec.authors ? `<span class="hint" style="display:block">${esc(rec.authors)}</span>` : ''}</td>
              <td><span class="badge">${esc(label[r.status])}</span>${r.message ? `<span class="hint" style="display:block">${esc(r.message)}</span>` : ''}${(r.warnings || []).map((w) => `<span class="hint" style="display:block">${esc(w)}</span>`).join('')}</td>
              <td>${opts ? `<select class="input input-sm" data-row="${r.index}" data-edition="${esc(r.edition_id || '')}">${opts}</select>` : '—'}</td>
            </tr>`;
          }).join('')}</tbody>
        </table></div>
        <div class="form-actions"><button type="button" class="btn btn-primary" id="imp-run">開始匯入</button></div>
        <div id="imp-progress"></div>
      </section>`;

    body.querySelector('#imp-run').addEventListener('click', async (e) => {
      const items = Array.from(body.querySelectorAll('select[data-row]')).map((s) => ({ index: +s.dataset.row, row: records[+s.dataset.row], mode: s.value, edition_id: s.dataset.edition }))
        .filter((x) => x.mode !== 'skip');
      if (!items.length) { toast('沒有要匯入的列。'); return; }
      const restore = setBusy(e.target, '匯入中…');
      body.querySelectorAll('select[data-row]').forEach((s) => { s.disabled = true; });
      const prog = body.querySelector('#imp-progress');
      const results = [];
      for (let i = 0; i < items.length; i += BATCH) {
        prog.innerHTML = `<p class="hint">正在匯入第 ${i + 1} 至 ${Math.min(i + BATCH, items.length)} 筆，共 ${items.length} 筆。請不要關閉頁面。</p>
          <span class="progress-bar"><span style="width:${Math.round(i / items.length * 100)}%"></span></span>`;
        try {
          const r = await write('books.importBatch', { rows: items.slice(i, i + BATCH) });
          results.push(...r.results);
        } catch (err) {
          prog.innerHTML = `<p class="form-error">第 ${i + 1} 筆起匯入失敗：${esc(err.message)}。已完成 ${results.length} 筆，重新選擇檔案時，已匯入的書會被標示為已收藏並自動略過。</p>`;
          booksChanged(); taxonomyChanged();
          restore();
          return;
        }
      }
      booksChanged(); taxonomyChanged();
      const ok = results.filter((r) => r.status === 'created' || r.status === 'added_copy').length;
      const bad = results.filter((r) => r.status === 'error');
      prog.innerHTML = `<div class="pending"><p class="pending-title">匯入完成，新增 ${ok} 筆</p>
        ${bad.length ? `<p class="pending-text">${bad.length} 筆失敗：${bad.map((b) => `第 ${b.index + 2} 列（${esc(b.message)}）`).join('、')}</p>` : ''}
        <p><a class="btn" href="#/library">查看全部藏書</a></p></div>`;
      restore();
      e.target.disabled = true;
    });
  };

  view.querySelector('#csv-file').addEventListener('change', async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    preview(await f.text());
    e.target.value = '';
  });
  view.querySelector('#csv-go').addEventListener('click', () => preview(view.querySelector('#csv-text').value));
}
