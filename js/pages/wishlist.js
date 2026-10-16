/**
 * 想買的書：清單、新增與編輯、詳細與 AI 顧問、標記已購買
 */
import { api } from '../api.js?v=2.0.0';
import { getSession } from '../auth.js?v=2.0.0';
import { go } from '../router.js?v=2.0.0';
import { getMembers, getTaxonomy, write, booksChanged, shelfName, indexBy } from '../data.js?v=2.0.0';
import { esc, formatDate, formatMoney, formatCount } from '../utils/format.js?v=2.0.0';
import { renderFields, readFields } from '../components/form.js?v=2.0.0';
import { dupPanel, statusBadge, advicePanel } from '../components/dup-panel.js?v=2.0.0';
import { copyCore, workShelves } from '../components/book-fields.js?v=2.0.0';
import { toast, setBusy, confirmDialog, errorView, skeletonLines } from '../ui.js?v=2.0.0';
import { todayInTaipei } from '../utils/age.js?v=2.0.0';

const OPEN = ['優先購買', '想買', '觀望中'];
const TABS = [['open', '想買'], ['bought', '已購買'], ['paused', '暫不購買']];
const ui = { tab: 'open' };

const forget = () => booksChanged();

/* ---------- 清單 ---------- */

export function listMount(view, { isCurrent }) {
  view.innerHTML = `
    <header class="page-head">
      <div><h1 class="page-title">想買的書</h1><p class="page-sub">Books we are waiting for.</p></div>
      <a class="btn btn-primary" href="#/wishlist/new">加入願望清單</a>
    </header>
    <div class="tabs" role="tablist">${TABS.map(([k, l]) => `<button type="button" role="tab" class="tab" data-tab="${k}" aria-selected="${k === ui.tab}">${l}</button>`).join('')}</div>
    <div id="wish-body">${skeletonLines(4, 56)}</div>`;
  const body = view.querySelector('#wish-body');
  let data = null, members = [];

  const draw = () => {
    const memById = indexBy(members, 'member_id');
    const items = data.items.filter((w) => (ui.tab === 'open' ? OPEN.includes(w.status) : ui.tab === 'bought' ? w.status === '已購買' : w.status === '暫不購買'));
    if (!items.length) {
      body.innerHTML = `<div class="empty"><p class="empty-text">${ui.tab === 'open' ? '還沒有想買的書。看到喜歡的書時，先加進來比對家裡有沒有。' : '這裡目前沒有書。'}</p>
        ${ui.tab === 'open' ? '<a class="btn btn-primary" href="#/wishlist/new">加入願望清單</a>' : ''}</div>`;
      return;
    }
    const total = items.reduce((n, w) => n + (Number(w.ref_price) || 0), 0);
    body.innerHTML = `
      ${ui.tab === 'open' && total ? `<p class="hint result-line">共 ${items.length} 本，參考價格合計 ${esc(formatMoney(total))}（預估，不計入實際支出）</p>` : ''}
      <ul class="list wish-list">${items.map((w) => `
        <li class="list-row wish-row">
          <a class="wish-link" href="#/wishlist/${encodeURIComponent(w.wish_id)}">
            <span class="list-name">${esc(w.title_text)}
              <span class="hint" style="display:block">${esc([w.author_text, shelfName(w.for_member, memById), w.ref_price ? formatMoney(w.ref_price) : ''].filter(Boolean).join('，'))}</span>
            </span>
            <span class="wish-meta">
              ${w.status !== '已購買' ? `<span class="badge">${esc(w.status)}${w.priority === "高" ? "，優先" : ""}</span>` : ''}
              ${w.live_status ? statusBadge(w.live_status) : ''}
            </span>
          </a>
        </li>`).join('')}</ul>`;
  };

  const load = async () => {
    try {
      const [d, m] = await Promise.all([api('wishlist.list'), getMembers()]);
      if (!isCurrent()) return;
      data = d; members = m.members;
      draw();
    } catch (err) {
      if (!isCurrent() || err.code === 'AUTH_REQUIRED') return;
      body.innerHTML = '';
      body.appendChild(errorView(err, load));
    }
  };
  view.querySelector('.tabs').addEventListener('click', (e) => {
    const t = e.target.closest('[data-tab]');
    if (!t) return;
    ui.tab = t.dataset.tab;
    view.querySelectorAll('.tab').forEach((b) => b.setAttribute('aria-selected', String(b === t)));
    if (data) draw();
  });
  load();
}

