require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const path = require('path');
const { signup, login, verifySignup, generateToken, verifyToken } = require('./auth');
const { sendCodeEmail } = require('./mailer');
const db = require('./database');

const app = express();
const PORT = process.env.PORT || 3001;
const API_KEY = process.env.ANTHROPIC_API_KEY;

console.log('🔧 Config loaded: PORT=' + PORT + ', API_KEY=' + (API_KEY ? 'set' : 'MISSING'));

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Stateless auth: userId is derived from a JWT in the Authorization header,
// not from a server-side session. This survives server restarts/cold starts
// (e.g. Render free tier), unlike an in-memory session store.
function getUserId(req) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return null;
  return verifyToken(token);
}

// API routes BEFORE static files
app.use('/api', express.Router());

if (!API_KEY) {
  console.error('❌ ANTHROPIC_API_KEY not found in .env file!');
  process.exit(1);
}

// ===== AUTH ROUTES =====
app.post('/api/auth/signup', async (req, res) => {
  const { username, email, password } = req.body;
  if (!username || !email || !password) {
    return res.status(400).json({ error: 'כל השדות חובה: שם משתמש, אימייל, סיסמה' });
  }

  try {
    const user = await signup(username, email, password);
    const emailResult = await sendCodeEmail(user.email, user.verificationCode, 'signup');

    res.json({
      id: user.id,
      username: user.username,
      email: user.email,
      emailSent: emailResult.sent,
      verificationCode: emailResult.sent ? undefined : user.verificationCode,
      message: emailResult.sent
        ? 'קוד אימות נשלח לאימייל שלך'
        : `קוד אימות: ${user.verificationCode} (המייל לא הוגדר בשרת, הקוד מוצג כאן)`
    });
  } catch (err) {
    res.status(400).json({ error: err.toString() });
  }
});

app.post('/api/auth/verify-signup', async (req, res) => {
  const { userId, code } = req.body;
  if (!userId || !code) return res.status(400).json({ error: 'קוד חובה' });

  try {
    const result = await verifySignup(userId, code);
    const token = generateToken(userId);
    res.json({ ...result, token, userId });
  } catch (err) {
    res.status(400).json({ error: err.toString() });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'שם משתמש וסיסמה חובה' });

  try {
    const user = await login(username, password);
    const token = generateToken(user.id);
    res.json({ id: user.id, username: user.username, token });
  } catch (err) {
    res.status(400).json({ error: err });
  }
});

app.post('/api/auth/logout', (req, res) => {
  // Stateless (JWT) auth - nothing to invalidate server-side, client just drops the token.
  res.json({ success: true });
});

app.get('/api/auth/status', (req, res) => {
  res.json({ userId: getUserId(req) });
});

// Password reset - request reset (by email, like every other app)
app.post('/api/auth/forgot-password', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'אימייל חסר' });

  db.get('SELECT id, email FROM users WHERE email = ?', [email], async (err, user) => {
    if (err || !user) return res.status(400).json({ error: 'לא נמצא חשבון עם אימייל זה' });

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 600000).toISOString(); // 10 minutes

    db.run(
      'INSERT INTO verification_codes (user_id, email, code, type, expires_at) VALUES (?, ?, ?, ?, ?)',
      [user.id, user.email, code, 'reset', expiresAt],
      async function(err) {
        if (err) return res.status(500).json({ error: err.message });

        const emailResult = await sendCodeEmail(user.email, code, 'reset');

        res.json({
          success: true,
          userId: user.id,
          emailSent: emailResult.sent,
          resetCode: emailResult.sent ? undefined : code,
          message: emailResult.sent
            ? 'קוד איפוס נשלח לאימייל שלך'
            : `קוד איפוס: ${code} (המייל לא הוגדר בשרת, הקוד מוצג כאן)`
        });
      }
    );
  });
});

