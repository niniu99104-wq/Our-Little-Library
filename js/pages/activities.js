/**
 * 小小探索家：五感美育教案
 * 所有教案、照片與實作紀錄預設為私人，網站不會自動公開或匯出。
 */
import { api } from '../api.js?v=2.0.1';
import { getSession } from '../auth.js?v=2.0.1';
import { go } from '../router.js?v=2.0.1';
import { getMembers, getBooks, write, indexBy, ageRangeLabel } from '../data.js?v=2.0.1';
import { esc, formatDate } from '../utils/format.js?v=2.0.1';
import { todayInTaipei } from '../utils/age.js?v=2.0.1';
import { renderFields, readFields } from '../components/form.js?v=2.0.1';
import { pickBook } from '../components/picker.js?v=2.0.1';
import { bindPhotoFields, loadImages, photoThumbs } from '../components/photos.js?v=2.0.1';
import { toast, setBusy, confirmDialog, errorView, skeletonLines } from '../ui.js?v=2.0.1';

const SENSES = ['視覺', '聽覺', '觸覺', '嗅覺', '味覺'];
const TYPES = ['美術創作', '感官遊戲', '食育活動', '科學實驗', '自然觀察', '音樂律動', '生活自理', '故事角色扮演'];
const ui = { sense: '', type: '' };

export function listMount(view, { isCurrent }) {
  view.innerHTML = `
    <header class="page-head">
      <div><h1 class="page-title">小小探索家</h1><p class="page-sub">Little Explorers</p></div>
      <a class="btn btn-primary" href="#/activities/new">新增教案</a>
    </header>
    <div id="a-body">${skeletonLines(4, 56)}</div>`;
  const body = view.querySelector('#a-body');
  let data;
  const draw = () => {
    const items = data.activities.filter((a) => (!ui.sense || a.senses.split(',').includes(ui.sense)) && (!ui.type || a.activity_type.split(',').includes(ui.type)));
    body.innerHTML = `
      <div class="chips" role="group" aria-label="五感">
        <button type="button" class="chip" data-sense="" aria-pressed="${!ui.sense}">全部五感</button>
        ${SENSES.map((s) => `<button type="button" class="chip" data-sense="${s}" aria-pressed="${ui.sense === s}">${s}</button>`).join('')}
      </div>
      <div class="chips" role="group" aria-label="活動類型">
        <button type="button" class="chip" data-type="" aria-pressed="${!ui.type}">全部類型</button>
        ${TYPES.map((s) => `<button type="button" class="chip" data-type="${s}" aria-pressed="${ui.type === s}">${s}</button>`).join('')}
      </div>
      ${items.length ? `<ul class="list">${items.map((a) => `
        <li class="list-row"><a class="list-name" href="#/activities/${encodeURIComponent(a.activity_id)}">${esc(a.title)}
          <span class="hint" style="display:block">${esc([a.senses.replace(/,/g, '、'), a.activity_type.replace(/,/g, '、'), ageRangeLabel(a.age_min_months, a.age_max_months),
            a.works.length ? `繪本：${a.works.map((w) => w.title).join('、')}` : '', a.log_count ? `實作 ${a.log_count} 次` : '尚未實作'].filter(Boolean).join('，'))}</span></a>
          ${a.share_status === '已確認可分享' ? '<span class="badge">可分享</span>' : ''}
        </li>`).join('')}</ul>` : `<div class="empty"><p class="empty-text">${data.activities.length ? '沒有符合條件的教案。' : '還沒有教案。從一本繪本出發，設計一個五感延伸活動吧。'}</p></div>`}`;
    body.querySelectorAll('[data-sense]').forEach((b) => b.addEventListener('click', () => { ui.sense = b.dataset.sense; draw(); }));
    body.querySelectorAll('[data-type]').forEach((b) => b.addEventListener('click', () => { ui.type = b.dataset.type; draw(); }));
  };
  const load = async () => {
    try { data = await api('activities.list'); if (isCurrent()) draw(); }
    catch (err) { if (!isCurrent() || err.code === 'AUTH_REQUIRED') return; body.innerHTML = ''; body.appendChild(errorView(err, load)); }
  };
  load();
}

