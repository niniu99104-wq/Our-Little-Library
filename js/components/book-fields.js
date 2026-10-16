/**
 * 書籍表單欄位：作品、版本、收藏三組，新增與編輯共用
 */
import { esc } from '../utils/format.js';
import { FORMAT_LABEL, SCOPE_LABEL, INVENTORY_STATUS, CONDITIONS, ACQUIRED_VIA } from '../data.js';

const LANGS = [['zh-TW', '繁體中文'], ['en', '英文'], ['ja', '日文'], ['ko', '韓文'], ['zh-CN', '簡體中文']];

export function field(label, control, hint = '') {
  return `<label class="field"><span class="field-label">${esc(label)}</span>${control}${hint ? `<span class="hint">${esc(hint)}</span>` : ''}</label>`;
}

export function input(name, value = '', attrs = '') {
  return `<input class="input" name="${name}" value="${esc(value)}" ${attrs}>`;
}

function options(list, value, empty) {
  return (empty !== undefined ? `<option value="">${esc(empty)}</option>` : '') +
    list.map(([v, l]) => `<option value="${esc(v)}"${String(v) === String(value) ? ' selected' : ''}>${esc(l)}</option>`).join('');
}

function monthsToYears(m) {
  return m === '' || m === undefined || m === null ? '' : String(Math.round((Number(m) / 12) * 10) / 10);
}

/* ---------- 作品 ---------- */

export function workCore(w = {}) {
  return `
    ${field('書名', input('title', w.title, 'required maxlength="200" autocomplete="off"'), '只填書名也能先儲存，其他資料之後再補。')}
    <div class="grid-2">
      ${field('作者', input('authors', w.authors, 'maxlength="200" autocomplete="off" placeholder="多位以頓號分隔"'))}
      ${field('繪者', input('illustrators', w.illustrators, 'maxlength="200" autocomplete="off"'))}
    </div>`;
}

export function workClassify(w = {}, tax, tagIds = []) {
  const groups = ['liam', 'mom', 'dad', 'family'].map((scope) => {
    const cats = tax.categories.filter((c) => c.scope === scope);
    if (!cats.length) return '';
    return `<optgroup label="${esc(SCOPE_LABEL[scope])}">${options(cats.map((c) => [c.category_id, c.name]), w.primary_category_id)}</optgroup>`;
  }).join('');
  const tagSet = new Set(tagIds);
  return `
    ${field('主要分類', `<select class="input" name="primary_category_id"><option value="">未分類</option>${groups}</select>`)}
    <fieldset class="field">
      <legend class="field-label">標籤</legend>
      ${tax.tags.length ? `<div class="chips">${tax.tags.map((t) => `
        <label class="chip chip-check"><input type="checkbox" name="tag_ids" value="${esc(t.tag_id)}"${tagSet.has(t.tag_id) ? ' checked' : ''}><span>${esc(t.name)}</span></label>`).join('')}</div>`
        : '<p class="hint">還沒有標籤，可以在「我的 → 分類、標籤與收納位置」新增。</p>'}
    </fieldset>`;
}

export function workShelves(members, shelfIds = []) {
  const set = new Set(shelfIds);
  return `
    <fieldset class="field">
      <legend class="field-label">出現在哪些書房</legend>
      <div class="chips">${members.map((m) => `
        <label class="chip chip-check" data-theme="${esc(m.theme_key)}"><input type="checkbox" name="shelf_ids" value="${esc(m.member_id)}"${set.has(m.member_id) ? ' checked' : ''}><span>${esc(m.shelf_name)}</span></label>`).join('')}</div>
      <span class="hint">同一本書可以放進多個書房，藏書數量不會重複計算。</span>
    </fieldset>`;
}

