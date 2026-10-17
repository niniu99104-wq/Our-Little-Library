/**
 * 閱讀計畫：年度 12 個月主題、每月與每週書單
 * 計畫只是安排，不代表已經讀過；只有新增閱讀紀錄才計入統計。
 */
import { api } from '../api.js?v=2.0.1';
import { go } from '../router.js?v=2.0.1';
import { getMembers, write } from '../data.js?v=2.0.1';
import { esc, formatDate } from '../utils/format.js?v=2.0.1';
import { pickBook } from '../components/picker.js?v=2.0.1';
import { toast, setBusy, confirmDialog, errorView, skeletonLines } from '../ui.js?v=2.0.1';

const STATUS = ['未開始', '進行中', '已完成'];

function defaultMember(members, wanted) {
  return members.find((m) => m.member_id === wanted) || members.find((m) => m.member_type === 'child') || members[0];
}

export function yearMount(view, { query, isCurrent }) {
  const thisYear = new Date().getFullYear();
  const year = parseInt(query.get('year'), 10) || thisYear;
  view.innerHTML = skeletonLines(6, 48);
  const load = async () => {
    try {
      const { members } = await getMembers();
      const m = defaultMember(members, query.get('member'));
      if (!m) { view.innerHTML = '<div class="empty"><p class="empty-text">請先新增家庭成員。</p></div>'; return; }
      const data = await api('plans.year', { member_id: m.member_id, year });
      if (!isCurrent()) return;
      view.dataset.theme = m.theme_key;
      const q = (y, mid) => `#/plans?member=${encodeURIComponent(mid)}&year=${y}`;
      view.innerHTML = `
        <header class="page-head">
          <div><h1 class="page-title">閱讀計畫</h1><p class="page-sub">Reading Plans ${year}</p></div>
          <div class="year-nav"><a class="btn btn-text" href="${q(year - 1, m.member_id)}" aria-label="前一年">‹ ${year - 1}</a><a class="btn btn-text" href="${q(year + 1, m.member_id)}" aria-label="下一年">${year + 1} ›</a></div>
        </header>
        <div class="chips" role="group" aria-label="家庭成員">${members.map((x) => `<a class="chip" href="${q(year, x.member_id)}" aria-pressed="${x.member_id === m.member_id}">${esc(x.nickname || x.name_zh)}</a>`).join('')}</div>
        ${data.months.length ? `
          <ol class="month-grid">${data.months.map((p) => `
            <li><a class="month-card${String(new Date().getMonth() + 1) === p.month && String(thisYear) === p.year ? ' is-now' : ''}" href="#/plans/${encodeURIComponent(m.member_id)}/${year}/${p.month}">
              <span class="month-no">${p.month} 月</span>
              <span class="month-theme">${esc(p.theme || '未設定主題')}</span>
              <span class="hint">${p.week_count ? `${p.week_count} 週，${p.item_count} 本書` : '尚未安排每週書單'}${p.status !== '未開始' ? `，${esc(p.status)}` : ''}</span>
            </a></li>`).join('')}</ol>` : `
          <div class="empty">
            <p class="empty-text">${year} 年還沒有閱讀計畫。會依下方的初始模板建立 12 個月的主題，之後都可以修改。</p>
            <button type="button" class="btn btn-primary" id="mk-year">建立 ${year} 年閱讀計畫</button>
          </div>`}
        <details class="form-section form-more" style="margin-top:32px">
          <summary class="form-section-title">編輯初始模板</summary>
          <p class="hint">建立新年度計畫時使用的 12 個月主題。修改模板不會影響已經建立的計畫。</p>
          <form id="tpl-form" class="month-template">
            ${data.template.map((t, i) => `<label class="field"><span class="field-label">${i + 1} 月</span><input class="input" name="t${i}" value="${esc(t)}" maxlength="30"></label>`).join('')}
            <button class="btn" type="submit">儲存模板</button>
          </form>
        </details>`;
      view.querySelector('#mk-year')?.addEventListener('click', async (e) => {
        const restore = setBusy(e.target, '建立中…');
        try { await write('plans.ensureYear', { member_id: m.member_id, year }); toast(`已建立 ${year} 年閱讀計畫`); load(); } catch (err) { toast(err.message, { error: true }); restore(); }
      });
      view.querySelector('#tpl-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const themes = Array.from({ length: 12 }, (_, i) => e.target[`t${i}`].value.trim());
        if (themes.some((t) => !t)) { toast('12 個月的主題都需要填寫。', { error: true }); return; }
        const restore = setBusy(e.submitter, '儲存中…');
        try { await write('plans.saveTemplate', { themes }); toast('已儲存初始模板'); } catch (err) { toast(err.message, { error: true }); } finally { restore(); }
      });
    } catch (err) {
      if (!isCurrent() || err.code === 'AUTH_REQUIRED') return;
      view.innerHTML = '';
      view.appendChild(errorView(err, load));
    }
  };
  load();
  return () => { delete view.dataset.theme; };
}

