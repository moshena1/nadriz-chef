# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## 🍽️ NADRIZ CHEF — Overview

**Smart Fridge AI Kitchen Assistant** — A full-stack web app that manages fridge inventory and generates personalized recipes using Claude AI. Users can:
- Track fridge ingredients with tags and bulk management
- Auto-generate 10+ recipes (food & desserts) from available items
- Scan fridge photos to auto-detect ingredients (Claude Vision)
- Import products from receipt URLs (pairzon.com integration)
- Chat with the AI chef for specific recipe requests
- Save favorite recipes with nutrition tracking
- Switch between light/dark mode
- Toggle between missing items ("shopping list") and current inventory

**Tech Stack:**
- Frontend: Single HTML5 file + Vanilla JS + RTL Hebrew support
- Backend: Node.js + Express proxy (API key security)
- AI: Claude API (haiku-4-5 model)
- Hosting: Replit or any server supporting Node.js
- Storage: localStorage (client) + .env (server secrets)

---

## 🏗️ Architecture

```
smart-fridge-FULL.html
├── UI: 4 tabs (🍽 אוכל | 🍰 קינוחים | ❤️ שמורים | 💬 שאל את השף)
├── 3-panel grid (Fridge manager | Actions | Recipes)
├── Dark mode toggle (🌙/☀️) in header
└── Embedded JS (300+ lines):
    ├── Ingredient management (add/remove/bulk)
    ├── Recipe generation (claude API calls)
    ├── Image analysis (Claude Vision for photos)
    ├── Receipt parsing (pairzon.com API)
    ├── Chat interface (free-form recipe requests)
    ├── Favorites (localStorage + heart button)
    └── Theme toggle (CSS --variables for light/dark)

server.js (Express proxy)
├── POST /api/claude → Anthropic API proxy
├── POST /api/fetch-receipt → Pairzon receipt parser + Claude filtering
├── POST /api/chat → Free-form chat with AI chef
└── GET / → Serve smart-fridge-FULL.html

.env (secrets)
└── ANTHROPIC_API_KEY=sk-ant-...
    PORT=3000
```

### Data Flow

1. **Ingredient Input** → `fridgeItems[]` → localStorage:nadriz-fridge
2. **Recipe Generation** → Claude prompt (current ingredients + quiz context) → 10 food + 10 dessert JSON
3. **Recipe Deletion** → Item removed from `fridgeItems[]` → Auto-add to `missingItems[]` → localStorage:nadriz-missing
4. **Chat** → User message + `fridgeItems[]` context → Claude chat response
5. **Image Upload** → Canvas compression → Base64 → Claude Vision → Extract ingredients → Auto-generate recipes
6. **Receipt Import** → URL → Pairzon API extraction → Claude filter (food only) → Add to fridge

---

## 🎯 Key Files & Their Purpose

| File | Purpose | Key Exports/State |
|------|---------|-------------------|
| `smart-fridge-FULL.html` | Single-page app (HTML+CSS+JS) | `fridgeItems[], missingItems[], favorites[], currentRecipes[], quizAnswers` |
| `server.js` | API proxy (3 endpoints) | `/api/claude`, `/api/fetch-receipt`, `/api/chat` |
| `.env` | Secrets (git-ignored) | `ANTHROPIC_API_KEY`, `PORT` |
| `package.json` | Dependencies + scripts | express, cors, dotenv, node-fetch |

---

## 🚀 Common Commands

### Development (Local)

```bash
# Install dependencies
npm install

# Start server (port 3000, serves HTML + API endpoints)
npm start

# After code changes → git add/commit/push to trigger Replit auto-update
git add -A && git commit -m "Description" && git push origin main
```

### Replit Deployment

```bash
# Inside Replit shell:
git config pull.rebase false
git pull origin main
npm start

# If port already in use:
pkill -f "node server.js"
npm start

# Replit auto-reloads on git push (no manual restart needed)
```

### Testing Features Locally

```bash
# Run server, then open browser: http://localhost:3000
# Test endpoints with curl:
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message":"סושי עם אורז","fridgeItems":["אורז","דגים"]}'
```