function yearsToMonths(v) { return v === '' ? '' : Math.round(Number(v) * 12); }
function monthsToYears(m) { return m === '' || m === undefined ? '' : String(Math.round((Number(m) / 12) * 10) / 10); }

const SPEC = [
  { name: 'title', label: '教案名稱', required: true, attrs: 'maxlength="80"' },
  { name: 'category', label: '主題分類', attrs: 'maxlength="40" placeholder="例如：食物與感官"' },
  { name: 'senses', label: '五感領域', type: 'chips', options: SENSES.map((s) => [s, s]) },
  { name: 'activity_type', label: '活動類型', type: 'chips', options: TYPES.map((s) => [s, s]) },
  { name: 'goals', label: '學習目標', type: 'textarea', rows: 2 },
  { name: 'materials', label: '活動材料與數量', type: 'textarea', rows: 3, hint: '一行一項，例如：蘋果 1 顆' },
  { name: 'duration_min', label: '活動時間（分鐘）', type: 'number', attrs: 'min="1" max="600"' },
  { name: 'steps', label: '活動流程', type: 'textarea', rows: 5 },
  { name: 'safety', label: '安全提醒', type: 'textarea', rows: 2 },
  { name: 'next_adjust', label: '下次調整', type: 'textarea', rows: 2 }
];

