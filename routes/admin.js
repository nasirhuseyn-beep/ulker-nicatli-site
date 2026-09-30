const express = require('express');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const path = require('path');

// Fayl yükləmə sazlaması
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/'),
  filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ storage: storage });

module.exports = (db) => {
  const router = express.Router();

  function requireAuth(req, res, next) {
    if (req.session.user) return next();
    res.redirect('/admin/login');
  }

  // ---------- LOGIN ----------
  router.get('/login', (req, res) => res.render('admin/login', { error: null }));

  router.post('/login', (req, res) => {
    const { username, password } = req.body;
    db.get('SELECT * FROM users WHERE username = ?', [username], (err, user) => {
      if (!user || !bcrypt.compareSync(password, user.password)) {
        return res.render('admin/login', { error: 'Istifadeci adi ve ya sifre yanlisdir' });
      }
      req.session.user = { id: user.id, username: user.username };
      res.redirect('/admin');
    });
  });

  router.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/admin/login');
  });

  // ---------- DASHBOARD ----------
  router.get('/', requireAuth, (req, res) => {
    db.get('SELECT COUNT(*) as c FROM posts', (e, p) => {
      db.get('SELECT COUNT(*) as c FROM comments WHERE approved = 0', (e, c) => {
        db.get('SELECT COUNT(*) as c FROM books', (e, b) => {
          res.render('admin/dashboard', {
            postCount: p.c,
            pendingComments: c.c,
            bookCount: b.c
          });
        });
      });
    });
  });

  // ============================================
  // ---------- SAYT SAZLAMALARI (SETTINGS) ----------
  // ============================================
  router.get('/settings', requireAuth, (req, res) => {
    db.all('SELECT key, value FROM settings', (err, rows) => {
      const settings = {};
      if (rows) rows.forEach(r => settings[r.key] = r.value);
      res.render('admin/settings', { settings: settings, saved: req.query.saved });
    });
  });

  router.post('/settings', requireAuth,
    upload.fields([{ name: 'hero_portrait' }, { name: 'hero_background' }]),
    (req, res) => {

    const fields = [
      'site_name', 'hero_title', 'hero_subtitle',
      'about_title', 'about_text',
      'contact_email', 'contact_phone',
      'social_instagram', 'social_facebook', 'social_youtube',
      'footer_text'
    ];

    // Normal sahələri yenilə
    fields.forEach(field => {
      if (req.body[field] !== undefined) {
        db.run('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)',
          [field, req.body[field]]);
      }
    });

    // Şəkilləri yüklə (əgər varsa)
    if (req.files && req.files.hero_portrait && req.files.hero_portrait[0]) {
      const portrait = '/uploads/' + req.files.hero_portrait[0].filename;
      db.run('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)',
        ['hero_portrait', portrait]);
    }
    if (req.files && req.files.hero_background && req.files.hero_background[0]) {
      const bg = '/uploads/' + req.files.hero_background[0].filename;
      db.run('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)',
        ['hero_background', bg]);
    }

    // Şəkilləri sil (əgər "remove" basılıbsa)
    if (req.body.remove_portrait === '1') {
      db.run('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)',
        ['hero_portrait', '']);
    }
    if (req.body.remove_background === '1') {
      db.run('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)',
        ['hero_background', '']);
    }

    // Yadda saxlanandan sonra yönləndir
    setTimeout(() => res.redirect('/admin/settings?saved=1'), 200);
  });

  // ============================================
  // ---------- YAZILAR (POSTS) ----------
  // ============================================
  router.get('/posts', requireAuth, (req, res) => {
    db.all('SELECT * FROM posts ORDER BY created_at DESC', (err, posts) => {
      if (err) posts = [];
      res.render('admin/posts', { posts: posts });
    });
  });

  router.get('/posts/new', requireAuth, (req, res) => {
    res.render('admin/post-form', { post: null });
  });

  router.post('/posts/new', requireAuth, upload.fields([{ name: 'image' }, { name: 'video' }]), (req, res) => {
    const { title, category, content } = req.body;
    const image = req.files && req.files.image ? '/uploads/' + req.files.image[0].filename : null;
    const video = req.files && req.files.video ? '/uploads/' + req.files.video[0].filename : null;
    db.run('INSERT INTO posts (title, category, content, image, video) VALUES (?, ?, ?, ?, ?)',
      [title, category, content, image, video], () => res.redirect('/admin/posts'));
  });

  router.get('/posts/edit/:id', requireAuth, (req, res) => {
    db.get('SELECT * FROM posts WHERE id = ?', [req.params.id], (err, post) => {
      res.render('admin/post-form', { post: post });
    });
  });

  router.post('/posts/edit/:id', requireAuth, upload.fields([{ name: 'image' }, { name: 'video' }]), (req, res) => {
    const { title, category, content } = req.body;
    db.get('SELECT * FROM posts WHERE id = ?', [req.params.id], (err, old) => {
      const image = req.files && req.files.image ? '/uploads/' + req.files.image[0].filename : old.image;
      const video = req.files && req.files.video ? '/uploads/' + req.files.video[0].filename : old.video;
      db.run('UPDATE posts SET title=?, category=?, content=?, image=?, video=? WHERE id=?',
        [title, category, content, image, video, req.params.id],
        () => res.redirect('/admin/posts'));
    });
  });

  router.post('/posts/delete/:id', requireAuth, (req, res) => {
    db.run('DELETE FROM posts WHERE id = ?', [req.params.id], () => res.redirect('/admin/posts'));
  });

  // ============================================
  // ---------- KİTABLAR (BOOKS) ----------
  // ============================================
  router.get('/books', requireAuth, (req, res) => {
    db.all('SELECT * FROM books ORDER BY created_at DESC', (err, books) => {
      if (err) books = [];
      res.render('admin/books', { books: books });
    });
  });

  router.get('/books/new', requireAuth, (req, res) => {
    res.render('admin/book-form', { book: null });
  });

  router.post('/books/new', requireAuth, upload.single('cover'), (req, res) => {
    const { title, year, publisher, isbn, description, sample_text, reviews, video_link, gallery, buy_link } = req.body;
    const cover = req.file ? '/uploads/' + req.file.filename : null;
    db.run('INSERT INTO books (title, cover, year, publisher, isbn, description, sample_text, reviews, video_link, gallery, buy_link) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [title, cover, year, publisher, isbn, description, sample_text, reviews, video_link, gallery, buy_link],
      () => res.redirect('/admin/books'));
  });

  router.get('/books/edit/:id', requireAuth, (req, res) => {
    db.get('SELECT * FROM books WHERE id = ?', [req.params.id], (err, book) => {
      res.render('admin/book-form', { book: book });
    });
  });

  router.post('/books/edit/:id', requireAuth, upload.single('cover'), (req, res) => {
    const { title, year, publisher, isbn, description, sample_text, reviews, video_link, gallery, buy_link } = req.body;
    db.get('SELECT * FROM books WHERE id = ?', [req.params.id], (err, old) => {
      const cover = req.file ? '/uploads/' + req.file.filename : old.cover;
      db.run('UPDATE books SET title=?, cover=?, year=?, publisher=?, isbn=?, description=?, sample_text=?, reviews=?, video_link=?, gallery=?, buy_link=? WHERE id=?',
        [title, cover, year, publisher, isbn, description, sample_text, reviews, video_link, gallery, buy_link, req.params.id],
        () => res.redirect('/admin/books'));
    });
  });

  router.post('/books/delete/:id', requireAuth, (req, res) => {
    db.run('DELETE FROM books WHERE id = ?', [req.params.id], () => res.redirect('/admin/books'));
  });

  // ============================================
  // ---------- ŞƏRHLƏR (COMMENTS) ----------
  // ============================================
  router.get('/comments', requireAuth, (req, res) => {
    db.all('SELECT comments.*, posts.title as post_title FROM comments JOIN posts ON posts.id = comments.post_id ORDER BY comments.created_at DESC', (err, comments) => {
      if (err) comments = [];
      res.render('admin/comments', { comments: comments });
    });
  });

  router.post('/comments/approve/:id', requireAuth, (req, res) => {
    db.run('UPDATE comments SET approved = 1 WHERE id = ?', [req.params.id], () => res.redirect('/admin/comments'));
  });

  router.post('/comments/delete/:id', requireAuth, (req, res) => {
    db.run('DELETE FROM comments WHERE id = ?', [req.params.id], () => res.redirect('/admin/comments'));
  });

  return router;
};