---

## 🎨 UI/UX Conventions

### CSS
- **Dark mode default:** `--bg:#06080f`, `--panel:rgba(11,17,34,0.88)`
- **Light mode:** `--bg:#f8f9fa`, `--panel:rgba(255,255,255,0.92)` (set via `html[data-theme="light"]`)
- **Colors:** `--green` (accent), `--orange` (secondary), `--blue` (info), `--purple` (quiz)
- **Animations:** `cubic-bezier(0.34, 1.56, 0.64, 1)` for smooth hover + focus states
- **Spacing:** Consistent 8-24px padding, 15px grid gap

### JavaScript State

```javascript
// Core state (all persisted to localStorage)
let fridgeItems = [];      // Current inventory
let missingItems = [];     // Shopping list (auto-added when removing from fridge)
let favorites = [];        // Saved recipe IDs
let currentRecipes = [];   // Rendered recipes from Claude
let quizAnswers = {};      // Optional: user preferences for recipe filtering
```

### API Payloads

**Claude API requests:** Always expect JSON response with `content[0].text`. Strip markdown if needed:
```javascript
const mdMatch = text.match(/```(?:json)?\n?([\s\S]*?)\n?```/);
if (mdMatch) text = mdMatch[1]; // Extract JSON from ```json...``` block
```

**Receipt URL format:** Only pairzon.com URLs fully supported. Extract `id` and `p` params, call Pairzon REST API directly:
```
https://osher.pairzon.com/v1.0/documents/{id}?p={p}
```

---

## 📋 Important Constraints & Rules

1. **Hebrew text:** Always use UTF-8, test with עברית characters, ensure RTL rendering (`dir="rtl"`)
2. **API key security:** NEVER expose in HTML. Always proxy through server.js (`/api/claude`, `/api/chat`)
3. **Recipe generation:** Enforce "ריאליסטי בלבד" (realistic recipes only) in Claude prompt. No weird combos like "ביצה קשוחה עם גמבה"
4. **localStorage keys:** Use fixed keys (`nadriz-fridge`, `nadriz-favorites`, `nadriz-missing`, `nadriz-theme`) — do not vary
5. **Image uploads:** Compress to max 1024px on client (canvas) before sending to server. Limit to 50MB server-side
6. **Recipe tabs:** 4 tabs total (🍽 אוכל | 🍰 קינוחים | ❤️ שמורים | 💬 שאל את השף). Tab panes: `#pane-food`, `#pane-dessert`, `#pane-favorites`, `#pane-chat`
7. **Git workflow:** Every code change → `git commit -m "..."` → `git push origin main`. Replit pulls automatically within 30s
8. **Port:** Default 3000 (configurable via `PORT` env var). Check `ps aux | grep node` to see if already running
9. **Response parsing:** Claude may return markdown-wrapped JSON. Always extract plain JSON before `JSON.parse()`
10. **Error handling:** Never crash app if one API fails (pairzon/receipt). Wrap in try-catch, show toast message, continue

---

## 🔄 Workflow for Adding Features

### 1. Simple UI Change (e.g., add button, change text)
- Edit `smart-fridge-FULL.html` → Find HTML section, add element
- Add CSS in `<style>` block (follow naming: `.btn-*`, `.panel-*`, etc.)
- Add JS function inline in `<script>` block
- Test locally: `npm start` → http://localhost:3000
- Commit & push → Replit auto-updates

### 2. New API Endpoint (e.g., save recipe to DB)
- Edit `server.js` → Add `app.post('/api/new-feature', async (req, res) => {...})`
- Ensure API key is never in response
- Test with curl or fetch from browser console
- Frontend calls: `fetch('/api/new-feature', {method:'POST', body:JSON.stringify(...)})`
- Commit & push

### 3. New Claude Integration (e.g., recipe nutrition analysis)
- Add prompt in `smart-fridge-FULL.html` (use existing `sendClaudeRequest()` pattern)
- **Claude prompts must:**
  - Request JSON-only responses (no markdown preamble)
  - Include Hebrew context if needed
  - Specify exact JSON schema expected
  - Include validation rules (e.g., "only realistic recipes")
