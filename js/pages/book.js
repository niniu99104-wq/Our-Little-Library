/** 書籍詳細頁：作品資料、所有版本、每一筆收藏 */
import { api } from '../api.js';
import { getSession } from '../auth.js';
import { go } from '../router.js';
import { getTaxonomy, getMembers, write, booksChanged, FORMAT_LABEL, indexBy, ageRangeLabel, shelfName } from '../data.js';
import { esc, formatDate } from '../utils/format.js';
import { coverHtml } from '../components/book-grid.js';
import { toast, confirmDialog, errorView, skeletonLines } from '../ui.js';

const LANG_LABEL = { 'zh-TW': '繁體中文', 'zh-CN': '簡體中文', en: '英文', ja: '日文', ko: '韓文' };

function row(label, value) {
  return value ? `<div class="meta-row"><dt>${esc(label)}</dt><dd>${value}</dd></div>` : '';
}

export function mount(view, { params, isCurrent }) {
  const workId = params.id;
  const isAdmin = getSession()?.account?.role === 'admin';
  view.innerHTML = skeletonLines(5, 32);

  const load = async () => {
    try {
      const [book, tax, mem] = await Promise.all([api('books.get', { work_id: workId }), getTaxonomy(), getMembers()]);
      if (!isCurrent()) return;
      draw(book, tax, mem.members);
    } catch (err) {
      if (!isCurrent() || err.code === 'AUTH_REQUIRED') return;
      view.innerHTML = '';
      view.appendChild(errorView(err, () => { view.innerHTML = skeletonLines(5, 32); load(); }));
    }
  };

  function draw(book, tax, members) {
    const { work, editions } = book;
    const catById = indexBy(tax.categories, 'category_id');
    const tagById = indexBy(tax.tags, 'tag_id');
    const locById = indexBy(tax.locations, 'location_id');
    const memById = indexBy(members, 'member_id');
    const firstCover = editions.find((e) => e.cover_url)?.cover_url || '';
    const cat = catById[work.primary_category_id];
    const tags = book.tag_ids.map((id) => tagById[id]).filter(Boolean);
    const totalCopies = editions.reduce((n, e) => n + e.copies.length, 0);

    view.innerHTML = `
      <p class="crumb"><a href="#/library">全部藏書</a></p>
      <article class="book">
        <div class="book-cover">${coverHtml({ title: work.title, cover_url: firstCover })}</div>
        <div class="book-main">
          <h1 class="page-title">${esc(work.title)}</h1>
          ${work.original_title ? `<p class="page-sub">${esc(work.original_title)}</p>` : ''}
          <dl class="meta">
            ${row('作者', esc(work.authors))}
            ${row('繪者', esc(work.illustrators))}
            ${row('主要分類', cat ? esc(cat.name) : '')}
            ${row('建議年齡', esc(ageRangeLabel(work.age_min_months, work.age_max_months)))}
            ${row('書房', book.shelf_ids.map((id) => `<a href="#/shelves/${encodeURIComponent(id)}">${esc(shelfName(id, memById))}</a>`).join('、'))}
          </dl>
          ${tags.length ? `<div class="chips chips-static">${tags.map((t) => `<span class="chip">${esc(t.name)}</span>`).join('')}</div>` : ''}
          <div class="actions-row">
            <a class="btn" href="#/book/${encodeURIComponent(work.work_id)}/edit">編輯書籍資料</a>
          </div>
        </div>
      </article>

      ${work.summary ? `<section class="section"><div class="section-head"><h2 class="section-title">簡介</h2></div><p class="prose">${esc(work.summary)}</p></section>` : ''}

      <section class="section" aria-labelledby="ed-title">
        <div class="section-head">
          <h2 class="section-title" id="ed-title">版本與收藏</h2>
          <a class="btn btn-text" href="#/book/${encodeURIComponent(work.work_id)}/edition/new">新增其他版本</a>
        </div>
        ${editions.map((e) => `
          <div class="edition">
            <div class="edition-head">
              <p class="edition-title">${esc(FORMAT_LABEL[e.format] || e.format)}${e.publisher ? `，${esc(e.publisher)}` : ''}</p>
              <a class="btn btn-text" href="#/book/${encodeURIComponent(work.work_id)}/edition/${encodeURIComponent(e.edition_id)}/edit">編輯版本</a>
            </div>
            <dl class="meta meta-compact">
              ${row('版本書名', esc(e.edition_title))}
              ${row('ISBN', esc(e.isbn13 || e.isbn10))}
              ${row('出版日期', esc(e.published_date))}
              ${row('語言', esc(LANG_LABEL[e.language] || e.language))}
              ${row('譯者', esc(e.translators))}
              ${row(e.format === 'audiobook' ? '長度' : '頁數', e.format === 'audiobook' ? (e.duration_min ? esc(e.duration_min) + ' 分鐘' : '') : (e.pages ? esc(e.pages) + ' 頁' : ''))}
            </dl>
            <ul class="copies">
              ${e.copies.length ? e.copies.map((c) => `
                <li class="copy">
                  <div>
                    <p>${esc(shelfName(c.owner, memById))}${e.format === 'physical' ? `，${esc(c.quantity)} 本` : ''}</p>
                    <p class="hint">${esc([
                      e.format === 'physical' ? (locById[c.location_id]?.label || '未設定位置') : '',
                      c.condition, c.acquired_via, c.acquired_date ? formatDate(c.acquired_date) : '',
                      c.inventory_status !== '已完成建檔' ? c.inventory_status : ''
                    ].filter(Boolean).join('，'))}</p>
                    ${c.notes ? `<p class="hint">${esc(c.notes)}</p>` : ''}
                  </div>
                  <div class="copy-actions">
                    <a class="btn btn-text" href="#/book/${encodeURIComponent(work.work_id)}/copy/${encodeURIComponent(c.copy_id)}/edit">編輯</a>
                    ${isAdmin ? `<button type="button" class="btn btn-text" data-del-copy="${esc(c.copy_id)}">刪除</button>` : ''}
                  </div>
                </li>`).join('') : '<li class="copy"><p class="hint">這個版本目前沒有收藏紀錄。</p></li>'}
            </ul>
            <a class="btn btn-text" href="#/book/${encodeURIComponent(work.work_id)}/edition/${encodeURIComponent(e.edition_id)}/copy/new">新增一筆收藏</a>
          </div>`).join('')}
      </section>

      ${isAdmin ? `
        <section class="section">
          <div class="section-head"><h2 class="section-title">刪除</h2></div>
          <p class="hint" style="margin-bottom:16px">刪除後會移到回收桶，可以隨時還原。</p>
          <button type="button" class="btn btn-danger" id="del-book">刪除整本書</button>
        </section>` : ''}`;

    view.querySelectorAll('[data-del-copy]').forEach((btn) => btn.addEventListener('click', async () => {
      const ok = await confirmDialog({
        title: '刪除這筆收藏？',
        text: totalCopies === 1 ? '這是這本書唯一的收藏紀錄。刪除後書籍資料仍會保留，可從回收桶還原。' : '刪除後可從回收桶還原。',
        confirmText: '刪除', danger: true
      });
      if (!ok) return;
      btn.disabled = true;
      try {
        const fresh = await write('copies.delete', { copy_id: btn.dataset.delCopy }, [booksChanged]);
        toast('已刪除這筆收藏');
        draw(fresh, tax, members);
      } catch (err) {
        btn.disabled = false;
        toast(err.message, { error: true });
      }
    }));

    view.querySelector('#del-book')?.addEventListener('click', async (ev) => {
      const ok = await confirmDialog({
        title: `刪除《${work.title}》？`,
        text: `會一併刪除 ${editions.length} 個版本、${totalCopies} 筆收藏。刪除後可從回收桶還原。`,
        confirmText: '刪除整本書', danger: true
      });
      if (!ok) return;
      ev.target.disabled = true;
      try {
        await write('books.delete', { work_id: work.work_id }, [booksChanged]);
        toast('已移到回收桶');
        go('/library');
      } catch (err) {
        ev.target.disabled = false;
        toast(err.message, { error: true });
      }
    });
  }

  load();
}
