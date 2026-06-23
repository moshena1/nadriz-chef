require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const path = require('path');
const session = require('express-session');
const { signup, login } = require('./auth');
const db = require('./database');

const app = express();
const PORT = process.env.PORT || 3001;
const API_KEY = process.env.ANTHROPIC_API_KEY;

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(session({
  secret: 'nadriz-secret-key',
  resave: false,
  saveUninitialized: true
}));
app.use(express.static('.'));

if (!API_KEY) {
  console.error('❌ ANTHROPIC_API_KEY not found in .env file!');
  process.exit(1);
}

// ===== AUTH ROUTES =====
app.post('/api/auth/signup', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'שם משתמש וסיסמה חובה' });

  try {
    const user = await signup(username, password);
    req.session.userId = user.id;
    res.json({ id: user.id, username: user.username });
  } catch (err) {
    res.status(400).json({ error: err });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'שם משתמש וסיסמה חובה' });

  try {
    const user = await login(username, password);
    req.session.userId = user.id;
    res.json({ id: user.id, username: user.username });
  } catch (err) {
    res.status(400).json({ error: err });
  }
});

app.post('/api/auth/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

app.get('/api/auth/status', (req, res) => {
  res.json({ userId: req.session.userId || null });
});

// Password reset - request reset
app.post('/api/auth/forgot-password', (req, res) => {
  const { username } = req.body;
  if (!username) return res.status(400).json({ error: 'שם משתמש חסר' });

  db.get('SELECT id FROM users WHERE username = ?', [username], (err, user) => {
    if (err || !user) return res.status(400).json({ error: 'שם משתמש לא קיים' });

    const token = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    const expiresAt = new Date(Date.now() + 1800000); // 30 minutes

    db.run(
      'INSERT INTO password_reset_tokens (user_id, token, expires_at) VALUES (?, ?, ?)',
      [user.id, token, expiresAt],
      function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({
          success: true,
          resetToken: token,
          message: 'קוד איפוס הסיסמה שלך: ' + token
        });
      }
    );
  });
});

// Password reset - verify token and reset
app.post('/api/auth/reset-password', async (req, res) => {
  const { token, newPassword } = req.body;
  if (!token || !newPassword) return res.status(400).json({ error: 'חסרים פרטים' });

  db.get(
    'SELECT user_id FROM password_reset_tokens WHERE token = ? AND expires_at > datetime("now")',
    [token],
    async (err, row) => {
      if (err || !row) return res.status(400).json({ error: 'קוד לא חוקי או פג תוקף' });

      const hashedPassword = require('bcryptjs').hashSync(newPassword, 10);

      db.run(
        'UPDATE users SET password = ? WHERE id = ?',
        [hashedPassword, row.user_id],
        function(resetErr) {
          if (resetErr) return res.status(500).json({ error: resetErr.message });

          // Delete used token
          db.run('DELETE FROM password_reset_tokens WHERE token = ?', [token]);

          res.json({ success: true, message: 'הסיסמה אופסה בהצלחה!' });
        }
      );
    }
  );
});

// ===== FRIDGE CRUD (with user isolation) =====
app.get('/api/fridge', (req, res) => {
  const userId = req.session.userId;
  if (!userId) return res.status(401).json({ error: 'לא מחובר' });

  db.all('SELECT * FROM fridge_items WHERE user_id = ? ORDER BY created_at DESC', [userId], (err, rows) => {
    if (err) res.status(500).json({ error: err.message });
    else res.json(rows || []);
  });
});

app.post('/api/fridge', (req, res) => {
  const { item_name, quantity } = req.body;
  const userId = req.session.userId;
  if (!userId) return res.status(401).json({ error: 'לא מחובר' });

  db.run(
    'INSERT INTO fridge_items (user_id, item_name, quantity) VALUES (?, ?, ?)',
    [userId, item_name, quantity || '1'],
    function(err) {
      if (err) res.status(500).json({ error: err.message });
      else res.json({ id: this.lastID, item_name, quantity });
    }
  );
});

app.delete('/api/fridge/:id', (req, res) => {
  const userId = req.session.userId;
  if (!userId) return res.status(401).json({ error: 'לא מחובר' });

  db.run(
    'DELETE FROM fridge_items WHERE id = ? AND user_id = ?',
    [req.params.id, userId],
    function(err) {
      if (err) res.status(500).json({ error: err.message });
      else res.json({ success: true });
    }
  );
});

