const express = require('express');
const bcrypt = require('bcryptjs');
const { runAsync, getAsync } = require('../config/database');
const { generateToken, authRequired } = require('../middleware/auth');

const router = express.Router();

const LEVEL_SILVER_THRESHOLD = 500;
const LEVEL_GOLD_THRESHOLD = 2000;
const GOLD_DISCOUNT_RATE = 0.8;

function calculateLevel(totalConsumed) {
  if (totalConsumed >= LEVEL_GOLD_THRESHOLD) return '金卡';
  if (totalConsumed >= LEVEL_SILVER_THRESHOLD) return '银卡';
  return '普通';
}

function applyDiscount(price, level) {
  if (level === '金卡') {
    return Math.round(price * GOLD_DISCOUNT_RATE * 100) / 100;
  }
  return price;
}

router.post('/register', async (req, res) => {
  try {
    const { phone, password, name } = req.body;

    if (!phone || !password || !name) {
      return res.status(400).json({
        code: 400,
        message: '手机号、密码、姓名不能为空'
      });
    }

    if (!/^1[3-9]\d{9}$/.test(phone)) {
      return res.status(400).json({
        code: 400,
        message: '请输入有效的手机号码'
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        code: 400,
        message: '密码长度至少6位'
      });
    }

    const existing = await getAsync('SELECT id FROM members WHERE phone = ?', [phone]);
    if (existing) {
      return res.status(409).json({
        code: 409,
        message: '该手机号已注册'
      });
    }

    const saltRounds = 10;
    const hashedPassword = bcrypt.hashSync(password, saltRounds);

    const result = await runAsync(
      'INSERT INTO members (phone, password, name) VALUES (?, ?, ?)',
      [phone, hashedPassword, name]
    );

    const member = await getAsync(
      'SELECT id, phone, name, level, total_consumed, points, created_at FROM members WHERE id = ?',
      [result.lastID]
    );

    const token = generateToken(member);

    res.status(201).json({
      code: 201,
      message: '注册成功',
      data: {
        member,
        token
      }
    });
  } catch (err) {
    console.error('注册失败:', err);
    res.status(500).json({ code: 500, message: '服务器内部错误' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { phone, password } = req.body;

    if (!phone || !password) {
      return res.status(400).json({
        code: 400,
        message: '手机号和密码不能为空'
      });
    }

    const member = await getAsync('SELECT * FROM members WHERE phone = ?', [phone]);
    if (!member) {
      return res.status(401).json({
        code: 401,
        message: '手机号或密码错误'
      });
    }

    const isMatch = bcrypt.compareSync(password, member.password);
    if (!isMatch) {
      return res.status(401).json({
        code: 401,
        message: '手机号或密码错误'
      });
    }

    const memberInfo = {
      id: member.id,
      phone: member.phone,
      name: member.name,
      level: member.level,
      total_consumed: member.total_consumed,
      points: member.points,
      created_at: member.created_at
    };

    const token = generateToken(memberInfo);

    res.json({
      code: 200,
      message: '登录成功',
      data: {
        member: memberInfo,
        token
      }
    });
  } catch (err) {
    console.error('登录失败:', err);
    res.status(500).json({ code: 500, message: '服务器内部错误' });
  }
});

router.get('/profile', authRequired, async (req, res) => {
  try {
    res.json({
      code: 200,
      data: req.member
    });
  } catch (err) {
    console.error('获取资料失败:', err);
    res.status(500).json({ code: 500, message: '服务器内部错误' });
  }
});

router.put('/profile', authRequired, async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) {
      return res.status(400).json({ code: 400, message: '姓名不能为空' });
    }

    await runAsync('UPDATE members SET name = ? WHERE id = ?', [name, req.member.id]);

    const updated = await getAsync(
      'SELECT id, phone, name, level, total_consumed, points, created_at FROM members WHERE id = ?',
      [req.member.id]
    );

    res.json({
      code: 200,
      message: '资料更新成功',
      data: updated
    });
  } catch (err) {
    console.error('更新资料失败:', err);
    res.status(500).json({ code: 500, message: '服务器内部错误' });
  }
});

module.exports = {
  router,
  calculateLevel,
  applyDiscount,
  GOLD_DISCOUNT_RATE
};