export function workMore(w = {}) {
  return `
    ${field('原文書名', input('original_title', w.original_title, 'maxlength="200" autocomplete="off"'))}
    <fieldset class="field">
      <legend class="field-label">建議閱讀年齡（歲）</legend>
      <div class="range-row">
        <input class="input" name="age_min" type="number" inputmode="decimal" min="0" max="20" step="0.5" value="${esc(monthsToYears(w.age_min_months))}" aria-label="最小年齡">
        <span>至</span>
        <input class="input" name="age_max" type="number" inputmode="decimal" min="0" max="20" step="0.5" value="${esc(monthsToYears(w.age_max_months))}" aria-label="最大年齡">
      </div>
      <span class="hint">可填 0.5 代表半歲，例如 2.5 歲。</span>
    </fieldset>
    ${field('簡介', `<textarea class="input" name="summary" rows="4" maxlength="3000">${esc(w.summary)}</textarea>`)}`;
}

/* ---------- 版本 ---------- */

export function editionCore(e = {}) {
  const fmt = e.format || 'physical';
  return `
    <fieldset class="field">
      <legend class="field-label">書籍形式</legend>
      <div class="segmented">${Object.entries(FORMAT_LABEL).map(([v, l]) => `
        <label><input type="radio" name="format" value="${v}"${v === fmt ? ' checked' : ''}><span>${l}</span></label>`).join('')}</div>
    </fieldset>
    <div class="grid-2">
      ${field('出版社', input('publisher', e.publisher, 'maxlength="80" autocomplete="off"'))}
      ${field('ISBN', input('isbn', e.isbn13 || e.isbn10, 'inputmode="numeric" maxlength="20" autocomplete="off" placeholder="10 碼或 13 碼"'))}
    </div>`;
}

export function editionMore(e = {}) {
  const lang = e.language || 'zh-TW';
  const known = LANGS.some(([v]) => v === lang);
  return `
    <div class="grid-2">
      ${field('出版日期', input('published_date', e.published_date, 'maxlength="10" placeholder="2024 或 2024-05" autocomplete="off"'))}
      ${field('語言', `<select class="input" name="language">${options(known ? LANGS : [...LANGS, [lang, lang]], lang)}</select>`)}
    </div>
    <div class="grid-2">
      ${field('譯者', input('translators', e.translators, 'maxlength="200" autocomplete="off"'))}
      ${field('版本書名', input('edition_title', e.edition_title, 'maxlength="200" autocomplete="off"'), '與作品書名不同時才需要填')}
    </div>
    <div class="grid-2">
      <div data-show="physical ebook">${field('頁數', input('pages', e.pages, 'type="number" inputmode="numeric" min="1" max="20000"'))}</div>
      <div data-show="audiobook">${field('長度（分鐘）', input('duration_min', e.duration_min, 'type="number" inputmode="numeric" min="1"'))}</div>
    </div>
    ${field('封面網址', input('cover_url', e.cover_url, 'type="url" inputmode="url" maxlength="1000" placeholder="https://"'), '貼上公開的封面圖片網址；照片上傳功能會在之後加入。')}
    <label class="check"><input type="checkbox" name="is_box_set"${e.is_box_set === 'TRUE' ? ' checked' : ''}><span>這是套書</span></label>`;
}

/* ---------- 收藏 ---------- */

export function copyCore(c = {}, members, locations) {
  const owner = c.owner || 'FAMILY';
  const ownerOpts = [['FAMILY', 'Family Collection（全家共用）'], ...members.map((m) => [m.member_id, m.shelf_name])];
  return `
    ${field('收藏歸屬', `<select class="input" name="owner">${options(ownerOpts, owner)}</select>`)}
    <div class="grid-2" data-show="physical">
      <div class="field">
        <label for="loc-select" class="field-label">收納位置</label>
        <select class="input" name="location_id" id="loc-select">${options(locations.map((l) => [l.location_id, l.label]), c.location_id, '未設定位置')}</select>
        <button type="button" class="btn btn-text btn-inline" data-act="new-location">新增位置</button>
      </div>
      ${field('數量', input('quantity', c.quantity || 1, 'type="number" inputmode="numeric" min="1" max="99"'))}
    </div>
    <div class="new-location" hidden>
      <div class="grid-4">
        ${input('nl_room', '', 'placeholder="房間" maxlength="30" aria-label="房間"')}
        ${input('nl_bookcase', '', 'placeholder="書櫃" maxlength="30" aria-label="書櫃"')}
        ${input('nl_shelf', '', 'placeholder="層架" maxlength="30" aria-label="層架"')}
        ${input('nl_box', '', 'placeholder="收納盒" maxlength="30" aria-label="收納盒"')}
      </div>
      <div class="actions-row">
        <button type="button" class="btn" data-act="save-location">加入位置</button>
        <button type="button" class="btn btn-text" data-act="cancel-location">取消</button>
      </div>
    </div>`;
}

