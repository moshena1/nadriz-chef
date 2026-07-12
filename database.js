const { createClient } = require('@libsql/client');

if (!process.env.TURSO_DATABASE_URL || !process.env.TURSO_AUTH_TOKEN) {
  console.error('❌ TURSO_DATABASE_URL / TURSO_AUTH_TOKEN not found in .env file!');
  process.exit(1);
}

const client = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN
});

const SCHEMA = [
  `PRAGMA foreign_keys = ON`,

  `CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    verified INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,

  `CREATE TABLE IF NOT EXISTS fridge_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    item_name TEXT NOT NULL,
    quantity TEXT,
    expiry_date DATE,
    needs_expiry INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )`,

  `CREATE TABLE IF NOT EXISTS user_nutrition (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL UNIQUE,
    age INTEGER,
    height INTEGER,
    current_weight REAL,
    target_weight REAL,
    dietary_preferences TEXT,
    activity_level TEXT,
    goal TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )`,

  `CREATE TABLE IF NOT EXISTS food_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    food_name TEXT NOT NULL,
    quantity TEXT,
    meal_type TEXT,
    calories INTEGER,
    protein REAL,
    carbs REAL,
    fat REAL,
    date DATE DEFAULT CURRENT_DATE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )`,

  `CREATE TABLE IF NOT EXISTS saved_recipes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    recipe_name TEXT NOT NULL,
    recipe_content TEXT NOT NULL,
    category TEXT,
    calories INTEGER,
    protein REAL,
    saved_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )`,

  `CREATE TABLE IF NOT EXISTS shopping_list (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    item_name TEXT NOT NULL,
    quantity TEXT,
    reason TEXT,
    purchased INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )`,

  `CREATE TABLE IF NOT EXISTS workout_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    exercise_name TEXT NOT NULL,
    duration INTEGER,
    sets INTEGER,
    reps INTEGER,
    location TEXT,
    difficulty TEXT,
    date DATE DEFAULT CURRENT_DATE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )`,

  `CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    token TEXT NOT NULL UNIQUE,
    expires_at DATETIME NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )`,

  `CREATE TABLE IF NOT EXISTS verification_codes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    email TEXT,
    code TEXT NOT NULL,
    type TEXT NOT NULL,
    expires_at DATETIME NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,

  `CREATE TABLE IF NOT EXISTS meal_photos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    photo_base64 TEXT,
    detected_foods TEXT,
    calories INTEGER,
    protein REAL,
    carbs REAL,
    fat REAL,
    meal_type TEXT,
    date DATE DEFAULT CURRENT_DATE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )`,

  `CREATE TABLE IF NOT EXISTS fridge_photos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    photo_base64 TEXT,
    detected_items TEXT,
    scan_date DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )`,

  `CREATE TABLE IF NOT EXISTS fitness_profiles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL UNIQUE,
    goal TEXT,
    macros_carbs REAL,
    macros_protein REAL,
    macros_fat REAL,
    daily_calories INTEGER,
    workouts_per_week INTEGER,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )`,

  `CREATE TABLE IF NOT EXISTS workout_plans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    goal TEXT,
    week_number INTEGER,
    day_number INTEGER,
    exercise_name TEXT,
    sets INTEGER,
    reps TEXT,
    notes TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )`,

  `CREATE TABLE IF NOT EXISTS shared_recipes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    recipe_id INTEGER,
    shared_by_user_id INTEGER,
    shared_with_email TEXT,
    shared_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (shared_by_user_id) REFERENCES users(id) ON DELETE CASCADE
  )`,

  `CREATE TABLE IF NOT EXISTS meal_photo_edits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    meal_photo_id INTEGER,
    user_id INTEGER,
    edited_foods TEXT,
    edited_calories INTEGER,
    edited_protein REAL,
    edited_carbs REAL,
    edited_fat REAL,
    edited_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )`
];

const ready = (async () => {
  for (const sql of SCHEMA) {
    await client.execute(sql);
  }
  console.log('✅ Database initialized (Turso)');
})().catch(err => {
  console.error('❌ Database schema setup failed:', err.message);
  process.exit(1);
});

function normalizeArgs(params) {
  return params || [];
}

// Thin compatibility layer over the sqlite3 callback API (db.run/get/all),
// so the ~40 existing call sites in server.js/auth.js don't need to change -
// only the storage backend underneath them does.
const db = {
  ready,
  run(sql, params, callback) {
    if (typeof params === 'function') { callback = params; params = []; }
    client.execute({ sql, args: normalizeArgs(params) })
      .then(rs => {
        if (callback) callback.call({ lastID: Number(rs.lastInsertRowid ?? 0), changes: rs.rowsAffected }, null);
      })
      .catch(err => { if (callback) callback(err); else console.error('DB run error:', err.message); });
  },
  get(sql, params, callback) {
    if (typeof params === 'function') { callback = params; params = []; }
    client.execute({ sql, args: normalizeArgs(params) })
      .then(rs => callback(null, rs.rows[0]))
      .catch(err => callback(err));
  },
  all(sql, params, callback) {
    if (typeof params === 'function') { callback = params; params = []; }
    client.execute({ sql, args: normalizeArgs(params) })
      .then(rs => callback(null, rs.rows))
      .catch(err => callback(err));
  }
};

module.exports = db;
