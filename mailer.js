const nodemailer = require('nodemailer');

const configured = !!(process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD);

const transporter = configured
  ? nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_APP_PASSWORD
      }
    })
  : null;

async function sendCodeEmail(to, code, type) {
  if (!configured) {
    console.log(`⚠️ מייל לא מוגדר (GMAIL_USER/GMAIL_APP_PASSWORD חסרים). קוד ל-${to}: ${code}`);
    return { sent: false };
  }

  const isReset = type === 'reset';
  const subject = isReset ? '🔐 איפוס סיסמה - NADRIZ CHEF' : '📝 אימות חשבון - NADRIZ CHEF';
  const title = isReset ? 'איפוס סיסמה' : 'ברוכים הבאים ל-NADRIZ CHEF!';
  const bodyText = isReset
    ? 'קיבלנו בקשה לאפס את הסיסמה שלך. הכנס את הקוד הבא באפליקציה:'
    : 'תודה שנרשמת! הכנס את הקוד הבא כדי לאמת את החשבון שלך:';

  const html = `
    <div dir="rtl" style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;">
      <h2 style="color:#16a34a;">${title}</h2>
      <p style="color:#333;font-size:15px;">${bodyText}</p>
      <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;padding:20px;text-align:center;margin:20px 0;">
        <span style="font-size:32px;font-weight:bold;letter-spacing:4px;color:#16a34a;">${code}</span>
      </div>
      <p style="color:#888;font-size:13px;">הקוד תקף ל-10 דקות. אם לא ביקשת פעולה זו, אפשר להתעלם מהמייל.</p>
    </div>
  `;

  try {
    await transporter.sendMail({
      from: `"NADRIZ CHEF" <${process.env.GMAIL_USER}>`,
      to,
      subject,
      html
    });
    return { sent: true };
  } catch (err) {
    console.error('❌ שליחת מייל נכשלה:', err.message);
    return { sent: false, error: err.message };
  }
}

module.exports = { sendCodeEmail, mailerConfigured: configured };
