/**
 * 簡單長條圖（單一數列）：細長條、頂端圓角、淡色格線，滑過或點按顯示數值。
 * 同時輸出一份隱藏的表格，讓讀屏軟體也能讀到數字。
 */
import { esc } from '../utils/format.js?v=2.0.0';

function niceMax(v) {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
}

/**
 * @param {{ label: string, value: number, note?: string }[]} data
 * @param {{ title: string, unit?: string, format?: (n:number)=>string, highlight?: number }} opts
 */
export function barChart(data, { title, unit = '', format = (n) => String(n), highlight = -1 } = {}) {
  const W = 640, H = 200, padL = 40, padB = 26, padT = 12, padR = 8;
  const max = niceMax(Math.max(0, ...data.map((d) => d.value)));
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const step = plotW / data.length;
  const bw = Math.max(6, Math.min(26, step * 0.5));
  const y = (v) => padT + plotH - (v / max) * plotH;
  const ticks = [0, max / 2, max];
  const bars = data.map((d, i) => {
    const x = padL + step * i + (step - bw) / 2;
    const top = y(d.value);
    const h = Math.max(0, padT + plotH - top);
    const r = Math.min(4, h, bw / 2);
    const path = h > 0
      ? `M${x} ${padT + plotH}V${top + r}Q${x} ${top} ${x + r} ${top}H${x + bw - r}Q${x + bw} ${top} ${x + bw} ${top + r}V${padT + plotH}Z`
      : '';
    const tip = `${d.label}：${format(d.value)}${unit}${d.note ? `，${d.note}` : ''}`;
    return `<g class="bar${i === highlight ? ' is-hl' : ''}" tabindex="0" aria-label="${esc(tip)}">
      <rect x="${x - (step - bw) / 2}" y="${padT}" width="${step}" height="${plotH}" fill="transparent"/>
      ${path ? `<path d="${path}"/>` : ''}
      <title>${esc(tip)}</title>
      <text x="${x + bw / 2}" y="${H - 8}" text-anchor="middle" class="bar-x">${esc(d.label)}</text>
    </g>`;
  }).join('');
  return `
    <figure class="chart">
      <figcaption class="chart-title">${esc(title)}</figcaption>
      <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(title)}" class="chart-svg">
        ${ticks.map((t) => `<line x1="${padL}" x2="${W - padR}" y1="${y(t)}" y2="${y(t)}" class="grid"/><text x="${padL - 6}" y="${y(t) + 4}" text-anchor="end" class="bar-y">${esc(format(t))}</text>`).join('')}
        ${bars}
      </svg>
      <p class="chart-tip hint" aria-live="polite"></p>
      <table class="visually-hidden"><caption>${esc(title)}</caption><tbody>${data.map((d) => `<tr><th>${esc(d.label)}</th><td>${esc(format(d.value))}${esc(unit)}</td></tr>`).join('')}</tbody></table>
    </figure>`;
}

/** 手機上點按長條時，在圖下方顯示數值 */
export function bindCharts(root) {
  root.querySelectorAll('.chart').forEach((fig) => {
    const tip = fig.querySelector('.chart-tip');
    const show = (g) => { tip.textContent = g.getAttribute('aria-label'); };
    fig.querySelectorAll('.bar').forEach((g) => {
      g.addEventListener('mouseenter', () => show(g));
      g.addEventListener('focus', () => show(g));
      g.addEventListener('click', () => show(g));
    });
  });
}
