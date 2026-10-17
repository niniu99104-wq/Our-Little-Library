/**
 * 通用表單：依欄位規格產生表單與讀取內容
 *
 * 欄位規格 { name, label, type, options, hint, attrs, required, group }
 *   type：text / textarea / number / date / time / select / chips / rating / checkbox / book / photos
 */
import { esc } from '../utils/format.js?v=2.0.1';

function opt(list, value, empty) {
  return (empty !== undefined ? `<option value="">${esc(empty)}</option>` : '') +
    list.map(([v, l]) => `<option value="${esc(v)}"${String(v) === String(value ?? '') ? ' selected' : ''}>${esc(l)}</option>`).join('');
}

export function renderField(f, value, ctx = {}) {
  const v = value ?? '';
  const name = esc(f.name);
  const attrs = f.attrs || '';
  const req = f.required ? ' required' : '';
  const wrap = (control, legend = false) => {
    const hint = f.hint ? `<span class="hint">${esc(f.hint)}</span>` : '';
    const when = f.when ? ` data-when="${esc(f.when)}"` : '';
    return legend
      ? `<fieldset class="field"${when}><legend class="field-label">${esc(f.label)}</legend>${control}${hint}</fieldset>`
      : `<label class="field"${when}><span class="field-label">${esc(f.label)}</span>${control}${hint}</label>`;
  };
  switch (f.type) {
    case 'textarea':
      return wrap(`<textarea class="input" name="${name}" rows="${f.rows || 3}" ${attrs}${req}>${esc(v)}</textarea>`);
    case 'number':
      return wrap(`<input class="input" type="number" inputmode="decimal" name="${name}" value="${esc(v)}" ${attrs}${req}>`);
    case 'date':
    case 'time':
      return wrap(`<input class="input" type="${f.type}" name="${name}" value="${esc(v)}" ${attrs}${req}>`);
    case 'select':
      return wrap(`<select class="input" name="${name}"${req}>${opt(f.options, v, f.empty)}</select>`);
    case 'chips': {
      const selected = new Set(Array.isArray(v) ? v : String(v).split(/[,，、]/).filter(Boolean));
      return wrap(`<div class="chips">${f.options.map(([ov, ol]) => `
        <label class="chip chip-check"><input type="${f.single ? 'radio' : 'checkbox'}" name="${name}" value="${esc(ov)}"${selected.has(String(ov)) ? ' checked' : ''}><span>${esc(ol)}</span></label>`).join('')}</div>`, true);
    }
    case 'rating':
      return wrap(`<div class="rating" role="radiogroup">${[1, 2, 3, 4, 5].map((n) => `
        <label><input type="radio" name="${name}" value="${n}"${String(v) === String(n) ? ' checked' : ''}><span aria-label="${n} 分">${n}</span></label>`).join('')}
        <button type="button" class="btn btn-text btn-inline" data-clear-rating="${name}">清除</button></div>`, true);
    case 'checkbox':
      return `<label class="check"${f.when ? ` data-when="${esc(f.when)}"` : ''}><input type="checkbox" name="${name}"${v === true || v === 'TRUE' ? ' checked' : ''}><span>${esc(f.label)}</span></label>`;
    case 'book': {
      const title = ctx.bookTitle ? ctx.bookTitle(v) : '';
      return wrap(`<div class="book-pick">
        <input type="hidden" name="${name}" value="${esc(v)}">
        <span class="book-pick-title" data-pick-title="${name}">${esc(title || (f.empty || '尚未選擇'))}</span>
        <button type="button" class="btn" data-pick-book="${name}" data-shelf="${esc(f.shelf || '')}">${v ? '更換' : '選擇書籍'}</button>
        ${f.required ? '' : `<button type="button" class="btn btn-text" data-clear-book="${name}"${v ? '' : ' hidden'}>清除</button>`}
      </div>`, true);
    }
    case 'photos':
      return wrap(`<div class="photos" data-photos="${name}" data-kind="${esc(f.kind || 'journal')}">
        <input type="hidden" name="${name}" value="${esc(Array.isArray(v) ? v.join(',') : v)}">
        <div class="photo-list"></div>
        <label class="btn photo-add"><input type="file" accept="image/*" multiple hidden><span>加入照片</span></label>
      </div>`, true);
    default:
      return wrap(`<input class="input" name="${name}" value="${esc(v)}" autocomplete="off" ${attrs}${req}>`);
  }
}

export function renderFields(spec, values = {}, ctx = {}) {
  return spec.map((f) => (f.html ? f.html : renderField(f, values[f.name], ctx))).join('');
}

export function readFields(form, spec) {
  const out = {};
  spec.forEach((f) => {
    if (!f.name) return;
    const el = form.elements[f.name];
    if (f.type === 'chips' && !f.single) {
      out[f.name] = Array.from(form.querySelectorAll(`input[name="${CSS.escape(f.name)}"]:checked`)).map((i) => i.value);
    } else if (f.type === 'rating' || (f.type === 'chips' && f.single)) {
      out[f.name] = form.querySelector(`input[name="${CSS.escape(f.name)}"]:checked`)?.value || '';
    } else if (f.type === 'checkbox') {
      out[f.name] = !!el?.checked;
    } else if (f.type === 'photos') {
      out[f.name] = (el?.value || '').split(',').filter(Boolean);
    } else {
      out[f.name] = el ? String(el.value ?? '').trim() : '';
    }
  });
  return out;
}

/** 依 data-when="欄位=值" 顯示或隱藏欄位 */
export function bindWhen(form, getValue) {
  const apply = () => {
    form.querySelectorAll('[data-when]').forEach((el) => {
      const [k, want] = el.dataset.when.split('=');
      el.hidden = String(getValue(k)) !== want;
    });
  };
  form.addEventListener('change', apply);
  apply();
  return apply;
}

/** 評分「清除」按鈕 */
export function bindRatingClear(form) {
  form.addEventListener('click', (e) => {
    const n = e.target.closest('[data-clear-rating]')?.dataset.clearRating;
    if (n) form.querySelectorAll(`input[name="${CSS.escape(n)}"]`).forEach((i) => { i.checked = false; });
  });
}
