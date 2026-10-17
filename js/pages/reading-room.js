/** 個人閱讀室：閱讀中、待讀清單（TBR）、已讀、閱讀目標 */
import { api } from '../api.js?v=2.0.1';
import { getMembers, getBooks, getTaxonomy, write, indexBy } from '../data.js?v=2.0.1';
import { esc, formatDate } from '../utils/format.js?v=2.0.1';
import { bookGrid } from '../components/book-grid.js?v=2.0.1';
import { loadImages } from '../components/photos.js?v=2.0.1';
import { toast, setBusy, errorView, skeletonLines } from '../ui.js?v=2.0.1';

const SORTS = [['want', '最想讀'], ['recent', '最近購入'], ['oldest', '收藏最久'], ['category', '依類型']];
const ui = { sort: 'want' };

export function mount(view, { params, isCurrent }) {
  view.innerHTML = skeletonLines(5, 40);
  const load = async () => {
    try {
      const [{ members }, { books }, tax, rd] = await Promise.all([
        getMembers(), getBooks(true), getTaxonomy(), api('reading.forMember', { member_id: params.id })
      ]);
      if (!isCurrent()) return;
      const m = members.find((x) => x.member_id === params.id);
      if (!m) { view.innerHTML = '<div class="pending"><p class="pending-title">找不到這位成員</p></div>'; return; }
      draw(m, books, tax, rd);
    } catch (err) {
      if (!isCurrent() || err.code === 'AUTH_REQUIRED') return;
      view.innerHTML = '';
      view.appendChild(errorView(err, load));
    }
  };

  function draw(m, allBooks, tax, rd) {
    view.dataset.theme = m.theme_key;
    const catById = indexBy(tax.categories, 'category_id');
    const mine = allBooks.filter((b) => b.shelf_ids.includes(m.member_id));
    const st = (b) => rd.progress[b.work_id]?.status || (rd.counts[b.work_id] ? '已讀' : '未讀');
    const reading = mine.filter((b) => st(b) === '閱讀中');
    const paused = mine.filter((b) => st(b) === '暫停');
    let tbr = mine.filter((b) => ['未讀', '想重讀'].includes(st(b)));
    const done = mine.filter((b) => st(b) === '已讀').sort((a, b) => String(rd.progress[b.work_id]?.finish_date || rd.last_read[b.work_id] || '').localeCompare(String(rd.progress[a.work_id]?.finish_date || rd.last_read[a.work_id] || '')));

    const sorters = {
      want: (a, b) => (Number(rd.progress[b.work_id]?.tbr_priority) || 0) - (Number(rd.progress[a.work_id]?.tbr_priority) || 0),
      recent: (a, b) => String(b.created_at).localeCompare(String(a.created_at)),
      oldest: (a, b) => String(a.created_at).localeCompare(String(b.created_at)),
      category: (a, b) => String(catById[a.primary_category_id]?.name || '~').localeCompare(String(catById[b.primary_category_id]?.name || '~'), 'zh-Hant')
    };
    tbr = tbr.slice().sort(sorters[ui.sort]);

    const monthDone = Object.entries(rd.progress).filter(([, p]) => p.status === '已讀' && (p.finish_date || '').slice(0, 7) === rd.month).length;
    const yearDone = Object.entries(rd.progress).filter(([, p]) => p.status === '已讀' && (p.finish_date || '').slice(0, 4) === rd.year).length;
    const goal = (period) => rd.goals.find((g) => g.period === period)?.target_count || '';
    const goalLine = (label, doneN, target, period) => `
      <div class="goal">
        <p><span>${esc(label)}</span><strong>${doneN}</strong>${target ? `<span class="hint"> ／ 目標 ${esc(target)} 本，完成 ${Math.min(100, Math.round(doneN / target * 100))}%</span>` : '<span class="hint"> 本</span>'}</p>
        ${target ? `<span class="progress-bar"><span style="width:${Math.min(100, Math.round(doneN / target * 100))}%"></span></span>` : ''}
        <form class="inline-form goal-form" data-period="${esc(period)}">
          <input class="input input-sm" type="number" min="0" name="target" value="${esc(target)}" placeholder="設定目標本數" aria-label="${esc(label)}目標">
          <button class="btn btn-sm" type="submit">設定</button>
        </form>
      </div>`;

    const progressRow = (b) => {
      const p = rd.progress[b.work_id] || {};
      return `<li class="list-row">
        <a class="list-name" href="#/book/${encodeURIComponent(b.work_id)}">${esc(b.title)}
          <span class="hint" style="display:block">${esc([b.authors, p.current_page && p.total_pages ? `第 ${p.current_page} ／ ${p.total_pages} 頁` : '', p.percent ? `${p.percent}%` : '', p.start_date ? `${formatDate(p.start_date)} 開始` : ''].filter(Boolean).join('，'))}</span>
          ${p.percent ? `<span class="progress-bar"><span style="width:${Math.min(100, +p.percent)}%"></span></span>` : ''}
        </a></li>`;
    };

    view.innerHTML = `
      <header class="shelf-head">
        <p class="masthead-date"><a href="#/shelves/${encodeURIComponent(m.member_id)}">${esc(m.shelf_name)}</a></p>
        <h1 class="masthead-title">Reading Room</h1>
        <p class="hint" style="margin-top:8px">${esc(m.nickname || m.name_zh)}的閱讀進度、待讀清單與閱讀目標</p>
      </header>

      <section class="section" style="margin-top:0">
        <div class="section-head"><h2 class="section-title">閱讀目標</h2></div>
        <div class="goals">
          ${goalLine('本月讀完', monthDone, goal(rd.month), rd.month)}
          ${goalLine(`${rd.year} 年讀完`, yearDone, goal(rd.year), rd.year)}
        </div>
        <p class="hint">以閱讀狀態標記為「已讀」且有完成日期的書計算。</p>
      </section>

      <section class="section">
        <div class="section-head"><h2 class="section-title">閱讀中</h2><span class="hint">${reading.length} 本</span></div>
        ${reading.length ? `<ul class="list">${reading.map(progressRow).join('')}</ul>` : '<p class="hint">目前沒有正在讀的書。在書籍頁按「更新進度」就能加進來。</p>'}
        ${paused.length ? `<p class="sub-title">暫停中</p><ul class="list">${paused.map(progressRow).join('')}</ul>` : ''}
      </section>

      <section class="section">
        <div class="section-head"><h2 class="section-title">待讀清單 TBR</h2><span class="hint">${tbr.length} 本</span></div>
        ${tbr.length ? `
          <div class="toolbar">
            <div class="chips" role="group" aria-label="排序">${SORTS.map(([k, l]) => `<button type="button" class="chip" data-sort="${k}" aria-pressed="${ui.sort === k}">${l}</button>`).join('')}</div>
            <button type="button" class="btn" id="random-pick">隨機選一本</button>
          </div>
          <div id="random-box"></div>
          ${bookGrid(tbr.slice(0, 40), { theme: m.theme_key })}` : '<p class="hint">書房裡的書都讀過了，或還沒有把書放進這個書房。</p>'}
      </section>

      <section class="section">
        <div class="section-head"><h2 class="section-title">已讀</h2><span class="hint">${done.length} 本</span></div>
        ${done.length ? bookGrid(done.slice(0, 24), { theme: m.theme_key }) : '<p class="hint">還沒有讀完的書。</p>'}
      </section>`;
    loadImages(view);

    view.querySelectorAll('[data-sort]').forEach((b) => b.addEventListener('click', () => { ui.sort = b.dataset.sort; draw(m, allBooks, tax, rd); }));
    view.querySelector('#random-pick')?.addEventListener('click', () => {
      const pick = tbr[Math.floor(Math.random() * tbr.length)];
      view.querySelector('#random-box').innerHTML = `<div class="pending" style="margin-bottom:16px"><p class="pending-title">今天就讀這本吧</p>
        <p><a href="#/book/${encodeURIComponent(pick.work_id)}">${esc(pick.title)}</a>${pick.authors ? `<span class="hint">　${esc(pick.authors)}</span>` : ''}</p></div>`;
    });
    view.querySelectorAll('.goal-form').forEach((f) => f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const restore = setBusy(e.submitter, '儲存中…');
      try {
        const next = await write('goals.save', { member_id: m.member_id, period: f.dataset.period, target_count: f.target.value || 0 });
        toast('已設定閱讀目標');
        draw(m, allBooks, tax, next);
      } catch (err) { toast(err.message, { error: true }); restore(); }
    }));
  }

  load();
  return () => { delete view.dataset.theme; };
}
