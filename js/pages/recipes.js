/**
 * 爸爸的甜點櫃：食譜索引、配方版本、甜點試作日誌
 * 版權提醒：索引保存書名、頁碼與自己寫的備註；配方內容只放自己創作或有權保存的資料。
 */
import { api } from '../api.js?v=2.0.0';
import { getSession } from '../auth.js?v=2.0.0';
import { go } from '../router.js?v=2.0.0';
import { getBooks, write, indexBy } from '../data.js?v=2.0.0';
import { esc, formatDate } from '../utils/format.js?v=2.0.0';
import { todayInTaipei } from '../utils/age.js?v=2.0.0';
import { renderFields, readFields, bindRatingClear } from '../components/form.js?v=2.0.0';
import { bindBookPickers } from '../components/picker.js?v=2.0.0';
import { bindPhotoFields, loadImages, photoThumbs } from '../components/photos.js?v=2.0.0';
import { toast, setBusy, confirmDialog, errorView, skeletonLines } from '../ui.js?v=2.0.0';

const STATUS = ['未試作', '試作中', '已完成', '常做'];
const DIFF = ['簡單', '中等', '困難'];
const ui = { q: '', status: '', diff: '' };

const norm = (s) => String(s || '').normalize('NFKC').toLowerCase().replace(/\s/g, '');

export function listMount(view, { isCurrent }) {
  view.innerHTML = `
    <header class="page-head">
      <div><h1 class="page-title">甜點櫃食譜</h1><p class="page-sub">Dad's Dessert Shelf</p></div>
      <a class="btn btn-primary" href="#/recipes/new">新增食譜索引</a>
    </header>
    <div id="r-body">${skeletonLines(4, 56)}</div>`;
  const body = view.querySelector('#r-body');
  let data;
  const draw = () => {
    body.innerHTML = `
      <div class="toolbar">
        <label class="search"><span class="visually-hidden">搜尋</span>
          <input class="input" type="search" id="rq" value="${esc(ui.q)}" placeholder="食譜名稱、材料、甜點類型、來源書籍"></label>
      </div>
      <div class="chips">${['', ...STATUS].map((s) => `<button type="button" class="chip" data-st="${s}" aria-pressed="${ui.status === s}">${s || '全部狀態'}</button>`).join('')}</div>
      <div class="chips">${['', ...DIFF].map((s) => `<button type="button" class="chip" data-df="${s}" aria-pressed="${ui.diff === s}">${s || '全部難度'}</button>`).join('')}</div>
      <div id="r-list"></div>`;
    const list = body.querySelector('#r-list');
    const refresh = () => {
      const q = norm(ui.q);
      const items = data.recipes.filter((r) => (!ui.status || r.status === ui.status) && (!ui.diff || r.difficulty === ui.diff) &&
        (!q || norm([r.name, r.main_ingredients, r.category, r.source_title].join('|')).includes(q)));
      list.innerHTML = items.length ? `<ul class="list">${items.map((r) => `
        <li class="list-row"><a class="list-name" href="#/recipes/${encodeURIComponent(r.recipe_id)}">${esc(r.name)}
          <span class="hint" style="display:block">${esc([r.category, r.source_title ? `${r.source_title}${r.page ? ` 第 ${r.page} 頁` : ''}` : '', r.difficulty, r.main_ingredients].filter(Boolean).join('，'))}</span>
          <span class="hint" style="display:block">${esc([r.status, r.version_count ? `${r.version_count} 個配方版本` : '', r.experiment_count ? `試作 ${r.experiment_count} 次，最近 ${formatDate(r.last_experiment)}` : ''].filter(Boolean).join('，'))}</span></a></li>`).join('')}</ul>`
        : `<div class="empty"><p class="empty-text">${data.recipes.length ? '沒有符合條件的食譜。' : '還沒有食譜索引。從甜點櫃裡的書開始，記下想做的食譜在第幾頁。'}</p></div>`;
    };
    body.querySelector('#rq').addEventListener('input', (e) => { ui.q = e.target.value; refresh(); });
    body.querySelectorAll('[data-st]').forEach((b) => b.addEventListener('click', () => { ui.status = b.dataset.st; draw(); }));
    body.querySelectorAll('[data-df]').forEach((b) => b.addEventListener('click', () => { ui.diff = b.dataset.df; draw(); }));
    refresh();
  };
  const load = async () => {
    try { data = await api('recipes.list'); if (isCurrent()) draw(); }
    catch (err) { if (!isCurrent() || err.code === 'AUTH_REQUIRED') return; body.innerHTML = ''; body.appendChild(errorView(err, load)); }
  };
  load();
}