- Parse response, validate, render to UI
- Test with real Claude API (not mock)

### 4. New Storage (e.g., track daily calorie intake)
- Add state variable: `let dailyIntake = JSON.parse(localStorage.getItem('nadriz-daily')) || {}`
- Update on each recipe view/selection
- Save: `localStorage.setItem('nadriz-daily', JSON.stringify(dailyIntake))`
- Render in UI or export to CSV
- Load on page init: `DOMContentLoaded` event

---

## 🐛 Debugging Tips

| Issue | Solution |
|-------|----------|
| Chat/Recipe API returns 500 | Check `.env` — is `ANTHROPIC_API_KEY` set? Run `echo $ANTHROPIC_API_KEY` in shell |
| Receipt parser returns 0 items | Check URL format — must be exact pairzon.com domain. Log API response: `console.log(apiRes)` |
| HTML not updating in Replit | Wait 30s for git pull, or manually: `git pull && npm start` |
| Port 3000 already in use | Kill: `pkill -f "node server.js"`, then `npm start` |
| Image upload fails (413) | Reduce image size on client (canvas max 1024px), or increase server limit in `server.js` |
| Hebrew text appears reversed | Ensure `dir="rtl"` on parent `<div>`, not just in CSS |
| localStorage not persisting | Check incognito mode (disabled), or use DevTools → Application → Local Storage to debug |

---

## 📚 External Integrations

| Service | Purpose | Auth | Notes |
|---------|---------|------|-------|
| **Anthropic Claude API** | Recipe generation, vision, chat | `ANTHROPIC_API_KEY` in .env | haiku-4-5 model, ~$0.05/day budget |
| **Pairzon.com API** | Receipt parsing | None (public REST) | Extracts product names from receipt JSON |
| **Replit Deployment** | Hosting | GitHub OAuth | Auto-pulls on `git push`, restarts on server error |

---

## 🎯 Future Roadmap (Priority Order)

1. **Database persistence:** Save user's favorite recipes + fridge history (Firebase/MongoDB)
2. **Mobile app:** React Native wrapper around web app
3. **Meal planner:** Generate weekly plan from recipes + nutrition targets
4. **Barcode scanning:** Mobile camera → scan ingredients → auto-add to fridge
5. **Dietary filters:** Vegan, gluten-free, keto toggles → filter recipes
6. **Grocery integration:** Direct links to buy missing items (Shoppy, Amazon)

---

## 📖 How to Modify Quickly

**Want to change recipe count from 10 to 5?**
- Find `10 מתכוני אוכל ו-10 מתכוני קינוחים` in HTML prompt
- Change to `5 מתכוני אוכל ו-5 מתכוני קינוחים`

**Want different nutrition fields (add fat)?**
- Modify Claude prompt: `"calories":400,"protein":30,"carbs":45,"fat":15`
- Update recipe-card display in `recipeCardHTML()` function (add `nutr-fat` div)

**Want to add new tab (e.g., shopping tips)?**
- Add button: `<button class="tab-btn" onclick="showTab('tips',this)">💡 עצות</button>`
- Add pane: `<div id="pane-tips" style="display:none;">...</div>`
- Update `showTab()` function array: `['food','dessert','favorites','chat','tips']`

**Want to change color scheme?**
- Edit `:root` CSS variables at top of `<style>`
- Test in light mode: Check `html[data-theme="light"]` overrides

---

## ✅ Pre-Commit Checklist

Before pushing:
- [ ] No `console.log()` spam (keep debugging logs minimal)
- [ ] Hebrew text renders correctly (check RTL)
- [ ] No API keys in HTML or git-tracked files
- [ ] Recipe generation tested with real Claude API (not mock)
- [ ] localStorage keys match documented names
- [ ] Replit auto-pull test: wait 30s after push, refresh app
- [ ] Mobile responsive: test on 380px width viewport
- [ ] Dark + light mode both work

---

**Status:** Production-Ready (v2.0 with Chat, Vision, Receipts, Dark Mode, Shopping List)

**Last Updated:** 2026-06-18
