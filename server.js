const express = require('express');
const session = require('express-session');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');

const app = express();
const db = new sqlite3.Database('./database.db');

// ---------- VERİLƏNLƏR BAZASI ----------
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    password TEXT
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT,
    category TEXT,
    content TEXT,
    image TEXT,
    video TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS books (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT,
    cover TEXT,
    year TEXT,
    publisher TEXT,
    isbn TEXT,
    description TEXT,
    sample_text TEXT,
    reviews TEXT,
    video_link TEXT,
    gallery TEXT,
    buy_link TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    post_id INTEGER,
    name TEXT,
    text TEXT,
    approved INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(post_id) REFERENCES posts(id) ON DELETE CASCADE
  )`);

  // ---------- SETTINGS CƏDVƏLİ (YENİ!) ----------
  db.run(`CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  )`);

  // Default dəyərlər
  db.run(`INSERT OR IGNORE INTO settings (key, value) VALUES 
    ('site_name', 'Ülkər Nicatlı'),
    ('hero_title', 'Sözün, duyğunun və düşüncənin ünvanı'),
    ('hero_subtitle', 'Ülkər Nicatlı''nın şeirləri, hekayələri və yazıları.'),
    ('hero_portrait', ''),
    ('hero_background', ''),
    ('about_title', 'Haqqında'),
    ('about_text', 'Bu bölmədə müəllif haqqında məlumat yerləşdirilə bilər.'),
    ('contact_email', ''),
    ('contact_phone', ''),
    ('social_instagram', ''),
    ('social_facebook', ''),
    ('social_youtube', ''),
    ('footer_text', '© 2025 Ülkər Nicatlı — Bütün hüquqlar qorunur.')
  `);

  // Default admin: admin / admin123
  const hash = bcrypt.hashSync('admin123', 10);
  db.run(`INSERT OR IGNORE INTO users (id, username, password) VALUES (1, 'admin', ?)`, [hash]);
});

// ---------- MIDDLEWARE ----------
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static('public'));
app.use('/uploads', express.static('uploads'));
app.use(session({
  secret: 'ulker-nicatli-secret-key-2025',
  resave: false,
  saveUninitialized: false
}));

// DB-ni hər request-də əlçatan et + settings yüklə
app.use((req, res, next) => {
  req.db = db;
  res.locals.user = req.session.user || null;
  
  // Settings-ləri yüklə (hər səhifədə lazımdır)
  db.all('SELECT key, value FROM settings', (err, rows) => {
    const settings = {};
    if (rows) {
      rows.forEach(r => settings[r.key] = r.value);
    }
    res.locals.settings = settings;
    next();
  });
});

// ---------- MARŞRUTLAR ----------
app.use('/', require('./routes/public')(db));
app.use('/admin', require('./routes/admin')(db));

// ---------- BAŞLAT ----------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('=================================');
  console.log('✅ Sayt işləyir: http://localhost:' + PORT);
  console.log('🔐 Admin: http://localhost:' + PORT + '/admin/login');
  console.log('👤 İstifadəçi: admin / admin123');
  console.log('=================================');
});