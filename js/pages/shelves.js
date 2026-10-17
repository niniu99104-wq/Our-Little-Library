/** 書房列表 */
import { api } from '../api.js?v=2.0.1';
import { remember, recall } from '../store.js?v=2.0.1';
import { shelfStack, shelvesFrom, stackSkeleton } from '../components/shelf-stack.js?v=2.0.1';
import { errorView } from '../ui.js?v=2.0.1';

export function mount(view, { isCurrent }) {
  view.innerHTML = `
    <header class="shelves-intro">
      <h1 class="page-title">書房</h1>
      <p class="page-sub">A room for every reader.</p>
    </header>
    <div id="shelves-body">${stackSkeleton()}</div>
    <div class="actions-row" style="margin-top:32px">
      <a class="btn" href="#/library">全部藏書與搜尋</a>
      <a class="btn btn-text" href="#/me">新增家庭成員或書房</a>
    </div>`;
  const body = view.querySelector('#shelves-body');

  const draw = (d) => { body.innerHTML = shelfStack(shelvesFrom(d.members, d.family), d.shelf_counts, d.today); };
  const cached = recall('home');
  if (cached) draw(cached);

  const load = async () => {
    try {
      const data = await api('home.summary');
      if (!isCurrent()) return;
      remember('home', data);
      draw(data);
    } catch (err) {
      if (!isCurrent() || err.code === 'AUTH_REQUIRED' || cached) return;
      body.innerHTML = '';
      body.appendChild(errorView(err, () => { body.innerHTML = stackSkeleton(); load(); }));
    }
  };
  load();
}
