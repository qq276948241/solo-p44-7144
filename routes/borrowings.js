const express = require('express');
const { runAsync, getAsync, allAsync } = require('../config/database');
const { authRequired } = require('../middleware/auth');

const router = express.Router();

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

async function detectAndUpdateOverdue() {
  const today = formatDate(new Date());
  const active = await allAsync(
    `SELECT * FROM borrowings WHERE status IN ('借用中', '逾期')`
  );

  for (const b of active) {
    const overdue = Math.max(0, daysBetween(b.expected_return_date, today) - OVERDUE_GRACE_DAYS);
    const newStatus = overdue > 0 ? '逾期' : '借用中';

    if (overdue !== b.overdue_days || newStatus !== b.status) {
      await runAsync(
        `UPDATE borrowings SET status = ?, overdue_days = ? WHERE id = ?`,
        [newStatus, overdue, b.id]
      );
    }
  }
}

function attachOverdueFlag(borrowing) {
  const today = formatDate(new Date());
  const rawOverdue = daysBetween(borrowing.expected_return_date, today);
  borrowing.overdue_days = Math.max(0, rawOverdue - OVERDUE_GRACE_DAYS);
  borrowing.is_overdue = borrowing.overdue_days > 0;
  borrowing.grace_remaining = Math.max(0, OVERDUE_GRACE_DAYS - rawOverdue);
  return borrowing;
}

router.get('/items', async (req, res) => {
  try {
    const items = await allAsync(
      `SELECT * FROM items ORDER BY category, name`
    );
    res.json({ code: 200, data: items });
  } catch (err) {
    console.error('获取可借物品列表失败:', err);
    res.status(500).json({ code: 500, message: '服务器内部错误' });
  }
});

router.get('/items/:id', async (req, res) => {
  try {
    const item = await getAsync(
      `SELECT * FROM items WHERE id = ?`,
      [req.params.id]
    );
    if (!item) {
      return res.status(404).json({ code: 404, message: '物品不存在' });
    }
    res.json({ code: 200, data: item });
  } catch (err) {
    console.error('获取物品详情失败:', err);
    res.status(500).json({ code: 500, message: '服务器内部错误' });
  }
});

router.get('/', authRequired, async (req, res) => {
  try {
    await detectAndUpdateOverdue();
    const list = await allAsync(
      `SELECT b.*, i.name as item_name, i.category as item_category, i.deposit as item_deposit,
              m.name as member_name, m.phone as member_phone
       FROM borrowings b
       JOIN items i ON b.item_id = i.id
       JOIN members m ON b.member_id = m.id
       WHERE b.member_id = ?
       ORDER BY b.created_at DESC`,
      [req.member.id]
    );
    list.forEach(attachOverdueFlag);
    res.json({ code: 200, data: list });
  } catch (err) {
    console.error('获取我的借用记录失败:', err);
    res.status(500).json({ code: 500, message: '服务器内部错误' });
  }
});

router.get('/overdue', authRequired, async (req, res) => {
  try {
    await detectAndUpdateOverdue();
    const today = formatDate(new Date());
    const list = await allAsync(
      `SELECT b.*, i.name as item_name, i.category as item_category, i.deposit as item_deposit,
              m.name as member_name, m.phone as member_phone
       FROM borrowings b
       JOIN items i ON b.item_id = i.id
       JOIN members m ON b.member_id = m.id
       WHERE b.status = '逾期'
       ORDER BY b.overdue_days DESC, b.expected_return_date ASC`
    );
    list.forEach(b => {
      b.is_overdue = true;
      b.overdue_days = Math.max(0, daysBetween(b.expected_return_date, today) - OVERDUE_GRACE_DAYS);
    });
    res.json({
      code: 200,
      data: {
        total: list.length,
        grace_days: OVERDUE_GRACE_DAYS,
        records: list
      }
    });
  } catch (err) {
    console.error('获取逾期列表失败:', err);
    res.status(500).json({ code: 500, message: '服务器内部错误' });
  }
});

