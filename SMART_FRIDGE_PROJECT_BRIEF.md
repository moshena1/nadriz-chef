# 🍳 Smart Fridge - Project Brief

## 📋 סקירה כללית

**מטרה:** אפליקציית ניהול מקרר + מתכונים אוטומטיים עם AI Chef + Nutrition Advisor

**Stack:** HTML5 + Vanilla JS + Claude API (Anthropic)

**Design:** Matte Black Luxury + Responsive (Desktop + Mobile)

---

## 🏗️ Architecture

```
smart-fridge.html (Single File App)
├── HTML Structure
│   ├── Header (Title + Subtitle)
│   ├── Grid Layout
│   │   ├── Panel 1: Ingredient Manager (Input + Tags)
│   │   ├── Panel 2: Actions (Generate + Clear)
│   │   └── Panel 3: Recipe Display (Full Width)
│
├── CSS
│   ├── Dark gradient background (#0a0e27 → #1a1f3a)
│   ├── Glass morphism panels (rgba + backdrop-filter)
│   ├── RTL Support (dir="rtl" for Hebrew)
│   ├── Responsive grid (1 column on mobile, 2 on desktop)
│   └── Color Scheme: White text, mint tags, red error
│
└── JavaScript
    ├── Ingredient Management
    │   ├── addIngredient() - add to array + UI
    │   ├── removeIngredient() - remove from array
    │   ├── updateIngredientList() - render tags
    │   └── localStorage sync
    │
    ├── Recipe Generation
    │   ├── generateRecipes() - API call to Claude
    │   ├── displayRecipes() - parse + render cards
    │   └── Error handling + loading state
    │
    └── Storage Layer
        └── localStorage:
            ├── 'anthropic-api-key' (user sets via console)
            └── 'fridge-ingredients' (auto-save)
```

---

## 💾 Data Flow

```
User Types "עגבנייה"
    ↓
addIngredient() → ingredients array
    ↓
updateIngredientList() → render tags + localStorage.setItem()
    ↓
User Clicks "צור מתכונים"
    ↓
generateRecipes() → Build prompt → fetch() → Claude API
    ↓
Claude Response (JSON/Text with recipes + calories)
    ↓
displayRecipes() → Parse → Render recipe-cards
    ↓
User Sees: Recipe title | Calories | Ingredients | Instructions
```

---

## 🎯 Current Features

- ✅ Add/Remove ingredients (Hebrew RTL)
- ✅ Tags display with X button
- ✅ Claude API integration (recipes + calories)
- ✅ localStorage persistence
- ✅ Dark luxury design (matte black)
- ✅ Responsive (mobile + desktop)
- ✅ Loading state
- ✅ Error handling + API key guide

---

## 📝 Next Steps (TODO)

### Priority 1 (High Value, Low Effort)
- [ ] **Better Recipe Parsing:** Structure Claude response as JSON instead of text → easier to format
- [ ] **Calorie Breakdown:** Extract calories per recipe + total for multiple recipes
- [ ] **Favorites:** Heart button on recipes → save to localStorage
- [ ] **Copy to Clipboard:** Button to copy recipe instructions
- [ ] **Meal Planner:** Mark recipes → auto-generate weekly meal plan

