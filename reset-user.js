const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./nadriz.db');

// Delete the myuser account
db.run('DELETE FROM users WHERE username = ?', ['myuser'], function(err) {
  if (err) {
    console.error('❌ Error:', err);
  } else {
    console.log('✅ Deleted myuser account');
  }
  db.close();
});
