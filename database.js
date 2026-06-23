const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const db = new sqlite3.Database(path.join(__dirname, 'nadriz.db'));

db.serialize(() => {
  // Create users table
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      verified INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Create fridge_items table
  db.run(`
    CREATE TABLE IF NOT EXISTS fridge_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      item_name TEXT NOT NULL,
      quantity TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // Create user_nutrition table (personal metrics)
  db.run(`
    CREATE TABLE IF NOT EXISTS user_nutrition (
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
    )
  `);

  // Create food_log table (daily food tracking)
  db.run(`
    CREATE TABLE IF NOT EXISTS food_log (
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
    )
  `);

  // Create saved_recipes table (favorite recipes)
  db.run(`
    CREATE TABLE IF NOT EXISTS saved_recipes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      recipe_name TEXT NOT NULL,
      recipe_content TEXT NOT NULL,
      category TEXT,
      calories INTEGER,
      protein REAL,
      saved_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // Create shopping_list table (items to buy)
  db.run(`
    CREATE TABLE IF NOT EXISTS shopping_list (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      item_name TEXT NOT NULL,
      quantity TEXT,
      reason TEXT,
      purchased INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // Create workout_logs table (fitness tracking)
  db.run(`
    CREATE TABLE IF NOT EXISTS workout_logs (
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
    )
  `);

  // Create password_reset_tokens table
  db.run(`
    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      token TEXT NOT NULL UNIQUE,
      expires_at DATETIME NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // Create verification_codes table
  db.run(`
    CREATE TABLE IF NOT EXISTS verification_codes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      email TEXT,
      code TEXT NOT NULL,
      type TEXT NOT NULL,
      expires_at DATETIME NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  console.log('✅ Database initialized');
});

module.exports = db;
