const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const dbDir = path.dirname(process.env.DB_PATH);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db = new sqlite3.Database(process.env.DB_PATH, (err) => {
  if (err) {
    console.error('数据库连接失败:', err.message);
    process.exit(1);
  }
  console.log('已连接到 SQLite 数据库');
});

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS members (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    phone TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    name TEXT NOT NULL,
    level TEXT DEFAULT '普通' NOT NULL,
    total_consumed REAL DEFAULT 0 NOT NULL,
    points INTEGER DEFAULT 0 NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS pets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    member_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    species TEXT NOT NULL,
    breed TEXT,
    age INTEGER,
    gender TEXT,
    weight REAL,
    allergies TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS vaccine_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pet_id INTEGER NOT NULL,
    vaccine_name TEXT NOT NULL,
    vaccine_date DATE NOT NULL,
    next_date DATE,
    notes TEXT,
    FOREIGN KEY (pet_id) REFERENCES pets(id) ON DELETE CASCADE
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS services (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    description TEXT,
    base_price REAL NOT NULL,
    duration_minutes INTEGER NOT NULL DEFAULT 60,
    capacity_per_slot INTEGER NOT NULL DEFAULT 1
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS appointments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    member_id INTEGER NOT NULL,
    pet_id INTEGER NOT NULL,
    service_id INTEGER NOT NULL,
    appointment_date DATE NOT NULL,
    start_time TEXT NOT NULL,
    end_time TEXT NOT NULL,
    status TEXT DEFAULT '待确认' NOT NULL,
    actual_price REAL,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (member_id) REFERENCES members(id),
    FOREIGN KEY (pet_id) REFERENCES pets(id),
    FOREIGN KEY (service_id) REFERENCES services(id)
  )`);

  db.run(`CREATE INDEX IF NOT EXISTS idx_appointments_slot 
    ON appointments(service_id, appointment_date, start_time)`);

  const insertServices = db.prepare(`
    INSERT OR IGNORE INTO services (name, description, base_price, duration_minutes, capacity_per_slot)
    VALUES (?, ?, ?, ?, ?)
  `);
  insertServices.run('洗澡美容', '包含洗浴、吹干、造型修剪', 128, 90, 3);
  insertServices.run('寄养', '按天收费，提供舒适环境和定时喂养', 80, 1440, 10);
  insertServices.run('体检', '常规健康检查，包含体温、心率、基础血检', 200, 60, 2);

  db.run(`CREATE TABLE IF NOT EXISTS items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    description TEXT,
    category TEXT,
    total_quantity INTEGER NOT NULL DEFAULT 1,
    available_quantity INTEGER NOT NULL DEFAULT 1,
    deposit REAL DEFAULT 0,
    max_borrow_days INTEGER NOT NULL DEFAULT 7,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS borrowings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    member_id INTEGER NOT NULL,
    item_id INTEGER NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 1,
    borrow_date DATE NOT NULL,
    expected_return_date DATE NOT NULL,
    actual_return_date DATE,
    status TEXT DEFAULT '借用中' NOT NULL,
    overdue_days INTEGER DEFAULT 0 NOT NULL,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (member_id) REFERENCES members(id),
    FOREIGN KEY (item_id) REFERENCES items(id)
  )`);

  db.run(`CREATE INDEX IF NOT EXISTS idx_borrowings_status ON borrowings(status)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_borrowings_member ON borrowings(member_id)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_borrowings_expected ON borrowings(expected_return_date)`);

  const insertItems = db.prepare(`
    INSERT OR IGNORE INTO items (name, description, category, total_quantity, available_quantity, deposit, max_borrow_days)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  insertItems.run('宠物航空箱（大号）', '适合20kg以内犬猫外出托运', '出行用品', 5, 5, 200, 7);
  insertItems.run('宠物航空箱（小号）', '适合5kg以内猫咪小型犬', '出行用品', 8, 8, 100, 7);
  insertItems.run('宠物推车', '外出遛弯轻便推车，承重30kg', '出行用品', 3, 3, 300, 5);
  insertItems.run('电推剪（专业款）', '宠物美容剃毛专用', '美容工具', 4, 4, 150, 3);
  insertItems.run('猫包', '透气外出便携猫包', '出行用品', 10, 10, 50, 7);

  console.log('数据库表结构初始化完成');
});

function runAsync(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}

function getAsync(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

function allAsync(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

module.exports = {
  db,
  runAsync,
  getAsync,
  allAsync
};