export function copyMore(c = {}) {
  return `
    <div class="grid-2">
      ${field('取得日期', input('acquired_date', c.acquired_date, 'type="date"'))}
      ${field('取得方式', `<select class="input" name="acquired_via">${options(ACQUIRED_VIA.map((v) => [v, v]), c.acquired_via, '未填')}</select>`)}
    </div>
    <div class="grid-2">
      ${field('書籍狀況', `<select class="input" name="condition">${options(CONDITIONS.map((v) => [v, v]), c.condition, '未填')}</select>`)}
      ${field('建檔狀態', `<select class="input" name="inventory_status">${options(INVENTORY_STATUS.map((v) => [v, v]), c.inventory_status || '已完成建檔')}</select>`)}
    </div>
    ${field('備註', `<textarea class="input" name="notes" rows="2" maxlength="1000">${esc(c.notes)}</textarea>`)}`;
}

/* ---------- 讀取表單 ---------- */

const val = (form, name) => (form.elements[name] ? String(form.elements[name].value ?? '').trim() : '');
const yearsToMonths = (y) => (y === '' ? '' : Math.round(Number(y) * 12));

export function readWork(form) {
  return {
    title: val(form, 'title'),
    authors: val(form, 'authors'),
    illustrators: val(form, 'illustrators'),
    original_title: val(form, 'original_title'),
    summary: val(form, 'summary'),
    primary_category_id: val(form, 'primary_category_id'),
    age_min_months: yearsToMonths(val(form, 'age_min')),
    age_max_months: yearsToMonths(val(form, 'age_max'))
  };
}

export function readChecked(form, name) {
  return Array.from(form.querySelectorAll(`input[name="${name}"]:checked`)).map((i) => i.value);
}

export function readEdition(form) {
  return {
    format: form.querySelector('input[name="format"]:checked')?.value || 'physical',
    publisher: val(form, 'publisher'),
    isbn: val(form, 'isbn'),
    published_date: val(form, 'published_date'),
    language: val(form, 'language'),
    translators: val(form, 'translators'),
    edition_title: val(form, 'edition_title'),
    pages: val(form, 'pages'),
    duration_min: val(form, 'duration_min'),
    cover_url: val(form, 'cover_url'),
    is_box_set: !!form.elements.is_box_set?.checked
  };
}

export function readCopy(form) {
  return {
    owner: val(form, 'owner'),
    location_id: val(form, 'location_id'),
    quantity: val(form, 'quantity'),
    acquired_date: val(form, 'acquired_date'),
    acquired_via: val(form, 'acquired_via'),
    condition: val(form, 'condition'),
    inventory_status: val(form, 'inventory_status'),
    notes: val(form, 'notes')
  };
}

/** 依書籍形式顯示或隱藏欄位（電子書、有聲書不需要收納位置與數量） */
export function bindFormatToggle(form) {
  const apply = () => {
    const fmt = form.querySelector('input[name="format"]:checked')?.value || form.dataset.format || 'physical';
    form.querySelectorAll('[data-show]').forEach((el) => {
      el.hidden = !el.dataset.show.split(' ').includes(fmt);
    });
  };
  form.addEventListener('change', (e) => { if (e.target.name === 'format') apply(); });
  apply();
}
