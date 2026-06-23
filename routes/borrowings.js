const express = require('express');
const { authRequired } = require('../middleware/auth');
const svc = require('../services/borrowingService');

const router = express.Router();

router.get('/items', async (req, res) => {
  try {
    const items = await svc.listItems();
    res.json({ code: 200, data: items });
  } catch (err) {
    console.error('获取可借物品列表失败:', err);
    res.status(500).json({ code: 500, message: '服务器内部错误' });
  }
});

router.get('/items/:id', async (req, res) => {
  try {
    const item = await svc.findItem(req.params.id);
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
    const list = await svc.getMyBorrowings(req.member.id);
    res.json({ code: 200, data: list });
  } catch (err) {
    console.error('获取我的借用记录失败:', err);
    res.status(500).json({ code: 500, message: '服务器内部错误' });
  }
});

router.get('/overdue', authRequired, async (req, res) => {
  try {
    const data = await svc.getOverdueList();
    res.json({ code: 200, data });
  } catch (err) {
    console.error('获取逾期列表失败:', err);
    res.status(500).json({ code: 500, message: '服务器内部错误' });
  }
});

router.get('/:id', authRequired, async (req, res) => {
  try {
    await svc.refreshOverdue();
    const b = await svc.findBorrowing(req.params.id, req.member.id);
    if (!b) {
      return res.status(404).json({ code: 404, message: '借用记录不存在' });
    }
    svc.attachOverdueInfo(b);
    res.json({ code: 200, data: b });
  } catch (err) {
    console.error('获取借用详情失败:', err);
    res.status(500).json({ code: 500, message: '服务器内部错误' });
  }
});

router.post('/', authRequired, async (req, res) => {
  try {
    const { item_id, quantity = 1, borrow_days, notes } = req.body;

    const inputCheck = svc.validateBorrowInput(item_id, quantity);
    if (!inputCheck.valid) {
      return res.status(inputCheck.code).json({ code: inputCheck.code, message: inputCheck.message });
    }

    const item = await svc.findItem(item_id);
    const stockCheck = svc.validateItemStock(item, quantity);
    if (!stockCheck.valid) {
      return res.status(stockCheck.code).json({ code: stockCheck.code, message: stockCheck.message });
    }

    const record = await svc.createBorrowing(req.member.id, item, quantity, borrow_days, notes);
    res.status(201).json({ code: 201, message: '借用申请成功', data: record });
  } catch (err) {
    console.error('创建借用失败:', err);
    res.status(500).json({ code: 500, message: '服务器内部错误' });
  }
});

router.put('/:id/return', authRequired, async (req, res) => {
  try {
    await svc.refreshOverdue();

    const b = await svc.findBorrowing(req.params.id, req.member.id);
    const statusCheck = svc.validateReturnStatus(b);
    if (!statusCheck.valid) {
      return res.status(statusCheck.code).json({ code: statusCheck.code, message: statusCheck.message });
    }

    const result = await svc.returnBorrowing(b);
    res.json({ code: 200, message: result.message, data: result.record });
  } catch (err) {
    console.error('归还失败:', err);
    res.status(500).json({ code: 500, message: '服务器内部错误' });
  }
});

module.exports = {
  router,
  detectAndUpdateOverdue: svc.refreshOverdue,
  OVERDUE_GRACE_DAYS: svc.OVERDUE_GRACE_DAYS
};
