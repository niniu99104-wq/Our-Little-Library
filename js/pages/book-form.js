/**
 * 書籍表單頁：新增書籍、編輯作品、新增或編輯版本、新增或編輯收藏
 *
 * 新增書籍時：
 *   1. 可以用 ISBN、掃描條碼、書名搜尋或拍封面辨識帶入資料（都需要使用者確認）
 *   2. 儲存前一定先做重複檢查，有可能重複時由使用者決定怎麼處理
 */
import { api } from '../api.js?v=2.0.1';
import { go } from '../router.js?v=2.0.1';
import { getTaxonomy, getMembers, write, booksChanged, taxonomyChanged } from '../data.js?v=2.0.1';
import { esc } from '../utils/format.js?v=2.0.1';
import {
  workCore, workClassify, workShelves, workMore, editionCore, editionMore, copyCore, copyMore,
  readWork, readEdition, readCopy, readChecked, bindFormatToggle
} from '../components/book-fields.js?v=2.0.1';
import { dupPanel } from '../components/dup-panel.js?v=2.0.1';
import { bindPhotoFields, compressImage } from '../components/photos.js?v=2.0.1';
import { scanIsbn } from '../components/scanner.js?v=2.0.1';
import { toast, setBusy, errorView, skeletonLines } from '../ui.js?v=2.0.1';

function section(title, inner, { open = true, sub = '' } = {}) {
  return open
    ? `<section class="form-section"><h2 class="form-section-title">${esc(title)}</h2>${sub ? `<p class="hint form-section-sub">${esc(sub)}</p>` : ''}${inner}</section>`
    : `<details class="form-section form-more"><summary class="form-section-title">${esc(title)}</summary>${inner}</details>`;
}

/** 收納位置快速新增 */
function bindLocationQuickAdd(form) {
  const box = form.querySelector('.new-location');
  if (!box) return;
  const select = form.querySelector('select[name="location_id"]');
  form.addEventListener('click', async (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'new-location') { box.hidden = false; box.querySelector('input').focus(); }
    if (act === 'cancel-location') box.hidden = true;
    if (act === 'save-location') {
      const restore = setBusy(e.target, '加入中…');
      try {
        const v = (n) => form.elements[n].value.trim();
        const { location } = await write('locations.save', { room: v('nl_room'), bookcase: v('nl_bookcase'), shelf: v('nl_shelf'), box: v('nl_box') }, [taxonomyChanged]);
        select.insertAdjacentHTML('beforeend', `<option value="${esc(location.location_id)}">${esc(location.label)}</option>`);
        select.value = location.location_id;
        ['nl_room', 'nl_bookcase', 'nl_shelf', 'nl_box'].forEach((n) => { form.elements[n].value = ''; });
        box.hidden = true;
        toast(`已加入「${location.label}」`);
      } catch (err) {
        toast(err.message, { error: true });
      } finally {
        restore();
      }
    }
  });
}

function formShell(title, sub, sections, buttons, top = '') {
  return `
    <header class="page-head"><div><h1 class="page-title">${esc(title)}</h1>${sub ? `<p class="page-sub">${esc(sub)}</p>` : ''}</div></header>
    ${top}
    <form id="book-form" class="book-form" novalidate>
      ${sections}
      <div id="dup-box"></div>
      <p class="form-error" id="form-error" role="alert"></p>
      <div class="form-actions">${buttons}</div>
    </form>`;
}

/** 新增書籍上方的查詢區 */
function lookupBar(aiOn) {
  return `
    <section class="lookup" aria-label="帶入書籍資料">
      <form class="lookup-row" id="isbn-form" novalidate>
        <input class="input" name="isbn" inputmode="numeric" placeholder="輸入 ISBN 查詢" aria-label="ISBN" autocomplete="off">
        <button class="btn" type="submit">查詢</button>
      </form>
      <div class="lookup-actions">
        <button type="button" class="btn btn-text" id="scan-btn">掃描條碼</button>
        <button type="button" class="btn btn-text" id="title-btn">用書名搜尋</button>
        ${aiOn ? `<label class="btn btn-text"><input type="file" accept="image/*" capture="environment" id="cover-shot" hidden><span>拍封面辨識</span></label>` : ''}
      </div>
      <div id="lookup-results"></div>
    </section>`;
}