### Priority 2 (Medium)
- [ ] **Image Upload:** User uploads fridge photo → Claude detects ingredients via vision
- [ ] **Dietary Filters:** Add buttons: "Vegan", "Gluten-Free", "Low Calorie" → Filter recipes
- [ ] **Kitchen Tools:** "מה יש לי במטבח" → בואו נשתמש בכלים שיש (blender, oven וכו')
- [ ] **Portion Calculator:** Adjust recipe for X servings → recalc ingredients + calories
- [ ] **Pantry Manager:** Separate "אחסון קבוע" (flour, oil) from "מקרר"

### Priority 3 (Nice to Have)
- [ ] **Recipe Database:** Cache recipes locally → faster reload
- [ ] **Shopping List:** Auto-generate from recipes + missing ingredients
- [ ] **Notifications:** "יש לך 3 אינגרדיינטים שקרוב לתפוגה"
- [ ] **User Preferences:** "אני לא אוכל דגים" → filter recipes
- [ ] **Social Share:** Share recipes via WhatsApp/social

---

## 🔧 How to Extend (for Claude Code)

### To add a new feature:
1. **New Button?** Add to `.input-group` or `.panel` → Add `onclick="functionName()"`
2. **New Storage?** Use `localStorage.setItem(key, JSON.stringify(data))`
3. **New API Call?** Copy `generateRecipes()` function → modify prompt + parsing
4. **New CSS?** Add to `<style>` block → follow existing color scheme

### Example: Add "Favorites" Feature
```javascript
// In JavaScript section:
let favorites = JSON.parse(localStorage.getItem('fridge-favorites')) || [];

function addToFavorites(recipeName) {
    if (!favorites.includes(recipeName)) {
        favorites.push(recipeName);
        localStorage.setItem('fridge-favorites', JSON.stringify(favorites));
    }
}

// In HTML, add to recipe-card:
<button onclick="addToFavorites('${recipeTitle}')">❤️ שמור</button>
```

---

## 🔑 API Key Setup

**User must do once:**
```javascript
// In browser console (F12):
localStorage.setItem('anthropic-api-key', 'sk-ant-xxx...')
```

**Better approach (future):**
- Node.js backend with env variable → proxy API calls
- No API key exposed in browser

---

## 📱 Responsive Design

- **Desktop (>768px):** 2-column grid (ingredients left, recipes full width)
- **Mobile (<768px):** 1-column stack (vertical)
- **All screens:** Readable text, touch-friendly buttons (48px min height)

---

## 🎨 Design System

**Colors:**
- Background: `#0a0e27` (dark navy)
- Text: `#e0e0e0` (light gray)
- Accent (success): `#88dd88` (mint green - calories)
- Accent (tags): `#b0d4ff` (light blue)
- Accent (error): `#ff9999` (light red)
- Borders: `rgba(255, 255, 255, 0.08-0.2)` (subtle white)

**Typography:**
- Font: Segoe UI, Tahoma, Geneva (system font stack)
- Sizes: 2.5em (h1) → 0.75em (labels)
- Weight: 300 (light) for header, 500 (medium) for body
- Letter-spacing: 1-2px (luxury feel)

**Components:**
- Panels: `backdrop-filter: blur(10px)` (glass effect)
- Tags: Pill shape, `border-radius: 20px`
- Buttons: Hover state + active scale (0.98)
- Cards: `grid-template-columns: repeat(auto-fit, minmax(350px, 1fr))`

---

## 🚀 Deployment Options

1. **Netlify/Vercel:** Drag & drop HTML file → live in seconds
2. **GitHub Pages:** Push to repo → auto-deploy
3. **Self-hosted:** Copy to any web server
4. **Mobile:** Works in any mobile browser (no native app needed)

---

## ⚠️ Known Limitations

- API key stored in localStorage (not production-safe) → Need backend proxy for security
- No offline support (requires internet for Claude API)
- No user authentication (anyone can use if key exposed)
- Single-file app (harder to scale) → Consider React if adding 10+ features

---

## 📞 Integration Points (for Future)

- **Backend API:** Node.js + Express (for key management)
- **Database:** Firebase/MongoDB (to save user recipes)
- **Vision AI:** Claude Vision for image ingredient detection
- **Nutrition API:** Integration with USDA/MyFitnessPal for accurate calories
- **Chat Interface:** WebSocket for real-time chef assistant

---

**Status:** MVP Ready → Ready for Claude Code Enhancement

**Last Updated:** 2026-06-17

---

## קובץ HTML (להעלות ל-Claude Code)

ראה את `smart-fridge.html` בקובץ זה או בפרויקט הראשי.
