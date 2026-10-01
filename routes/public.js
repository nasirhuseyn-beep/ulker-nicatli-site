const express = require('express');

module.exports = (db) => {
  const router = express.Router();

  // ========== ANA SƏHİFƏ ==========
  router.get('/', (req, res) => {
    db.all('SELECT * FROM posts ORDER BY created_at DESC LIMIT 10', (err, posts) => {
      if (err) posts = [];
      db.all('SELECT * FROM books ORDER BY created_at DESC LIMIT 4', (err, books) => {
        if (err) books = [];
        res.render('index', { posts: posts, books: books, category: null });
      });
    });
  });

  // ========== KATEQORİYA ==========
  router.get('/kateqoriya/:cat', (req, res) => {
    const cat = req.params.cat;
    db.all('SELECT * FROM posts WHERE category = ? ORDER BY created_at DESC', [cat], (err, posts) => {
      if (err) posts = [];
      res.render('category', { posts: posts, category: cat });
    });
  });

  // ========== TƏK YAZI (BAXIŞ SAYI ARTIR) ==========
  router.get('/yazi/:id', (req, res) => {
    const id = req.params.id;
    
    // Baxış sayını artır
    db.run('UPDATE posts SET views = views + 1 WHERE id = ?', [id]);
    
    db.get('SELECT * FROM posts WHERE id = ?', [id], (err, post) => {
      if (!post) return res.status(404).send('Yazi tapilmadi');
      db.all('SELECT * FROM comments WHERE post_id = ? AND approved = 1 ORDER BY created_at DESC', [id], (err, comments) => {
        if (err) comments = [];
        res.render('post', { post: post, comments: comments, sent: req.query.sent });
      });
    });
  });

  // ========== BƏYƏNMƏ ==========
  router.post('/yazi/:id/like', (req, res) => {
    const id = req.params.id;
    db.run('UPDATE posts SET likes = likes + 1 WHERE id = ?', [id], (err) => {
      if (err) {
        return res.json({ success: false });
      }
      db.get('SELECT likes FROM posts WHERE id = ?', [id], (err, row) => {
        res.json({ success: true, likes: row ? row.likes : 0 });
      });
    });
  });

  // ========== ŞƏRH YAZMAQ ==========
  router.post('/yazi/:id/comment', (req, res) => {
    const { name, text } = req.body;
    const post_id = req.params.id;
    if (!name || !text) return res.redirect('/yazi/' + post_id);
    db.run('INSERT INTO comments (post_id, name, text, approved) VALUES (?, ?, ?, 0)',
      [post_id, name, text], () => {
        res.redirect('/yazi/' + post_id + '?sent=1');
      });
  });

  // ========== KİTABLAR — siyahı ==========
  router.get('/kitablar', (req, res) => {
    db.all('SELECT * FROM books ORDER BY created_at DESC', (err, books) => {
      if (err) books = [];
      res.render('books', { books: books });
    });
  });

  // ========== KİTABLAR — tək kitab ==========
  router.get('/kitab/:id', (req, res) => {
    const id = req.params.id;
    db.get('SELECT * FROM books WHERE id = ?', [id], (err, book) => {
      if (!book) return res.status(404).send('Kitab tapilmadi');
      db.all('SELECT * FROM books WHERE id != ? ORDER BY created_at DESC LIMIT 3', [id], (err, otherBooks) => {
        if (err) otherBooks = [];
        res.render('book', { book: book, otherBooks: otherBooks });
      });
    });
  });

  return router;
};