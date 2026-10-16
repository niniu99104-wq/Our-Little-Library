/** 新增或編輯家庭成員（管理員） */
import { go } from '../router.js';
import { getMembers, write, membersChanged } from '../data.js';
import { esc } from '../utils/format.js';
import { formatAgeDetailed, todayInTaipei } from '../utils/age.js';
import { field, input } from '../components/book-fields.js';
import { toast, setBusy, errorView, skeletonLines } from '../ui.js';

const THEMES = [['liam', '霧霾藍與鼠尾草綠'], ['mom', '米杏與可可棕'], ['dad', '燕麥與深咖啡'], ['family', '奶油白與暖灰']];

export function mount(view, { params, isCurrent }) {
  const isNew = !params.id;
  view.innerHTML = skeletonLines(5, 40);

  const load = async () => {
    try {
      const { members } = await getMembers();
      if (!isCurrent()) return;
      const m = isNew ? { member_type: 'child', theme_key: 'liam', sort_order: members.length + 1 } : members.find((x) => x.member_id === params.id);
      if (!m) { view.innerHTML = '<div class="pending"><p class="pending-title">找不到這位成員</p></div>'; return; }
      render(m);
    } catch (err) {
      if (!isCurrent() || err.code === 'AUTH_REQUIRED') return;
      view.innerHTML = '';
      view.appendChild(errorView(err, () => { view.innerHTML = skeletonLines(5, 40); load(); }));
    }
  };

  function render(m) {
    view.innerHTML = `
      <p class="crumb"><a href="#/me">我的</a></p>
      <header class="page-head"><div>
        <h1 class="page-title">${isNew ? '新增家庭成員' : '編輯成員'}</h1>
        <p class="page-sub">${isNew ? 'A new reader, a new shelf.' : esc(m.shelf_name)}</p>
      </div></header>
      <form id="member-form" class="book-form" novalidate>
        <section class="form-section">
          <div class="grid-2">
            ${field('中文名稱', input('name_zh', m.name_zh, 'maxlength="30" required'))}
            ${field('暱稱', input('nickname', m.nickname, 'maxlength="30"'))}
          </div>
          <div class="grid-2">
            ${field('英文名稱', input('name_en', m.name_en, 'maxlength="40"'))}
            <fieldset class="field">
              <legend class="field-label">成員類型</legend>
              <div class="segmented">
                <label><input type="radio" name="member_type" value="child"${m.member_type === 'child' ? ' checked' : ''}><span>兒童</span></label>
                <label><input type="radio" name="member_type" value="adult"${m.member_type !== 'child' ? ' checked' : ''}><span>成人</span></label>
              </div>
            </fieldset>
          </div>
          ${field('出生日期', input('birth_date', m.birth_date, `type="date" max="${todayInTaipei()}"`), '兒童必填，年齡會每天自動更新。')}
          <p class="hint" id="age-preview"></p>
        </section>
        <section class="form-section">
          <h2 class="form-section-title">書房</h2>
          ${field('書房名稱', input('shelf_name', m.shelf_name, 'maxlength="60" required placeholder="例如：Baby\'s Little Library"'))}
          <fieldset class="field">
            <legend class="field-label">書房主題色</legend>
            <div class="swatches">${THEMES.map(([k, l]) => `
              <label class="swatch" data-theme="${k}"><input type="radio" name="theme_key" value="${k}"${m.theme_key === k ? ' checked' : ''}><span class="swatch-color" aria-hidden="true"></span><span>${l}</span></label>`).join('')}</div>
          </fieldset>
          ${field('閱讀興趣', input('interests', (m.interests || []).join('、'), 'maxlength="300" placeholder="以頓號分隔，例如：交通工具、畫畫"'))}
          ${field('首頁顯示順序', input('sort_order', m.sort_order, 'type="number" min="1" max="999" inputmode="numeric"'))}
        </section>
        <p class="form-error" id="form-error" role="alert"></p>
        <div class="form-actions">
          <button class="btn btn-primary" type="submit">${isNew ? '建立成員與書房' : '儲存變更'}</button>
          <a class="btn btn-text" href="#/me">取消</a>
        </div>
      </form>`;

    const form = view.querySelector('#member-form');
    const err = view.querySelector('#form-error');
    const preview = view.querySelector('#age-preview');
    const updateAge = () => {
      const a = form.birth_date.value ? formatAgeDetailed(form.birth_date.value) : '';
      preview.textContent = a ? `目前 ${a}` : '';
    };
    form.birth_date.addEventListener('input', updateAge);
    updateAge();

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      err.textContent = '';
      const d = Object.fromEntries(new FormData(form).entries());
      if (!d.name_zh.trim()) { err.textContent = '請填寫中文名稱。'; form.name_zh.focus(); return; }
      if (!d.shelf_name.trim()) { err.textContent = '請填寫書房名稱。'; form.shelf_name.focus(); return; }
      if (d.member_type === 'child' && !d.birth_date) { err.textContent = '兒童成員需要填寫出生日期。'; form.birth_date.focus(); return; }
      const restore = setBusy(e.submitter, '儲存中…');
      try {
        if (isNew) await write('members.create', d, [membersChanged]);
        else await write('members.update', { ...d, member_id: m.member_id, expected_updated_at: m.updated_at }, [membersChanged]);
        toast(isNew ? `已建立「${d.shelf_name}」` : '已儲存');
        go('/me');
      } catch (e2) {
        err.textContent = e2.message;
        restore();
      }
    });
  }

  load();
}
