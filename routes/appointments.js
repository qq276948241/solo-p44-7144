const express = require('express');
const { runAsync, getAsync, allAsync } = require('../config/database');
const { authRequired } = require('../middleware/auth');
const { calculateLevel, applyDiscount } = require('./members');

const router = express.Router();

function timeToMinutes(timeStr) {
  const [h, m] = timeStr.split(':').map(Number);
  return h * 60 + m;
}

function minutesToTime(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function isTimeOverlap(s1, e1, s2, e2) {
  return s1 < e2 && s2 < e1;
}

function generateTimeSlots(durationMinutes) {
  const slots = [];
  const start = 9 * 60;
  const end = 18 * 60;
  for (let t = start; t + durationMinutes <= end; t += durationMinutes) {
    slots.push({
      start_time: minutesToTime(t),
      end_time: minutesToTime(t + durationMinutes)
    });
  }
  return slots;
}

router.get('/services', async (req, res) => {
  try {
    const services = await allAsync('SELECT * FROM services ORDER BY id');
    res.json({
      code: 200,
      data: services
    });
  } catch (err) {
    console.error('获取服务列表失败:', err);
    res.status(500).json({ code: 500, message: '服务器内部错误' });
  }
});

router.get('/availability', async (req, res) => {
  try {
    const { service_id, date } = req.query;

    if (!service_id || !date) {
      return res.status(400).json({
        code: 400,
        message: 'service_id 和 date 参数不能为空'
      });
    }

    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(date)) {
      return res.status(400).json({
        code: 400,
        message: 'date 格式必须为 YYYY-MM-DD'
      });
    }

    const service = await getAsync('SELECT * FROM services WHERE id = ?', [service_id]);
    if (!service) {
      return res.status(404).json({ code: 404, message: '服务不存在' });
    }

    const existingAppointments = await allAsync(
      `SELECT start_time, end_time, COUNT(*) as count 
       FROM appointments 
       WHERE service_id = ? AND appointment_date = ? AND status != '已取消'
       GROUP BY start_time, end_time`,
      [service_id, date]
    );

    const timeSlots = generateTimeSlots(service.duration_minutes);
    const availability = [];

    for (const slot of timeSlots) {
      const slotStart = timeToMinutes(slot.start_time);
      const slotEnd = timeToMinutes(slot.end_time);

      let usedCapacity = 0;
      for (const apt of existingAppointments) {
        const aptStart = timeToMinutes(apt.start_time);
        const aptEnd = timeToMinutes(apt.end_time);
        if (isTimeOverlap(slotStart, slotEnd, aptStart, aptEnd)) {
          usedCapacity += apt.count;
        }
      }

      const remaining = Math.max(0, service.capacity_per_slot - usedCapacity);
      availability.push({
        start_time: slot.start_time,
        end_time: slot.end_time,
        capacity: service.capacity_per_slot,
        booked: usedCapacity,
        remaining: remaining,
        available: remaining > 0
      });
    }

    res.json({
      code: 200,
      data: {
        service,
        date,
        slots: availability
      }
    });
  } catch (err) {
    console.error('查询可用时间失败:', err);
    res.status(500).json({ code: 500, message: '服务器内部错误' });
  }
});

router.get('/', authRequired, async (req, res) => {
  try {
    const appointments = await allAsync(
      `SELECT a.*, s.name as service_name, s.description as service_description,
              s.base_price, s.duration_minutes,
              p.name as pet_name, p.species as pet_species, p.breed as pet_breed
       FROM appointments a
       JOIN services s ON a.service_id = s.id
       JOIN pets p ON a.pet_id = p.id
       WHERE a.member_id = ?
       ORDER BY a.appointment_date DESC, a.start_time DESC`,
      [req.member.id]
    );

    res.json({
      code: 200,
      data: appointments
    });
  } catch (err) {
    console.error('获取预约列表失败:', err);
    res.status(500).json({ code: 500, message: '服务器内部错误' });
  }
});

router.get('/:id', authRequired, async (req, res) => {
  try {
    const apt = await getAsync(
      `SELECT a.*, s.name as service_name, s.description as service_description,
              s.base_price, s.duration_minutes, s.capacity_per_slot,
              p.name as pet_name, p.species as pet_species, p.breed as pet_breed,
              p.age as pet_age, p.allergies as pet_allergies
       FROM appointments a
       JOIN services s ON a.service_id = s.id
       JOIN pets p ON a.pet_id = p.id
       WHERE a.id = ? AND a.member_id = ?`,
      [req.params.id, req.member.id]
    );

    if (!apt) {
      return res.status(404).json({ code: 404, message: '预约不存在' });
    }

    res.json({
      code: 200,
      data: apt
    });
  } catch (err) {
    console.error('获取预约详情失败:', err);
    res.status(500).json({ code: 500, message: '服务器内部错误' });
  }
});

