/** 分類、標籤與收納位置管理 */
import { getSession } from '../auth.js';
import { getTaxonomy, write, taxonomyChanged, booksChanged, SCOPE_LABEL } from '../data.js';
import { esc } from '../utils/format.js';
import { toast, setBusy, confirmDialog, errorView, skeletonLines } from '../ui.js';

const TABS = [['categories', '分類'], ['tags', '標籤'], ['locations', '收納位置']];
const ui = { tab: 'categories', scope: 'liam' };

export function mount(view, { isCurrent }) {
  const isAdmin = getSession()?.account?.role === 'admin';
  view.innerHTML = `
    <p class="crumb"><a href="#/me">我的</a></p>
    <header class="page-head"><div><h1 class="page-title">分類、標籤與收納位置</h1><p class="page-sub">A place for everything.</p></div></header>
    <div class="tabs" role="tablist">${TABS.map(([k, l]) => `<button type="button" role="tab" class="tab" data-tab="${k}" aria-selected="${k === ui.tab}">${l}</button>`).join('')}</div>
    <div id="tax-body">${skeletonLines(5, 40)}</div>`;
  const body = view.querySelector('#tax-body');

  view.querySelector('.tabs').addEventListener('click', (e) => {
    const t = e.target.closest('[data-tab]');
    if (!t) return;
    ui.tab = t.dataset.tab;
    view.querySelectorAll('.tab').forEach((b) => b.setAttribute('aria-selected', String(b === t)));
    load();
  });

  async function load(force = false) {
    try {
      const tax = await getTaxonomy(force);
      if (!isCurrent()) return;
      if (ui.tab === 'categories') drawCategories(tax);
      if (ui.tab === 'tags') drawTags(tax);
      if (ui.tab === 'locations') drawLocations(tax);
    } catch (err) {
      if (!isCurrent() || err.code === 'AUTH_REQUIRED') return;
      body.innerHTML = '';
      body.appendChild(errorView(err, () => load(true)));
    }
  }

  /** 共用：清單中的每一列可以改名、刪除 */
  async function saveAndReload(btn, action, data, msg) {
    const restore = setBusy(btn, '儲存中…');
    try {
      await write(action, data, [taxonomyChanged, booksChanged]);
      toast(msg);
      await load(true);
    } catch (err) {
      toast(err.message, { error: true });
      restore();
    }
  }

  async function removeItem(btn, action, data, name, extra) {
    const ok = await confirmDialog({ title: `刪除「${name}」？`, text: extra || '刪除後可以請管理員從試算表還原。', confirmText: '刪除', danger: true });
    if (!ok) return;
    await saveAndReload(btn, action, data, `已刪除「${name}」`);
  }

  function listRow(id, name, extraHtml = '', actions = '') {
    return `
      <li class="list-row" data-id="${esc(id)}">
        <span class="list-name">${esc(name)}${extraHtml}</span>
        <span class="list-actions">${actions}</span>
      </li>`;
  }

  function drawCategories(tax) {
    const cats = tax.categories.filter((c) => c.scope === ui.scope);
    body.innerHTML = `
      <div class="chips" role="group" aria-label="書房">
        ${Object.entries(SCOPE_LABEL).map(([k, l]) => `<button type="button" class="chip" data-scope="${k}" aria-pressed="${k === ui.scope}">${esc(l)}</button>`).join('')}
      </div>
      <ul class="list">${cats.map((c, i) => listRow(c.category_id, c.name, '', `
        <button type="button" class="btn btn-text" data-act="up" ${i === 0 ? 'disabled' : ''} aria-label="往上移">上移</button>
        <button type="button" class="btn btn-text" data-act="rename">改名</button>
        ${isAdmin ? '<button type="button" class="btn btn-text" data-act="delete">刪除</button>' : ''}`)).join('') || '<li class="list-row"><span class="hint">這個書房還沒有分類。</span></li>'}</ul>
      <form class="inline-form" id="add-form">
        <input class="input" name="name" maxlength="30" placeholder="新的分類名稱" aria-label="新的分類名稱" required>
        <button class="btn btn-primary" type="submit">新增分類</button>
      </form>`;

    body.querySelector('.chips').addEventListener('click', (e) => {
      const b = e.target.closest('[data-scope]');
      if (!b) return;
      ui.scope = b.dataset.scope;
      drawCategories(tax);
    });
    body.querySelector('#add-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const name = e.target.name.value.trim();
      if (!name) return;
      saveAndReload(e.submitter, 'categories.save', { scope: ui.scope, name, sort_order: cats.length + 1 }, `已新增「${name}」`);
    });
    body.querySelector('.list').addEventListener('click', async (e) => {
      const act = e.target.closest('[data-act]')?.dataset.act;
      const li = e.target.closest('[data-id]');
      if (!act || !li) return;
      const c = cats.find((x) => x.category_id === li.dataset.id);
      if (act === 'up') {
        const ids = cats.map((x) => x.category_id);
        const i = ids.indexOf(c.category_id);
        [ids[i - 1], ids[i]] = [ids[i], ids[i - 1]];
        saveAndReload(e.target, 'categories.reorder', { ids }, '已調整順序');
      }
      if (act === 'rename') {
        const name = await promptName('分類名稱', c.name);
        if (name && name !== c.name) saveAndReload(e.target, 'categories.save', { category_id: c.category_id, scope: c.scope, name, sort_order: c.sort_order, expected_updated_at: c.updated_at }, '已改名');
      }
      if (act === 'delete') removeItem(e.target, 'categories.delete', { category_id: c.category_id }, c.name, '使用這個分類的書會變成「未分類」，書籍資料不受影響。');
    });
  }

  function drawTags(tax) {
    body.innerHTML = `
      <ul class="list">${tax.tags.map((t) => listRow(t.tag_id, t.name, '', `
        <button type="button" class="btn btn-text" data-act="rename">改名</button>
        ${isAdmin ? '<button type="button" class="btn btn-text" data-act="delete">刪除</button>' : ''}`)).join('') || '<li class="list-row"><span class="hint">還沒有標籤。</span></li>'}</ul>
      <form class="inline-form" id="add-form">
        <input class="input" name="name" maxlength="20" placeholder="新的標籤，例如：互動繪本" aria-label="新的標籤" required>
        <button class="btn btn-primary" type="submit">新增標籤</button>
      </form>`;
    body.querySelector('#add-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const name = e.target.name.value.trim();
      if (name) saveAndReload(e.submitter, 'tags.save', { name }, `已新增「${name}」`);
    });
    body.querySelector('.list').addEventListener('click', async (e) => {
      const act = e.target.closest('[data-act]')?.dataset.act;
      const li = e.target.closest('[data-id]');
      if (!act || !li) return;
      const t = tax.tags.find((x) => x.tag_id === li.dataset.id);
      if (act === 'rename') {
        const name = await promptName('標籤名稱', t.name);
        if (name && name !== t.name) saveAndReload(e.target, 'tags.save', { tag_id: t.tag_id, name, scope: t.scope, expected_updated_at: t.updated_at }, '已改名');
      }
      if (act === 'delete') removeItem(e.target, 'tags.delete', { tag_id: t.tag_id }, t.name, '所有書籍上的這個標籤都會一起移除。');
    });
  }

  function drawLocations(tax) {
    body.innerHTML = `
      <ul class="list">${tax.locations.map((l) => listRow(l.location_id, l.label, '', `
        <button type="button" class="btn btn-text" data-act="edit">修改</button>
        ${isAdmin ? '<button type="button" class="btn btn-text" data-act="delete">刪除</button>' : ''}`)).join('') || '<li class="list-row"><span class="hint">還沒有收納位置。</span></li>'}</ul>
      <form id="loc-form" class="loc-form">
        <input type="hidden" name="location_id">
        <input type="hidden" name="expected_updated_at">
        <p class="form-section-title" id="loc-form-title">新增收納位置</p>
        <div class="grid-4">
          <input class="input" name="room" maxlength="30" placeholder="房間，例如：二樓書房" aria-label="房間">
          <input class="input" name="bookcase" maxlength="30" placeholder="書櫃，例如：A 書櫃" aria-label="書櫃">
          <input class="input" name="shelf" maxlength="30" placeholder="層架，例如：第 3 層" aria-label="層架">
          <input class="input" name="box" maxlength="30" placeholder="收納盒" aria-label="收納盒">
        </div>
        <div class="actions-row">
          <button class="btn btn-primary" type="submit">儲存位置</button>
          <button class="btn btn-text" type="button" id="loc-cancel" hidden>取消修改</button>
        </div>
      </form>`;
    const form = body.querySelector('#loc-form');
    const cancel = body.querySelector('#loc-cancel');
    const resetForm = () => { form.reset(); form.location_id.value = ''; form.expected_updated_at.value = ''; cancel.hidden = true; body.querySelector('#loc-form-title').textContent = '新增收納位置'; };
    cancel.addEventListener('click', resetForm);
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const d = Object.fromEntries(new FormData(form).entries());
      saveAndReload(e.submitter, 'locations.save', d, d.location_id ? '已更新位置' : '已新增位置');
    });
    body.querySelector('.list').addEventListener('click', (e) => {
      const act = e.target.closest('[data-act]')?.dataset.act;
      const li = e.target.closest('[data-id]');
      if (!act || !li) return;
      const l = tax.locations.find((x) => x.location_id === li.dataset.id);
      if (act === 'edit') {
        ['room', 'bookcase', 'shelf', 'box'].forEach((k) => { form[k].value = l[k] || ''; });
        form.location_id.value = l.location_id;
        form.expected_updated_at.value = l.updated_at;
        cancel.hidden = false;
        body.querySelector('#loc-form-title').textContent = `修改「${l.label}」`;
        form.room.focus();
      }
      if (act === 'delete') removeItem(e.target, 'locations.delete', { location_id: l.location_id }, l.label, '只有沒有任何書放在這裡時才能刪除。');
    });
  }

  load();
}

/** 改名視窗 */
function promptName(label, current) {
  return new Promise((resolve) => {
    const dlg = document.createElement('dialog');
    dlg.className = 'dialog';
    dlg.innerHTML = `
      <form method="dialog">
        <label class="field"><span class="field-label">${esc(label)}</span><input class="input" name="v" maxlength="30" value="${esc(current)}" required></label>
        <div class="dialog-actions">
          <button type="button" class="btn btn-text" value="cancel">取消</button>
          <button type="submit" class="btn btn-primary" value="ok">儲存</button>
        </div>
      </form>`;
    document.body.appendChild(dlg);
    const finish = (v) => { dlg.close(); dlg.remove(); resolve(v); };
    dlg.querySelector('[value=cancel]').addEventListener('click', () => finish(null));
    dlg.querySelector('form').addEventListener('submit', (e) => { e.preventDefault(); finish(dlg.querySelector('input').value.trim()); });
    dlg.addEventListener('cancel', (e) => { e.preventDefault(); finish(null); });
    dlg.showModal();
    dlg.querySelector('input').select();
  });
}
