const express = require('express');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const path = require('path');

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
          db.get('SELECT SUM(views) as total_views, SUM(likes) as total_likes FROM posts', (e, s) => {
            res.render('admin/dashboard', {
              postCount: p ? p.c : 0,
              pendingComments: c ? c.c : 0,
              bookCount: b ? b.c : 0,
              totalViews: s ? (s.total_views || 0) : 0,
              totalLikes: s ? (s.total_likes || 0) : 0
            });
          });
        });
      });
    });
  });

  // ============================================
  // ---------- SAYT SAZLAMALARI ----------
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

    // Normal sahələri yenilə (PostgreSQL ON CONFLICT)
    fields.forEach(field => {
      if (req.body[field] !== undefined) {
        db.run(
          'INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value',
          [field, req.body[field]]
        );
      }
    });

    // Şəkilləri yüklə (əgər varsa)
    if (req.files && req.files.hero_portrait && req.files.hero_portrait[0]) {
      const portrait = '/uploads/' + req.files.hero_portrait[0].filename;
      db.run(
        'INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value',
        ['hero_portrait', portrait]
      );
    }
    if (req.files && req.files.hero_background && req.files.hero_background[0]) {
      const bg = '/uploads/' + req.files.hero_background[0].filename;
      db.run(
        'INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value',
        ['hero_background', bg]
      );
    }

    // Şəkilləri sil
    if (req.body.remove_portrait === '1') {
      db.run(
        'INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value',
        ['hero_portrait', '']
      );
    }
    if (req.body.remove_background === '1') {
      db.run(
        'INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value',
        ['hero_background', '']
      );
    }

    setTimeout(() => res.redirect('/admin/settings?saved=1'), 300);
  });

  // ============================================
  // ---------- YAZILAR ----------
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
  // ---------- KİTABLAR ----------
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
  // ---------- ŞƏRHLƏR ----------
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

  // ============================================
  // ---------- ŞİFRƏ DƏYİŞMƏ ----------
  // ============================================
  router.get('/password', requireAuth, (req, res) => {
    res.render('admin/password', { error: null, success: null });
  });

  router.post('/password', requireAuth, (req, res) => {
    const { current_password, new_password, confirm_password } = req.body;

    if (!current_password || !new_password || !confirm_password) {
      return res.render('admin/password', { error: 'Butun saheleri doldurun', success: null });
    }
    if (new_password !== confirm_password) {
      return res.render('admin/password', { error: 'Yeni sifreler uygun deyil', success: null });
    }
    if (new_password.length < 6) {
      return res.render('admin/password', { error: 'Yeni sifre en azi 6 simvol olmalidir', success: null });
    }

    db.get('SELECT * FROM users WHERE id = ?', [req.session.user.id], (err, user) => {
      if (err || !user) {
        return res.render('admin/password', { error: 'Istifadeci tapilmadi', success: null });
      }
      if (!bcrypt.compareSync(current_password, user.password)) {
        return res.render('admin/password', { error: 'Cari sifre yanlisdir', success: null });
      }
      const newHash = bcrypt.hashSync(new_password, 10);
      db.run('UPDATE users SET password = ? WHERE id = ?', [newHash, user.id], (err) => {
        if (err) {
          return res.render('admin/password', { error: 'Xeta bas verdi', success: null });
        }
        res.render('admin/password', { error: null, success: 'Sifre ugurla deyisdirildi!' });
      });
    });
  });

  return router;
};