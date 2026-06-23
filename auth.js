const bcrypt = require('bcryptjs');
const db = require('./database');

function generateVerificationCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

async function signup(username, email, password) {
  return new Promise((resolve, reject) => {
    if (!username || !email || !password) {
      return reject('כל השדות חובה');
    }

    const hashedPassword = bcrypt.hashSync(password, 10);
    const code = generateVerificationCode();
    const expiresAt = new Date(Date.now() + 600000).toISOString(); // 10 minutes

    db.run(
      'INSERT INTO users (username, email, password) VALUES (?, ?, ?)',
      [username, email, hashedPassword],
      function(err) {
        if (err) {
          if (err.message.includes('UNIQUE')) {
            reject('שם משתמש או אימייל כבר קיימים');
          } else {
            reject(err.message);
          }
        } else {
          const userId = this.lastID;

          // Create verification code
          db.run(
            'INSERT INTO verification_codes (user_id, email, code, type, expires_at) VALUES (?, ?, ?, ?, ?)',
            [userId, email, code, 'signup', expiresAt],
            (codeErr) => {
              if (codeErr) {
                reject(codeErr.message);
              } else {
                // Log code to console for development
                console.log(`🔐 Verification code for ${email}: ${code}`);

                resolve({
                  id: userId,
                  username,
                  email,
                  verificationCode: code,
                  message: `קוד אימות: ${code} (הוצג בקונסול השרת)`
                });
              }
            }
          );
        }
      }
    );
  });
}

async function verifySignup(userId, code) {
  return new Promise((resolve, reject) => {
    db.get(
      'SELECT * FROM verification_codes WHERE user_id = ? AND code = ? AND type = "signup" AND expires_at > datetime("now")',
      [userId, code],
      (err, row) => {
        if (err || !row) {
          reject('קוד לא חוקי או פג תוקף');
        } else {
          db.run(
            'UPDATE users SET verified = 1 WHERE id = ?',
            [userId],
            (updateErr) => {
              if (updateErr) {
                reject(updateErr.message);
              } else {
                db.run('DELETE FROM verification_codes WHERE id = ?', [row.id]);
                resolve({ success: true, message: 'חשבון אומת בהצלחה!' });
              }
            }
          );
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
      } else if (!user.verified) {
        reject('חשבון לא מאומת. בדוק את הקוד שקיבלת');
      } else {
        resolve({ id: user.id, username: user.username, email: user.email });
      }
    });
  });
}

module.exports = { signup, login, verifySignup, generateVerificationCode };