const SPEC = [
  { name: 'name', label: '食譜名稱', required: true, attrs: 'maxlength="80"' },
  { name: 'work_id', label: '來源書籍', type: 'book', empty: '沒有來源書籍（自己的配方）' },
  { name: 'page', label: '頁碼', attrs: 'maxlength="20"' },
  { name: 'category', label: '食譜分類', attrs: 'maxlength="40" placeholder="例如：塔派與法式甜點"' },
  { name: 'main_ingredients', label: '主要材料', attrs: 'maxlength="300" placeholder="以頓號分隔，例如：檸檬、奶油、蛋"' },
  { name: 'difficulty', label: '製作難度', type: 'select', options: DIFF.map((d) => [d, d]), empty: '未填' },
  { name: 'time_min', label: '預估製作時間（分鐘）', type: 'number', attrs: 'min="1"' },
  { name: 'status', label: '實作狀態', type: 'select', options: STATUS.map((d) => [d, d]) },
  { name: 'notes', label: '備註', type: 'textarea', rows: 3, hint: '請用自己的話記錄重點，不要整段抄錄書中的文字。' }
];

export function formMount(view, { params, query, isCurrent }) {
  const isNew = !params.id;
  view.innerHTML = skeletonLines(6, 40);
  (async () => {
    try {
      const [{ books }, d] = await Promise.all([getBooks(), isNew ? null : api('recipes.get', { recipe_id: params.id })]);
      if (!isCurrent()) return;
      const bookById = indexBy(books, 'work_id');
      const r = d ? d.recipe : { status: '未試作', work_id: query.get('work') || '' };
      view.innerHTML = `
        <p class="crumb"><a href="#/recipes">甜點櫃食譜</a></p>
        <header class="page-head"><div><h1 class="page-title">${isNew ? '新增食譜索引' : '編輯食譜索引'}</h1><p class="page-sub">A page worth remembering.</p></div></header>
        <form id="rc-form" class="book-form" novalidate>
          ${renderFields(SPEC.slice(0, 2), r, { bookTitle: (id) => bookById[id]?.title })}
          <div class="grid-2">${renderFields(SPEC.slice(2, 4), r)}</div>
          ${renderFields(SPEC.slice(4, 5), r)}
          <div class="grid-2">${renderFields(SPEC.slice(5, 7), r)}</div>
          ${renderFields(SPEC.slice(7), r)}
          <p class="form-error" id="form-error" role="alert"></p>
          <div class="form-actions"><button class="btn btn-primary" type="submit">儲存</button>
            <a class="btn btn-text" href="${isNew ? '#/recipes' : `#/recipes/${encodeURIComponent(params.id)}`}">取消</a></div>
        </form>`;
      const form = view.querySelector('#rc-form');
      bindBookPickers(form);
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const err = view.querySelector('#form-error');
        const v = readFields(form, SPEC);
        if (!v.name) { err.textContent = '請填寫食譜名稱。'; return; }
        if (!isNew) Object.assign(v, { recipe_id: r.recipe_id, expected_updated_at: r.updated_at });
        const restore = setBusy(e.submitter, '儲存中…');
        try { const res = await write('recipes.save', v); toast('已儲存'); go(`/recipes/${encodeURIComponent(res.recipe.recipe_id)}`); }
        catch (e2) { err.textContent = e2.message; restore(); }
      });
    } catch (err) {
      if (!isCurrent() || err.code === 'AUTH_REQUIRED') return;
      view.innerHTML = '';
      view.appendChild(errorView(err, () => formMount(view, { params, query, isCurrent })));
    }
  })();
}

const EXP_SPEC = [
  { name: 'recipe_version_id', label: '使用的配方版本', type: 'select' },
  { name: 'exp_date', label: '實作日期', type: 'date' },
  { name: 'oven_temp', label: '烘烤溫度', attrs: 'maxlength="60" placeholder="例如：上火 170°C、下火 160°C"' },
  { name: 'bake_time', label: '烘烤時間', attrs: 'maxlength="60" placeholder="例如：25 分鐘"' },
  { name: 'adjustments', label: '材料調整', type: 'textarea', rows: 2 },
  { name: 'process', label: '操作紀錄', type: 'textarea', rows: 3 },
  { name: 'texture', label: '口感評估', type: 'textarea', rows: 2 },
  { name: 'failure_reason', label: '失敗原因', type: 'textarea', rows: 2 },
  { name: 'next_change', label: '下次修改方向', type: 'textarea', rows: 2 },
  { name: 'rating', label: '評分', type: 'rating' },
  { name: 'photo_file_ids', label: '成品照片', type: 'photos', kind: 'recipe' }
];

export function detailMount(view, { params, isCurrent }) {
  const isAdmin = getSession()?.account?.role === 'admin';
  view.innerHTML = skeletonLines(5, 40);
  const draw = (d) => {
    const r = d.recipe;
    const verById = indexBy(d.versions, 'recipe_version_id');
    const spec = EXP_SPEC.map((f) => (f.name === 'recipe_version_id' ? { ...f, options: d.versions.map((v) => [v.recipe_version_id, `第 ${v.version_no} 版　${v.title}`]), empty: '未指定' } : f));
    view.innerHTML = `
      <p class="crumb"><a href="#/recipes">甜點櫃食譜</a></p>
      <header class="page-head"><div><h1 class="page-title">${esc(r.name)}</h1>
        <p class="page-sub">${r.source_title ? `${esc(r.source_title)}${r.page ? `，第 ${esc(r.page)} 頁` : ''}` : '自己的配方'}</p></div>
        <a class="btn" href="#/recipes/${encodeURIComponent(r.recipe_id)}/edit">編輯</a></header>
      <dl class="meta">
        ${[['分類', r.category], ['主要材料', r.main_ingredients], ['難度', r.difficulty], ['預估時間', r.time_min ? `${r.time_min} 分鐘` : ''], ['狀態', r.status]]
          .filter(([, v]) => v).map(([k, v]) => `<div class="meta-row"><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}
        ${r.work_id ? `<div class="meta-row"><dt>來源書籍</dt><dd><a href="#/book/${encodeURIComponent(r.work_id)}">${esc(r.source_title)}</a></dd></div>` : ''}
      </dl>
      ${r.notes ? `<p class="prose">${esc(r.notes)}</p>` : ''}

      <section class="section">
        <div class="section-head"><h2 class="section-title">配方版本</h2><span class="hint">每次修改都會成為新版本，舊版本永遠保留</span></div>
        ${d.versions.length ? d.versions.map((v) => `
          <details class="version"${v === d.versions[0] ? ' open' : ''}>
            <summary><strong>第 ${esc(v.version_no)} 版</strong>　${esc(v.title)}<span class="hint">　${esc(formatDate(v.created_at))}</span></summary>
            ${v.change_note ? `<p class="hint">修改說明：${esc(v.change_note)}</p>` : ''}
            ${v.formula ? `<pre class="formula">${esc(v.formula)}</pre>` : ''}
          </details>`).join('') : '<p class="hint">還沒有配方版本。</p>'}
        <form id="ver-form" class="loc-form" novalidate>
          <p class="form-section-title">新增配方版本</p>
          <label class="field"><span class="field-label">版本名稱（選填）</span><input class="input" name="title" maxlength="80" placeholder="例如：減糖版"></label>
          <label class="field"><span class="field-label">配方內容</span><textarea class="input" name="formula" rows="5" placeholder="只記錄自己創作、調整後或有權保存的配方"></textarea></label>
          <label class="field"><span class="field-label">修改說明</span><textarea class="input" name="change_note" rows="2"></textarea></label>
          <button class="btn" type="submit">儲存為新版本</button>
        </form>
      </section>

      <section class="section">
        <div class="section-head"><h2 class="section-title">試作日誌</h2><span class="hint">${d.experiments.length} 次</span></div>
        ${d.experiments.length ? `<ol class="timeline">${d.experiments.map((x) => `
          <li class="timeline-item"><p class="timeline-date">${esc(formatDate(x.exp_date))}</p>
            <div>
              <p>${x.recipe_version_id && verById[x.recipe_version_id] ? `第 ${esc(verById[x.recipe_version_id].version_no)} 版` : '未指定版本'}${x.rating ? `<span class="hint">　${'★'.repeat(+x.rating)}</span>` : ''}</p>
              <p class="hint">${esc([x.oven_temp, x.bake_time].filter(Boolean).join('，'))}</p>
              ${[['材料調整', x.adjustments], ['操作紀錄', x.process], ['口感', x.texture], ['失敗原因', x.failure_reason], ['下次修改', x.next_change]]
                .filter(([, v]) => v).map(([k, v]) => `<p><span class="hint">${k}：</span>${esc(v)}</p>`).join('')}
              ${photoThumbs(x.photo_file_ids)}
              <button type="button" class="btn btn-text btn-inline" data-del-exp="${esc(x.experiment_id)}">刪除</button>
            </div></li>`).join('')}</ol>` : '<p class="hint">還沒有試作紀錄。</p>'}
        <form id="exp-form" class="book-form loc-form" novalidate>
          <p class="form-section-title">新增試作紀錄</p>
          ${renderFields(spec.slice(0, 2), { exp_date: todayInTaipei(), recipe_version_id: d.versions[0]?.recipe_version_id || '' })}
          <div class="grid-2">${renderFields(spec.slice(2, 4), {})}</div>
          ${renderFields(spec.slice(4), {})}
          <button class="btn btn-primary" type="submit">儲存試作紀錄</button>
        </form>
      </section>
      ${isAdmin ? '<section class="section"><button type="button" class="btn btn-danger" id="rc-del">刪除食譜</button></section>' : ''}`;
    loadImages(view);
    view.querySelector('#ver-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = e.target;
      const restore = setBusy(e.submitter, '儲存中…');
      try { draw(await write('recipeVersions.create', { recipe_id: r.recipe_id, title: f.title.value, formula: f.formula.value, change_note: f.change_note.value })); toast('已儲存新版本'); }
      catch (err) { toast(err.message, { error: true }); restore(); }
    });
    const ef = view.querySelector('#exp-form');
    bindPhotoFields(ef);
    bindRatingClear(ef);
    ef.addEventListener('submit', async (e) => {
      e.preventDefault();
      const v = readFields(ef, spec);
      const restore = setBusy(e.submitter, '儲存中…');
      try { draw(await write('experiments.save', { ...v, recipe_id: r.recipe_id })); toast('已儲存試作紀錄'); }
      catch (err) { toast(err.message, { error: true }); restore(); }
    });
    view.querySelectorAll('[data-del-exp]').forEach((b) => b.addEventListener('click', async () => {
      if (!(await confirmDialog({ title: '刪除這筆試作紀錄？', text: '刪除後可從回收桶還原。', confirmText: '刪除', danger: true }))) return;
      try { draw(await write('experiments.delete', { experiment_id: b.dataset.delExp })); } catch (err) { toast(err.message, { error: true }); }
    }));
    view.querySelector('#rc-del')?.addEventListener('click', async () => {
      if (!(await confirmDialog({ title: `刪除「${r.name}」？`, text: '刪除後可從回收桶還原。', confirmText: '刪除', danger: true }))) return;
      try { await write('recipes.delete', { recipe_id: r.recipe_id }); go('/recipes'); } catch (err) { toast(err.message, { error: true }); }
    });
  };
  const load = async () => {
    try { const d = await api('recipes.get', { recipe_id: params.id }); if (isCurrent()) draw(d); }
    catch (err) { if (!isCurrent() || err.code === 'AUTH_REQUIRED') return; view.innerHTML = ''; view.appendChild(errorView(err, load)); }
  };
  load();
}
