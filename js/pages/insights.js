/**
 * 家庭閱讀統計與年度閱讀回顧
 * 閱讀本數（不同的書）與閱讀次數（紀錄筆數）分開計算，只來自實際的閱讀紀錄。
 */
import { api } from '../api.js?v=2.0.1';
import { getSession } from '../auth.js?v=2.0.1';
import { esc, formatCount, formatMoney } from '../utils/format.js?v=2.0.1';
import { barChart, bindCharts } from '../components/bars.js?v=2.0.1';
import { errorView, skeletonLines } from '../ui.js?v=2.0.1';

export function mount(view, { query, isCurrent }) {
  const isAdmin = getSession()?.account?.role === 'admin';
  view.innerHTML = skeletonLines(6, 48);
  const load = async (year) => {
    try {
      const d = await api('insights.summary', { year: year || query.get('year') || '' });
      if (isCurrent()) draw(d);
    } catch (err) {
      if (!isCurrent() || err.code === 'AUTH_REQUIRED') return;
      view.innerHTML = '';
      view.appendChild(errorView(err, () => load(year)));
    }
  };

  function draw(d) {
    const f = d.family;
    const tile = (label, value, sub) => `<div class="stat"><p class="stat-label">${esc(label)}</p><p class="stat-value">${esc(value)}</p>${sub ? `<p class="hint">${esc(sub)}</p>` : ''}</div>`;
    const curMonthIdx = d.year === d.month.slice(0, 4) ? +d.month.slice(5) - 1 : -1;
    const works = (list) => list.length ? `<ol class="rank">${list.map((w) => `<li><a href="#/book/${encodeURIComponent(w.work_id)}">${esc(w.title)}</a><span class="hint">　${w.times} 次</span></li>`).join('')}</ol>` : '<p class="hint">還沒有資料。</p>';

    view.innerHTML = `
      <header class="page-head">
        <div><h1 class="page-title">閱讀統計</h1><p class="page-sub">Reading Insights</p></div>
        <label class="filter"><span class="visually-hidden">年份</span>
          <select class="input input-sm" id="year">${d.years.map((y) => `<option${y === d.year ? ' selected' : ''}>${y}</option>`).join('')}</select></label>
      </header>

      <section>
        <div class="section-head"><h2 class="section-title">家庭</h2></div>
        <div class="stats">
          ${tile('家庭總藏書', `${formatCount(f.total)} 本`, `實體書 ${f.physical}，電子書 ${f.ebook}，有聲書 ${f.audiobook}`)}
          ${tile('本月新增藏書', `${formatCount(f.month_new)} 本`, `${d.year} 年新增 ${formatCount(f.acquired_year)} 本`)}
          ${tile(`${d.year} 年閱讀`, `${formatCount(f.books_year)} 本`, `共 ${formatCount(f.logs_year)} 次閱讀紀錄`)}
          ${isAdmin ? tile(`${d.year} 年購書金額`, formatMoney(f.year_spend), '含運費') : ''}
          ${tile('想買的書', `${formatCount(f.wishlist_open)} 本`, '')}
          ${tile('五感活動', `${formatCount(f.activity_logs_year)} 次`, `${d.year} 年實作紀錄`)}
        </div>
      </section>

      ${d.members.map((m) => `
        <section class="section member-insight" data-theme="${esc(m.theme_key)}">
          <div class="section-head"><h2 class="section-title">${esc(m.shelf_name)}</h2><a class="btn btn-text" href="#/journal?member=${encodeURIComponent(m.member_id)}">閱讀日記</a></div>
          <div class="stats">
            ${tile('本月閱讀', `${m.books_month} 本`, `${m.times_month} 次${m.goal_month ? `，目標 ${m.goal_month} 本` : ''}`)}
            ${tile(`${d.year} 年閱讀`, `${m.books_year} 本`, `${m.times_year} 次${m.goal_year ? `，目標 ${m.goal_year} 本，完成 ${Math.min(100, Math.round(m.books_year / m.goal_year * 100))}%` : ''}`)}
            ${tile('累計閱讀', `${m.books_total} 本`, `${m.times_total} 次`)}
            ${tile('最常閱讀類型', m.top_category || '—', m.favorite ? `最喜愛：${m.favorite.title}（${m.favorite.rating} 分）` : '')}
          </div>
          ${m.times_year ? barChart(m.monthly.map((x) => ({ label: `${+x.month.slice(5)}月`, value: x.books, note: `${x.times} 次` })), { title: `${d.year} 年每月閱讀本數`, unit: ' 本', highlight: curMonthIdx }) : ''}
          ${m.member_type === 'child' ? `
            <div class="grid-2 insight-grid">
              <div>
                <h3 class="sub-title">不同年齡讀的書</h3>
                ${m.by_age?.length ? `<ul class="list">${m.by_age.map((a) => `<li class="list-row"><span class="list-name">${a.age} 歲<span class="hint" style="display:block">${a.books} 本，${a.times} 次${a.top.length ? `。最常讀：${esc(a.top.map((t) => t.title).join('、'))}` : ''}</span></span></li>`).join('')}</ul>` : '<p class="hint">還沒有資料。</p>'}
              </div>
              <div>
                <h3 class="sub-title">最常重讀的繪本</h3>
                ${works(m.most_reread || [])}
              </div>
            </div>
            ${m.year_themes?.length ? `<h3 class="sub-title">${d.year} 年閱讀主題</h3><p class="themes">${m.year_themes.map((t) => `<span class="chip">${t.month} 月　${esc(t.theme)}</span>`).join('')}</p>` : ''}
            <p class="hint">${d.year} 年五感活動 ${m.activity_logs_year || 0} 次。</p>` : `
            <h3 class="sub-title">${d.year} 年最常讀</h3>${works(m.top_works)}`}
        </section>`).join('')}

      <section class="section review">
        <div class="section-head"><h2 class="section-title">${d.year} 年度閱讀回顧</h2></div>
        <p class="review-lead">這一年，全家一起讀了 <strong>${formatCount(f.books_year)}</strong> 本書，留下 <strong>${formatCount(f.logs_year)}</strong> 次閱讀紀錄，新收藏 <strong>${formatCount(f.acquired_year)}</strong> 本書，做了 <strong>${formatCount(f.activity_logs_year)}</strong> 次五感活動。</p>
        <h3 class="sub-title">全家最常讀的書</h3>
        ${works(f.top_works_year)}
      </section>`;
    bindCharts(view);
    view.querySelector('#year').addEventListener('change', (e) => load(e.target.value));
  }

  load();
}
