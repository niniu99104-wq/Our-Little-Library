/** 閱讀日記：時間軸與新增、編輯閱讀紀錄 */
import { api } from '../api.js?v=2.0.0';
import { getSession } from '../auth.js?v=2.0.0';
import { go } from '../router.js?v=2.0.0';
import { getMembers, getBooks, write, booksChanged, indexBy } from '../data.js?v=2.0.0';
import { esc, formatDate } from '../utils/format.js?v=2.0.0';
import { formatAge, todayInTaipei } from '../utils/age.js?v=2.0.0';
import { renderFields, readFields, bindWhen, bindRatingClear } from '../components/form.js?v=2.0.0';
import { bindBookPickers } from '../components/picker.js?v=2.0.0';
import { bindPhotoFields, loadImages, photoThumbs } from '../components/photos.js?v=2.0.0';
import { toast, setBusy, confirmDialog, errorView, skeletonLines } from '../ui.js?v=2.0.0';

const METHODS = ['親子共讀', '自己閱讀', '聽有聲書', '睡前故事', '其他'];
const ui = { member: '' };

export function listMount(view, { query, isCurrent }) {
  if (query.get('member')) ui.member = query.get('member');
  view.innerHTML = `
    <header class="page-head">
      <div><h1 class="page-title">閱讀日記</h1><p class="page-sub">Reading Journal</p></div>
      <a class="btn btn-primary" href="#/journal/new${ui.member ? `?member=${encodeURIComponent(ui.member)}` : ''}">新增紀錄</a>
    </header>
    <div id="j-filter"></div>
    <div id="j-body">${skeletonLines(5, 48)}</div>`;
  const body = view.querySelector('#j-body');
  const filter = view.querySelector('#j-filter');

  const load = async () => {
    try {
      const [{ members }, data] = await Promise.all([getMembers(), api('journal.list', { member_id: ui.member })]);
      if (!isCurrent()) return;
      const memById = indexBy(members, 'member_id');
      filter.innerHTML = `<div class="chips" role="group" aria-label="家庭成員">
        <button type="button" class="chip" data-m="" aria-pressed="${!ui.member}">全家</button>
        ${members.map((m) => `<button type="button" class="chip" data-m="${esc(m.member_id)}" aria-pressed="${ui.member === m.member_id}">${esc(m.nickname || m.name_zh)}</button>`).join('')}
      </div>`;
      filter.querySelectorAll('[data-m]').forEach((b) => b.addEventListener('click', () => { ui.member = b.dataset.m; load(); }));
      if (!data.logs.length) {
        body.innerHTML = '<div class="empty"><p class="empty-text">還沒有閱讀紀錄。讀完一本書時，記下孩子的反應或自己的心得。</p><a class="btn btn-primary" href="#/journal/new">新增第一筆紀錄</a></div>';
        return;
      }
      // 依月份分段
      const groups = {};
      data.logs.forEach((l) => { (groups[l.read_date.slice(0, 7)] = groups[l.read_date.slice(0, 7)] || []).push(l); });
      body.innerHTML = Object.entries(groups).map(([month, logs]) => `
        <section class="section">
          <div class="section-head"><h2 class="section-title">${esc(month.replace('-', ' 年 '))} 月</h2>
            <span class="hint">${new Set(logs.map((l) => l.work_id)).size} 本，${logs.length} 次</span></div>
          <ol class="timeline">${logs.map((l) => {
            const m = memById[l.member_id];
            const age = m && m.member_type === 'child' && l.age_months !== '' ? formatAge(m.birth_date, l.read_date) : '';
            return `
              <li class="timeline-item" data-theme="${esc(m?.theme_key || 'family')}">
                <p class="timeline-date">${esc(formatDate(l.read_date).slice(5))}</p>
                <div>
                  <p><a href="#/journal/${encodeURIComponent(l.reading_log_id)}/edit"><strong>${esc(l.title)}</strong></a></p>
                  <p class="hint">${esc([m ? (m.nickname || m.name_zh) : '', age ? `當時 ${age}` : '', l.method, l.rating ? '★'.repeat(+l.rating) : ''].filter(Boolean).join('，'))}</p>
                  ${l.child_quote ? `<p class="quote">「${esc(l.child_quote)}」</p>` : ''}
                  ${l.thoughts ? `<p>${esc(l.thoughts)}</p>` : ''}
                  ${l.child_reaction ? `<p class="hint">孩子的反應：${esc(l.child_reaction)}</p>` : ''}
                  ${photoThumbs(l.photo_file_ids)}
                </div>
              </li>`;
          }).join('')}</ol>
        </section>`).join('') + (data.total > data.logs.length ? `<p class="hint">只顯示最近 ${data.logs.length} 筆，共 ${data.total} 筆。</p>` : '');
      loadImages(body);
    } catch (err) {
      if (!isCurrent() || err.code === 'AUTH_REQUIRED') return;
      body.innerHTML = '';
      body.appendChild(errorView(err, load));
    }
  };
  load();
}

