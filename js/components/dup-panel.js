/** 重複檢查結果與 AI 顧問分析的顯示 */
import { esc } from '../utils/format.js?v=2.0.0';
import { FORMAT_LABEL } from '../data.js?v=2.0.0';

const STATUS_TONE = {
  '已收藏': 'warn', '可能已有其他版本': 'warn', '可能包含於套書': 'warn', '已加入願望清單': 'info', '目前沒有收藏紀錄': 'ok'
};

export function statusBadge(status) {
  if (!status) return '';
  return `<span class="badge badge-${STATUS_TONE[status] || 'info'}">${esc(status)}</span>`;
}

function edLine(e) {
  if (!e) return '';
  return [FORMAT_LABEL[e.format], e.publisher, e.isbn ? `ISBN ${e.isbn}` : '', e.copies ? `收藏 ${e.copies} 筆` : '尚無收藏'].filter(Boolean).join('，');
}

/**
 * @param {object} dup  checkDuplicate 的結果
 * @param {{ actions?: boolean }} opts  actions：顯示「這是同一本 / 不同版本」等選項（新增書籍時）
 */
export function dupPanel(dup, { actions = false } = {}) {
  if (!dup) return '';
  const rows = [
    ...dup.matches.map((m) => `
      <li class="dup-item">
        <div>
          <a href="#/book/${encodeURIComponent(m.work_id)}" target="_blank" rel="noopener">${esc(m.title)}</a>
          ${m.authors ? `<span class="hint">　${esc(m.authors)}</span>` : ''}
          <p class="hint">${esc(m.reason)}</p>
          ${m.edition ? `<p class="hint">${esc(edLine(m.edition))}</p>` : ''}
          ${m.editions ? m.editions.map((e) => `<p class="hint">${esc(edLine(e))}</p>`).join('') : ''}
        </div>
        ${actions && m.kind !== 'in_box_set' ? `
          <div class="dup-actions">
            ${m.edition || (m.editions && m.editions[0]) ? `<button type="button" class="btn btn-sm" data-dup="copy" data-edition="${esc((m.edition || m.editions[0]).edition_id)}" data-work="${esc(m.work_id)}">同一本，增加收藏</button>` : ''}
            <button type="button" class="btn btn-sm" data-dup="edition" data-work="${esc(m.work_id)}">不同版本，加到這本書</button>
          </div>` : ''}
      </li>`),
    ...dup.wish_matches.map((w) => `
      <li class="dup-item"><div><a href="#/wishlist/${encodeURIComponent(w.wish_id)}" target="_blank" rel="noopener">${esc(w.title)}</a>
        <p class="hint">願望清單（${esc(w.status)}）：${esc(w.reason)}</p></div></li>`)
  ];
  return `
    <div class="dup-panel" role="status">
      <p class="dup-head">${statusBadge(dup.status)}</p>
      ${rows.length ? `<ul class="dup-list">${rows.join('')}</ul>
        <p class="hint">系統只依書名、作者與 ISBN 比對，請點書名查看差異後再決定。</p>` : ''}
      ${actions && rows.length ? '<button type="button" class="btn btn-text" data-dup="new">都不是，照常新增為新書</button>' : ''}
    </div>`;
}

/** AI 顧問：已確認事實與 AI 建議分開顯示 */
export function advicePanel(res) {
  const f = res.facts || {};
  const facts = [
    `比對結果：${f.duplicate_status || '無資料'}`,
    ...(f.duplicate_matches || []).map((m) => `${m.title}：${m.reason}`),
    ...(f.wishlist_matches || []).map((m) => `願望清單已有《${m.title}》（${m.status}）`),
    f.same_author_in_library?.length ? `家中同作者的書：${f.same_author_in_library.join('、')}` : '家中沒有同作者的書',
    f.similar_topic_in_library?.length ? `家中相似主題的書：${f.similar_topic_in_library.slice(0, 8).join('、')}${f.similar_topic_in_library.length > 8 ? ' 等' : ''}` : '',
    f.member ? `${f.member.shelf}：${f.member.type}${f.member.age ? `，${f.member.age}` : ''}${f.member.interests ? `，興趣：${f.member.interests.replace(/,/g, '、')}` : ''}` : '',
    f.age_rule ? `年齡比對：${f.age_rule.fit}，${f.age_rule.reason}` : ''
  ].filter(Boolean);
  const ai = res.ai;
  return `
    <div class="advice">
      <section>
        <h3 class="advice-title">已確認事實</h3>
        <p class="hint">來自家中藏書資料的比對，不經過 AI。</p>
        <ul class="advice-list">${facts.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
      </section>
      <section>
        <h3 class="advice-title">AI 建議</h3>
        ${ai ? `
          <p class="advice-verdict">${esc(ai.verdict || '')}${ai.age_fit ? `　${statusBadge('')}<span class="badge badge-info">${esc(ai.age_fit)}</span>` : ''}</p>
          ${ai.age_reason ? `<p>${esc(ai.age_reason)}</p>` : ''}
          <ul class="advice-list">${(ai.reasons || []).map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
          ${ai.overlap_note ? `<p class="hint">${esc(ai.overlap_note)}</p>` : ''}
          ${ai.reevaluate_date ? `<p class="hint">建議 ${esc(ai.reevaluate_date)} 左右重新評估。</p>` : ''}
          ${ai.info_sufficient === false ? '<p class="hint">AI 表示資料不足，以上建議僅供參考。</p>' : ''}
          <p class="hint">AI 建議只供參考，年齡判斷不是絕對標準。${res.cached ? '這是先前的分析結果。' : ''}</p>`
        : res.ai_status?.configured === false
          ? '<p class="hint">尚未設定 AI 服務，所以只顯示系統比對的事實。設定方式請看部署說明「AI 功能設定」。</p>'
          : '<p class="hint">沒有 AI 分析結果。</p>'}
      </section>
    </div>`;
}
