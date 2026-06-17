require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const API_KEY = process.env.ANTHROPIC_API_KEY;

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(express.static('.'));

if (!API_KEY) {
  console.error('❌ ANTHROPIC_API_KEY not found in .env file!');
  process.exit(1);
}

// Proxy endpoint for Claude API
app.post('/api/claude', async (req, res) => {
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

// Serve HTML
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'smart-fridge-FULL.html'));
});

app.listen(PORT, () => {
  console.log(`✅ Smart Fridge Server running at http://localhost:${PORT}`);
  console.log('🔐 API Key loaded from .env (not exposed to client)');
});
