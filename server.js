const express = require('express');
const session = require('express-session');
const path = require('path');
const { Pool } = require('pg');

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

// เชื่อมต่อฐานข้อมูล PostgreSQL บน Neon
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false } // จำเป็นสำหรับ Neon
});

// ทดสอบการเชื่อมต่อ
async function initDb() {
  try {
    await pool.query('SELECT 1');
    console.log('✅ Connected to Neon PostgreSQL Database successfully!');
  } catch (err) {
    console.error('❌ Database Connection Error:', err.message);
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
      [code, name, category, quantity || 0, unit || 'เม็ด', min_threshold || 10, image || '']
    );
    res.json({ success: true, id: result.rows[0].id });
  } catch (err) {
    res.status(400).json({ error: 'รหัสยานี้มีในระบบแล้ว หรือข้อมูลไม่ถูกต้อง' });
  }
});

app.put('/api/medicines/:id', requireAuth, async (req, res) => {
  const { code, name, category, quantity, unit, min_threshold, image } = req.body;
  try {
    await pool.query(
      `UPDATE medicines 
       SET code = $1, name = $2, category = $3, quantity = $4, unit = $5, min_threshold = $6, image = $7 
       WHERE id = $8`,
      [code, name, category, quantity, unit, min_threshold, image || '', req.params.id]
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
      [amount, req.params.id]
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

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));