export function formMount(view, { params, query, isCurrent }) {
  const isNew = !params.id;
  const isAdmin = getSession()?.account?.role === 'admin';
  view.innerHTML = skeletonLines(6, 40);
  (async () => {
    try {
      const [{ books }, d] = await Promise.all([getBooks(), isNew ? null : api('activities.get', { activity_id: params.id })]);
      if (!isCurrent()) return;
      const bookById = indexBy(books, 'work_id');
      const a = d ? d.activity : { share_status: '私人' };
      let works = d ? d.works.map((w) => w.work_id) : (query.get('work') ? [query.get('work')] : []);
      view.innerHTML = `
        <p class="crumb"><a href="#/activities">小小探索家</a></p>
        <header class="page-head"><div><h1 class="page-title">${isNew ? '新增教案' : '編輯教案'}</h1><p class="page-sub">See, hear, touch, smell, taste.</p></div></header>
        <form id="act-form" class="book-form" novalidate>
          ${renderFields(SPEC.slice(0, 4), a)}
          <fieldset class="field"><legend class="field-label">關聯繪本</legend>
            <ul class="set-list" id="act-works"></ul>
            <button type="button" class="btn btn-sm" id="act-add-work">加入繪本</button>
          </fieldset>
          <fieldset class="field"><legend class="field-label">建議年齡（歲）</legend>
            <div class="range-row">
              <input class="input" name="age_min" type="number" step="0.5" min="0" max="20" value="${esc(monthsToYears(a.age_min_months))}" aria-label="最小年齡"><span>至</span>
              <input class="input" name="age_max" type="number" step="0.5" min="0" max="20" value="${esc(monthsToYears(a.age_max_months))}" aria-label="最大年齡">
            </div></fieldset>
          ${renderFields(SPEC.slice(4), a)}
          <fieldset class="field"><legend class="field-label">分享狀態</legend>
            <label class="check"><input type="radio" name="share_status" value="私人"${a.share_status !== '已確認可分享' ? ' checked' : ''}><span>私人（預設）</span></label>
            <label class="check"><input type="radio" name="share_status" value="已確認可分享"${a.share_status === '已確認可分享' ? ' checked' : ''}${isAdmin ? '' : ' disabled'}><span>已確認可分享（例如之後用於 Peanutbebe 或小感樹）</span></label>
            <span class="hint">標記可分享不會自動公開任何內容，只是方便你之後自己挑選。照片與孩子的紀錄不包含在內。</span>
          </fieldset>
          <p class="form-error" id="form-error" role="alert"></p>
          <div class="form-actions">
            <button class="btn btn-primary" type="submit">${isNew ? '建立教案' : '儲存變更'}</button>
            <a class="btn btn-text" href="${isNew ? '#/activities' : `#/activities/${encodeURIComponent(params.id)}`}">取消</a>
          </div>
        </form>`;
      const form = view.querySelector('#act-form');
      const list = view.querySelector('#act-works');
      const drawWorks = () => {
        list.innerHTML = works.length ? works.map((id) => `<li>${esc(bookById[id]?.title || '（已刪除的書）')} <button type="button" class="btn btn-text btn-inline" data-rm="${esc(id)}">移除</button></li>`).join('') : '<li class="hint">還沒有關聯繪本。</li>';
        list.querySelectorAll('[data-rm]').forEach((b) => b.addEventListener('click', () => { works = works.filter((x) => x !== b.dataset.rm); drawWorks(); }));
      };
      drawWorks();
      view.querySelector('#act-add-work').addEventListener('click', async () => {
        const r = await pickBook({ exclude: works });
        if (r) { works.push(r.work_id); drawWorks(); }
      });
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const err = view.querySelector('#form-error');
        err.textContent = '';
        const v = readFields(form, SPEC);
        if (!v.title) { err.textContent = '請填寫教案名稱。'; return; }
        const payload = { ...v, work_ids: works, age_min_months: yearsToMonths(form.age_min.value), age_max_months: yearsToMonths(form.age_max.value),
          share_status: form.querySelector('input[name=share_status]:checked').value };
        if (!isNew) Object.assign(payload, { activity_id: a.activity_id, expected_updated_at: a.updated_at });
        const restore = setBusy(e.submitter, '儲存中…');
        try {
          const r = await write('activities.save', payload);
          toast('已儲存教案');
          go(`/activities/${encodeURIComponent(r.activity.activity_id)}`);
        } catch (e2) { err.textContent = e2.message; restore(); }
      });
    } catch (err) {
      if (!isCurrent() || err.code === 'AUTH_REQUIRED') return;
      view.innerHTML = '';
      view.appendChild(errorView(err, () => formMount(view, { params, query, isCurrent })));
    }
  })();
}

export function detailMount(view, { params, isCurrent }) {
  const isAdmin = getSession()?.account?.role === 'admin';
  view.innerHTML = skeletonLines(5, 40);
  const draw = (d, members) => {
    const a = d.activity;
    const memById = indexBy(members, 'member_id');
    const kids = members.filter((m) => m.member_type === 'child');
    const block = (label, text) => (text ? `<section class="section"><div class="section-head"><h2 class="section-title">${esc(label)}</h2></div><p class="prose">${esc(text)}</p></section>` : '');
    view.innerHTML = `
      <p class="crumb"><a href="#/activities">小小探索家</a></p>
      <header class="page-head"><div><h1 class="page-title">${esc(a.title)}</h1><p class="page-sub">${esc([a.category, ageRangeLabel(a.age_min_months, a.age_max_months), a.duration_min ? `${a.duration_min} 分鐘` : ''].filter(Boolean).join('，'))}</p></div>
        <a class="btn" href="#/activities/${encodeURIComponent(a.activity_id)}/edit">編輯</a></header>
      <div class="chips chips-static">${[...a.senses.split(','), ...a.activity_type.split(',')].filter(Boolean).map((s) => `<span class="chip">${esc(s)}</span>`).join('')}
        <span class="chip">${esc(a.share_status)}</span></div>
      ${d.works.length ? `<p>關聯繪本：${d.works.map((w) => `<a href="#/book/${encodeURIComponent(w.work_id)}">${esc(w.title)}</a>`).join('、')}</p>` : ''}
      ${block('學習目標', a.goals)}${block('活動材料', a.materials)}${block('活動流程', a.steps)}${block('安全提醒', a.safety)}${block('下次調整', a.next_adjust)}
      <section class="section">
        <div class="section-head"><h2 class="section-title">實作紀錄</h2><span class="hint">${d.logs.length} 次</span></div>
        ${d.logs.length ? `<ol class="timeline">${d.logs.map((l) => `
          <li class="timeline-item"><p class="timeline-date">${esc(formatDate(l.done_date))}</p>
            <div><p>${esc(memById[l.member_id]?.nickname || memById[l.member_id]?.name_zh || '')}</p>
              ${l.child_reaction ? `<p>孩子的反應：${esc(l.child_reaction)}</p>` : ''}
              ${l.notes ? `<p class="hint">${esc(l.notes)}</p>` : ''}
              ${l.adjust_next ? `<p class="hint">下次調整：${esc(l.adjust_next)}</p>` : ''}
              ${photoThumbs(l.photo_file_ids)}
              <button type="button" class="btn btn-text btn-inline" data-del-log="${esc(l.activity_log_id)}">刪除</button></div></li>`).join('')}</ol>` : '<p class="hint">還沒有實作紀錄。</p>'}
        <form id="alog-form" class="book-form loc-form" novalidate>
          <p class="form-section-title">新增一次實作</p>
          <div class="grid-2">
            <label class="field"><span class="field-label">誰</span><select class="input" name="member_id">${(kids.length ? kids : members).map((m) => `<option value="${esc(m.member_id)}">${esc(m.nickname || m.name_zh)}</option>`).join('')}</select></label>
            <label class="field"><span class="field-label">日期</span><input class="input" type="date" name="done_date" value="${todayInTaipei()}"></label>
          </div>
          ${renderFields([
            { name: 'child_reaction', label: '孩子的反應', type: 'textarea', rows: 2 },
            { name: 'notes', label: '實作紀錄', type: 'textarea', rows: 3 },
            { name: 'adjust_next', label: '下次調整', type: 'textarea', rows: 2 },
            { name: 'photo_file_ids', label: '活動照片', type: 'photos', kind: 'activity' }
          ], {})}
          <button class="btn btn-primary" type="submit">儲存實作紀錄</button>
        </form>
      </section>
      ${isAdmin ? '<section class="section"><button type="button" class="btn btn-danger" id="act-del">刪除教案</button></section>' : ''}`;
    loadImages(view);
    const form = view.querySelector('#alog-form');
    bindPhotoFields(form);
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const v = readFields(form, [{ name: 'member_id' }, { name: 'done_date' }, { name: 'child_reaction' }, { name: 'notes' }, { name: 'adjust_next' }, { name: 'photo_file_ids', type: 'photos' }]);
      const restore = setBusy(e.submitter, '儲存中…');
      try { draw(await write('activityLogs.save', { ...v, activity_id: a.activity_id }), members); toast('已儲存實作紀錄'); }
      catch (err) { toast(err.message, { error: true }); restore(); }
    });
    view.querySelectorAll('[data-del-log]').forEach((b) => b.addEventListener('click', async () => {
      if (!(await confirmDialog({ title: '刪除這次實作紀錄？', text: '刪除後可從回收桶還原。', confirmText: '刪除', danger: true }))) return;
      try { draw(await write('activityLogs.delete', { activity_log_id: b.dataset.delLog }), members); } catch (err) { toast(err.message, { error: true }); }
    }));
    view.querySelector('#act-del')?.addEventListener('click', async () => {
      if (!(await confirmDialog({ title: `刪除「${a.title}」？`, text: '刪除後可從回收桶還原。', confirmText: '刪除', danger: true }))) return;
      try { await write('activities.delete', { activity_id: a.activity_id }); toast('已刪除'); go('/activities'); } catch (err) { toast(err.message, { error: true }); }
    });
  };
  const load = async () => {
    try {
      const [d, { members }] = await Promise.all([api('activities.get', { activity_id: params.id }), getMembers()]);
      if (isCurrent()) draw(d, members);
    } catch (err) {
      if (!isCurrent() || err.code === 'AUTH_REQUIRED') return;
      view.innerHTML = '';
      view.appendChild(errorView(err, load));
    }
  };
  load();
}
