const express = require('express');
const session = require('express-session');
const path = require('path');
const { createClient } = require('@libsql/client');

const app = express();
const PORT = process.env.PORT || 3000;

// ขยายขนาดรองรับรูปภาพ Base64
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

app.use(session({
  secret: 'medicine-stock-secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 24 * 60 * 60 * 1000 }
}));

app.use(express.static(path.join(__dirname, 'public')));

// 🟢 ตัดช่องว่าง, อัญประกาศ และเครื่องหมาย / ท้ายสุดออกให้อัตโนมัติ
// 🟢 ดึงค่าและตัดช่องว่าง/สแลชท้ายออกอัตโนมัติ
const tursoUrl = (process.env.TURSO_DATABASE_URL || '').trim().replace(/\/+$/, '');
const tursoToken = (process.env.TURSO_AUTH_TOKEN || '').trim();

const db = createClient({
  url: tursoUrl,
  authToken: tursoToken,
});

// สร้างตารางข้อมูลอัตโนมัติบน Cloud
async function initDb() {
  try {
    await db.execute(`
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
    console.log('Connected to Turso Cloud Database successfully.');
  } catch (err) {
    console.error('Turso DB Connection Error:', err);
  }
}
initDb();

// Middleware เช็กการล็อกอิน
const requireAuth = (req, res, next) => {
  if (req.session && req.session.user) next();
  else res.status(401).json({ error: 'Unauthorized' });
};

// API Routes
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  if (username === 'admin' && password === '2543') {
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

// ดึงรายการยาทั้งหมด
app.get('/api/medicines', requireAuth, async (req, res) => {
  try {
    const result = await db.execute('SELECT * FROM medicines ORDER BY id DESC');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// เพิ่มรายการยาใหม่
app.post('/api/medicines', requireAuth, async (req, res) => {
  const { code, name, category, quantity, unit, min_threshold, image } = req.body;
  try {
    const result = await db.execute({
      sql: `INSERT INTO medicines (code, name, category, quantity, unit, min_threshold, image) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      args: [code, name, category, quantity || 0, unit || 'เม็ด', min_threshold || 10, image || '']
    });
    res.json({ success: true, id: Number(result.lastInsertRowid) });
  } catch (err) {
    res.status(400).json({ error: 'รหัสยานี้มีในระบบแล้ว หรือข้อมูลไม่ถูกต้อง' });
  }
});

// แก้ไขข้อมูลยา
app.put('/api/medicines/:id', requireAuth, async (req, res) => {
  const { code, name, category, quantity, unit, min_threshold, image } = req.body;
  try {
    await db.execute({
      sql: `UPDATE medicines SET code = ?, name = ?, category = ?, quantity = ?, unit = ?, min_threshold = ?, image = ? WHERE id = ?`,
      args: [code, name, category, quantity, unit, min_threshold, image || '', req.params.id]
    });
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ปรับจำนวนสต๊อก (+1 / -1)
app.post('/api/medicines/:id/adjust', requireAuth, async (req, res) => {
  const { amount } = req.body;
  try {
    await db.execute({
      sql: `UPDATE medicines SET quantity = MAX(0, quantity + ?) WHERE id = ?`,
      args: [amount, req.params.id]
    });
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ลบรายการยา
app.delete('/api/medicines/:id', requireAuth, async (req, res) => {
  try {
    await db.execute({
      sql: `DELETE FROM medicines WHERE id = ?`,
      args: [req.params.id]
    });
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));