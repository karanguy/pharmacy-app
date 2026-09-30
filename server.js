const express = require('express');
const session = require('express-session');
const path = require('path');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;

// รองรับข้อมูลขนาดใหญ่ (เช่น รูปภาพ Base64)
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// ตั้งค่า Session
app.use(session({
  secret: 'medicine-stock-secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 24 * 60 * 60 * 1000 }
}));

app.use(express.static(path.join(__dirname, 'public')));

// 🔴 สำหรับ Localhost: นำ Connection String จริงจาก Neon ของคุณมาแปะใส่แทนที่ข้อความในอัญประกาศนี้
const localDbUrl = 'postgresql://neondb_owner:npg_z8ERoQnf7AVe@ep-long-sound-b536dz7x-pooler.c-7.us-east-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require'; 

const connectionString = process.env.DATABASE_URL || localDbUrl;
const isNeon = connectionString && connectionString.includes('neon');

const pool = new Pool({
  connectionString: connectionString,
  ssl: isNeon ? { rejectUnauthorized: false } : false
});

// สร้างตาราง medicines และ equipments อัตโนมัติหากยังไม่มี
async function initDb() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS medicines (
        id SERIAL PRIMARY KEY,
        code VARCHAR(100) UNIQUE NOT NULL,
        name VARCHAR(255) NOT NULL,
        category VARCHAR(100),
        quantity INT DEFAULT 0,
        unit VARCHAR(50) DEFAULT 'เม็ด',
        min_threshold INT DEFAULT 10,
        image TEXT
      );

      CREATE TABLE IF NOT EXISTS equipments (
        id SERIAL PRIMARY KEY,
        code VARCHAR(100) UNIQUE NOT NULL,
        name VARCHAR(255) NOT NULL,
        category VARCHAR(100),
        quantity INT DEFAULT 0,
        unit VARCHAR(50) DEFAULT 'ชิ้น',
        min_threshold INT DEFAULT 5,
        image TEXT
      );
    `);
    console.log('✅ Connected & Tables ready in Database!');
  } catch (err) {
    console.error('❌ Database Initialization Error:', err.message);
  }
}
initDb();

// Middleware ตรวจสอบการล็อกอิน
const requireAuth = (req, res, next) => {
  if (req.session && req.session.user) next();
  else res.status(401).json({ error: 'Unauthorized' });
};

// --- AUTHENTICATION API ---
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

// --- MEDICINES API ---
app.get('/api/medicines', requireAuth, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM medicines ORDER BY id DESC');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/medicines', requireAuth, async (req, res) => {
  const { code, name, category, quantity, unit, min_threshold, image } = req.body;
  try {
    const result = await pool.query(
      `INSERT INTO medicines (code, name, category, quantity, unit, min_threshold, image) 
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [code, name, category, parseInt(quantity, 10) || 0, unit || 'เม็ด', parseInt(min_threshold, 10) || 10, image || '']
    );
    res.json({ success: true, id: result.rows[0].id });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.put('/api/medicines/:id', requireAuth, async (req, res) => {
  const { code, name, category, quantity, unit, min_threshold, image } = req.body;
  try {
    await pool.query(
      `UPDATE medicines SET code = $1, name = $2, category = $3, quantity = $4, unit = $5, min_threshold = $6, image = $7 WHERE id = $8`,
      [code, name, category, parseInt(quantity, 10) || 0, unit, parseInt(min_threshold, 10) || 10, image || '', req.params.id]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/medicines/:id/adjust', requireAuth, async (req, res) => {
  const { amount } = req.body;
  try {
    await pool.query(
      `UPDATE medicines SET quantity = GREATEST(0, quantity + $1) WHERE id = $2`,
      [parseInt(amount, 10) || 0, req.params.id]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete('/api/medicines/:id', requireAuth, async (req, res) => {
  try {
    await pool.query('DELETE FROM medicines WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// --- EQUIPMENTS API ---
app.get('/api/equipments', requireAuth, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM equipments ORDER BY id DESC');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/equipments', requireAuth, async (req, res) => {
  const { code, name, category, quantity, unit, min_threshold, image } = req.body;
  try {
    const result = await pool.query(
      `INSERT INTO equipments (code, name, category, quantity, unit, min_threshold, image) 
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [code, name, category, parseInt(quantity, 10) || 0, unit || 'ชิ้น', parseInt(min_threshold, 10) || 5, image || '']
    );
    res.json({ success: true, id: result.rows[0].id });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.put('/api/equipments/:id', requireAuth, async (req, res) => {
  const { code, name, category, quantity, unit, min_threshold, image } = req.body;
  try {
    await pool.query(
      `UPDATE equipments SET code = $1, name = $2, category = $3, quantity = $4, unit = $5, min_threshold = $6, image = $7 WHERE id = $8`,
      [code, name, category, parseInt(quantity, 10) || 0, unit, parseInt(min_threshold, 10) || 5, image || '', req.params.id]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/equipments/:id/adjust', requireAuth, async (req, res) => {
  const { amount } = req.body;
  try {
    await pool.query(
      `UPDATE equipments SET quantity = GREATEST(0, quantity + $1) WHERE id = $2`,
      [parseInt(amount, 10) || 0, req.params.id]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete('/api/equipments/:id', requireAuth, async (req, res) => {
  try {
    await pool.query('DELETE FROM equipments WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));