// Password reset - verify code and reset
app.post('/api/auth/reset-password', async (req, res) => {
  const { userId, code, newPassword, confirmPassword } = req.body;
  if (!userId || !code || !newPassword || !confirmPassword) {
    return res.status(400).json({ error: 'חסרים פרטים' });
  }

  if (newPassword !== confirmPassword) {
    return res.status(400).json({ error: 'הסיסמאות לא תואמות' });
  }

  db.get(
    'SELECT * FROM verification_codes WHERE user_id = ? AND code = ? AND type = "reset" AND expires_at > datetime("now")',
    [userId, code],
    async (err, row) => {
      if (err || !row) return res.status(400).json({ error: 'קוד לא חוקי או פג תוקף' });

      const hashedPassword = require('bcryptjs').hashSync(newPassword, 10);

      db.run(
        'UPDATE users SET password = ? WHERE id = ?',
        [hashedPassword, userId],
        function(resetErr) {
          if (resetErr) return res.status(500).json({ error: resetErr.message });

          // Delete used code
          db.run('DELETE FROM verification_codes WHERE id = ?', [row.id]);

          res.json({ success: true, message: 'הסיסמה אופסה בהצלחה! התחבר עם הסיסמה החדשה' });
        }
      );
    }
  );
});

// ===== FRIDGE CRUD (with user isolation) =====
app.get('/api/fridge', (req, res) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: 'לא מחובר' });

  db.all('SELECT * FROM fridge_items WHERE user_id = ? ORDER BY created_at DESC', [userId], (err, rows) => {
    if (err) res.status(500).json({ error: err.message });
    else res.json(rows || []);
  });
});

app.post('/api/fridge', (req, res) => {
  const { item_name, quantity } = req.body;
  const userId = getUserId(req);
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
  const userId = getUserId(req);
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
  const userId = getUserId(req);
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
  const userId = getUserId(req);
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
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: 'לא מחובר' });

  db.get('SELECT * FROM user_nutrition WHERE user_id = ?', [userId], (err, row) => {
    if (err) res.status(500).json({ error: err.message });
    else res.json(row || {});
  });
});

app.post('/api/food-log', (req, res) => {
  const userId = getUserId(req);
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
  const userId = getUserId(req);
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
  const userId = getUserId(req);
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
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: 'לא מחובר' });

  db.all('SELECT * FROM saved_recipes WHERE user_id = ? ORDER BY saved_at DESC', [userId], (err, rows) => {
    if (err) res.status(500).json({ error: err.message });
    else res.json(rows || []);
  });
});

app.post('/api/recipes/save', (req, res) => {
  const userId = getUserId(req);
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
  const userId = getUserId(req);
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
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: 'לא מחובר' });

  db.all('SELECT * FROM shopping_list WHERE user_id = ? AND purchased = 0 ORDER BY created_at DESC', [userId], (err, rows) => {
    if (err) res.status(500).json({ error: err.message });
    else res.json(rows || []);
  });
});

