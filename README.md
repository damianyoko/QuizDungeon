# ESL Quest — English Learning Game

A gamified ESL (English as a Second Language) learning game with 40 high-quality questions across 4 difficulty levels, casino-style minigames, and an intense boss fight.

---

## 🎮 Game Overview

Progress through 4 levels of increasingly difficult English questions:

| Level | Difficulty    | Points/Question | Points to Advance |
|-------|---------------|-----------------|-------------------|
| 1     | Beginner      | 10              | 60                |
| 2     | Intermediate  | 20              | 150               |
| 3     | Advanced      | 35              | 280               |
| 4     | Expert        | 55              | 450               |
| 5     | ⚔️ Boss Fight | 55              | Reach 600 pts!    |

After each level, unlock a **minigame** to gamble your points:
- 🃏 **Blackjack** — Player vs dealer, hit/stand, dealer hits to 17
- 🎡 **Roulette** — 0-36 spin, bet on red/black/even/odd or straight-up (35:1)
- 🎲 **Dice Duel** — Roll 2d6 each, higher wins; double-or-nothing option
- ⬆️⬇️ **High/Low** — Guess if next card is higher/lower, build a streak multiplier

**Boss Fight:** 10-second timer per question, -2 lives per wrong answer, first to 600 points wins!

---

## ⚙️ Setup & Installation

### Prerequisites
- Python 3.8 or higher
- pip

### Install Dependencies

```bash
cd ~/workspace/esl-game
pip install flask
```

### Run the Server

```bash
python server.py
```

The game will be available at: **http://localhost:5000**

### Optional: Use a virtual environment

```bash
python -m venv venv
source venv/bin/activate      # Linux/macOS
# or: venv\Scripts\activate   # Windows

pip install flask
python server.py
```

---

## 📁 Project Structure

```
esl-game/
├── server.py              # Flask web server + API endpoints
├── game_engine.py         # Core game logic, state machine, save/load
├── question_engine.py     # Question loading and level filtering
├── minigame_engine.py     # Casino minigames (blackjack, roulette, dice, high/low)
├── questions.json         # 40 ESL questions (10 per level)
├── gamestate.json         # Auto-saved game state (created on first game)
├── templates/
│   └── index.html         # Single-page app HTML (7 screens)
├── static/
│   ├── style.css          # Complete dark-theme stylesheet
│   └── app.js             # Complete game client (fetch, UI, animations)
└── README.md              # This file
```

---

## 🔌 API Reference

| Method | Endpoint             | Description                                          |
|--------|----------------------|------------------------------------------------------|
| GET    | `/`                  | Serve the game UI                                    |
| POST   | `/api/start`         | Start a new game                                     |
| GET    | `/api/state`         | Get current game state                               |
| POST   | `/api/answer`        | Submit question answer `{question_id, answer}`       |
| POST   | `/api/next_round`    | Advance round/level `{action: "minigame"|"next_level"}` |
| POST   | `/api/minigame/play` | Play a minigame (see below)                          |
| POST   | `/api/boss/answer`   | Submit boss question answer `{question_id, answer}`  |

### Minigame Payload Examples

**Blackjack:**
```json
{ "game": "blackjack", "bet": 20, "action": { "action": "deal" } }
{ "game": "blackjack", "bet": 20, "action": { "action": "hit" } }
{ "game": "blackjack", "bet": 20, "action": { "action": "stand" } }
```

**Roulette:**
```json
{ "game": "roulette", "bet": 15, "action": { "bet_type": "red" } }
{ "game": "roulette", "bet": 15, "action": { "bet_type": "17" } }
```

**Dice:**
```json
{ "game": "dice", "bet": 10, "action": { "double_or_nothing": false } }
```

**High/Low:**
```json
{ "game": "highlow", "bet": 10, "action": {} }
{ "game": "highlow", "bet": 10, "action": { "guess": "high", "current_card": 7, "streak": 2 } }
```

---

## 🎓 Question Categories

- **vocabulary** — Word meanings, synonyms, antonyms, context usage
- **grammar** — Tenses, articles, conditionals, passive voice, modifiers
- **sentence_structure** — Clauses, parallelism, punctuation, word order
- **reading_comprehension** — Short passages, inference, main idea, vocabulary in context

---

## 🎨 Design

- **Dark theme:** `#0f0f13` background, `#1a1a24` cards, `#22c55e` green accent
- Animated grid background, glowing effects
- Smooth screen transitions
- Responsive (mobile-friendly)
- Boss fight: red glow theme, countdown timer

---

## 💾 Save System

Game state is automatically saved to `gamestate.json` on every action. Use **Continue** from the main menu to resume a saved game. High scores are stored in the browser's `localStorage`.

---

## 🛠 Development Notes

- The Flask server runs on `0.0.0.0:5000` with debug mode enabled by default
- For production, disable debug mode and consider using gunicorn:
  ```bash
  pip install gunicorn
  gunicorn -w 1 -b 0.0.0.0:5000 server:app
  ```
- The minigame engine uses time-seeded RNG (not cryptographically secure — this is a game!)
- Single-user design: one game state at a time, one blackjack session in memory

---

## 📝 License

MIT — free to use, modify, and share for educational purposes.