/* ---------- 新增與編輯 ---------- */

function wishSpec(members) {
  return [
    { name: 'title_text', label: '書名', required: true, attrs: 'maxlength="200"' },
    { name: 'author_text', label: '作者', attrs: 'maxlength="200"' },
    { name: 'publisher_text', label: '出版社', attrs: 'maxlength="80"' },
    { name: 'isbn_text', label: 'ISBN', attrs: 'inputmode="numeric" maxlength="20"' },
    { name: 'for_member', label: '想買給誰', type: 'select', options: [['FAMILY', 'Family Collection（全家）'], ...members.map((m) => [m.member_id, m.shelf_name])] },
    { name: 'priority', label: '優先程度', type: 'chips', single: true, options: [['高', '高'], ['中', '中'], ['低', '低']] },
    { name: 'status', label: '購買狀態', type: 'select', options: [['想買', '想買'], ['觀望中', '觀望中'], ['優先購買', '優先購買'], ['暫不購買', '暫不購買']] },
    { name: 'planned_period', label: '預計購買時間', type: 'text', attrs: 'type="month"' },
    { name: 'ref_price', label: '參考價格（元）', type: 'number', attrs: 'min="0"' },
    { name: 'budget', label: '預算（元）', type: 'number', attrs: 'min="0"' },
    { name: 'url', label: '購買網址', attrs: 'type="url" inputmode="url" placeholder="https://"' },
    { name: 'cover_url', label: '封面網址', attrs: 'type="url" inputmode="url" placeholder="https://"' },
    { name: 'reason', label: '購買原因', type: 'textarea', rows: 2 },
    { name: 'notes', label: '備註', type: 'textarea', rows: 2 }
  ];
}

