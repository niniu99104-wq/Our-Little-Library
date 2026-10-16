/** 書籍詳細頁：作品資料、閱讀、版本與收藏、套書、延伸教案與食譜、選書顧問 */
import { api } from '../api.js?v=2.0.0';
import { getSession } from '../auth.js?v=2.0.0';
import { go } from '../router.js?v=2.0.0';
import { getTaxonomy, getMembers, write, booksChanged, FORMAT_LABEL, indexBy, ageRangeLabel, shelfName } from '../data.js?v=2.0.0';
import { esc, formatDate, formatMoney } from '../utils/format.js?v=2.0.0';
import { formatAge } from '../utils/age.js?v=2.0.0';
import { coverHtml } from '../components/book-grid.js?v=2.0.0';
import { advicePanel } from '../components/dup-panel.js?v=2.0.0';
import { pickBook } from '../components/picker.js?v=2.0.0';
import { loadImages, photoThumbs } from '../components/photos.js?v=2.0.0';
import { toast, confirmDialog, errorView, skeletonLines, setBusy } from '../ui.js?v=2.0.0';

const LANG_LABEL = { 'zh-TW': '繁體中文', 'zh-CN': '簡體中文', en: '英文', ja: '日文', ko: '韓文' };
const READ_STATUS = ['未讀', '閱讀中', '已讀', '暫停', '棄讀', '想重讀'];

function row(label, value) {
  return value ? `<div class="meta-row"><dt>${esc(label)}</dt><dd>${value}</dd></div>` : '';
}

/** 共用的表單視窗，回傳表單內容或 null */
function formDialog(title, inner) {
  return new Promise((resolve) => {
    const dlg = document.createElement('dialog');
    dlg.className = 'dialog';
    dlg.innerHTML = `
      <form method="dialog">
        <p class="dialog-title">${esc(title)}</p>
        ${inner}
        <div class="dialog-actions">
          <button type="button" class="btn btn-text" value="cancel">取消</button>
          <button type="submit" class="btn btn-primary">儲存</button>
        </div>
      </form>`;
    document.body.appendChild(dlg);
    const form = dlg.querySelector('form');
    const finish = (v) => { dlg.close(); dlg.remove(); resolve(v); };
    dlg.querySelector('[value=cancel]').addEventListener('click', () => finish(null));
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const d = Object.fromEntries(new FormData(form).entries());
      form.querySelectorAll('input[type=checkbox]').forEach((c) => { d[c.name] = c.checked; });
      finish(d);
    });
    dlg.addEventListener('cancel', (e) => { e.preventDefault(); finish(null); });
    dlg.showModal();
  });
}

function progressDialog(member, workTitle, p, pages) {
  return formDialog(`${member.shelf_name}：${workTitle}`, `
    <label class="field"><span class="field-label">閱讀狀態</span>
      <select class="input" name="status">${READ_STATUS.map((s) => `<option${s === (p?.status || '未讀') ? ' selected' : ''}>${s}</option>`).join('')}</select></label>
    <div class="grid-2">
      <label class="field"><span class="field-label">目前頁數</span><input class="input" type="number" min="0" name="current_page" value="${esc(p?.current_page || '')}"></label>
      <label class="field"><span class="field-label">總頁數</span><input class="input" type="number" min="1" name="total_pages" value="${esc(p?.total_pages || pages || '')}"></label>
    </div>
    <label class="field"><span class="field-label">或直接填閱讀百分比（電子書、有聲書）</span><input class="input" type="number" min="0" max="100" name="percent" value="${esc(p?.percent || '')}"></label>
    <div class="grid-2">
      <label class="field"><span class="field-label">開始日期</span><input class="input" type="date" name="start_date" value="${esc(p?.start_date || '')}"></label>
      <label class="field"><span class="field-label">完成日期</span><input class="input" type="date" name="finish_date" value="${esc(p?.finish_date || '')}"></label>
    </div>
    <label class="field"><span class="field-label">想讀程度（1 至 5，待讀清單排序用）</span><input class="input" type="number" min="1" max="5" name="tbr_priority" value="${esc(p?.tbr_priority || '')}"></label>
    <label class="check"><input type="checkbox" name="favorite"${p?.favorite === 'TRUE' ? ' checked' : ''}><span>最喜愛的書</span></label>`);
}

