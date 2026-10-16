/**
 * 購書預算：預算設定、本月與年度支出、各成員支出、訂單明細
 * 實際支出只來自購書紀錄與訂單，願望清單的預估價格不計入。
 */
import { api } from '../api.js?v=2.0.0';
import { write, booksChanged, indexBy, shelfName } from '../data.js?v=2.0.0';
import { esc, formatDate, formatMoney } from '../utils/format.js?v=2.0.0';
import { barChart, bindCharts } from '../components/bars.js?v=2.0.0';
import { toast, setBusy, confirmDialog, errorView, skeletonLines } from '../ui.js?v=2.0.0';

function shiftMonth(m, d) {
  const [y, mo] = m.split('-').map(Number);
  const t = new Date(Date.UTC(y, mo - 1 + d, 1));
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function mount(view, { query, isCurrent }) {
  view.innerHTML = skeletonLines(6, 48);
  const load = async (month) => {
    try {
      const d = await api('budgets.summary', { month: month || query.get('month') || '' });
      if (isCurrent()) draw(d);
    } catch (err) {
      if (!isCurrent() || err.code === 'AUTH_REQUIRED') return;
      view.innerHTML = '';
      view.appendChild(errorView(err, () => load(month)));
    }
  };

  function draw(d) {
    const memById = indexBy(d.members, 'member_id');
    const b = (who, type) => d.budgets[`${who}|${type}`];
    const monthBudget = b('FAMILY', 'month');
    const yearBudget = b('FAMILY', 'year');
    const tile = (label, value, sub) => `<div class="stat"><p class="stat-label">${esc(label)}</p><p class="stat-value">${esc(value)}</p>${sub ? `<p class="hint">${esc(sub)}</p>` : ''}</div>`;
    const [y, mo] = d.month.split('-');
    const curIdx = +mo - 1;

    view.innerHTML = `
      <header class="page-head">
        <div><h1 class="page-title">購書預算</h1><p class="page-sub">Book Budget</p></div>
        <div class="year-nav">
          <button type="button" class="btn btn-text" data-month="${shiftMonth(d.month, -1)}">‹ 上個月</button>
          <button type="button" class="btn btn-text" data-month="${shiftMonth(d.month, 1)}">下個月 ›</button>
        </div>
      </header>
      <p class="sub-title">${esc(y)} 年 ${+mo} 月</p>
      <div class="stats">
        ${tile('本月已花費', formatMoney(d.spent.month), d.shipping.month ? `含運費與訂單折扣 ${formatMoney(d.shipping.month)}` : '')}
        ${tile('本月剩餘預算', monthBudget !== undefined ? formatMoney(monthBudget - d.spent.month) : '未設定', monthBudget !== undefined ? `預算 ${formatMoney(monthBudget)}` : '')}
        ${tile(`${y} 年累計`, formatMoney(d.spent.year), yearBudget !== undefined ? `年度預算 ${formatMoney(yearBudget)}，剩餘 ${formatMoney(yearBudget - d.spent.year)}` : '')}
      </div>
      ${monthBudget ? `<span class="progress-bar${d.spent.month > monthBudget ? ' is-over' : ''}" aria-hidden="true"><span style="width:${Math.min(100, Math.round(d.spent.month / monthBudget * 100))}%"></span></span>` : ''}

      <section class="section">
        ${barChart(d.monthly.map((x) => ({ label: `${+x.month.slice(5)}月`, value: x.amount })), { title: `${y} 年每月購書支出（元）`, format: (n) => Math.round(n).toLocaleString('zh-TW'), unit: ' 元', highlight: curIdx })}
      </section>

      <section class="section">
        <div class="section-head"><h2 class="section-title">各成員購書支出</h2></div>
        <p class="hint" style="margin-bottom:8px">只計算書價。運費與訂單折扣列為家庭共同支出。</p>
        <ul class="list">${[{ member_id: 'FAMILY' }, ...d.members].map((m) => {
          const s = d.by_member[m.member_id] || { month: 0, year: 0 };
          const mb = b(m.member_id, 'month');
          return `<li class="list-row"><span class="list-name">${esc(shelfName(m.member_id, memById))}
            <span class="hint" style="display:block">本月 ${esc(formatMoney(s.month))}，今年 ${esc(formatMoney(s.year))}${mb !== undefined && m.member_id !== 'FAMILY' ? `，個人月預算 ${esc(formatMoney(mb))}，剩餘 ${esc(formatMoney(mb - s.month))}` : ''}</span></span></li>`;
        }).join('')}</ul>
      </section>

      <section class="section">
        <div class="section-head"><h2 class="section-title">本月訂單</h2></div>
        ${d.orders.length ? d.orders.map((o) => `
          <div class="edition">
            <div class="edition-head"><p class="edition-title">${esc(formatDate(o.order_date))}${o.platform ? `，${esc(o.platform)}` : ''}</p>
              <button type="button" class="btn btn-text" data-edit-order="${esc(o.order_id)}">修改運費</button></div>
            <p class="hint">運費 ${esc(formatMoney(o.shipping || 0))}${Number(o.order_discount) ? `，訂單折扣 ${esc(formatMoney(o.order_discount))}` : ''}${o.platform_order_no ? `，訂單編號 ${esc(o.platform_order_no)}` : ''}</p>
            <ul class="copies">${o.items.map((it) => `
              <li class="copy"><div><p>${it.work_id ? `<a href="#/book/${encodeURIComponent(it.work_id)}">${esc(it.title)}</a>` : esc(it.title)}</p>
                <p class="hint">${esc(shelfName(it.member_id, memById))}，實付 ${esc(formatMoney(it.paid_amount))}${it.list_price ? `（定價 ${esc(formatMoney(it.list_price))}）` : ''}</p></div>
                <div class="copy-actions"><button type="button" class="btn btn-text" data-del-purchase="${esc(it.purchase_id)}">刪除</button></div></li>`).join('')}</ul>
          </div>`).join('') : '<p class="hint">這個月沒有購書紀錄。從「想買的書」標記已購買，或在書籍頁「記錄購買」。</p>'}
      </section>

      <section class="section">
        <div class="section-head"><h2 class="section-title">預算設定</h2></div>
        <form id="bud-form" class="book-form">
          <div class="grid-2">
            <label class="field"><span class="field-label">家庭每月購書預算</span><input class="input" type="number" min="0" name="FAMILY|month" value="${esc(monthBudget ?? '')}"></label>
            <label class="field"><span class="field-label">家庭年度購書預算</span><input class="input" type="number" min="0" name="FAMILY|year" value="${esc(yearBudget ?? '')}"></label>
          </div>
          <div class="grid-2">${d.members.map((m) => `<label class="field"><span class="field-label">${esc(m.shelf_name)} 每月預算</span><input class="input" type="number" min="0" name="${esc(m.member_id)}|month" value="${esc(b(m.member_id, 'month') ?? '')}"></label>`).join('')}</div>
          <p class="hint">留空代表不設定預算。</p>
          <button class="btn btn-primary" type="submit">儲存預算</button>
        </form>
      </section>`;
    bindCharts(view);
    view.querySelectorAll('[data-month]').forEach((btn) => btn.addEventListener('click', () => load(btn.dataset.month)));
    view.querySelector('#bud-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const restore = setBusy(e.submitter, '儲存中…');
      try {
        for (const input of e.target.querySelectorAll('input')) {
          const [member_id, period_type] = input.name.split('|');
          const cur = d.budgets[input.name];
          const next = input.value === '' ? undefined : Number(input.value);
          if (cur !== next) await write('budgets.save', { member_id, period_type, amount: input.value });
        }
        toast('已儲存預算');
        load(d.month);
      } catch (err) { toast(err.message, { error: true }); restore(); }
    });
    view.querySelectorAll('[data-del-purchase]').forEach((btn) => btn.addEventListener('click', async () => {
      if (!(await confirmDialog({ title: '刪除這筆購書紀錄？', text: '書籍與收藏不會被刪除；若來自願望清單，會改回「想買」。', confirmText: '刪除', danger: true }))) return;
      try { await write('purchases.delete', { purchase_id: btn.dataset.delPurchase }, [booksChanged]); toast('已刪除'); load(d.month); } catch (err) { toast(err.message, { error: true }); }
    }));
    view.querySelectorAll('[data-edit-order]').forEach((btn) => btn.addEventListener('click', async () => {
      const o = d.orders.find((x) => x.order_id === btn.dataset.editOrder);
      const v = prompt('這張訂單的運費（元）', o.shipping || '0');
      if (v === null) return;
      try { await write('orders.update', { ...o, shipping: v, expected_updated_at: o.updated_at }); toast('已更新運費'); load(d.month); } catch (err) { toast(err.message, { error: true }); }
    }));
  }

  load();
}
