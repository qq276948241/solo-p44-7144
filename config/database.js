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