router.get('/:id', authRequired, async (req, res) => {
  try {
    await detectAndUpdateOverdue();
    const b = await getAsync(
      `SELECT b.*, i.name as item_name, i.category as item_category, i.deposit as item_deposit,
              m.name as member_name, m.phone as member_phone
       FROM borrowings b
       JOIN items i ON b.item_id = i.id
       JOIN members m ON b.member_id = m.id
       WHERE b.id = ? AND b.member_id = ?`,
      [req.params.id, req.member.id]
    );
    if (!b) {
      return res.status(404).json({ code: 404, message: '借用记录不存在' });
    }
    attachOverdueFlag(b);
    res.json({ code: 200, data: b });
  } catch (err) {
    console.error('获取借用详情失败:', err);
    res.status(500).json({ code: 500, message: '服务器内部错误' });
  }
});

router.post('/', authRequired, async (req, res) => {
  try {
    const { item_id, quantity = 1, borrow_days, notes } = req.body;

    if (!item_id) {
      return res.status(400).json({ code: 400, message: 'item_id 不能为空' });
    }
    if (quantity < 1) {
      return res.status(400).json({ code: 400, message: '借用数量必须大于 0' });
    }

    const item = await getAsync(`SELECT * FROM items WHERE id = ?`, [item_id]);
    if (!item) {
      return res.status(404).json({ code: 404, message: '物品不存在' });
    }
    if (item.available_quantity < quantity) {
      return res.status(409).json({
        code: 409,
        message: `库存不足，当前可借 ${item.available_quantity} 件`
      });
    }

    const days = borrow_days && borrow_days > 0
      ? Math.min(borrow_days, item.max_borrow_days)
      : item.max_borrow_days;

    const today = formatDate(new Date());
    const expectedReturn = addDays(today, days);

    const result = await runAsync(
      `INSERT INTO borrowings (member_id, item_id, quantity, borrow_date, expected_return_date, notes)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [req.member.id, item_id, quantity, today, expectedReturn, notes || null]
    );

    await runAsync(
      `UPDATE items SET available_quantity = available_quantity - ? WHERE id = ?`,
      [quantity, item_id]
    );

    const record = await getAsync(
      `SELECT b.*, i.name as item_name, i.category as item_category
       FROM borrowings b JOIN items i ON b.item_id = i.id WHERE b.id = ?`,
      [result.lastID]
    );
    attachOverdueFlag(record);

    res.status(201).json({
      code: 201,
      message: '借用申请成功',
      data: record
    });
  } catch (err) {
    console.error('创建借用失败:', err);
    res.status(500).json({ code: 500, message: '服务器内部错误' });
  }
});

router.put('/:id/return', authRequired, async (req, res) => {
  try {
    await detectAndUpdateOverdue();

    const b = await getAsync(
      `SELECT * FROM borrowings WHERE id = ? AND member_id = ?`,
      [req.params.id, req.member.id]
    );
    if (!b) {
      return res.status(404).json({ code: 404, message: '借用记录不存在' });
    }
    if (b.status === '已归还') {
      return res.status(400).json({ code: 400, message: '该借用已归还，请勿重复操作' });
    }

    const today = formatDate(new Date());
    const rawOverdue = Math.max(0, daysBetween(b.expected_return_date, today) - OVERDUE_GRACE_DAYS);
    const finalOverdue = Math.max(0, rawOverdue);
    const finalStatus = '已归还';

    await runAsync(
      `UPDATE borrowings
       SET status = ?, actual_return_date = ?, overdue_days = ?
       WHERE id = ?`,
      [finalStatus, today, finalOverdue, b.id]
    );

    await runAsync(
      `UPDATE items SET available_quantity = available_quantity + ? WHERE id = ?`,
      [b.quantity, b.item_id]
    );

    const record = await getAsync(
      `SELECT b.*, i.name as item_name, i.category as item_category, i.deposit as item_deposit
       FROM borrowings b JOIN items i ON b.item_id = i.id WHERE b.id = ?`,
      [b.id]
    );

    const msg = finalOverdue > 0
      ? `归还成功，逾期 ${finalOverdue} 天，请联系客服处理逾期费用`
      : '归还成功';

    res.json({
      code: 200,
      message: msg,
      data: record
    });
  } catch (err) {
    console.error('归还失败:', err);
    res.status(500).json({ code: 500, message: '服务器内部错误' });
  }
});

module.exports = {
  router,
  detectAndUpdateOverdue,
  OVERDUE_GRACE_DAYS
};
