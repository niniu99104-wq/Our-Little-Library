/** 書房列表 */
import { api } from '../api.js';
import { remember, recall } from '../store.js';
import { shelfStack, shelvesFrom, stackSkeleton } from '../components/shelf-stack.js';
import { errorView } from '../ui.js';

export function mount(view, { isCurrent }) {
  view.innerHTML = `
    <header class="shelves-intro">
      <h1 class="page-title">書房</h1>
      <p class="page-sub">A room for every reader.</p>
    </header>
    <div id="shelves-body">${stackSkeleton()}</div>`;
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