// Proxy endpoint for Claude API
app.post('/api/claude', async (req, res) => {
  const userId = req.session.userId;
  if (!userId) return res.status(401).json({ error: 'לא מחובר' });

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify(req.body)
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json(data);
    }

    res.json(data);
  } catch (error) {
    console.error('Proxy error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Fetch receipt from URL and extract products
app.post('/api/fetch-receipt', async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'URL חסר' });

  try {
    let itemNames = [];

    // ── Pairzon receipts (אושר עד וחנויות נוספות) ──────────────────────
    const pairzonMatch = url.match(/https?:\/\/([^\/]+pairzon\.com)[^?]*\?.*id=([0-9a-f-]+).*[&?]p=(\d+)/i);
    if (pairzonMatch) {
      const [, host, docId, prefix] = pairzonMatch;
      const apiUrl = `https://${host}/v1.0/documents/${docId}?p=${prefix}`;
      console.log('Pairzon API:', apiUrl);

      const apiRes = await fetch(apiUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0' }
      });
      if (!apiRes.ok) throw new Error(`Pairzon API שגיאה: ${apiRes.status}`);

      const data = await apiRes.json();
      itemNames = (data.items || []).map(i => i.name).filter(Boolean);

      // Send to Claude to filter only food items
      const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': API_KEY, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 800,
          messages: [{
            role: 'user',
            content: `מהרשימה הבאה של מוצרים שנקנו בסופר, החזר ONLY JSON array עם שמות מוצרי המזון בלבד (בלי מוצרי ניקיון, בלי כלי בית, בלי אריזות מיחזור, בלי ממסים). שמות קצרים וברורים בעברית, ללא markdown:\n${JSON.stringify(itemNames)}`
          }]
        })
      });
      const claudeData = await claudeRes.json();
      res.json(claudeData);
      return;
    }

    // ── קבלות אחרות — scrape + Claude ──────────────────────────────────
    const pageRes = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      redirect: 'follow'
    });
    if (!pageRes.ok) throw new Error(`שגיאה בטעינת הדף: ${pageRes.status}`);

    const html = await pageRes.text();
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .substring(0, 12000);

    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 800,
        messages: [{
          role: 'user',
          content: `זהו תוכן קבלת קניות. חלץ רק מוצרי מזון (לא ניקיון, לא מיחזור). החזר ONLY JSON array בעברית, ללא markdown: ["פריט 1", "פריט 2"]\n\n${text}`
        }]
      })
    });
    const data = await claudeRes.json();
    res.json(data);

  } catch (error) {
    console.error('Receipt fetch error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ===== NUTRITION ENDPOINTS =====
app.post('/api/nutrition/profile', (req, res) => {
  const userId = req.session.userId;
  if (!userId) return res.status(401).json({ error: 'לא מחובר' });

  const { age, height, current_weight, target_weight, dietary_preferences, activity_level, goal } = req.body;

  db.run(
    `INSERT OR REPLACE INTO user_nutrition (user_id, age, height, current_weight, target_weight, dietary_preferences, activity_level, goal)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [userId, age, height, current_weight, target_weight, dietary_preferences, activity_level, goal],
    function(err) {
      if (err) res.status(500).json({ error: err.message });
      else res.json({ success: true });
    }
  );
});

app.get('/api/nutrition/profile', (req, res) => {
  const userId = req.session.userId;
  if (!userId) return res.status(401).json({ error: 'לא מחובר' });

  db.get('SELECT * FROM user_nutrition WHERE user_id = ?', [userId], (err, row) => {
    if (err) res.status(500).json({ error: err.message });
    else res.json(row || {});
  });
});

app.post('/api/food-log', (req, res) => {
  const userId = req.session.userId;
  if (!userId) return res.status(401).json({ error: 'לא מחובר' });

  const { food_name, quantity, meal_type, calories, protein, carbs, fat, date } = req.body;

  db.run(
    `INSERT INTO food_log (user_id, food_name, quantity, meal_type, calories, protein, carbs, fat, date)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [userId, food_name, quantity, meal_type, calories, protein, carbs, fat, date || new Date().toISOString().split('T')[0]],
    function(err) {
      if (err) res.status(500).json({ error: err.message });
      else res.json({ id: this.lastID });
    }
  );
});

app.get('/api/food-log/:date', (req, res) => {
  const userId = req.session.userId;
  if (!userId) return res.status(401).json({ error: 'לא מחובר' });

  const date = req.params.date || new Date().toISOString().split('T')[0];

  db.all(
    'SELECT * FROM food_log WHERE user_id = ? AND date = ? ORDER BY created_at',
    [userId, date],
    (err, rows) => {
      if (err) res.status(500).json({ error: err.message });
      else res.json(rows || []);
    }
  );
});

app.delete('/api/food-log/:id', (req, res) => {
  const userId = req.session.userId;
  if (!userId) return res.status(401).json({ error: 'לא מחובר' });

  db.run(
    'DELETE FROM food_log WHERE id = ? AND user_id = ?',
    [req.params.id, userId],
    function(err) {
      if (err) res.status(500).json({ error: err.message });
      else res.json({ success: true });
    }
  );
});

// ===== SAVED RECIPES =====
app.get('/api/recipes/saved', (req, res) => {
  const userId = req.session.userId;
  if (!userId) return res.status(401).json({ error: 'לא מחובר' });

  db.all('SELECT * FROM saved_recipes WHERE user_id = ? ORDER BY saved_at DESC', [userId], (err, rows) => {
    if (err) res.status(500).json({ error: err.message });
    else res.json(rows || []);
  });
});

app.post('/api/recipes/save', (req, res) => {
  const userId = req.session.userId;
  if (!userId) return res.status(401).json({ error: 'לא מחובר' });

  const { recipe_name, recipe_content, category, calories, protein } = req.body;

  db.run(
    'INSERT INTO saved_recipes (user_id, recipe_name, recipe_content, category, calories, protein) VALUES (?, ?, ?, ?, ?, ?)',
    [userId, recipe_name, recipe_content, category, calories, protein],
    function(err) {
      if (err) res.status(500).json({ error: err.message });
      else res.json({ id: this.lastID });
    }
  );
});

app.delete('/api/recipes/save/:id', (req, res) => {
  const userId = req.session.userId;
  if (!userId) return res.status(401).json({ error: 'לא מחובר' });

  db.run(
    'DELETE FROM saved_recipes WHERE id = ? AND user_id = ?',
    [req.params.id, userId],
    function(err) {
      if (err) res.status(500).json({ error: err.message });
      else res.json({ success: true });
    }
  );
});

// ===== SHOPPING LIST =====
app.get('/api/shopping-list', (req, res) => {
  const userId = req.session.userId;
  if (!userId) return res.status(401).json({ error: 'לא מחובר' });

  db.all('SELECT * FROM shopping_list WHERE user_id = ? AND purchased = 0 ORDER BY created_at DESC', [userId], (err, rows) => {
    if (err) res.status(500).json({ error: err.message });
    else res.json(rows || []);
  });
});

app.post('/api/shopping-list', (req, res) => {
  const userId = req.session.userId;
  if (!userId) return res.status(401).json({ error: 'לא מחובר' });

  const { item_name, quantity, reason } = req.body;

  db.run(
    'INSERT INTO shopping_list (user_id, item_name, quantity, reason) VALUES (?, ?, ?, ?)',
    [userId, item_name, quantity, reason],
    function(err) {
      if (err) res.status(500).json({ error: err.message });
      else res.json({ id: this.lastID });
    }
  );
});

app.delete('/api/shopping-list/:id', (req, res) => {
  const userId = req.session.userId;
  if (!userId) return res.status(401).json({ error: 'לא מחובר' });

  db.run(
    'DELETE FROM shopping_list WHERE id = ? AND user_id = ?',
    [req.params.id, userId],
    function(err) {
      if (err) res.status(500).json({ error: err.message });
      else res.json({ success: true });
    }
  );
});

// ===== WORKOUT LOGS =====
app.get('/api/workouts/:date', (req, res) => {
  const userId = req.session.userId;
  if (!userId) return res.status(401).json({ error: 'לא מחובר' });

  const date = req.params.date || new Date().toISOString().split('T')[0];

  db.all(
    'SELECT * FROM workout_logs WHERE user_id = ? AND date = ? ORDER BY created_at',
    [userId, date],
    (err, rows) => {
      if (err) res.status(500).json({ error: err.message });
      else res.json(rows || []);
    }
  );
});

app.post('/api/workouts', (req, res) => {
  const userId = req.session.userId;
  if (!userId) return res.status(401).json({ error: 'לא מחובר' });

  const { exercise_name, duration, sets, reps, location, difficulty } = req.body;

  db.run(
    'INSERT INTO workout_logs (user_id, exercise_name, duration, sets, reps, location, difficulty) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [userId, exercise_name, duration, sets, reps, location, difficulty],
    function(err) {
      if (err) res.status(500).json({ error: err.message });
      else res.json({ id: this.lastID });
    }
  );
});

app.delete('/api/workouts/:id', (req, res) => {
  const userId = req.session.userId;
  if (!userId) return res.status(401).json({ error: 'לא מחובר' });

  db.run(
    'DELETE FROM workout_logs WHERE id = ? AND user_id = ?',
    [req.params.id, userId],
    function(err) {
      if (err) res.status(500).json({ error: err.message });
      else res.json({ success: true });
    }
  );
});

// Chat endpoint - talk to the chef
app.post('/api/chat', async (req, res) => {
  const { message, fridgeItems } = req.body;
  if (!message) return res.status(400).json({ error: 'הודעה חסרה' });

  try {
    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 600,
        messages: [{
          role: 'user',
          content: `אתה שף חבר מומחה. המשתמש בקש משהו ספציפי.

במקרר שלהם: ${fridgeItems && fridgeItems.length ? fridgeItems.join(', ') : 'ריק'}

בקשה: "${message}"

אם הם ביקשו מתכון ספציפי: תן מתכון קצר וקל (עברית, 2-3 שלבים בלבד).
אם זו שאלה או בקשה אחרת: תן תשובה קצרה וחבורתית.
עברית נכונה בלבד, ללא טעויות כתיב. תשובה קצרה וישירה.`
        }]
      })
    });

    const data = await claudeRes.json();
    res.json(data);

  } catch (error) {
    console.error('Chat error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Serve HTML (SaaS version with auth)
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'smart-fridge-saas.html'));
});

app.listen(PORT, () => {
  console.log(`✅ Smart Fridge Server running at http://localhost:${PORT}`);
  console.log('🔐 API Key loaded from .env (not exposed to client)');
});
