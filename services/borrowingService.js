const { runAsync, getAsync, allAsync } = require('../config/database');

const OVERDUE_GRACE_DAYS = 3;

function parseDate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function formatDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function today() {
  return formatDate(new Date());
}

function addDays(dateStr, days) {
  const d = parseDate(dateStr);
  d.setDate(d.getDate() + days);
  return formatDate(d);
}

function daysBetween(dateStrA, dateStrB) {
  const a = parseDate(dateStrA);
  const b = parseDate(dateStrB);
  return Math.floor((b - a) / (1000 * 60 * 60 * 24));
}

function computeOverdueDays(expectedReturnDate) {
  return Math.max(0, daysBetween(expectedReturnDate, today()) - OVERDUE_GRACE_DAYS);
}

function attachOverdueInfo(borrowing) {
  const rawElapsed = daysBetween(borrowing.expected_return_date, today());
  borrowing.overdue_days = Math.max(0, rawElapsed - OVERDUE_GRACE_DAYS);
  borrowing.is_overdue = borrowing.overdue_days > 0;
  borrowing.grace_remaining = Math.max(0, OVERDUE_GRACE_DAYS - rawElapsed);
  return borrowing;
}

const BORROWING_DETAIL_JOIN = `
  SELECT b.*, i.name as item_name, i.category as item_category, i.deposit as item_deposit,
         m.name as member_name, m.phone as member_phone
  FROM borrowings b
  JOIN items i ON b.item_id = i.id
  JOIN members m ON b.member_id = m.id`;

async function refreshOverdue() {
  const active = await allAsync(
    `SELECT * FROM borrowings WHERE status IN ('借用中', '逾期')`
  );
  for (const b of active) {
    const overdue = computeOverdueDays(b.expected_return_date);
    const newStatus = overdue > 0 ? '逾期' : '借用中';
    if (overdue !== b.overdue_days || newStatus !== b.status) {
      await runAsync(
        `UPDATE borrowings SET status = ?, overdue_days = ? WHERE id = ?`,
        [newStatus, overdue, b.id]
      );
    }
  }
}

async function listItems() {
  return allAsync(`SELECT * FROM items ORDER BY category, name`);
}

async function findItem(itemId) {
  return getAsync(`SELECT * FROM items WHERE id = ?`, [itemId]);
}

function validateBorrowInput(item_id, quantity) {
  if (!item_id) return { valid: false, code: 400, message: 'item_id 不能为空' };
  if (quantity < 1) return { valid: false, code: 400, message: '借用数量必须大于 0' };
  return { valid: true };
}

function validateItemStock(item, quantity) {
  if (!item) return { valid: false, code: 404, message: '物品不存在' };
  if (item.available_quantity < quantity) {
    return { valid: false, code: 409, message: `库存不足，当前可借 ${item.available_quantity} 件` };
  }
  return { valid: true };
}

async function adjustStock(itemId, delta) {
  await runAsync(
    `UPDATE items SET available_quantity = available_quantity + ? WHERE id = ?`,
    [delta, itemId]
  );
}

async function findBorrowing(borrowingId, memberId) {
  return getAsync(
    `${BORROWING_DETAIL_JOIN} WHERE b.id = ? AND b.member_id = ?`,
    [borrowingId, memberId]
  );
}

function validateReturnStatus(borrowing) {
  if (!borrowing) return { valid: false, code: 404, message: '借用记录不存在' };
  if (borrowing.status === '已归还') return { valid: false, code: 400, message: '该借用已归还，请勿重复操作' };
  if (borrowing.status !== '借用中' && borrowing.status !== '逾期') {
    return { valid: false, code: 400, message: `当前状态「${borrowing.status}」不允许归还` };
  }
  return { valid: true };
}

async function createBorrowing(memberId, item, quantity, borrowDays, notes) {
  const days = borrowDays && borrowDays > 0
    ? Math.min(borrowDays, item.max_borrow_days)
    : item.max_borrow_days;

  const borrowDate = today();
  const expectedReturnDate = addDays(borrowDate, days);

  const result = await runAsync(
    `INSERT INTO borrowings (member_id, item_id, quantity, borrow_date, expected_return_date, notes)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [memberId, item.id, quantity, borrowDate, expectedReturnDate, notes || null]
  );

  await adjustStock(item.id, -quantity);

  const record = await getAsync(
    `${BORROWING_DETAIL_JOIN} WHERE b.id = ?`,
    [result.lastID]
  );
  return attachOverdueInfo(record);
}

async function returnBorrowing(borrowing) {
  const returnDate = today();
  const finalOverdue = computeOverdueDays(borrowing.expected_return_date);

  await runAsync(
    `UPDATE borrowings SET status = '已归还', actual_return_date = ?, overdue_days = ? WHERE id = ?`,
    [returnDate, finalOverdue, borrowing.id]
  );

  await adjustStock(borrowing.item_id, borrowing.quantity);

  const record = await getAsync(
    `${BORROWING_DETAIL_JOIN} WHERE b.id = ?`,
    [borrowing.id]
  );

  return {
    record,
    overdueDays: finalOverdue,
    message: finalOverdue > 0
      ? `归还成功，逾期 ${finalOverdue} 天，请联系客服处理逾期费用`
      : '归还成功'
  };
}

async function getMyBorrowings(memberId) {
  await refreshOverdue();
  const list = await allAsync(
    `${BORROWING_DETAIL_JOIN} WHERE b.member_id = ? ORDER BY b.created_at DESC`,
    [memberId]
  );
  return list.map(attachOverdueInfo);
}

async function getOverdueList() {
  await refreshOverdue();
  const list = await allAsync(
    `${BORROWING_DETAIL_JOIN} WHERE b.status = '逾期' ORDER BY b.overdue_days DESC, b.expected_return_date ASC`
  );
  list.forEach(b => {
    b.is_overdue = true;
    b.overdue_days = computeOverdueDays(b.expected_return_date);
  });
  return {
    total: list.length,
    grace_days: OVERDUE_GRACE_DAYS,
    records: list
  };
}

module.exports = {
  OVERDUE_GRACE_DAYS,
  refreshOverdue,
  listItems,
  findItem,
  validateBorrowInput,
  validateItemStock,
  adjustStock,
  findBorrowing,
  validateReturnStatus,
  createBorrowing,
  returnBorrowing,
  getMyBorrowings,
  getOverdueList,
  attachOverdueInfo
};