function spec(members) {
  return [
    { name: 'member_id', label: '誰讀的', type: 'select', options: members.map((m) => [m.member_id, `${m.nickname || m.name_zh}（${m.shelf_name}）`]) },
    { name: 'work_id', label: '書籍', type: 'book', required: true },
    { name: 'read_date', label: '閱讀日期', type: 'date' },
    { name: 'read_time', label: '閱讀時間', type: 'time' },
    { name: 'method', label: '閱讀方式', type: 'select', options: METHODS.map((x) => [x, x]), empty: '未填' },
    { name: 'duration_min', label: '閱讀分鐘數', type: 'number', attrs: 'min="0" max="1440"' },
    { name: 'progress_note', label: '閱讀進度', attrs: 'maxlength="100" placeholder="例如：讀到第 3 章、聽完一半"' },
    { name: 'rating', label: '評分', type: 'rating' },
    { name: 'thoughts', label: '心得', type: 'textarea', rows: 3 },
    { name: 'child_reaction', label: '孩子的反應', type: 'textarea', rows: 2, when: 'member_type=child' },
    { name: 'favorite_scene', label: '最喜歡的畫面', type: 'textarea', rows: 2, when: 'member_type=child' },
    { name: 'child_quote', label: '童言童語', type: 'textarea', rows: 2, when: 'member_type=child' },
    { name: 'child_questions', label: '共讀時的提問', type: 'textarea', rows: 2, when: 'member_type=child' },
    { name: 'parent_observation', label: '家長觀察', type: 'textarea', rows: 2, when: 'member_type=child' },
    { name: 'extension_activity', label: '延伸活動', type: 'textarea', rows: 2, when: 'member_type=child' },
    { name: 'next_suggestion', label: '下次閱讀建議', type: 'textarea', rows: 2, when: 'member_type=child' },
    { name: 'photo_file_ids', label: '照片', type: 'photos', kind: 'journal' },
    { name: 'notes', label: '備註', type: 'textarea', rows: 2 }
  ];
}