function purchaseDialog(date) {
  return formDialog('記錄購買資訊', `
    <div class="grid-2">
      <label class="field"><span class="field-label">購買日期</span><input class="input" type="date" name="order_date" value="${esc(date)}"></label>
      <label class="field"><span class="field-label">購買平台</span><input class="input" name="platform" maxlength="40"></label>
    </div>
    <div class="grid-2">
      <label class="field"><span class="field-label">定價</span><input class="input" type="number" min="0" name="list_price"></label>
      <label class="field"><span class="field-label">實付金額</span><input class="input" type="number" min="0" name="paid_amount" required></label>
    </div>
    <label class="field"><span class="field-label">運費（這張訂單只有這本書時才填）</span><input class="input" type="number" min="0" name="shipping"></label>`);
}

export function mount(view, { params, isCurrent }) {
  const workId = params.id;
  const isAdmin = getSession()?.account?.role === 'admin';
  view.innerHTML = skeletonLines(5, 32);

  const load = async () => {
    try {
      const [book, reading, tax, mem] = await Promise.all([
        api('books.get', { work_id: workId }), api('reading.forWork', { work_id: workId }), getTaxonomy(), getMembers()
      ]);
      if (!isCurrent()) return;
      draw(book, reading, tax, mem.members, mem.today);
    } catch (err) {
      if (!isCurrent() || err.code === 'AUTH_REQUIRED') return;
      view.innerHTML = '';
      view.appendChild(errorView(err, () => { view.innerHTML = skeletonLines(5, 32); load(); }));
    }
  };

  function draw(book, reading, tax, members, today) {
    const { work, editions } = book;
    const catById = indexBy(tax.categories, 'category_id');
    const tagById = indexBy(tax.tags, 'tag_id');
    const locById = indexBy(tax.locations, 'location_id');
    const memById = indexBy(members, 'member_id');
    const coverEd = editions.find((e) => e.cover_file_id) || editions.find((e) => e.cover_url) || {};
    const cat = catById[work.primary_category_id];
    const tags = book.tag_ids.map((id) => tagById[id]).filter(Boolean);
    const totalCopies = editions.reduce((n, e) => n + e.copies.length, 0);
    const wid = encodeURIComponent(work.work_id);
    const progressBy = indexBy(reading.progress, 'member_id');
    const pages = editions.find((e) => e.pages)?.pages || '';
    const readers = [...members].sort((a, b) => (book.shelf_ids.includes(b.member_id) ? 1 : 0) - (book.shelf_ids.includes(a.member_id) ? 1 : 0));
    const logCount = (mid) => reading.logs.filter((l) => l.member_id === mid).length;
    const oldest = reading.logs[reading.logs.length - 1];

    view.innerHTML = `
      <p class="crumb"><a href="#/library">全部藏書</a></p>
      <article class="book">
        <div class="book-cover">${coverHtml({ title: work.title, cover_url: coverEd.cover_url, cover_file_id: coverEd.cover_file_id })}</div>
        <div class="book-main">
          <h1 class="page-title">${esc(work.title)}</h1>
          ${work.original_title ? `<p class="page-sub">${esc(work.original_title)}</p>` : ''}
          <dl class="meta">
            ${row('作者', esc(work.authors))}
            ${row('繪者', esc(work.illustrators))}
            ${row('主要分類', cat ? esc(cat.name) : '')}
            ${row('建議年齡', esc(ageRangeLabel(work.age_min_months, work.age_max_months)))}
            ${row('書房', book.shelf_ids.map((id) => `<a href="#/shelves/${encodeURIComponent(id)}">${esc(shelfName(id, memById))}</a>`).join('、'))}
            ${row('收錄於套書', book.in_sets.map((s) => `<a href="#/book/${encodeURIComponent(s.work_id)}">${esc(s.title)}</a>`).join('、'))}
          </dl>
          ${tags.length ? `<div class="chips chips-static">${tags.map((t) => `<span class="chip">${esc(t.name)}</span>`).join('')}</div>` : ''}
          <div class="actions-row">
            <a class="btn btn-primary" href="#/journal/new?work=${wid}">新增閱讀紀錄</a>
            <a class="btn" href="#/book/${wid}/edit">編輯書籍資料</a>
          </div>
        </div>
      </article>

      ${work.summary ? `<section class="section"><div class="section-head"><h2 class="section-title">簡介</h2></div><p class="prose">${esc(work.summary)}</p></section>` : ''}

      <section class="section" aria-labelledby="rd-title">
        <div class="section-head"><h2 class="section-title" id="rd-title">閱讀</h2><a class="btn btn-text" href="#/journal/new?work=${wid}">新增紀錄</a></div>
        <ul class="list">${readers.map((m) => {
          const p = progressBy[m.member_id];
          const n = logCount(m.member_id);
          const pct = p?.percent ? `${p.percent}%` : '';
          return `
            <li class="list-row" data-theme="${esc(m.theme_key)}">
              <span class="list-name">${esc(m.shelf_name)}
                <span class="hint" style="display:block">${esc([p?.status || '未讀', pct, n ? `讀過 ${n} 次` : '', p?.favorite === 'TRUE' ? '最喜愛' : ''].filter(Boolean).join('，'))}</span>
                ${pct ? `<span class="progress-bar" aria-hidden="true"><span style="width:${Math.min(100, +p.percent)}%"></span></span>` : ''}
              </span>
              <span class="list-actions"><button type="button" class="btn btn-text" data-progress="${esc(m.member_id)}">更新進度</button></span>
            </li>`;
        }).join('')}</ul>
        ${reading.logs.length ? `
          <h3 class="sub-title">閱讀歷程</h3>
          <ol class="timeline">${reading.logs.map((l) => {
            const m = memById[l.member_id];
            const age = m && m.member_type === 'child' && l.age_months !== '' ? formatAge(m.birth_date, l.read_date) : '';
            return `
              <li class="timeline-item">
                <p class="timeline-date">${esc(formatDate(l.read_date))}${l.read_time ? ` ${esc(l.read_time)}` : ''}</p>
                <div>
                  <p><a href="#/journal/${encodeURIComponent(l.reading_log_id)}/edit">${esc(m ? (m.nickname || m.name_zh) : '')}${l.method ? `，${esc(l.method)}` : ''}</a>${age ? `<span class="hint">　當時 ${esc(age)}</span>` : ''}${l.rating ? `<span class="hint">　${'★'.repeat(+l.rating)}</span>` : ''}</p>
                  ${l.child_quote ? `<p class="quote">「${esc(l.child_quote)}」</p>` : ''}
                  ${l.thoughts ? `<p class="hint">${esc(l.thoughts)}</p>` : ''}
                  ${photoThumbs(l.photo_file_ids)}
                </div>
              </li>`;
          }).join('')}</ol>
          <p class="hint">第一次閱讀 ${esc(formatDate(oldest.read_date))}，最近一次 ${esc(formatDate(reading.logs[0].read_date))}，累計 ${reading.logs.length} 次。</p>` : '<p class="hint">還沒有閱讀紀錄。</p>'}
      </section>

      <section class="section" aria-labelledby="nt-title">
        <div class="section-head"><h2 class="section-title" id="nt-title">閱讀筆記</h2></div>
        ${reading.notes.length ? `<ul class="list">${reading.notes.map((n) => `
          <li class="list-row note-row">
            <span class="list-name"><span class="badge">${esc(n.note_type)}</span>${n.page ? `<span class="hint">　第 ${esc(n.page)} 頁</span>` : ''}
              <span style="display:block" class="prose">${esc(n.content)}</span>
              <span class="hint">${esc(memById[n.member_id]?.shelf_name || '')}，${esc(formatDate(n.note_date))}</span></span>
            <span class="list-actions"><button type="button" class="btn btn-text" data-del-note="${esc(n.note_id)}">刪除</button></span>
          </li>`).join('')}</ul>` : ''}
        <form class="note-form" id="note-form">
          <div class="grid-2">
            <select class="input" name="member_id" aria-label="誰的筆記">${members.map((m) => `<option value="${esc(m.member_id)}"${m.theme_key === 'mom' ? ' selected' : ''}>${esc(m.shelf_name)}</option>`).join('')}</select>
            <select class="input" name="note_type" aria-label="筆記類型"><option>心得</option><option>喜歡的句子</option><option>個人想法</option><option>重點摘要</option></select>
          </div>
          <textarea class="input" name="content" rows="3" maxlength="5000" placeholder="寫下心得、喜歡的句子或重點" aria-label="筆記內容"></textarea>
          <div class="toolbar"><input class="input input-sm" name="page" maxlength="20" placeholder="頁碼（選填）" aria-label="頁碼" style="max-width:140px"><button type="submit" class="btn">加入筆記</button></div>
        </form>
      </section>

      <section class="section" aria-labelledby="ed-title">
        <div class="section-head">
          <h2 class="section-title" id="ed-title">版本與收藏</h2>
          <a class="btn btn-text" href="#/book/${wid}/edition/new">新增其他版本</a>
        </div>
        ${editions.map((e) => `
          <div class="edition">
            <div class="edition-head">
              <p class="edition-title">${esc(FORMAT_LABEL[e.format] || e.format)}${e.publisher ? `，${esc(e.publisher)}` : ''}${e.is_box_set === 'TRUE' ? '，套書' : ''}</p>
              <a class="btn btn-text" href="#/book/${wid}/edition/${encodeURIComponent(e.edition_id)}/edit">編輯版本</a>
            </div>
            <dl class="meta meta-compact">
              ${row('版本書名', esc(e.edition_title))}
              ${row('ISBN', esc(e.isbn13 || e.isbn10))}
              ${row('出版日期', esc(e.published_date))}
              ${row('語言', esc(LANG_LABEL[e.language] || e.language))}
              ${row('譯者', esc(e.translators))}
              ${row(e.format === 'audiobook' ? '長度' : '頁數', e.format === 'audiobook' ? (e.duration_min ? esc(e.duration_min) + ' 分鐘' : '') : (e.pages ? esc(e.pages) + ' 頁' : ''))}
              ${e.data_source === 'google_books' ? row('資料來源', 'Google Books 書目資料') : ''}
            </dl>
            ${e.is_box_set === 'TRUE' ? `
              <div class="set-box">
                <p class="sub-title">這套書包含</p>
                ${e.set_works?.length ? `<ul class="set-list">${e.set_works.map((s) => `<li><a href="#/book/${encodeURIComponent(s.work_id)}">${esc(s.title)}</a> <button type="button" class="btn btn-text btn-inline" data-set-remove="${esc(e.edition_id)}" data-work="${esc(s.work_id)}">移除</button></li>`).join('')}</ul>` : '<p class="hint">還沒有設定套書內容。把套書裡的每一本加進來，之後買書時就能提醒你「已在套書裡」。</p>'}
                <button type="button" class="btn btn-text" data-set-add="${esc(e.edition_id)}">加入一本</button>
              </div>` : ''}
            <ul class="copies">
              ${e.copies.length ? e.copies.map((c) => `
                <li class="copy">
                  <div>
                    <p>${esc(shelfName(c.owner, memById))}${e.format === 'physical' ? `，${esc(c.quantity)} 本` : ''}</p>
                    <p class="hint">${esc([
                      e.format === 'physical' ? (locById[c.location_id]?.label || '未設定位置') : '',
                      c.condition, c.acquired_via, c.acquired_date ? formatDate(c.acquired_date) : '',
                      c.purchase ? `實付 ${formatMoney(c.purchase.paid_amount)}` : '',
                      c.inventory_status !== '已完成建檔' ? c.inventory_status : ''
                    ].filter(Boolean).join('，'))}</p>
                    ${c.notes ? `<p class="hint">${esc(c.notes)}</p>` : ''}
                  </div>
                  <div class="copy-actions">
                    ${!c.purchase && isAdmin ? `<button type="button" class="btn btn-text" data-buy-copy="${esc(c.copy_id)}" data-date="${esc(c.acquired_date || '')}">記錄購買</button>` : ''}
                    <a class="btn btn-text" href="#/book/${wid}/copy/${encodeURIComponent(c.copy_id)}/edit">編輯</a>
                    ${isAdmin ? `<button type="button" class="btn btn-text" data-del-copy="${esc(c.copy_id)}">刪除</button>` : ''}
                  </div>
                </li>`).join('') : '<li class="copy"><p class="hint">這個版本目前沒有收藏紀錄。</p></li>'}
            </ul>
            <a class="btn btn-text" href="#/book/${wid}/edition/${encodeURIComponent(e.edition_id)}/copy/new">新增一筆收藏</a>
          </div>`).join('')}
      </section>

      ${reading.activities.length || reading.recipes.length ? `
        <section class="section">
          <div class="section-head"><h2 class="section-title">延伸</h2></div>
          ${reading.activities.map((a) => `<a class="link-row" href="#/activities/${encodeURIComponent(a.activity_id)}"><span>五感教案：${esc(a.title)}</span><span aria-hidden="true">›</span></a>`).join('')}
          ${reading.recipes.map((r) => `<a class="link-row" href="#/recipes/${encodeURIComponent(r.recipe_id)}"><span>食譜：${esc(r.name)}${r.page ? `（第 ${esc(r.page)} 頁）` : ''}</span><span aria-hidden="true">›</span></a>`).join('')}
        </section>` : ''}

      <section class="section">
        <div class="section-head"><h2 class="section-title">選書顧問</h2></div>
        <p class="hint" style="margin-bottom:12px">比對家中相似的書，並分析是否適合某位家人現在的年齡與興趣。</p>
        <div class="toolbar">
          <select class="input input-sm" id="adv-member" aria-label="分析對象">${members.map((m) => `<option value="${esc(m.member_id)}"${book.shelf_ids[0] === m.member_id ? ' selected' : ''}>${esc(m.shelf_name)}</option>`).join('')}</select>
          <button type="button" class="btn" id="adv-run">分析</button>
        </div>
        <div id="adv-box"></div>
      </section>

      ${isAdmin ? `
        <section class="section">
          <div class="section-head"><h2 class="section-title">刪除</h2></div>
          <p class="hint" style="margin-bottom:16px">刪除後會移到回收桶，可以隨時還原。閱讀紀錄不會被刪除。</p>
          <button type="button" class="btn btn-danger" id="del-book">刪除整本書</button>
        </section>` : ''}`;

    loadImages(view);
    const reload = async () => {
      const [b, r] = await Promise.all([api('books.get', { work_id: workId }), api('reading.forWork', { work_id: workId })]);
      if (isCurrent()) draw(b, r, tax, members, today);
    };

    view.querySelectorAll('[data-progress]').forEach((btn) => btn.addEventListener('click', async () => {
      const m = memById[btn.dataset.progress];
      const d = await progressDialog(m, work.title, progressBy[m.member_id], pages);
      if (!d) return;
      try {
        await write('progress.save', { ...d, member_id: m.member_id, work_id: work.work_id, expected_updated_at: progressBy[m.member_id]?.updated_at }, [booksChanged]);
        toast('已更新閱讀進度');
        reload();
      } catch (err) { toast(err.message, { error: true }); }
    }));

    view.querySelector('#note-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = e.target;
      if (!f.content.value.trim()) { f.content.focus(); return; }
      const restore = setBusy(e.submitter, '儲存中…');
      try {
        await write('notes.create', { member_id: f.member_id.value, work_id: work.work_id, note_type: f.note_type.value, content: f.content.value, page: f.page.value });
        toast('已加入筆記');
        reload();
      } catch (err) { toast(err.message, { error: true }); restore(); }
    });
    view.querySelectorAll('[data-del-note]').forEach((btn) => btn.addEventListener('click', async () => {
      if (!(await confirmDialog({ title: '刪除這則筆記？', text: '刪除後可從回收桶還原。', confirmText: '刪除', danger: true }))) return;
      try { await write('notes.delete', { note_id: btn.dataset.delNote }); reload(); } catch (err) { toast(err.message, { error: true }); }
    }));

    view.querySelectorAll('[data-set-add]').forEach((btn) => btn.addEventListener('click', async () => {
      const e = editions.find((x) => x.edition_id === btn.dataset.setAdd);
      const current = (e.set_works || []).map((s) => s.work_id);
      const res = await pickBook({ title: '套書裡的哪一本？', exclude: [work.work_id, ...current] });
      if (!res) return;
      try { await write('setContents.save', { set_edition_id: e.edition_id, work_ids: [...current, res.work_id] }, [booksChanged]); reload(); } catch (err) { toast(err.message, { error: true }); }
    }));
    view.querySelectorAll('[data-set-remove]').forEach((btn) => btn.addEventListener('click', async () => {
      const e = editions.find((x) => x.edition_id === btn.dataset.setRemove);
      const next = (e.set_works || []).map((s) => s.work_id).filter((id) => id !== btn.dataset.work);
      try { await write('setContents.save', { set_edition_id: e.edition_id, work_ids: next }, [booksChanged]); reload(); } catch (err) { toast(err.message, { error: true }); }
    }));

    view.querySelectorAll('[data-buy-copy]').forEach((btn) => btn.addEventListener('click', async () => {
      const d = await purchaseDialog(btn.dataset.date || today);
      if (!d) return;
      try {
        await write('purchases.create', { copy_id: btn.dataset.buyCopy, order: { order_date: d.order_date, platform: d.platform, shipping: d.shipping }, item: { list_price: d.list_price, paid_amount: d.paid_amount, member_id: 'FAMILY' } }, [booksChanged]);
        toast('已記錄購買');
        reload();
      } catch (err) { toast(err.message, { error: true }); }
    }));

    view.querySelector('#adv-run').addEventListener('click', async (e) => {
      const box = view.querySelector('#adv-box');
      const restore = setBusy(e.target, '分析中…');
      try { box.innerHTML = advicePanel(await api('ai.advise', { work_id: work.work_id, member_id: view.querySelector('#adv-member').value })); }
      catch (err) { box.innerHTML = `<p class="form-error">${esc(err.message)}</p>`; }
      finally { restore(); }
    });

    view.querySelectorAll('[data-del-copy]').forEach((btn) => btn.addEventListener('click', async () => {
      const ok = await confirmDialog({
        title: '刪除這筆收藏？',
        text: totalCopies === 1 ? '這是這本書唯一的收藏紀錄。刪除後書籍資料仍會保留，可從回收桶還原。' : '刪除後可從回收桶還原。',
        confirmText: '刪除', danger: true
      });
      if (!ok) return;
      btn.disabled = true;
      try {
        await write('copies.delete', { copy_id: btn.dataset.delCopy }, [booksChanged]);
        toast('已刪除這筆收藏');
        reload();
      } catch (err) {
        btn.disabled = false;
        toast(err.message, { error: true });
      }
    }));

    view.querySelector('#del-book')?.addEventListener('click', async (ev) => {
      const ok = await confirmDialog({
        title: `刪除《${work.title}》？`,
        text: `會一併刪除 ${editions.length} 個版本、${totalCopies} 筆收藏。閱讀紀錄會保留。刪除後可從回收桶還原。`,
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
