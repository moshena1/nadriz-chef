const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const db = new sqlite3.Database('./nadriz.db');

const username = 'moshe';
const email = 'moshe@test.com';
const password = 'Moshe123!';

// Hash the password
const hashedPassword = bcrypt.hashSync(password, 10);

// Insert user
db.run(
  'INSERT OR REPLACE INTO users (id, username, email, password, verified) VALUES (1, ?, ?, ?, 1)',
  [username, email, hashedPassword],
  function(err) {
    if (err) {
      console.error('❌ Error:', err.message);
    } else {
      console.log('✅ Account created/updated:');
      console.log('   Username: ' + username);
      console.log('   Email: ' + email);
      console.log('   Password: ' + password);
      console.log('\n💾 This account is now ready to use!');
    }
    db.close();
  }
);
