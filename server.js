const express = require('express');
const session = require('express-session');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// 1. เชื่อมต่อฐานข้อมูล SQLite
const db = new sqlite3.Database('./pharmacy.db', (err) => {
    if (err) console.error(err.message);
    else console.log('เชื่อมต่อฐานข้อมูลสำเร็จ');
});

// สร้างตารางเก็บข้อมูลยา
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS inventory (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        med_id TEXT UNIQUE,
        med_name TEXT,
        category TEXT,
        quantity INTEGER,
        unit TEXT,
        min_stock INTEGER
    )`);
});

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));
app.use(session({
    secret: 'pharmacy_secret_key_12345',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 3600000 } // 1 ชั่วโมง
}));

// ตรวจสอบการเข้าสู่ระบบ
function requireAuth(req, res, next) {
    if (req.session && req.session.loggedIn) {
        next();
    } else {
        res.status(401).json({ error: 'กรุณาเข้าสู่ระบบก่อน' });
    }
}

// --- API Routes ---

// ล็อกอิน
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    // กำหนด Username และ Password
    if (username === 'admin' && password === '123456') {
        req.session.loggedIn = true;
        res.json({ success: true });
    } else {
        res.status(400).json({ success: false, message: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' });
    }
});

// ล็อกเอาต์
app.post('/api/logout', (req, res) => {
    req.session.destroy();
    res.json({ success: true });
});

// เช็คสถานะการล็อกอิน
app.get('/api/check-auth', (req, res) => {
    res.json({ loggedIn: !!(req.session && req.session.loggedIn) });
});

// ดึงรายการยา
app.get('/api/inventory', requireAuth, (req, res) => {
    db.all("SELECT * FROM inventory", [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// เพิ่มยาใหม่
app.post('/api/inventory', requireAuth, (req, res) => {
    const { med_id, med_name, category, quantity, unit, min_stock } = req.body;
    const sql = `INSERT INTO inventory (med_id, med_name, category, quantity, unit, min_stock) VALUES (?, ?, ?, ?, ?, ?)`;
    db.run(sql, [med_id, med_name, category, quantity, unit, min_stock], function(err) {
        if (err) return res.status(400).json({ error: 'รหัสยานี้มีในระบบแล้ว หรือข้อมูลไม่ถูกต้อง' });
        res.json({ success: true, id: this.lastID });
    });
});

// อัปเดตจำนวนยา
app.put('/api/inventory/:med_id', requireAuth, (req, res) => {
    const { quantity } = req.body;
    const sql = `UPDATE inventory SET quantity = ? WHERE med_id = ?`;
    db.run(sql, [quantity, req.params.med_id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});