export function formMount(view, { params, query, isCurrent }) {
  const isNew = !params.id;
  view.innerHTML = skeletonLines(6, 40);
  (async () => {
    try {
      const [{ members }, w] = await Promise.all([getMembers(), isNew ? null : api('wishlist.get', { wish_id: params.id })]);
      if (!isCurrent()) return;
      const values = w || { for_member: query.get('member') || 'FAMILY', priority: '中', status: '想買', title_text: query.get('title') || '' };
      const spec = wishSpec(members);
      view.innerHTML = `
        <p class="crumb"><a href="#/wishlist">想買的書</a></p>
        <header class="page-head"><div><h1 class="page-title">${isNew ? '加入願望清單' : '編輯願望清單'}</h1>
          <p class="page-sub">Is it already on our shelves?</p></div></header>
        <form id="wish-form" class="book-form" novalidate>
          <div class="lookup-row" style="margin-bottom:16px">
            <button type="button" class="btn" id="wl-isbn">用 ISBN 帶入資料</button>
            <button type="button" class="btn btn-text" id="wl-check">比對家中藏書</button>
          </div>
          <div id="wl-check-box"></div>
          ${renderFields(spec.slice(0, 4), values)}
          <div class="grid-2">${renderFields(spec.slice(4, 6), values)}</div>
          <div class="grid-2">${renderFields(spec.slice(6, 8), { ...values, planned_period: (values.planned_period || '').slice(0, 7) })}</div>
          <div class="grid-2">${renderFields(spec.slice(8, 10), values)}</div>
          ${renderFields(spec.slice(10), values)}
          <p class="form-error" id="form-error" role="alert"></p>
          <div class="form-actions">
            <button class="btn btn-primary" type="submit">${isNew ? '加入願望清單' : '儲存變更'}</button>
            <a class="btn btn-text" href="${isNew ? '#/wishlist' : `#/wishlist/${encodeURIComponent(params.id)}`}">取消</a>
          </div>
        </form>`;
      if (!isNew && w.status === '已購買') {
        const sel = view.querySelector('select[name=status]');
        sel.add(new Option('已購買', '已購買'));
        sel.value = '已購買';
      }
      const form = view.querySelector('#wish-form');
      const box = view.querySelector('#wl-check-box');
      const err = view.querySelector('#form-error');
      const check = async () => {
        const d = readFields(form, spec);
        if (!d.title_text && !d.isbn_text) return;
        try {
          const r = await api('wishlist.check', { ...d, wish_id: params.id || '' });
          box.innerHTML = dupPanel(r);
        } catch (e) { box.innerHTML = `<p class="form-error">${esc(e.message)}</p>`; }
      };
      form.title_text.addEventListener('change', check);
      form.isbn_text.addEventListener('change', check);
      view.querySelector('#wl-check').addEventListener('click', check);
      view.querySelector('#wl-isbn').addEventListener('click', async (e) => {
        const isbn = form.isbn_text.value.trim();
        if (!isbn) { toast('請先填寫 ISBN。', { error: true }); form.isbn_text.focus(); return; }
        const restore = setBusy(e.target, '查詢中…');
        try {
          const r = await api('books.lookupIsbn', { isbn });
          const b = r.results[0];
          if (b) {
            if (b.title) form.title_text.value = b.title;
            if (b.authors) form.author_text.value = b.authors;
            if (b.publisher) form.publisher_text.value = b.publisher;
            if (b.cover_url) form.cover_url.value = b.cover_url;
            toast('已帶入資料，請確認');
          } else toast('書目資料庫查不到這本書，請手動填寫。', { error: true });
          box.innerHTML = dupPanel(r.duplicate);
        } catch (e2) { toast(e2.message, { error: true }); } finally { restore(); }
      });
      if (values.title_text) check();

      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        err.textContent = '';
        const d = readFields(form, spec);
        if (!d.title_text) { err.textContent = '請填寫書名。'; form.title_text.focus(); return; }
        const restore = setBusy(e.submitter, '儲存中…');
        try {
          if (isNew) {
            const r = await write('wishlist.create', d, [forget]);
            toast(r.check.status === '目前沒有收藏紀錄' ? '已加入願望清單' : `已加入，提醒：${r.check.status}`);
            go(`/wishlist/${encodeURIComponent(r.item.wish_id)}`);
          } else {
            await write('wishlist.update', { ...d, wish_id: params.id, expected_updated_at: w.updated_at }, [forget]);
            toast('已儲存');
            go(`/wishlist/${encodeURIComponent(params.id)}`);
          }
        } catch (e2) { err.textContent = e2.message; restore(); }
      });
    } catch (err) {
      if (!isCurrent() || err.code === 'AUTH_REQUIRED') return;
      view.innerHTML = '';
      view.appendChild(errorView(err, () => formMount(view, { params, query, isCurrent })));
    }
  })();
}

/* ---------- 詳細頁 ---------- */

export function detailMount(view, { params, isCurrent }) {
  const isAdmin = getSession()?.account?.role === 'admin';
  view.innerHTML = skeletonLines(5, 40);
  const load = async () => {
    try {
      const [w, { members }] = await Promise.all([api('wishlist.get', { wish_id: params.id }), getMembers()]);
      if (!isCurrent()) return;
      const memById = indexBy(members, 'member_id');
      const open = OPEN.includes(w.status);
      view.innerHTML = `
        <p class="crumb"><a href="#/wishlist">想買的書</a></p>
        <article class="book">
          <div class="book-cover">${w.cover_url ? `<img class="cover-img" src="${esc(w.cover_url)}" alt="" referrerpolicy="no-referrer">` : `<div class="cover-fallback" data-theme="family">${esc(w.title_text)}</div>`}</div>
          <div class="book-main">
            <h1 class="page-title">${esc(w.title_text)}</h1>
            <dl class="meta">
              ${[['作者', w.author_text], ['出版社', w.publisher_text], ['ISBN', w.isbn_text], ['想買給', shelfName(w.for_member, memById)],
                ['狀態', w.status], ['優先程度', w.priority], ['預計購買', w.planned_period], ['參考價格', w.ref_price ? formatMoney(w.ref_price) : ''],
                ['預算', w.budget ? formatMoney(w.budget) : ''], ['加入日期', formatDate(w.created_at)]]
                .filter(([, v]) => v).map(([k, v]) => `<div class="meta-row"><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}
              ${w.url ? `<div class="meta-row"><dt>購買網址</dt><dd><a href="${esc(w.url)}" target="_blank" rel="noopener noreferrer">開啟購買頁面</a></dd></div>` : ''}
            </dl>
            ${w.reason ? `<p class="prose">${esc(w.reason)}</p>` : ''}
            ${w.notes ? `<p class="hint prose">${esc(w.notes)}</p>` : ''}
            <div class="actions-row">
              ${open ? `<a class="btn btn-primary" href="#/wishlist/${encodeURIComponent(w.wish_id)}/buy">標記已購買</a>` : ''}
              <a class="btn" href="#/wishlist/${encodeURIComponent(w.wish_id)}/edit">編輯</a>
            </div>
            ${open ? `<div class="chips" style="margin-top:16px" role="group" aria-label="改變狀態">
              ${['優先購買', '想買', '觀望中', '暫不購買'].map((s) => `<button type="button" class="chip" data-status="${s}" aria-pressed="${s === w.status}">${s}</button>`).join('')}
            </div>` : ''}
          </div>
        </article>

        <section class="section">
          <div class="section-head"><h2 class="section-title">家裡有沒有這本書</h2></div>
          ${w.status === '已購買' ? '<p class="hint">這本書已經購買。</p>' : dupPanel(w.live)}
        </section>

        <section class="section">
          <div class="section-head"><h2 class="section-title">智慧購書顧問</h2></div>
          <div class="toolbar">
            <select class="input input-sm" id="adv-member" aria-label="分析對象">
              <option value="">不指定成員</option>
              ${members.map((m) => `<option value="${esc(m.member_id)}"${m.member_id === w.for_member ? ' selected' : ''}>${esc(m.shelf_name)}</option>`).join('')}
            </select>
            <button type="button" class="btn" id="adv-run">開始分析</button>
          </div>
          <div id="adv-box"></div>
        </section>

        ${isAdmin ? `<section class="section"><button type="button" class="btn btn-danger" id="wish-del">刪除這筆</button></section>` : ''}`;

      view.querySelectorAll('[data-status]').forEach((b) => b.addEventListener('click', async () => {
        try {
          await write('wishlist.update', { ...w, status: b.dataset.status, expected_updated_at: w.updated_at }, [forget]);
          toast(`已改為「${b.dataset.status}」`);
          load();
        } catch (e) { toast(e.message, { error: true }); }
      }));
      const advBox = view.querySelector('#adv-box');
      view.querySelector('#adv-run').addEventListener('click', async (e) => {
        const restore = setBusy(e.target, '分析中…');
        advBox.innerHTML = '<p class="hint">正在比對家中藏書，若有設定 AI 服務約需 10 秒。</p>';
        try {
          advBox.innerHTML = advicePanel(await api('ai.advise', { wish_id: w.wish_id, member_id: view.querySelector('#adv-member').value }));
        } catch (err) { advBox.innerHTML = `<p class="form-error">${esc(err.message)}</p>`; } finally { restore(); }
      });
      view.querySelector('#wish-del')?.addEventListener('click', async () => {
        if (!(await confirmDialog({ title: '刪除這筆願望清單？', text: '刪除後可從回收桶還原。', confirmText: '刪除', danger: true }))) return;
        try { await write('wishlist.delete', { wish_id: w.wish_id }, [forget]); toast('已刪除'); go('/wishlist'); } catch (e) { toast(e.message, { error: true }); }
      });
    } catch (err) {
      if (!isCurrent() || err.code === 'AUTH_REQUIRED') return;
      view.innerHTML = '';
      view.appendChild(errorView(err, load));
    }
  };
  load();
}

/* ---------- 標記已購買 ---------- */

export function buyMount(view, { params, isCurrent }) {
  view.innerHTML = skeletonLines(6, 40);
  (async () => {
    try {
      const [w, { members }, tax, recent] = await Promise.all([
        api('wishlist.get', { wish_id: params.id }), getMembers(), getTaxonomy(), api('orders.recent')
      ]);
      if (!isCurrent()) return;
      const owned = w.live.matches.filter((m) => m.kind === 'owned' || m.kind === 'same_isbn');
      const others = w.live.matches.filter((m) => m.kind === 'other_edition');
      const editionOpts = owned.map((m) => m.edition ? `<option value="${esc(m.edition.edition_id)}">${esc(m.title)}（${esc(m.edition.publisher || '')} ${esc(m.edition.isbn || '')}）</option>` : '').join('');
      const workOpts = [...owned, ...others].map((m) => `<option value="${esc(m.work_id)}">${esc(m.title)}</option>`).join('');
      const defaultMode = owned.length ? 'copy' : others.length ? 'edition' : 'new';
      const owner = w.for_member || 'FAMILY';
      view.innerHTML = `
        <p class="crumb"><a href="#/wishlist/${encodeURIComponent(w.wish_id)}">${esc(w.title_text)}</a></p>
        <header class="page-head"><div><h1 class="page-title">標記已購買</h1><p class="page-sub">${esc(w.title_text)}</p></div></header>
        <form id="buy-form" class="book-form" novalidate>
          <section class="form-section">
            <h2 class="form-section-title">訂單</h2>
            <div class="segmented" style="margin-bottom:16px">
              <label><input type="radio" name="order_mode" value="new" checked><span>新的訂單</span></label>
              <label><input type="radio" name="order_mode" value="existing"${recent.orders.length ? '' : ' disabled'}><span>加入最近的訂單</span></label>
            </div>
            <div data-order="new">
              <div class="grid-2">
                <label class="field"><span class="field-label">購買日期</span><input class="input" type="date" name="order_date" value="${todayInTaipei()}"></label>
                <label class="field"><span class="field-label">購買平台</span><input class="input" name="platform" maxlength="40" placeholder="例如：博客來、誠品、二手書店"></label>
              </div>
              <div class="grid-2">
                <label class="field"><span class="field-label">運費（整張訂單一次）</span><input class="input" type="number" inputmode="decimal" min="0" name="shipping" placeholder="0"></label>
                <label class="field"><span class="field-label">訂單折扣（折價券、滿額折）</span><input class="input" type="number" inputmode="decimal" min="0" name="order_discount" placeholder="0"></label>
              </div>
              <label class="field"><span class="field-label">訂單編號（選填）</span><input class="input" name="platform_order_no" maxlength="60"></label>
            </div>
            <div data-order="existing" hidden>
              <label class="field"><span class="field-label">選擇訂單</span>
                <select class="input" name="order_id">${recent.orders.map((o) => `<option value="${esc(o.order_id)}">${esc(formatDate(o.order_date))} ${esc(o.platform || '')}（已有 ${o.item_count} 本，運費 ${esc(formatMoney(o.shipping || 0))}）</option>`).join('')}</select>
                <span class="hint">同一張訂單的運費只記一次，不會重複計算。</span></label>
            </div>
          </section>
          <section class="form-section">
            <h2 class="form-section-title">這本書的價格</h2>
            <div class="grid-2">
              <label class="field"><span class="field-label">定價</span><input class="input" type="number" inputmode="decimal" min="0" name="list_price" value="${esc(w.ref_price || '')}"></label>
              <label class="field"><span class="field-label">單本折扣</span><input class="input" type="number" inputmode="decimal" min="0" name="discount"></label>
            </div>
            <div class="grid-2">
              <label class="field"><span class="field-label">實付金額</span><input class="input" type="number" inputmode="decimal" min="0" name="paid_amount" placeholder="空白時以定價減折扣計算"></label>
              <label class="field"><span class="field-label">買給誰</span><select class="input" name="member_id">
                <option value="FAMILY">Family Collection（全家）</option>
                ${members.map((m) => `<option value="${esc(m.member_id)}"${m.member_id === owner ? ' selected' : ''}>${esc(m.shelf_name)}</option>`).join('')}
              </select></label>
            </div>
          </section>
          <section class="form-section">
            <h2 class="form-section-title">加入家庭藏書</h2>
            <div class="radio-list">
              <label class="check"><input type="radio" name="lib_mode" value="new"${defaultMode === 'new' ? ' checked' : ''}><span>加入藏書，建立新書</span></label>
              ${others.length || owned.length ? `<label class="check"><input type="radio" name="lib_mode" value="edition"${defaultMode === 'edition' ? ' checked' : ''}><span>加到家裡已有的書，成為另一個版本</span></label>` : ''}
              ${owned.length ? `<label class="check"><input type="radio" name="lib_mode" value="copy"${defaultMode === 'copy' ? ' checked' : ''}><span>家裡已有相同版本，只增加一筆收藏</span></label>` : ''}
              <label class="check"><input type="radio" name="lib_mode" value="none"><span>先不加入藏書</span></label>
            </div>
            <div data-lib="new">
              <div class="grid-2">
                <label class="field"><span class="field-label">書名</span><input class="input" name="b_title" value="${esc(w.title_text)}"></label>
                <label class="field"><span class="field-label">作者</span><input class="input" name="b_authors" value="${esc(w.author_text)}"></label>
              </div>
              <div class="grid-2">
                <label class="field"><span class="field-label">出版社</span><input class="input" name="b_publisher" value="${esc(w.publisher_text)}"></label>
                <label class="field"><span class="field-label">ISBN</span><input class="input" name="b_isbn" value="${esc(w.isbn_text)}" inputmode="numeric"></label>
              </div>
              ${workShelves(members, owner === 'FAMILY' ? [] : [owner])}
            </div>
            <div data-lib="edition" hidden><label class="field"><span class="field-label">加到哪一本</span><select class="input" name="lib_work">${workOpts}</select></label></div>
            <div data-lib="copy" hidden><label class="field"><span class="field-label">哪一個版本</span><select class="input" name="lib_edition">${editionOpts}</select></label></div>
            <div data-lib-copy>${copyCore({ owner }, members, tax.locations)}</div>
          </section>
          <p class="form-error" id="form-error" role="alert"></p>
          <div class="form-actions">
            <button class="btn btn-primary" type="submit">完成購買</button>
            <a class="btn btn-text" href="#/wishlist/${encodeURIComponent(w.wish_id)}">取消</a>
          </div>
        </form>`;
      const form = view.querySelector('#buy-form');
      const err = view.querySelector('#form-error');
      const sync = () => {
        const om = form.querySelector('input[name=order_mode]:checked').value;
        form.querySelectorAll('[data-order]').forEach((el) => { el.hidden = el.dataset.order !== om; });
        const lm = form.querySelector('input[name=lib_mode]:checked').value;
        form.querySelectorAll('[data-lib]').forEach((el) => { el.hidden = el.dataset.lib !== lm; });
        form.querySelector('[data-lib-copy]').hidden = lm === 'none';
      };
      form.addEventListener('change', sync);
      form.querySelector('.new-location')?.remove();
      form.querySelector('[data-act=new-location]')?.remove();
      sync();
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        err.textContent = '';
        const v = (n) => (form.elements[n] ? String(form.elements[n].value).trim() : '');
        const om = form.querySelector('input[name=order_mode]:checked').value;
        const lm = form.querySelector('input[name=lib_mode]:checked').value;
        const copy = { owner: v('owner'), location_id: v('location_id'), quantity: v('quantity') };
        let library = null;
        if (lm === 'new') library = { mode: 'new', work: { title: v('b_title'), authors: v('b_authors') }, edition: { publisher: v('b_publisher'), isbn: v('b_isbn'), cover_url: w.cover_url }, copy,
          shelf_ids: Array.from(form.querySelectorAll('input[name=shelf_ids]:checked')).map((i) => i.value) };
        if (lm === 'edition') library = { mode: 'edition', work_id: v('lib_work'), edition: { publisher: w.publisher_text, isbn: w.isbn_text, cover_url: w.cover_url }, copy };
        if (lm === 'copy') library = { mode: 'copy', edition_id: v('lib_edition'), copy };
        const payload = {
          wish_id: w.wish_id,
          ...(om === 'existing' ? { order_id: v('order_id') } : { order: { order_date: v('order_date'), platform: v('platform'), platform_order_no: v('platform_order_no'), shipping: v('shipping'), order_discount: v('order_discount') } }),
          item: { member_id: v('member_id'), list_price: v('list_price'), discount: v('discount'), paid_amount: v('paid_amount') },
          library
        };
        const restore = setBusy(e.submitter, '儲存中…');
        try {
          const r = await write('wishlist.markPurchased', payload, [forget]);
          toast('已記錄購買');
          go(r.work_id ? `/book/${encodeURIComponent(r.work_id)}` : '/wishlist');
        } catch (e2) { err.textContent = e2.message; restore(); }
      });
    } catch (err) {
      if (!isCurrent() || err.code === 'AUTH_REQUIRED') return;
      view.innerHTML = '';
      view.appendChild(errorView(err, () => buyMount(view, { params, isCurrent })));
    }
  })();
}

export { formatCount };
