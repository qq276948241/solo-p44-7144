const jwt = require('jsonwebtoken');
const { getAsync } = require('../config/database');

const JWT_SECRET = process.env.JWT_SECRET || 'petshop_secret_key_2024';

function generateToken(member) {
  return jwt.sign(
    {
      id: member.id,
      phone: member.phone,
      name: member.name,
      level: member.level
    },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

async function authRequired(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ code: 401, message: '请先登录' });
    }

    const token = authHeader.substring(7);
    const decoded = jwt.verify(token, JWT_SECRET);

    const member = await getAsync(
      'SELECT id, phone, name, level, total_consumed, points, created_at FROM members WHERE id = ?',
      [decoded.id]
    );

    if (!member) {
      return res.status(401).json({ code: 401, message: '用户不存在或已被删除' });
    }

    req.member = member;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ code: 401, message: '登录已过期，请重新登录' });
    }
    if (err.name === 'JsonWebTokenError') {
      return res.status(401).json({ code: 401, message: '无效的登录凭证' });
    }
    return res.status(500).json({ code: 500, message: '认证服务异常' });
  }
}

module.exports = {
  generateToken,
  authRequired
};
