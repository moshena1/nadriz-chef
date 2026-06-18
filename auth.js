const bcrypt = require('bcryptjs');
const db = require('./database');

function generateUserId() {
  return Math.random().toString(36).substring(2, 15);
}

async function signup(username, password) {
  return new Promise((resolve, reject) => {
    const hashedPassword = bcrypt.hashSync(password, 10);
    db.run(
      'INSERT INTO users (username, password) VALUES (?, ?)',
      [username, hashedPassword],
      function(err) {
        if (err) {
          reject(err.message.includes('UNIQUE') ? 'שם משתמש כבר קיים' : err.message);
        } else {
          resolve({ id: this.lastID, username });
        }
      }
    );
  });
}

async function login(username, password) {
  return new Promise((resolve, reject) => {
    db.get('SELECT * FROM users WHERE username = ?', [username], (err, user) => {
      if (err) {
        reject(err.message);
      } else if (!user) {
        reject('שם משתמש או סיסמה לא נכונים');
      } else if (!bcrypt.compareSync(password, user.password)) {
        reject('שם משתמש או סיסמה לא נכונים');
      } else {
        resolve({ id: user.id, username: user.username });
      }
    });
  });
}

module.exports = { signup, login };