router.post('/', authRequired, async (req, res) => {
  try {
    const { pet_id, service_id, appointment_date, start_time, notes } = req.body;

    if (!pet_id || !service_id || !appointment_date || !start_time) {
      return res.status(400).json({
        code: 400,
        message: 'pet_id、service_id、appointment_date、start_time 不能为空'
      });
    }

    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(appointment_date)) {
      return res.status(400).json({
        code: 400,
        message: 'appointment_date 格式必须为 YYYY-MM-DD'
      });
    }

    const timeRegex = /^\d{2}:\d{2}$/;
    if (!timeRegex.test(start_time)) {
      return res.status(400).json({
        code: 400,
        message: 'start_time 格式必须为 HH:MM'
      });
    }

    const pet = await getAsync(
      'SELECT id FROM pets WHERE id = ? AND member_id = ?',
      [pet_id, req.member.id]
    );
    if (!pet) {
      return res.status(404).json({ code: 404, message: '宠物不存在' });
    }

    const service = await getAsync('SELECT * FROM services WHERE id = ?', [service_id]);
    if (!service) {
      return res.status(404).json({ code: 404, message: '服务不存在' });
    }

    const startTimeMin = timeToMinutes(start_time);
    const endTimeMin = startTimeMin + service.duration_minutes;
    const end_time = minutesToTime(endTimeMin);

    if (startTimeMin < 9 * 60 || endTimeMin > 18 * 60) {
      return res.status(400).json({
        code: 400,
        message: '预约时间必须在 09:00-18:00 营业范围内'
      });
    }

    const existingAppointments = await allAsync(
      `SELECT start_time, end_time, COUNT(*) as count 
       FROM appointments 
       WHERE service_id = ? AND appointment_date = ? AND status != '已取消'
       GROUP BY start_time, end_time`,
      [service_id, appointment_date]
    );

    let usedCapacity = 0;
    for (const apt of existingAppointments) {
      const aptStart = timeToMinutes(apt.start_time);
      const aptEnd = timeToMinutes(apt.end_time);
      if (isTimeOverlap(startTimeMin, endTimeMin, aptStart, aptEnd)) {
        usedCapacity += apt.count;
      }
    }

    if (usedCapacity >= service.capacity_per_slot) {
      return res.status(409).json({
        code: 409,
        message: '该时间段预约已满，请选择其他时间'
      });
    }

    const actualPrice = applyDiscount(service.base_price, req.member.level);

    const result = await runAsync(
      `INSERT INTO appointments (member_id, pet_id, service_id, appointment_date, start_time, end_time, actual_price, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [req.member.id, pet_id, service_id, appointment_date, start_time, end_time, actualPrice, notes || null]
    );

    const appointment = await getAsync(
      `SELECT a.*, s.name as service_name, p.name as pet_name
       FROM appointments a
       JOIN services s ON a.service_id = s.id
       JOIN pets p ON a.pet_id = p.id
       WHERE a.id = ?`,
      [result.lastID]
    );

    res.status(201).json({
      code: 201,
      message: '预约成功',
      data: appointment
    });
  } catch (err) {
    console.error('创建预约失败:', err);
    res.status(500).json({ code: 500, message: '服务器内部错误' });
  }
});

router.put('/:id/confirm', authRequired, async (req, res) => {
  try {
    const apt = await getAsync(
      'SELECT * FROM appointments WHERE id = ? AND member_id = ?',
      [req.params.id, req.member.id]
    );

    if (!apt) {
      return res.status(404).json({ code: 404, message: '预约不存在' });
    }

    if (apt.status !== '待确认') {
      return res.status(400).json({
        code: 400,
        message: `当前状态为「${apt.status}」，无法重复确认`
      });
    }

    const price = apt.actual_price;
    const addPoints = Math.floor(price);

    const currentMember = await getAsync(
      'SELECT total_consumed, points FROM members WHERE id = ?',
      [req.member.id]
    );

    const newTotalConsumed = currentMember.total_consumed + price;
    const newPoints = currentMember.points + addPoints;
    const newLevel = calculateLevel(newTotalConsumed);

    await runAsync(
      `UPDATE members SET total_consumed = ?, points = ?, level = ? WHERE id = ?`,
      [newTotalConsumed, newPoints, newLevel, req.member.id]
    );

    await runAsync(
      `UPDATE appointments SET status = '已完成' WHERE id = ?`,
      [req.params.id]
    );

    const levelUpNotice = newLevel !== apt.status && newLevel !== '普通'
      ? `，恭喜升级为${newLevel}会员！`
      : '';

    const updated = await getAsync(
      `SELECT a.*, s.name as service_name, p.name as pet_name
       FROM appointments a
       JOIN services s ON a.service_id = s.id
       JOIN pets p ON a.pet_id = p.id
       WHERE a.id = ?`,
      [req.params.id]
    );

    const memberInfo = await getAsync(
      'SELECT id, phone, name, level, total_consumed, points FROM members WHERE id = ?',
      [req.member.id]
    );

    res.json({
      code: 200,
      message: `服务已确认完成，消费 ¥${price}，获得 ${addPoints} 积分${levelUpNotice}`,
      data: {
        appointment: updated,
        member: memberInfo
      }
    });
  } catch (err) {
    console.error('确认预约失败:', err);
    res.status(500).json({ code: 500, message: '服务器内部错误' });
  }
});

router.put('/:id/cancel', authRequired, async (req, res) => {
  try {
    const apt = await getAsync(
      'SELECT * FROM appointments WHERE id = ? AND member_id = ?',
      [req.params.id, req.member.id]
    );

    if (!apt) {
      return res.status(404).json({ code: 404, message: '预约不存在' });
    }

    if (apt.status === '已完成') {
      return res.status(400).json({
        code: 400,
        message: '已完成的预约无法取消'
      });
    }

    if (apt.status === '已取消') {
      return res.status(400).json({
        code: 400,
        message: '预约已取消，请勿重复操作'
      });
    }

    await runAsync(
      `UPDATE appointments SET status = '已取消' WHERE id = ?`,
      [req.params.id]
    );

    const updated = await getAsync(
      `SELECT a.*, s.name as service_name, p.name as pet_name
       FROM appointments a
       JOIN services s ON a.service_id = s.id
       JOIN pets p ON a.pet_id = p.id
       WHERE a.id = ?`,
      [req.params.id]
    );

    res.json({
      code: 200,
      message: '预约已取消',
      data: updated
    });
  } catch (err) {
    console.error('取消预约失败:', err);
    res.status(500).json({ code: 500, message: '服务器内部错误' });
  }
});

module.exports = router;