export function mount(view, { params, query, isCurrent }) {
  const mode = params.mode;
  view.innerHTML = skeletonLines(6, 40);

  const load = async () => {
    try {
      const needBook = mode !== 'add';
      const [tax, mem, book, ai] = await Promise.all([
        getTaxonomy(), getMembers(),
        needBook ? api('books.get', { work_id: params.id }) : Promise.resolve(null),
        mode === 'add' ? api('ai.status').catch(() => ({ configured: false })) : Promise.resolve(null)
      ]);
      if (!isCurrent()) return;
      render(tax, mem.members, book, ai);
    } catch (err) {
      if (!isCurrent() || err.code === 'AUTH_REQUIRED') return;
      view.innerHTML = '';
      view.appendChild(errorView(err, () => { view.innerHTML = skeletonLines(6, 40); load(); }));
    }
  };

  function render(tax, members, book, ai) {
    const back = book ? `#/book/${encodeURIComponent(book.work.work_id)}` : '#/library';
    const cancel = `<a class="btn btn-text" href="${back}">取消</a>`;
    const edition = book && params.eid ? book.editions.find((e) => e.edition_id === params.eid) : null;
    const copy = book && params.cid ? book.editions.flatMap((e) => e.copies.map((c) => ({ ...c, _format: e.format }))).find((c) => c.copy_id === params.cid) : null;
    if ((params.eid && !edition) || (params.cid && !copy)) {
      view.innerHTML = `<div class="pending"><p class="pending-title">找不到這筆資料</p><p class="pending-text">它可能已被刪除。</p></div>`;
      return;
    }

    let html = '';
    if (mode === 'add') {
      const presetShelf = query.get('shelf');
      const presetOwner = presetShelf && presetShelf !== 'FAMILY' && members.some((m) => m.member_id === presetShelf) ? presetShelf : 'FAMILY';
      const preset = {
        title: query.get('title') || '', authors: query.get('authors') || '', publisher: query.get('publisher') || '', isbn13: query.get('isbn') || ''
      };
      html = formShell('新增書籍', 'Every shelf starts with one book.', [
        section('書籍', workCore(preset) + editionCore(preset)),
        section('收藏', copyCore({ owner: presetOwner }, members, tax.locations) + workShelves(members, presetOwner === 'FAMILY' ? [] : [presetOwner])),
        section('分類與標籤', workClassify({}, tax)),
        section('更多資料', workMore() + editionMore() + copyMore(), { open: false })
      ].join(''), `<button class="btn btn-primary" type="submit" data-next="detail">儲存</button>
        <button class="btn" type="submit" data-next="again">儲存並新增下一本</button>${cancel}`, lookupBar(ai?.configured));
    } else if (mode === 'edit-work') {
      html = formShell('編輯書籍資料', book.work.title, [
        section('書籍', workCore(book.work) + workMore(book.work)),
        section('書房', workShelves(members, book.shelf_ids)),
        section('分類與標籤', workClassify(book.work, tax, book.tag_ids))
      ].join(''), `<button class="btn btn-primary" type="submit">儲存變更</button>${cancel}`);
    } else if (mode === 'add-edition') {
      html = formShell('新增其他版本', book.work.title, [
        section('版本', editionCore() + editionMore(), { sub: '例如同一本書的英文版、電子書或有聲書。' }),
        section('收藏', copyCore({}, members, tax.locations) + copyMore())
      ].join(''), `<button class="btn btn-primary" type="submit">儲存版本</button>${cancel}`);
    } else if (mode === 'edit-edition') {
      html = formShell('編輯版本', book.work.title, [
        section('版本', editionCore(edition) + editionMore(edition))
      ].join(''), `<button class="btn btn-primary" type="submit">儲存變更</button>${cancel}`);
    } else if (mode === 'add-copy') {
      html = formShell('新增一筆收藏', book.work.title, [
        section('收藏', copyCore({}, members, tax.locations) + copyMore())
      ].join(''), `<button class="btn btn-primary" type="submit">儲存收藏</button>${cancel}`);
    } else if (mode === 'edit-copy') {
      html = formShell('編輯收藏', book.work.title, [
        section('收藏', copyCore(copy, members, tax.locations) + copyMore(copy))
      ].join(''), `<button class="btn btn-primary" type="submit">儲存變更</button>${cancel}`);
    }
    view.innerHTML = html;

    const form = view.querySelector('#book-form');
    const errorEl = view.querySelector('#form-error');
    const dupBox = view.querySelector('#dup-box');
    if (mode === 'add-copy') form.dataset.format = edition.format;
    if (mode === 'edit-copy') form.dataset.format = copy._format;
    bindFormatToggle(form);
    bindLocationQuickAdd(form);
    bindPhotoFields(form);

    let statusTouched = false;
    form.elements.inventory_status?.addEventListener('change', () => { statusTouched = true; });

    form.elements.owner?.addEventListener('change', () => {
      const box = form.querySelector(`input[name="shelf_ids"][value="${CSS.escape(form.elements.owner.value)}"]`);
      if (box) box.checked = true;
    });

    /* ---------- 新增書籍：查詢與帶入 ---------- */
    let dupState = null; // { key, result, choice }
    const dupKey = () => [form.elements.title?.value.trim(), form.elements.authors?.value.trim(), form.elements.isbn?.value.trim()].join('|');

    if (mode === 'add') {
      const results = view.querySelector('#lookup-results');
      const fill = (r) => {
        const set = (n, v) => { if (v && form.elements[n]) form.elements[n].value = v; };
        set('title', r.title); set('authors', r.authors); set('illustrators', r.illustrators); set('publisher', r.publisher);
        set('isbn', r.isbn13 || r.isbn); set('published_date', r.published_date); set('pages', r.pages);
        set('summary', r.summary); set('cover_url', r.cover_url);
        if (r.language && form.elements.language) {
          if (![...form.elements.language.options].some((o) => o.value === r.language)) form.elements.language.add(new Option(r.language, r.language));
          form.elements.language.value = r.language;
        }
        results.innerHTML = '<p class="hint">已帶入查詢到的資料，請確認內容正確後再儲存。查不到的欄位保留空白。</p>';
        dupState = null;
        form.elements.title.focus();
      };
      const showResults = (res, label) => {
        const list = res.results || [];
        results.innerHTML = `
          ${res.duplicate && res.duplicate.status !== '目前沒有收藏紀錄' ? dupPanel(res.duplicate) : ''}
          ${list.length ? `<p class="hint">${esc(label)}，請選擇正確的版本帶入：</p>
            <ul class="lookup-list">${list.map((r, i) => `
              <li><button type="button" class="lookup-item" data-i="${i}">
                ${r.cover_url ? `<img src="${esc(r.cover_url)}" alt="" referrerpolicy="no-referrer">` : '<span class="lookup-nocover"></span>'}
                <span><strong>${esc(r.title || '（沒有書名）')}</strong><span class="hint">${esc([r.authors, r.publisher, r.published_date, r.isbn13].filter(Boolean).join('，'))}</span></span>
              </button></li>`).join('')}</ul>`
          : '<p class="hint">書目資料庫裡查不到這本書。很多中文繪本沒有收錄，請直接手動填寫。</p>'}`;
        results.querySelectorAll('.lookup-item').forEach((b) => b.addEventListener('click', () => fill(list[+b.dataset.i])));
      };
      const runIsbn = async (isbn, btn) => {
        const restore = btn ? setBusy(btn, '查詢中…') : null;
        // 不論查詢成功與否，都先把 ISBN 填進下方表單
        if (form.elements.isbn && !form.elements.isbn.value) form.elements.isbn.value = isbn;
        try {
          showResults(await api('books.lookupIsbn', { isbn }), '查到以下資料');
        } catch (err) {
          results.innerHTML = `<p class="form-error">${esc(err.message)}</p>`;
        } finally { restore?.(); }
      };
      view.querySelector('#isbn-form').addEventListener('submit', (e) => {
        e.preventDefault();
        const v = e.target.isbn.value.trim();
        if (v) runIsbn(v, e.submitter);
      });
      view.querySelector('#scan-btn').addEventListener('click', async () => {
        try {
          const isbn = await scanIsbn();
          if (isbn) { view.querySelector('#isbn-form').isbn.value = isbn; runIsbn(isbn); }
        } catch (err) { toast(err.message, { error: true }); }
      });
      view.querySelector('#title-btn').addEventListener('click', async (e) => {
        const title = form.elements.title.value.trim();
        if (!title) { toast('請先在下方填寫書名，再按搜尋。', { error: true }); form.elements.title.focus(); return; }
        const restore = setBusy(e.target, '搜尋中…');
        try {
          showResults(await api('books.lookupTitle', { title, author: form.elements.authors.value.trim().split('、')[0] }), `「${title}」的搜尋結果`);
        } catch (err) {
          results.innerHTML = `<p class="form-error">${esc(err.message)}</p>`;
        } finally { restore(); }
      });
      view.querySelector('#cover-shot')?.addEventListener('change', async (e) => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file) return;
        results.innerHTML = '<p class="hint">辨識封面中，大約需要 5 至 15 秒…</p>';
        try {
          const img = await compressImage(file, 1200);
          const r = await api('ai.recognizeCover', { mime: img.mime, data: img.data });
          const rec = r.recognized;
          if (r.lookup) {
            showResults(r.lookup, `封面辨識出「${rec.title || '（無法辨識書名）'}」，書目查詢結果`);
            results.insertAdjacentHTML('afterbegin', `<p><button type="button" class="btn btn-text" id="use-rec">直接使用辨識出的文字</button></p>`);
          } else {
            results.innerHTML = `<p class="hint">辨識結果：${esc([rec.title, rec.authors, rec.publisher].filter(Boolean).join('，') || '看不清楚')}</p>
              <p><button type="button" class="btn" id="use-rec">使用辨識結果</button></p>${r.duplicate ? dupPanel(r.duplicate) : ''}`;
          }
          view.querySelector('#use-rec')?.addEventListener('click', () => fill(rec));
        } catch (err) {
          results.innerHTML = `<p class="form-error">${esc(err.message)}</p>`;
        }
      });

      // 選擇如何處理可能重複的書
      dupBox.addEventListener('click', (e) => {
        const b = e.target.closest('[data-dup]');
        if (!b) return;
        const choice = b.dataset.dup;
        if (choice === 'copy') { go(`/book/${encodeURIComponent(b.dataset.work)}/edition/${encodeURIComponent(b.dataset.edition)}/copy/new`); return; }
        dupState.choice = choice;
        dupState.work = b.dataset.work;
        dupBox.innerHTML = choice === 'edition'
          ? '<p class="hint dup-chosen">已選擇：加到既有的書，成為另一個版本。請按「儲存」。</p>'
          : '<p class="hint dup-chosen">已選擇：新增為不同的書。請按「儲存」。</p>';
      });
    }
    form.elements.title?.focus();

    const resetForNext = () => {
      ['title', 'authors', 'illustrators', 'isbn', 'original_title', 'summary', 'translators', 'edition_title',
        'pages', 'duration_min', 'cover_url', 'cover_file_id', 'published_date', 'notes', 'age_min', 'age_max'].forEach((n) => {
        if (form.elements[n]) form.elements[n].value = '';
      });
      form.querySelectorAll('input[name="tag_ids"]').forEach((i) => { i.checked = false; });
      form.querySelector('[data-photos="cover_file_id"] .photo-list').innerHTML = '';
      view.querySelector('#lookup-results').innerHTML = '';
      view.querySelector('#isbn-form').reset();
      dupBox.innerHTML = '';
      dupState = null;
      form.elements.title.focus();
      window.scrollTo(0, 0);
    };

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      errorEl.textContent = '';
      const submitter = e.submitter || form.querySelector('button[type=submit]');
      const restore = setBusy(submitter, '儲存中…');
      form.querySelectorAll('button[type=submit]').forEach((b) => { b.disabled = true; });
      try {
        let result;
        if (mode === 'add') {
          const work = readWork(form);
          const edition = readEdition(form);
          const copy = readCopy(form);
          if (!work.title) throw Object.assign(new Error('請填寫書名。'), { field: 'title' });
          // 儲存前一定先比對；內容有改變就重新比對
          if (!dupState || dupState.key !== dupKey()) {
            const result0 = await api('books.checkDuplicate', { title: work.title, authors: work.authors, isbn: edition.isbn });
            dupState = { key: dupKey(), result: result0, choice: '' };
            if (result0.matches.length || result0.wish_matches.length) {
              dupBox.innerHTML = dupPanel(result0, { actions: true });
              dupBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
              throw new Error('發現可能重複的書，請在上方選擇處理方式。');
            }
          } else if ((dupState.result.matches.length || dupState.result.wish_matches.length) && !dupState.choice) {
            throw new Error('請先在上方選擇如何處理可能重複的書。');
          }
          const onlyTitle = !work.authors && !edition.publisher && !edition.isbn;
          if (!statusTouched && onlyTitle) copy.inventory_status = '待確認';
          if (edition.cover_url && !edition.isbn && !work.authors) edition.data_source = 'manual';
          if (dupState?.choice === 'edition') {
            result = await write('books.addEdition', { work_id: dupState.work, edition, copy }, [booksChanged]);
          } else {
            result = await write('books.create', {
              work, edition, copy, tag_ids: readChecked(form, 'tag_ids'), shelf_ids: readChecked(form, 'shelf_ids')
            }, [booksChanged]);
          }
          toast(`已收藏《${result.work.title}》`);
          if (submitter.dataset.next === 'again') { resetForNext(); return; }
          go(`/book/${encodeURIComponent(result.work.work_id)}`);
          return;
        }
        if (mode === 'edit-work') {
          const work = readWork(form);
          if (!work.title) throw Object.assign(new Error('請填寫書名。'), { field: 'title' });
          result = await write('books.updateWork', {
            work_id: book.work.work_id, work, tag_ids: readChecked(form, 'tag_ids'), shelf_ids: readChecked(form, 'shelf_ids'),
            expected_updated_at: book.work.updated_at
          }, [booksChanged]);
        } else if (mode === 'add-edition') {
          result = await write('books.addEdition', { work_id: book.work.work_id, edition: readEdition(form), copy: readCopy(form) }, [booksChanged]);
        } else if (mode === 'edit-edition') {
          result = await write('books.updateEdition', { edition_id: edition.edition_id, edition: readEdition(form), expected_updated_at: edition.updated_at }, [booksChanged]);
        } else if (mode === 'add-copy') {
          result = await write('copies.create', { edition_id: edition.edition_id, copy: readCopy(form) }, [booksChanged]);
        } else if (mode === 'edit-copy') {
          result = await write('copies.update', { copy_id: copy.copy_id, copy: readCopy(form), expected_updated_at: copy.updated_at }, [booksChanged]);
        }
        toast('已儲存');
        go(`/book/${encodeURIComponent(result.work.work_id)}`);
      } catch (err) {
        errorEl.textContent = err.message;
        if (err.field && form.elements[err.field]) form.elements[err.field].focus();
      } finally {
        restore();
        form.querySelectorAll('button[type=submit]').forEach((b) => { b.disabled = false; });
      }
    });
  }

  load();
}
