const express = require('express');
const session = require('express-session');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// 🟢 1. เพิ่ม Limit ขนาดข้อมูลรองรับรูปภาพ Base64 (สำคัญมาก)
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

app.use(session({
  secret: 'medicine-stock-secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 24 * 60 * 60 * 1000 }
}));

app.use(express.static(path.join(__dirname, 'public')));

// สร้าง/เปิดใช้งาน SQLite
const db = new sqlite3.Database('./database.sqlite', (err) => {
  if (err) console.error('Database connection error:', err);
  else console.log('Connected to SQLite database.');
});

// 🟢 2. สร้างตารางและเพิ่มคอลัมน์ image หากยังไม่มี
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS medicines (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      category TEXT,
      quantity INTEGER DEFAULT 0,
      unit TEXT DEFAULT 'เม็ด',
      min_threshold INTEGER DEFAULT 10,
      image TEXT
    )
  `);

  // กรณีมีตารางเดิมอยู่แล้วแต่ยังไม่มีคอลัมน์ image
  db.run(`ALTER TABLE medicines ADD COLUMN image TEXT`, (err) => {
    // ข้ามถ้ามีคอลัมน์แล้ว
  });
});

// Check Auth Middleware
const requireAuth = (req, res, next) => {
  if (req.session && req.session.user) next();
  else res.status(401).json({ error: 'Unauthorized' });
};

// API routes
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  if (username === 'admin' && password === '123456') {
    req.session.user = { username };
    res.json({ success: true });
  } else {
    res.status(400).json({ success: false, error: 'Username หรือ Password ไม่ถูกต้อง' });
  }
});

app.post('/api/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

app.get('/api/check-auth', (req, res) => {
  res.json({ loggedIn: !!(req.session && req.session.user) });
});

// ดึงรายการยาทั้งหมด (รวม image)
app.get('/api/medicines', requireAuth, (req, res) => {
  db.all('SELECT * FROM medicines ORDER BY id DESC', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// เพิ่มรายการยาใหม่ (รวม image)
app.post('/api/medicines', requireAuth, (req, res) => {
  const { code, name, category, quantity, unit, min_threshold, image } = req.body;
  const sql = `INSERT INTO medicines (code, name, category, quantity, unit, min_threshold, image) VALUES (?, ?, ?, ?, ?, ?, ?)`;
  
  db.run(sql, [code, name, category, quantity || 0, unit || 'เม็ด', min_threshold || 10, image || ''], function(err) {
    if (err) return res.status(400).json({ error: 'รหัสยานี้มีในระบบแล้ว หรือข้อมูลไม่ถูกต้อง' });
    res.json({ success: true, id: this.lastID });
  });
});

// แก้ไขข้อมูลยา (รวม image)
app.put('/api/medicines/:id', requireAuth, (req, res) => {
  const { code, name, category, quantity, unit, min_threshold, image } = req.body;
  const sql = `UPDATE medicines SET code = ?, name = ?, category = ?, quantity = ?, unit = ?, min_threshold = ?, image = ? WHERE id = ?`;
  
  db.run(sql, [code, name, category, quantity, unit, min_threshold, image || '', req.params.id], function(err) {
    if (err) return res.status(400).json({ error: err.message });
    res.json({ success: true });
  });
});

// ปรับจำนวนสต๊อก (+1 / -1)
app.post('/api/medicines/:id/adjust', requireAuth, (req, res) => {
  const { amount } = req.body;
  const sql = `UPDATE medicines SET quantity = MAX(0, quantity + ?) WHERE id = ?`;
  
  db.run(sql, [amount, req.params.id], function(err) {
    if (err) return res.status(400).json({ error: err.message });
    res.json({ success: true });
  });
});

// ลบรายการยา
app.delete('/api/medicines/:id', requireAuth, (req, res) => {
  db.run('DELETE FROM medicines WHERE id = ?', [req.params.id], function(err) {
    if (err) return res.status(400).json({ error: err.message });
    res.json({ success: true });
  });
});

app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));