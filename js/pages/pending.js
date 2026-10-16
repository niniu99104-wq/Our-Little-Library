/**
 * 尚未開發完成的頁面
 * 明確告訴使用者功能還沒開放，不顯示假的表單或假資料。
 */
function pendingPage(title, sub, text) {
  return {
    mount(view) {
      view.innerHTML = `
        <header style="margin-bottom:32px">
          <h1 class="page-title">${title}</h1>
          <p class="page-sub">${sub}</p>
        </header>
        <div class="pending">
          <p class="pending-title">這個功能還在製作中</p>
          <p class="pending-text">${text}</p>
        </div>`;
    }
  };
}

export const addPage = pendingPage(
  '新增書籍',
  'Every shelf starts with one book.',
  '手動新增書籍會在下一個開發步驟開放；ISBN 與書名查詢、重複檢查會在第三個步驟加入。目前還無法建立書籍資料。'
);

export const wishlistPage = pendingPage(
  '想買的書',
  'Books we are waiting for.',
  '願望清單與「是否已經買過」的比對，會在第一階段的第三個步驟開放。'
);