export function formMount(view, { params, query, isCurrent }) {
  const isNew = !params.id;
  const isAdmin = getSession()?.account?.role === 'admin';
  view.innerHTML = skeletonLines(6, 40);
  (async () => {
    try {
      const [{ members }, { books }, existing] = await Promise.all([
        getMembers(), getBooks(), isNew ? null : api('journal.list', {}).then((d) => d.logs.find((l) => l.reading_log_id === params.id))
      ]);
      if (!isCurrent()) return;
      if (!isNew && !existing) { view.innerHTML = '<div class="pending"><p class="pending-title">找不到這筆紀錄</p></div>'; return; }
      const bookById = indexBy(books, 'work_id');
      const presetMember = query.get('member') || members.find((m) => bookById[query.get('work')]?.shelf_ids.includes(m.member_id))?.member_id || members[0]?.member_id;
      const values = existing || { member_id: presetMember, work_id: query.get('work') || '', read_date: todayInTaipei() };
      const s = spec(members);
      const memById = indexBy(members, 'member_id');
      view.innerHTML = `
        <p class="crumb"><a href="#/journal">閱讀日記</a></p>
        <header class="page-head"><div><h1 class="page-title">${isNew ? '新增閱讀紀錄' : '編輯閱讀紀錄'}</h1><p class="page-sub">Every reading is a little story.</p></div></header>
        <form id="log-form" class="book-form" novalidate>
          ${renderFields(s.slice(0, 2), values, { bookTitle: (id) => bookById[id]?.title })}
          <div class="grid-2">${renderFields(s.slice(2, 4), values)}</div>
          <div class="grid-2">${renderFields(s.slice(4, 6), values)}</div>
          ${renderFields(s.slice(6), values)}
          ${isNew ? `<label class="check" data-when="member_type=adult"><input type="checkbox" name="mark_done"><span>這本書讀完了（閱讀狀態改為「已讀」）</span></label>` : ''}
          <p class="form-error" id="form-error" role="alert"></p>
          <div class="form-actions">
            <button class="btn btn-primary" type="submit">${isNew ? '儲存紀錄' : '儲存變更'}</button>
            <a class="btn btn-text" href="#/journal">取消</a>
            ${!isNew ? '<button type="button" class="btn btn-text" id="log-del">刪除</button>' : ''}
          </div>
        </form>`;
      const form = view.querySelector('#log-form');
      const err = view.querySelector('#form-error');
      bindBookPickers(form);
      bindPhotoFields(form);
      bindRatingClear(form);
      const applyWhen = bindWhen(form, (k) => (k === 'member_type' ? memById[form.member_id.value]?.member_type : ''));
      form.member_id.addEventListener('change', applyWhen);
      // 選擇書籍時，預設只看該成員的書房
      const setShelf = () => form.querySelector('[data-pick-book]')?.setAttribute('data-shelf', form.member_id.value);
      form.member_id.addEventListener('change', setShelf);
      setShelf();

      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        err.textContent = '';
        const d = readFields(form, s);
        if (!d.work_id) { err.textContent = '請選擇書籍。'; return; }
        if (!d.read_date) { err.textContent = '請填寫閱讀日期。'; return; }
        if (memById[d.member_id]?.member_type !== 'child') {
          ['child_reaction', 'favorite_scene', 'child_quote', 'child_questions', 'parent_observation', 'extension_activity', 'next_suggestion'].forEach((k) => { d[k] = existing?.[k] || ''; });
        }
        if (form.mark_done?.checked) d.mark_status = '已讀';
        const restore = setBusy(e.submitter, '儲存中…');
        try {
          if (isNew) await write('logs.create', d, [booksChanged]);
          else await write('logs.update', { ...d, reading_log_id: existing.reading_log_id, expected_updated_at: existing.updated_at }, [booksChanged]);
          toast('已儲存閱讀紀錄');
          go(`/book/${encodeURIComponent(d.work_id)}`);
        } catch (e2) { err.textContent = e2.message; restore(); }
      });
      view.querySelector('#log-del')?.addEventListener('click', async () => {
        if (!(await confirmDialog({ title: '刪除這筆閱讀紀錄？', text: isAdmin ? '刪除後可從回收桶還原。' : '刪除後可請管理員從回收桶還原。', confirmText: '刪除', danger: true }))) return;
        try { await write('logs.delete', { reading_log_id: existing.reading_log_id }, [booksChanged]); toast('已刪除'); go('/journal'); } catch (e2) { toast(e2.message, { error: true }); }
      });
    } catch (err) {
      if (!isCurrent() || err.code === 'AUTH_REQUIRED') return;
      view.innerHTML = '';
      view.appendChild(errorView(err, () => formMount(view, { params, query, isCurrent })));
    }
  })();
}

export { loadImages };