export function monthMount(view, { params, isCurrent }) {
  const { member: memberId, year, month } = params;
  view.innerHTML = skeletonLines(6, 48);
  const load = async () => {
    try {
      const [{ members }, data] = await Promise.all([getMembers(), api('plans.month', { member_id: memberId, year, month })]);
      if (!isCurrent()) return;
      const m = members.find((x) => x.member_id === memberId);
      if (!m) { view.innerHTML = '<div class="pending"><p class="pending-title">找不到這位成員</p></div>'; return; }
      view.dataset.theme = m.theme_key;
      const mp = data.month_plan;
      view.innerHTML = `
        <p class="crumb"><a href="#/plans?member=${encodeURIComponent(memberId)}&year=${year}">${year} 年閱讀計畫</a></p>
        <header class="page-head"><div><h1 class="page-title">${year} 年 ${month} 月</h1><p class="page-sub">${esc(m.shelf_name)}</p></div></header>
        ${mp ? `
          <form id="month-form" class="book-form plan-form">
            <div class="grid-2">
              <label class="field"><span class="field-label">本月閱讀主題</span><input class="input" name="theme" value="${esc(mp.theme)}" maxlength="40"></label>
              <label class="field"><span class="field-label">完成狀態</span><select class="input" name="status">${STATUS.map((s) => `<option${s === mp.status ? ' selected' : ''}>${s}</option>`).join('')}</select></label>
            </div>
            <label class="field"><span class="field-label">本月共讀目標</span><textarea class="input" name="goal" rows="2">${esc(mp.goal)}</textarea></label>
            <label class="field"><span class="field-label">延伸活動</span><textarea class="input" name="activity" rows="2">${esc(mp.activity)}</textarea></label>
            <button class="btn" type="submit">儲存本月計畫</button>
          </form>` : `<div class="pending"><p class="pending-title">這個月還沒有月計畫</p><p class="pending-text"><a href="#/plans?member=${encodeURIComponent(memberId)}&year=${year}">回到年度計畫</a>建立整年計畫。</p></div>`}

        <section class="section">
          <div class="section-head"><h2 class="section-title">每週書單</h2><span class="hint">建議每週 2 本主題繪本、1 本自由選讀</span></div>
          ${data.weeks.length ? data.weeks.map((w) => `
            <div class="week" data-plan="${esc(w.plan_id)}">
              <div class="week-head">
                <p class="edition-title">第 ${esc(w.week_no)} 週</p>
                <span class="hint">${esc(formatDate(w.start_date).slice(5))} 至 ${esc(formatDate(w.end_date).slice(5))}</span>
              </div>
              <form class="week-form">
                <div class="grid-2">
                  <input class="input" name="theme" value="${esc(w.theme)}" maxlength="40" placeholder="本週主題" aria-label="本週主題">
                  <select class="input" name="status" aria-label="完成狀態">${STATUS.map((s) => `<option${s === w.status ? ' selected' : ''}>${s}</option>`).join('')}</select>
                </div>
                <ul class="plan-items">${w.items.length ? w.items.map((it) => `
                  <li class="plan-item">
                    <label class="check"><input type="checkbox" data-done="${esc(it.plan_item_id)}"${it.done === 'TRUE' ? ' checked' : ''}><span>${esc(it.title)}</span></label>
                    <span class="hint">${esc(it.role === '自由' ? '自由選讀' : '主題繪本')}${it.read_count ? `，本週讀了 ${it.read_count} 次` : '，本週還沒有閱讀紀錄'}</span>
                    <button type="button" class="btn btn-text btn-inline" data-remove="${esc(it.plan_item_id)}">移除</button>
                  </li>`).join('') : '<li class="hint">還沒有書。</li>'}</ul>
                <div class="actions-row">
                  <button type="button" class="btn btn-sm" data-add="主題">加入主題繪本</button>
                  <button type="button" class="btn btn-sm" data-add="自由">加入自由選讀</button>
                </div>
                <details class="form-more" style="margin-top:12px"><summary class="hint">共讀目標與延伸活動</summary>
                  <textarea class="input" name="goal" rows="2" placeholder="共讀目標" aria-label="共讀目標">${esc(w.goal)}</textarea>
                  <textarea class="input" name="activity" rows="2" placeholder="延伸活動" aria-label="延伸活動" style="margin-top:8px">${esc(w.activity)}</textarea>
                </details>
                <div class="actions-row"><button class="btn" type="submit">儲存這週</button><button type="button" class="btn btn-text" data-del-week>刪除這週</button></div>
              </form>
            </div>`).join('') : `
            <div class="empty"><p class="empty-text">這個月還沒有每週計畫。</p><button type="button" class="btn btn-primary" id="mk-weeks">建立每週計畫</button></div>`}
          <p class="hint">勾選代表計畫完成，不會算進閱讀統計。實際讀過請到「閱讀日記」新增紀錄。</p>
        </section>`;

      view.querySelector('#month-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const f = e.target;
        const restore = setBusy(e.submitter, '儲存中…');
        try {
          await write('plans.save', { ...mp, theme: f.theme.value, status: f.status.value, goal: f.goal.value, activity: f.activity.value, expected_updated_at: mp.updated_at });
          toast('已儲存本月計畫'); load();
        } catch (err) { toast(err.message, { error: true }); restore(); }
      });
      view.querySelector('#mk-weeks')?.addEventListener('click', async (e) => {
        const restore = setBusy(e.target, '建立中…');
        try { await write('plans.ensureWeeks', { member_id: memberId, year, month }); load(); } catch (err) { toast(err.message, { error: true }); restore(); }
      });
      view.querySelectorAll('.week').forEach((box) => {
        const w = data.weeks.find((x) => x.plan_id === box.dataset.plan);
        const f = box.querySelector('form');
        f.addEventListener('submit', async (e) => {
          e.preventDefault();
          const restore = setBusy(e.submitter, '儲存中…');
          try {
            await write('plans.save', { ...w, theme: f.theme.value, status: f.status.value, goal: f.goal.value, activity: f.activity.value, expected_updated_at: w.updated_at });
            toast('已儲存'); load();
          } catch (err) { toast(err.message, { error: true }); restore(); }
        });
        box.querySelectorAll('[data-add]').forEach((b) => b.addEventListener('click', async () => {
          const res = await pickBook({ shelf: memberId, title: b.dataset.add === '自由' ? '選一本自由選讀' : '選一本主題繪本', exclude: w.items.map((i) => i.work_id) });
          if (!res) return;
          try { await write('planItems.add', { plan_id: w.plan_id, work_id: res.work_id, role: b.dataset.add }); load(); } catch (err) { toast(err.message, { error: true }); }
        }));
        box.querySelectorAll('[data-done]').forEach((c) => c.addEventListener('change', async () => {
          try { await write('planItems.update', { plan_item_id: c.dataset.done, done: c.checked }); } catch (err) { c.checked = !c.checked; toast(err.message, { error: true }); }
        }));
        box.querySelectorAll('[data-remove]').forEach((b) => b.addEventListener('click', async () => {
          try { await write('planItems.delete', { plan_item_id: b.dataset.remove }); load(); } catch (err) { toast(err.message, { error: true }); }
        }));
        box.querySelector('[data-del-week]').addEventListener('click', async () => {
          if (!(await confirmDialog({ title: `刪除第 ${w.week_no} 週？`, text: '這週的書單會一起刪除，閱讀紀錄不受影響。', confirmText: '刪除', danger: true }))) return;
          try { await write('plans.delete', { plan_id: w.plan_id }); load(); } catch (err) { toast(err.message, { error: true }); }
        });
      });
    } catch (err) {
      if (!isCurrent() || err.code === 'AUTH_REQUIRED') return;
      view.innerHTML = '';
      view.appendChild(errorView(err, load));
    }
  };
  load();
  return () => { delete view.dataset.theme; };
}

export { go };
