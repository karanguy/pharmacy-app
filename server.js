const express = require('express');
const session = require('express-session');
const path = require('path');
const { createClient } = require('@libsql/client');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

app.use(session({
  secret: 'medicine-stock-secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 24 * 60 * 60 * 1000 }
}));

app.use(express.static(path.join(__dirname, 'public')));

// 🟢 ใช้ Canonical URL ของ Turso (ไม่มีชื่อภูมิภาค aws-ap-northeast-1)
const DEFAULT_URL = 'https://pharmacy-db-karang.turso.io';
const DEFAULT_TOKEN = 'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3OTA2NzE3NjQsImlkIjoiMDFhMGVjNTktYWEwMS03OWUwLWI0ZGQtODZkY2Y3YTc3YmQyIiwia2lkIjoiWFNTRnRuU3ZPRTJTT0VDbl9tZjZTM3pmald6S3ZQWUQtdUR4V2Q4am5lcyIsInJpZCI6IjhjMDBkNTdjLWUxNjItNDg1NC05ZjkxLWIwNjhjYWQ5ZGQyNCJ9.BvfkDT76FQhM2gwDhFAcnQ61AEJ4cRSPQ1pRCPg2WXTWw0FyzxtqAvnv6BAlZNV5Rn1etrhi_7kiQJa2DUJfAw';

// ทำความสะอาด URL โดยลบส่วนเกินและตัด .aws-ap-northeast-1 ออกอัตโนมัติ
let rawUrl = process.env.TURSO_DATABASE_URL || DEFAULT_URL;
rawUrl = rawUrl.replace('.aws-ap-northeast-1', '');

const tursoUrl = rawUrl.trim().replace(/^["']|["']$/g, '').replace(/\/+$/, '');
const tursoToken = (process.env.TURSO_AUTH_TOKEN || DEFAULT_TOKEN).trim().replace(/^["']|["']$/g, '');

const db = createClient({
  url: tursoUrl,
  authToken: tursoToken,
});

async function initDb() {
  try {
    // ทดสอบการเชื่อมต่อ
    await db.execute('SELECT 1');
    console.log('✅ Connected to Turso Cloud Database successfully!');
    
    // สร้างตารางข้อมูล
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
  } catch (err) {
    console.error('Turso DB Warning/Error:', err.message);
  }
}
initDb();

const requireAuth = (req, res, next) => {
  if (req.session && req.session.user) next();
  else res.status(401).json({ error: 'Unauthorized' });
};

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

app.get('/api/medicines', requireAuth, async (req, res) => {
  try {
    const result = await db.execute('SELECT * FROM medicines ORDER BY id DESC');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

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