app.post('/api/shopping-list', (req, res) => {
  const userId = getUserId(req);
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
  const userId = getUserId(req);
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
  const userId = getUserId(req);
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
  const userId = getUserId(req);
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
  const userId = getUserId(req);
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

// MEAL PHOTO ANALYSIS - Vision-based calorie tracking
app.post('/api/meal/analyze-photo', async (req, res) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: 'לא מחובר' });

  const { photoBase64, mealType } = req.body;
  if (!photoBase64) return res.status(400).json({ error: 'תמונה חסרה' });

  try {
    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-opus-4-1',
        max_tokens: 1000,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: 'image/jpeg',
                data: photoBase64
              }
            },
            {
              type: 'text',
              text: `נתח את הארוחה בתמונה. זיהה כל פריט, כמותו בערך. חזר JSON בלבד:
{
  "foods": [{"name":"שם","quantity":"כמות"}],
  "totalCalories": 0,
  "protein": 0,
  "carbs": 0,
  "fat": 0
}`
            }
          ]
        }]
      })
    });

    const claudeData = await claudeRes.json();
    const analysisText = claudeData.content[0].text;
    const analysis = JSON.parse(analysisText.replace(/```json|```/g, '').trim());

    // Save to database
    db.run(
      `INSERT INTO meal_photos (user_id, photo_base64, detected_foods, calories, protein, carbs, fat, meal_type)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [userId, photoBase64, JSON.stringify(analysis.foods), analysis.totalCalories, analysis.protein, analysis.carbs, analysis.fat, mealType],
      function(err) {
        if (err) res.status(500).json({ error: err.message });
        else res.json({ success: true, analysis, id: this.lastID });
      }
    );
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// FRIDGE PHOTO SCANNING - AI detects products
app.post('/api/fridge/scan-photo', async (req, res) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: 'לא מחובר' });

  const { photoBase64 } = req.body;
  if (!photoBase64) return res.status(400).json({ error: 'תמונה חסרה' });

  try {
    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-opus-4-1',
        max_tokens: 1000,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: 'image/jpeg',
                data: photoBase64
              }
            },
            {
              type: 'text',
              text: `זיהה את כל המוצרים והמצרכים במקרר. חזר JSON בלבד:
{
  "items": [{"name":"שם מוצר","quantity":"הערכה לכמות"}]
}`
            }
          ]
        }]
      })
    });

    const claudeData = await claudeRes.json();
    const detectionText = claudeData.content[0].text;
    const detection = JSON.parse(detectionText.replace(/```json|```/g, '').trim());

    // Auto-add items to fridge
    const items = detection.items || [];
    for (const item of items) {
      db.run(
        'INSERT INTO fridge_items (user_id, item_name, quantity) VALUES (?, ?, ?)',
        [userId, item.name, item.quantity]
      );
    }

    // Save photo scan
    db.run(
      'INSERT INTO fridge_photos (user_id, photo_base64, detected_items) VALUES (?, ?, ?)',
      [userId, photoBase64, JSON.stringify(items)]
    );

    res.json({ success: true, addedItems: items.length, items });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// NUTRITION DAILY/WEEKLY/MONTHLY SUMMARY
app.get('/api/nutrition/summary/:period', (req, res) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: 'לא מחובר' });

  const period = req.params.period; // 'daily', 'weekly', 'monthly'
  let dateFilter = '';

  if (period === 'daily') dateFilter = "date = CURRENT_DATE";
  else if (period === 'weekly') dateFilter = "date >= date('now', '-7 days')";
  else if (period === 'monthly') dateFilter = "date >= date('now', 'start of month')";

  const query = `
    SELECT
      SUM(calories) as totalCalories,
      SUM(protein) as totalProtein,
      SUM(carbs) as totalCarbs,
      SUM(fat) as totalFat,
      COUNT(*) as mealCount
    FROM food_log
    WHERE user_id = ? AND ${dateFilter}
  `;

  db.get(query, [userId], (err, row) => {
    if (err) res.status(500).json({ error: err.message });
    else res.json(row || { totalCalories: 0, totalProtein: 0, totalCarbs: 0, totalFat: 0, mealCount: 0 });
  });
});

// FITNESS PROFILE - Set professional fitness goal
app.post('/api/fitness-profile/set-goal', (req, res) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: 'לא מחובר' });

  const { goal, dailyCalories, protein, carbs, fat, workoutsPerWeek } = req.body;
  if (!goal) return res.status(400).json({ error: 'יעד חסר' });

  db.run(
    `INSERT OR REPLACE INTO fitness_profiles
     (user_id, goal, daily_calories, macros_protein, macros_carbs, macros_fat, workouts_per_week)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [userId, goal, dailyCalories, protein, carbs, fat, workoutsPerWeek],
    function(err) {
      if (err) res.status(500).json({ error: err.message });
      else res.json({ success: true, goal });
    }
  );
});

// GET fitness profile
app.get('/api/fitness-profile', (req, res) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: 'לא מחובר' });

  db.get('SELECT * FROM fitness_profiles WHERE user_id = ?', [userId], (err, row) => {
    if (err) res.status(500).json({ error: err.message });
    else res.json(row || {});
  });
});

