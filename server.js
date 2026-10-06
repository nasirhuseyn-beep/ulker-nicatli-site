require('dotenv').config();

const express = require('express');
const session = require('express-session');
const path = require('path');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

const app = express();

// ---------- POSTGRESQL BAĞLANTI ----------
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// ---------- AĞILLI WRAPPER (SQLite → PostgreSQL) ----------
function convertSql(sql) {
  let counter = 1;
  return sql.replace(/\?/g, () => `$${counter++}`);
}

const db = {
  get: (sql, params, callback) => {
    if (typeof params === 'function') {
      callback = params;
      params = [];
    }
    const pgSql = convertSql(sql);
    pool.query(pgSql, params || [])
      .then(result => callback(null, result.rows[0]))
      .catch(err => callback(err));
  },
  
  all: (sql, params, callback) => {
    if (typeof params === 'function') {
      callback = params;
      params = [];
    }
    const pgSql = convertSql(sql);
    pool.query(pgSql, params || [])
      .then(result => callback(null, result.rows))
      .catch(err => callback(err));
  },
  
  run: (sql, params, callback) => {
    if (typeof params === 'function') {
      callback = params;
      params = [];
    }
    const pgSql = convertSql(sql);
    pool.query(pgSql, params || [])
      .then(result => {
        if (callback) callback(null, result);
      })
      .catch(err => {
        if (callback) callback(err);
        else console.error('DB Error:', err);
      });
  },
  
  serialize: (callback) => {
    if (callback) callback();
  }
};

// ---------- VERİLƏNLƏR BAZASI SXEMİ ----------
async function initDatabase() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username TEXT UNIQUE,
        password TEXT
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS posts (
        id SERIAL PRIMARY KEY,
        title TEXT,
        category TEXT,
        content TEXT,
        image TEXT,
        video TEXT,
        views INTEGER DEFAULT 0,
        likes INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS books (
        id SERIAL PRIMARY KEY,
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
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS comments (
        id SERIAL PRIMARY KEY,
        post_id INTEGER REFERENCES posts(id) ON DELETE CASCADE,
        name TEXT,
        text TEXT,
        approved INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT
      )
    `);

    const defaultSettings = [
      ['site_name', 'Ülkər Nicatlı'],
      ['hero_title', 'Sözün, duyğunun və düşüncənin ünvanı'],
      ['hero_subtitle', "Ülkər Nicatlı'nın şeirləri, hekayələri və yazıları."],
      ['hero_portrait', ''],
      ['hero_background', ''],
      ['about_title', 'Haqqında'],
      ['about_text', 'Bu bölmədə müəllif haqqında məlumat yerləşdirilə bilər.'],
      ['contact_email', ''],
      ['contact_phone', ''],
      ['social_instagram', ''],
      ['social_facebook', ''],
      ['social_youtube', ''],
      ['footer_text', '© 2025 Ülkər Nicatlı — Bütün hüquqlar qorunur.']
    ];

    for (const [key, value] of defaultSettings) {
      await pool.query(
        `INSERT INTO settings (key, value) VALUES ($1, $2) 
         ON CONFLICT (key) DO NOTHING`,
        [key, value]
      );
    }

    const hash = bcrypt.hashSync('admin123', 10);
    await pool.query(
      `INSERT INTO users (id, username, password) VALUES (1, 'admin', $1)
       ON CONFLICT (id) DO NOTHING`,
      [hash]
    );

    console.log('✅ Database initialized (PostgreSQL)');
  } catch (err) {
    console.error('❌ Database init error:', err.message);
  }
}

// ---------- MIDDLEWARE ----------
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static('public'));
app.use('/uploads', express.static('uploads'));
app.use(session({
  secret: process.env.SESSION_SECRET || 'ulker-nicatli-secret-key-2025',
  resave: false,
  saveUninitialized: false
}));

app.use((req, res, next) => {
  req.db = db;
  res.locals.user = req.session.user || null;
  
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

initDatabase().then(() => {
  app.listen(PORT, () => {
    console.log('=================================');
    console.log('✅ Sayt işləyir: http://localhost:' + PORT);
    console.log('🔐 Admin: http://localhost:' + PORT + '/admin/login');
    console.log('👤 İstifadəçi: admin / admin123');
    console.log('📊 Database: PostgreSQL (Supabase)');
    console.log('☁️  Storage: Supabase Storage');
    console.log('=================================');
  });
});