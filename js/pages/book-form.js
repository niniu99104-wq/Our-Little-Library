/**
 * 書籍表單頁：新增書籍、編輯作品、新增或編輯版本、新增或編輯收藏
 */
import { api } from '../api.js';
import { go } from '../router.js';
import { getTaxonomy, getMembers, write, booksChanged, taxonomyChanged } from '../data.js';
import { esc } from '../utils/format.js';
import {
  workCore, workClassify, workShelves, workMore, editionCore, editionMore, copyCore, copyMore,
  readWork, readEdition, readCopy, readChecked, bindFormatToggle
} from '../components/book-fields.js';
import { toast, setBusy, errorView, skeletonLines } from '../ui.js';

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

function formShell(title, sub, sections, buttons) {
  return `
    <header class="page-head"><div><h1 class="page-title">${esc(title)}</h1>${sub ? `<p class="page-sub">${esc(sub)}</p>` : ''}</div></header>
    <form id="book-form" class="book-form" novalidate>
      ${sections}
      <p class="form-error" id="form-error" role="alert"></p>
      <div class="form-actions">${buttons}</div>
    </form>`;
}

export function mount(view, { params, query, isCurrent }) {
  const mode = params.mode;
  view.innerHTML = skeletonLines(6, 40);

  const load = async () => {
    try {
      const needBook = mode !== 'add';
      const [tax, mem, book] = await Promise.all([
        getTaxonomy(), getMembers(), needBook ? api('books.get', { work_id: params.id }) : Promise.resolve(null)
      ]);
      if (!isCurrent()) return;
      render(tax, mem.members, book);
    } catch (err) {
      if (!isCurrent() || err.code === 'AUTH_REQUIRED') return;
      view.innerHTML = '';
      view.appendChild(errorView(err, () => { view.innerHTML = skeletonLines(6, 40); load(); }));
    }
  };

  function render(tax, members, book) {
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
      html = formShell('新增書籍', 'Every shelf starts with one book.', [
        section('書籍', workCore() + editionCore()),
        section('收藏', copyCore({ owner: presetOwner }, members, tax.locations) + workShelves(members, presetOwner === 'FAMILY' ? [] : [presetOwner])),
        section('分類與標籤', workClassify({}, tax)),
        section('更多資料', workMore() + editionMore() + copyMore(), { open: false })
      ].join(''), `<button class="btn btn-primary" type="submit" data-next="detail">儲存</button>
        <button class="btn" type="submit" data-next="again">儲存並新增下一本</button>${cancel}`);
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
    // 只有收藏欄位的表單，依照所屬版本的形式顯示欄位
    if (mode === 'add-copy') form.dataset.format = edition.format;
    if (mode === 'edit-copy') form.dataset.format = copy._format;
    bindFormatToggle(form);
    bindLocationQuickAdd(form);

    let statusTouched = false;
    form.elements.inventory_status?.addEventListener('change', () => { statusTouched = true; });
    form.elements.title?.focus();

    // 新增時選擇歸屬成員，自動勾選他的書房
    form.elements.owner?.addEventListener('change', () => {
      const box = form.querySelector(`input[name="shelf_ids"][value="${CSS.escape(form.elements.owner.value)}"]`);
      if (box) box.checked = true;
    });

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
          const onlyTitle = !work.authors && !edition.publisher && !edition.isbn;
          if (!statusTouched && onlyTitle) copy.inventory_status = '待確認';
          result = await write('books.create', {
            work, edition, copy, tag_ids: readChecked(form, 'tag_ids'), shelf_ids: readChecked(form, 'shelf_ids')
          }, [booksChanged]);
          if (submitter.dataset.next === 'again') {
            toast(`已收藏《${result.work.title}》`);
            // 保留歸屬、書房、位置、分類與形式，方便連續建檔
            ['title', 'authors', 'illustrators', 'isbn', 'original_title', 'summary', 'translators', 'edition_title',
              'pages', 'duration_min', 'cover_url', 'published_date', 'notes', 'age_min', 'age_max'].forEach((n) => {
              if (form.elements[n]) form.elements[n].value = '';
            });
            form.querySelectorAll('input[name="tag_ids"]').forEach((i) => { i.checked = false; });
            form.elements.title.focus();
            window.scrollTo(0, 0);
            return;
          }
          toast(`已收藏《${result.work.title}》`);
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
        // 儲存失敗時保留所有已填寫的內容
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
