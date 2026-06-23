const express = require('express');
const { runAsync, getAsync, allAsync } = require('../config/database');
const { authRequired } = require('../middleware/auth');

const router = express.Router();

router.get('/', authRequired, async (req, res) => {
  try {
    const pets = await allAsync(
      'SELECT * FROM pets WHERE member_id = ? ORDER BY created_at DESC',
      [req.member.id]
    );

    for (const pet of pets) {
      pet.vaccines = await allAsync(
        'SELECT * FROM vaccine_records WHERE pet_id = ? ORDER BY vaccine_date DESC',
        [pet.id]
      );
    }

    res.json({
      code: 200,
      data: pets
    });
  } catch (err) {
    console.error('获取宠物列表失败:', err);
    res.status(500).json({ code: 500, message: '服务器内部错误' });
  }
});

router.get('/:id', authRequired, async (req, res) => {
  try {
    const pet = await getAsync(
      'SELECT * FROM pets WHERE id = ? AND member_id = ?',
      [req.params.id, req.member.id]
    );

    if (!pet) {
      return res.status(404).json({ code: 404, message: '宠物不存在' });
    }

    pet.vaccines = await allAsync(
      'SELECT * FROM vaccine_records WHERE pet_id = ? ORDER BY vaccine_date DESC',
      [pet.id]
    );

    res.json({
      code: 200,
      data: pet
    });
  } catch (err) {
    console.error('获取宠物详情失败:', err);
    res.status(500).json({ code: 500, message: '服务器内部错误' });
  }
});

router.post('/', authRequired, async (req, res) => {
  try {
    const { name, species, breed, age, gender, weight, allergies } = req.body;

    if (!name || !species) {
      return res.status(400).json({
        code: 400,
        message: '宠物名称和品种（物种）不能为空'
      });
    }

    const result = await runAsync(
      `INSERT INTO pets (member_id, name, species, breed, age, gender, weight, allergies)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [req.member.id, name, species, breed || null, age || null, gender || null, weight || null, allergies || null]
    );

    const pet = await getAsync('SELECT * FROM pets WHERE id = ?', [result.lastID]);
    pet.vaccines = [];

    res.status(201).json({
      code: 201,
      message: '宠物档案创建成功',
      data: pet
    });
  } catch (err) {
    console.error('创建宠物档案失败:', err);
    res.status(500).json({ code: 500, message: '服务器内部错误' });
  }
});

router.put('/:id', authRequired, async (req, res) => {
  try {
    const { name, species, breed, age, gender, weight, allergies } = req.body;

    const existing = await getAsync(
      'SELECT id FROM pets WHERE id = ? AND member_id = ?',
      [req.params.id, req.member.id]
    );

    if (!existing) {
      return res.status(404).json({ code: 404, message: '宠物不存在' });
    }

    await runAsync(
      `UPDATE pets SET name = ?, species = ?, breed = ?, age = ?, gender = ?, weight = ?, allergies = ?
       WHERE id = ? AND member_id = ?`,
      [
        name, species, breed || null, age || null, gender || null,
        weight || null, allergies || null, req.params.id, req.member.id
      ]
    );

    const updated = await getAsync('SELECT * FROM pets WHERE id = ?', [req.params.id]);
    updated.vaccines = await allAsync(
      'SELECT * FROM vaccine_records WHERE pet_id = ? ORDER BY vaccine_date DESC',
      [updated.id]
    );

    res.json({
      code: 200,
      message: '宠物档案更新成功',
      data: updated
    });
  } catch (err) {
    console.error('更新宠物档案失败:', err);
    res.status(500).json({ code: 500, message: '服务器内部错误' });
  }
});

router.delete('/:id', authRequired, async (req, res) => {
  try {
    const existing = await getAsync(
      'SELECT id FROM pets WHERE id = ? AND member_id = ?',
      [req.params.id, req.member.id]
    );

    if (!existing) {
      return res.status(404).json({ code: 404, message: '宠物不存在' });
    }

    await runAsync('DELETE FROM pets WHERE id = ? AND member_id = ?', [req.params.id, req.member.id]);

    res.json({
      code: 200,
      message: '宠物档案删除成功'
    });
  } catch (err) {
    console.error('删除宠物档案失败:', err);
    res.status(500).json({ code: 500, message: '服务器内部错误' });
  }
});

router.post('/:id/vaccines', authRequired, async (req, res) => {
  try {
    const { vaccine_name, vaccine_date, next_date, notes } = req.body;

    if (!vaccine_name || !vaccine_date) {
      return res.status(400).json({
        code: 400,
        message: '疫苗名称和接种日期不能为空'
      });
    }

    const pet = await getAsync(
      'SELECT id FROM pets WHERE id = ? AND member_id = ?',
      [req.params.id, req.member.id]
    );

    if (!pet) {
      return res.status(404).json({ code: 404, message: '宠物不存在' });
    }

    const result = await runAsync(
      `INSERT INTO vaccine_records (pet_id, vaccine_name, vaccine_date, next_date, notes)
       VALUES (?, ?, ?, ?, ?)`,
      [req.params.id, vaccine_name, vaccine_date, next_date || null, notes || null]
    );

    const record = await getAsync('SELECT * FROM vaccine_records WHERE id = ?', [result.lastID]);

    res.status(201).json({
      code: 201,
      message: '疫苗记录添加成功',
      data: record
    });
  } catch (err) {
    console.error('添加疫苗记录失败:', err);
    res.status(500).json({ code: 500, message: '服务器内部错误' });
  }
});

router.delete('/:id/vaccines/:vaccineId', authRequired, async (req, res) => {
  try {
    const pet = await getAsync(
      'SELECT id FROM pets WHERE id = ? AND member_id = ?',
      [req.params.id, req.member.id]
    );

    if (!pet) {
      return res.status(404).json({ code: 404, message: '宠物不存在' });
    }

    const result = await runAsync(
      'DELETE FROM vaccine_records WHERE id = ? AND pet_id = ?',
      [req.params.vaccineId, req.params.id]
    );

    if (result.changes === 0) {
      return res.status(404).json({ code: 404, message: '疫苗记录不存在' });
    }

    res.json({
      code: 200,
      message: '疫苗记录删除成功'
    });
  } catch (err) {
    console.error('删除疫苗记录失败:', err);
    res.status(500).json({ code: 500, message: '服务器内部错误' });
  }
});

module.exports = router;