// EDIT MEAL PHOTO DETAILS
app.post('/api/meal/edit-details', (req, res) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: 'לא מחובר' });

  const { mealPhotoId, editedFoods, calories, protein, carbs, fat } = req.body;

  db.run(
    `INSERT INTO meal_photo_edits (meal_photo_id, user_id, edited_foods, edited_calories, edited_protein, edited_carbs, edited_fat)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [mealPhotoId, userId, JSON.stringify(editedFoods), calories, protein, carbs, fat],
    function(err) {
      if (err) res.status(500).json({ error: err.message });
      else {
        // Also update the original meal_photos record
        db.run(
          'UPDATE meal_photos SET calories = ?, protein = ?, carbs = ?, fat = ? WHERE id = ?',
          [calories, protein, carbs, fat, mealPhotoId]
        );
        res.json({ success: true, id: this.lastID });
      }
    }
  );
});

// SMART EXPIRY DATE - only for specific items
app.post('/api/fridge/set-expiry', (req, res) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: 'לא מחובר' });

  const { fridgeItemId, expiryDate } = req.body;
  const PERISHABLES = ['חלב', 'גבינה', 'יוגורט', 'חמאה', 'ביצים', 'בשר', 'דגים', 'חומוס', 'טחינה', 'יוקי', 'קוטג\''];

  db.run(
    'UPDATE fridge_items SET expiry_date = ?, needs_expiry = 1 WHERE id = ? AND user_id = ?',
    [expiryDate, fridgeItemId, userId],
    function(err) {
      if (err) res.status(500).json({ error: err.message });
      else res.json({ success: true });
    }
  );
});

// GENERATE WORKOUT PLAN based on goal
app.post('/api/fitness/generate-plan', async (req, res) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: 'לא מחובר' });

  const { goal } = req.body;

  try {
    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-opus-4-1',
        max_tokens: 2000,
        messages: [{
          role: 'user',
          content: `תוכנית אימונים שבועית עבור יעד: ${goal}

          החזר JSON בלבד:
{
  "week": [
    {
      "day": 1,
      "dayName": "ראשון",
      "exercises": [
        {"name": "תרגיל", "sets": 4, "reps": "8-10"}
      ]
    }
  ]
}`
        }]
      })
    });

    const claudeData = await claudeRes.json();
    const planText = claudeData.content[0].text;
    const plan = JSON.parse(planText.replace(/```json|```/g, '').trim());

    // Save plan to DB
    for (const day of plan.week) {
      for (const exercise of day.exercises) {
        db.run(
          `INSERT INTO workout_plans (user_id, goal, week_number, day_number, exercise_name, sets, reps)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [userId, goal, 1, day.day, exercise.name, exercise.sets, exercise.reps]
        );
      }
    }

    res.json({ success: true, plan });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET WORKOUT PLAN
app.get('/api/fitness/plan', (req, res) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: 'לא מחובר' });

  db.all(
    'SELECT * FROM workout_plans WHERE user_id = ? ORDER BY week_number, day_number',
    [userId],
    (err, rows) => {
      if (err) res.status(500).json({ error: err.message });
      else res.json(rows || []);
    }
  );
});

// SHARE RECIPE
app.post('/api/recipes/share', (req, res) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: 'לא מחובר' });

  const { recipeId, shareWithEmail } = req.body;

  db.run(
    'INSERT INTO shared_recipes (recipe_id, shared_by_user_id, shared_with_email) VALUES (?, ?, ?)',
    [recipeId, userId, shareWithEmail],
    function(err) {
      if (err) res.status(500).json({ error: err.message });
      else res.json({ success: true, message: `משותף עם ${shareWithEmail}` });
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

// Serve static files (AFTER all API routes)
app.use(express.static('.'));

// Serve HTML (SaaS version with auth)
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'smart-fridge-saas.html'));
});

const PORT_NUM = parseInt(PORT) || 3001;
const server = app.listen(PORT_NUM, '0.0.0.0', () => {
  console.log(`✅ Smart Fridge Server running at http://localhost:${PORT_NUM}`);
  console.log('🔐 API Key loaded from .env (not exposed to client)');
});

server.on('error', (err) => {
  console.error('❌ Server error:', err.message);
  process.exit(1);
});
