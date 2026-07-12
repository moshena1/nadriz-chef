const fetch = require('node-fetch');

const configured = !!process.env.RESEND_API_KEY;
const FROM = process.env.RESEND_FROM || 'NADRIZ CHEF <onboarding@resend.dev>';

async function sendCodeEmail(to, code, type) {
  if (!configured) {
    console.log(`⚠️ מייל לא מוגדר (RESEND_API_KEY חסר). קוד ל-${to}: ${code}`);
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
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ from: FROM, to: [to], subject, html }),
      signal: controller.signal
    });
    clearTimeout(timeout);

    if (!r.ok) {
      const errBody = await r.text();
      console.error('❌ שליחת מייל נכשלה (Resend):', r.status, errBody);
      return { sent: false, error: errBody };
    }
    return { sent: true };
  } catch (err) {
    console.error('❌ שליחת מייל נכשלה:', err.message);
    return { sent: false, error: err.message };
  }
}

module.exports = { sendCodeEmail, mailerConfigured: configured };
