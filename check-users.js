const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./nadriz.db');

db.all('SELECT id, username, email, verified, created_at FROM users', (err, rows) => {
  if (err) {
    console.error('❌ שגיאה:', err);
  } else {
    console.log('\n📋 משתמשים רשומים:\n');
    if (rows.length === 0) {
      console.log('אין משתמשים עדיין 👤');
    } else {
      rows.forEach((user, idx) => {
        console.log(`${idx + 1}. ${user.username}`);
        console.log(`   📧 אימייל: ${user.email}`);
        console.log(`   ✔️ אומת: ${user.verified ? 'כן ✅' : 'לא ❌'}`);
        console.log(`   📅 נרשם: ${user.created_at}\n`);
      });
    }
  }
  db.close();
});
