// ─────────────────────────────────────────────
// ESL Game — Complete Client Application
// ─────────────────────────────────────────────

'use strict';

// ─── State ───────────────────────────────────
const App = {
  gameState: null,
  currentQuestion: null,
  minigameActive: null,       // current minigame name
  bjState: null,              // blackjack hand state
  bjBet: 10,
  hlStreak: 0,
  hlCurrentCard: null,
  bossTimer: null,
  bossTimeLeft: 10,
  bossTimerStarted: false,
  rouletteSpinning: false,
  diceRolling: false,
};

// ─── Utility ─────────────────────────────────
const $ = (id) => document.getElementById(id);
const $$ = (sel, ctx = document) => ctx.querySelectorAll(sel);

function showScreen(screenId) {
  $$('.screen').forEach((s) => s.classList.remove('active'));
  const target = $(screenId);
  if (target) target.classList.add('active');
  if (screenId === 'minigame-select') { setTimeout(initWheelScreen, 50); }

  const gameScreens = ['question-screen', 'minigame-select', 'minigame-play', 'boss-screen'];
  const hud = $('hud');
  if (gameScreens.includes(screenId)) {
    hud.classList.add('visible');
  } else {
    hud.classList.remove('visible');
  }
}

function toast(msg, type = 'info', duration = 3000) {
  const container = $('toast-container');
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.textContent = msg;
  container.appendChild(el);
  setTimeout(() => {
    el.classList.add('hiding');
    setTimeout(() => el.remove(), 300);
  }, duration);
}

async function apiFetch(url, options = {}) {
  try {
    const res = await fetch(url, {
      headers: { 'Content-Type': 'application/json', ...options.headers },
      ...options,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
  } catch (err) {
    console.error('API error:', err);
    toast(`Error: ${err.message}`, 'error');
    throw err;
  }
}

// ─── High Score (localStorage) ───────────────
function getLocalHighScore() {
  return parseInt(localStorage.getItem('esl_high_score') || '0', 10);
}

function setLocalHighScore(score) {
  const current = getLocalHighScore();
  if (score > current) {
    localStorage.setItem('esl_high_score', score);
    return true;
  }
  return false;
}

// ─── HUD ─────────────────────────────────────
function updateHUD(state) {
  if (!state) return;
  const livesArr = Array.from({ length: 5 }, (_, i) =>
    i < state.lives ? '❤️' : '🖤'
  ).join('');
  $('hud-lives').querySelector('.hud-val').textContent = livesArr;
  $('hud-points').querySelector('.hud-val').textContent = state.points;

  const levelNames = { 1: 'Beginner', 2: 'Intermediate', 3: 'Advanced', 4: 'Expert', 5: '⚔️ BOSS' };
  $('hud-level').querySelector('.hud-val').textContent = levelNames[state.level] || `L${state.level}`;

  // Progress
  const answered = state.current_question_index || 0;
  const total = state.total_questions_this_round || 10;
  const pct = Math.min(100, (answered / total) * 100);
  $('hud-progress-bar').style.width = pct + '%';
  $('hud-progress-text').textContent = `${answered}/${total}`;
}

// ─── Main Menu ────────────────────────────────
async function initMainMenu() {
  const hs = getLocalHighScore();
  $('menu-high-score').textContent = hs;
  showScreen('main-menu');
}

async function startNewGame() {
  const nameInput = document.getElementById('player-name-input');
  const nameError = document.getElementById('name-error');
  const playerName = nameInput ? nameInput.value.trim() : '';
  if (nameInput && !playerName) {
    if (nameError) nameError.style.display = 'block';
    nameInput.focus();
    return;
  }
  if (nameError) nameError.style.display = 'none';
  App.playerName = playerName || 'Anonymous';
  try {
    const state = await apiFetch('/api/start', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ player_name: App.playerName })
    });
    App.gameState = state;
    updateHUD(state);
    renderQuestion(state);
    showScreen('question-screen');
  } catch (e) {
    // error already toasted
  }
}

async function loadSavedGame() {
  try {
    const state = await apiFetch('/api/state');
    if (!state || state.phase === 'gameover' || state.phase === 'victory') {
      toast('No active game. Starting new game...', 'info');
      await startNewGame();
      return;
    }
    App.gameState = state;
    updateHUD(state);
    resumeGame(state);
  } catch (e) {
    // error toasted
  }
}

function resumeGame(state) {
  switch (state.phase) {
    case 'question':
      renderQuestion(state);
      showScreen('question-screen');
      break;
    case 'minigame':
      showScreen('minigame-select');
      break;
    case 'boss':
      renderBossQuestion(state);
      showScreen('boss-screen');
      break;
    case 'gameover':
      showGameOver(state);
      break;
    case 'victory':
      showVictory(state);
      break;
    default:
      renderQuestion(state);
      showScreen('question-screen');
  }
}

// ─── Question Screen ──────────────────────────
function categoryDisplay(cat) {
  const map = {
    vocabulary: '📖 Vocabulary',
    grammar: '✏️ Grammar',
    sentence_structure: '🔗 Sentence Structure',
    reading_comprehension: '📚 Reading',
  };
  return map[cat] || cat;
}

function renderQuestion(state) {
  const q = state.current_question;
  if (!q) {
    // Round complete
    handleRoundComplete(state);
    return;
  }

  App.currentQuestion = q;
  updateHUD(state);

  $('q-category').textContent = categoryDisplay(q.category);
  const levelNames = ['', 'Beginner', 'Intermediate', 'Advanced', 'Expert'];
  $('q-level-badge').textContent = levelNames[q.level] || `Level ${q.level}`;
  $('q-counter').textContent = `${(state.current_question_index || 0)} / ${state.total_questions_this_round}`;
  $('q-text').textContent = q.question;

  const optionsGrid = $('options-grid');
  optionsGrid.innerHTML = '';
  q.options.forEach((opt, idx) => {
    const letter = String.fromCharCode(65 + idx);
    const btn = document.createElement('button');
    btn.className = 'option-btn';
    btn.dataset.answer = letter;
    btn.innerHTML = `<span class="option-key">${letter}</span><span class="option-text">${opt.replace(/^[A-D]\.\s*/, '')}</span>`;
    btn.addEventListener('click', () => submitAnswer(letter, btn));
    optionsGrid.appendChild(btn);
  });

  // Reset feedback
  const feedback = $('feedback-area');
  feedback.className = 'feedback-area';
  feedback.innerHTML = '';

  $('next-question-btn').style.display = 'none';
  $('finish-round-btn').style.display = 'none';
}

async function submitAnswer(answer, clickedBtn) {
  if (!App.currentQuestion) return;

  // Disable all options
  $$('.option-btn', $('options-grid')).forEach((b) => (b.disabled = true));

  try {
    const result = await apiFetch('/api/answer', {
      method: 'POST',
      body: JSON.stringify({
        question_id: App.currentQuestion.id,
        answer,
      }),
    });

    App.gameState = { ...App.gameState, ...result };

    // Highlight correct/wrong
    $$('.option-btn', $('options-grid')).forEach((btn) => {
      if (btn.dataset.answer === result.correct_answer) {
        btn.classList.add('correct');
      } else if (btn === clickedBtn && !result.correct) {
        btn.classList.add('wrong');
      }
    });

    // Feedback
    const feedback = $('feedback-area');
    if (result.correct) {
      feedback.className = 'feedback-area correct show';
      feedback.innerHTML = `
        <span class="feedback-icon">✅</span>
        <div>
          <div class="feedback-points">+${result.points_earned} points!</div>
          <div class="feedback-text">${result.explanation}</div>
        </div>`;
    } else {
      feedback.className = 'feedback-area wrong show';
      feedback.innerHTML = `
        <span class="feedback-icon">❌</span>
        <div>
          <div class="feedback-points">-1 life</div>
          <div class="feedback-text">${result.explanation}</div>
        </div>`;
    }

    updateHUD({
      lives: result.lives_remaining,
      points: result.points,
      level: App.gameState.level,
      current_question_index: (App.gameState.current_question_index || 0),
      total_questions_this_round: App.gameState.total_questions_this_round,
    });

    if (result.game_over) {
      setTimeout(() => showGameOver({ points: result.points, lives: 0, level: App.gameState.level }), 1500);
      return;
    }

    if (result.round_complete) {
      $('next-question-btn').style.display = 'none';
      $('finish-round-btn').style.display = 'block';
    } else {
      $('next-question-btn').style.display = 'block';
    }
  } catch (e) {
    // already toasted
  }
}

async function loadNextQuestion() {
  try {
    const state = await apiFetch('/api/state');
    App.gameState = state;
    if (!state.current_question) {
      handleRoundComplete(state);
      return;
    }
    renderQuestion(state);
  } catch (e) {
    // already toasted
  }
}

function handleRoundComplete(state) {
  // Check if level complete
  const pointsNeeded = { 1: 60, 2: 150, 3: 280, 4: 450 };
  const required = pointsNeeded[state.level];
  if (required && state.points >= required) {
    toast(`Level ${state.level} complete! 🎉 Head to the minigame!`, 'success', 3000);
  }
  showMinigameSelect();
}

async function finishRound() {
  showMinigameSelect();
}

// ─── Minigame Select ─────────────────────────
function showMinigameSelect() {
  updateHUD(App.gameState);
  showScreen('minigame-select');
}

function selectMinigame(game) {
  App.minigameActive = game;
  App.bjState = null;
  App.hlStreak = 0;
  App.hlCurrentCard = null;
  renderMinigamePlay(game);
  showScreen('minigame-play');
}

// ─── Minigame Play ────────────────────────────
function renderMinigamePlay(game) {
  const titles = {
    blackjack: '🃏 Blackjack',
    roulette: '🎡 Roulette',
    dice: '🎲 Dice Duel',
    highlow: '⬆️⬇️ High / Low',
  };
  const descs = {
    blackjack: 'Beat the dealer! Get closer to 21 without busting.',
    roulette: 'Spin the wheel! Bet on color, parity, or a number.',
    dice: 'Roll 2d6! Higher total wins. Risk it for double-or-nothing.',
    highlow: 'Guess if the next card is higher or lower! Build a streak!',
  };

  $('mg-title').textContent = titles[game] || game;
  $('mg-desc').textContent = descs[game] || '';
  $('mg-result').className = 'result-message';
  $('mg-result').textContent = '';
  const pointsEl = $('mg-points-display');
  if (pointsEl) pointsEl.textContent = (App.gameState?.points ?? 0) + ' pts';

  const gameArea = $('game-area');
  gameArea.innerHTML = '';

  const maxBet = Math.max(1, App.gameState?.points || 100);
  const defaultBet = Math.min(10, maxBet);

  const betHtml = `
    <div class="bet-control">
      <span class="text-muted" style="font-size:0.9rem">Bet:</span>
      <input type="number" id="bet-input" class="bet-input" value="${defaultBet}" min="1" max="${maxBet}" />
      <span id="max-bet-label" class="text-muted" style="font-size:0.8rem">max: ${maxBet}</span>
    </div>`;

  if (game === 'blackjack') {
    gameArea.innerHTML = `
      <div>
        <div style="color:var(--text-secondary);font-size:0.85rem;margin-bottom:4px">Dealer</div>
        <div id="dealer-cards" class="cards-display"></div>
        <div id="dealer-value" class="hand-value" style="margin-top:6px">–</div>
      </div>
      <div>
        <div style="color:var(--text-secondary);font-size:0.85rem;margin-bottom:4px">You</div>
        <div id="player-cards" class="cards-display"></div>
        <div id="player-value" class="hand-value" style="margin-top:6px">–</div>
      </div>
      ${betHtml}
      <div style="display:flex;gap:10px;flex-wrap:wrap;justify-content:center">
        <button class="btn btn-primary" id="bj-deal-btn" onclick="bjAction('deal')">Deal</button>
        <button class="btn btn-secondary" id="bj-hit-btn" onclick="bjAction('hit')" disabled>Hit</button>
        <button class="btn btn-secondary" id="bj-stand-btn" onclick="bjAction('stand')" disabled>Stand</button>
      </div>`;
  } else if (game === 'roulette') {
    gameArea.innerHTML = `
      <div class="roulette-wheel" id="roulette-wheel">
        <div class="roulette-center" id="roulette-result">?</div>
      </div>
      ${betHtml}
      <div class="roulette-bets">
        <button class="btn btn-secondary" onclick="playRoulette('red')">🔴 Red (1:1)</button>
        <button class="btn btn-secondary" onclick="playRoulette('black')">⚫ Black (1:1)</button>
        <button class="btn btn-secondary" onclick="playRoulette('even')">2️⃣ Even (1:1)</button>
        <button class="btn btn-secondary" onclick="playRoulette('odd')">1️⃣ Odd (1:1)</button>
      </div>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
        <input type="number" id="straight-up-num" placeholder="0-36" min="0" max="36" style="width:80px;padding:8px;background:var(--bg-secondary);border:2px solid var(--border-color);border-radius:var(--radius-sm);color:var(--text-primary);font-size:0.9rem" />
        <button class="btn btn-outline" onclick="playRouletteStraight()">Straight Up (35:1)</button>
      </div>`;
  } else if (game === 'dice') {
    gameArea.innerHTML = `
      <div class="dice-display">
        <div>
          <div style="color:var(--text-secondary);font-size:0.8rem;text-align:center;margin-bottom:8px">You</div>
          <div class="dice-group">
            <div class="die" id="p-die1">🎲</div>
            <div class="die" id="p-die2">🎲</div>
          </div>
          <div style="text-align:center;font-weight:700;color:var(--accent-yellow);margin-top:6px" id="p-total">–</div>
        </div>
        <div class="vs-text">VS</div>
        <div>
          <div style="color:var(--text-secondary);font-size:0.8rem;text-align:center;margin-bottom:8px">Dealer</div>
          <div class="dice-group">
            <div class="die" id="d-die1">🎲</div>
            <div class="die" id="d-die2">🎲</div>
          </div>
          <div style="text-align:center;font-weight:700;color:var(--accent-yellow);margin-top:6px" id="d-total">–</div>
        </div>
      </div>
      ${betHtml}
      <div style="display:flex;gap:10px;flex-wrap:wrap;justify-content:center">
        <button class="btn btn-primary" onclick="playDice(false)">🎲 Roll!</button>
        <button class="btn btn-secondary" id="double-btn" onclick="playDice(true)" disabled>✖2 Double or Nothing</button>
      </div>`;
  } else if (game === 'highlow') {
    gameArea.innerHTML = `
      <div class="highlow-card">
        <div class="streak-display" id="hl-streak">Streak: 0 (×1.0)</div>
        <div class="big-card" id="hl-card">?</div>
        <div style="color:var(--text-secondary);font-size:0.85rem" id="hl-instruction">Starting card...</div>
      </div>
      ${betHtml}
      <div style="display:flex;gap:10px;flex-wrap:wrap;justify-content:center">
        <button class="btn btn-primary" id="hl-high-btn" onclick="playHighLow('high')" disabled>⬆️ Higher</button>
        <button class="btn btn-secondary" id="hl-low-btn" onclick="playHighLow('low')" disabled>⬇️ Lower</button>
        <button class="btn btn-outline" id="hl-start-btn" onclick="hlStartGame()">▶ Start</button>
      </div>`;
  }
}

// ─── Blackjack ────────────────────────────────
const CARD_SUITS_RED = ['♥', '♦'];
function cardHtml(name) {
  const redCards = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
  // Simple: face cards/even index = red, odd = black
  const faceVal = name === 'A' ? 1 : (name === 'J' ? 11 : name === 'Q' ? 12 : name === 'K' ? 13 : parseInt(name));
  const isRed = (faceVal % 2 === 0);
  if (name === '?') return `<div class="playing-card hidden"></div>`;
  return `<div class="playing-card ${isRed ? 'red-card' : ''}">${name}</div>`;
}

async function bjAction(action) {
  const bet = parseInt($('bet-input')?.value || '10', 10);
  App.bjBet = bet;

  const body = {
    game: 'blackjack',
    bet,
    action: { action },
  };

  if (action !== 'deal' && App.bjState) {
    body.action._state = App.bjState;
  }

  // On stand, pass the full state
  if ((action === 'hit' || action === 'stand') && App.bjState) {
    body.action = { action, ...App.bjState };
  }

  try {
    const res = await apiFetch('/api/minigame/play', {
      method: 'POST',
      body: JSON.stringify(body),
    });
    handleBJResult(res, action);
  } catch (e) {}
}

function handleBJResult(res, action) {
  if (res.error) { toast(res.error, 'error'); return; }

  if (res.player_hand) {
    const pc = $('player-cards');
    const dc = $('dealer-cards');
    if (pc) pc.innerHTML = res.player_hand.map(cardHtml).join('');
    if (dc) dc.innerHTML = res.dealer_hand.map(cardHtml).join('');
    if ($('player-value')) $('player-value').textContent = res.player_value || '–';
    if ($('dealer-value')) $('dealer-value').textContent = res.dealer_value || '–';
  }

  if (res.game_over) {
    App.bjState = null;
    showMGResult(res.message, res.result);
    updatePointsDisplay(res.current_points);
    $('bj-deal-btn')?.removeAttribute('disabled');
    $('bj-hit-btn')?.setAttribute('disabled', true);
    $('bj-stand-btn')?.setAttribute('disabled', true);
  } else {
    // Store state for next action
    if (res._state) App.bjState = res._state;
    else if (action === 'deal') {
      // Reconstruct state from response (server strips _state)
      // We need to re-fetch or store before stripping
      App.bjState = null; // Will rely on server session
    }
    $('bj-deal-btn')?.setAttribute('disabled', true);
    $('bj-hit-btn')?.removeAttribute('disabled');
    $('bj-stand-btn')?.removeAttribute('disabled');
  }
}

// ─── Roulette ─────────────────────────────────
async function playRoulette(betType) {
  if (App.rouletteSpinning) return;
  App.rouletteSpinning = true;
  const bet = parseInt($('bet-input')?.value || '10', 10);

  // Spin animation
  const wheel = $('roulette-wheel');
  if (wheel) {
    const deg = 1440 + Math.random() * 360;
    wheel.style.transform = `rotate(${deg}deg)`;
  }
  const resultEl = $('roulette-result');
  if (resultEl) resultEl.textContent = '...';

  try {
    const res = await apiFetch('/api/minigame/play', {
      method: 'POST',
      body: JSON.stringify({ game: 'roulette', bet, action: { bet_type: betType } }),
    });
    setTimeout(() => {
      App.rouletteSpinning = false;
      if (resultEl) {
        const colorEmoji = { red: '🔴', black: '⚫', green: '🟢' };
        resultEl.textContent = res.spin ?? '?';
      }
      showMGResult(res.message, res.result);
      updatePointsDisplay(res.current_points);
    }, 1600);
  } catch (e) {
    App.rouletteSpinning = false;
  }
}

async function playRouletteStraight() {
  const num = parseInt($('straight-up-num')?.value || '-1', 10);
  if (isNaN(num) || num < 0 || num > 36) {
    toast('Enter a number 0-36', 'error');
    return;
  }
  await playRoulette(String(num));
}

// ─── Dice ─────────────────────────────────────
const DIE_FACES = ['', '⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];

async function playDice(doubleOrNothing) {
  if (App.diceRolling) return;
  App.diceRolling = true;
  const bet = parseInt($('bet-input')?.value || '10', 10);

  // Rolling animation
  ['p-die1', 'p-die2', 'd-die1', 'd-die2'].forEach((id) => {
    const el = $(id);
    if (el) el.classList.add('rolling');
  });
  const pTotal = $('p-total'), dTotal = $('d-total');
  if (pTotal) pTotal.textContent = '...';
  if (dTotal) dTotal.textContent = '...';

  try {
    const res = await apiFetch('/api/minigame/play', {
      method: 'POST',
      body: JSON.stringify({ game: 'dice', bet, action: { double_or_nothing: doubleOrNothing } }),
    });
    setTimeout(() => {
      App.diceRolling = false;
      ['p-die1', 'p-die2', 'd-die1', 'd-die2'].forEach((id) => {
        const el = $(id);
        if (el) el.classList.remove('rolling');
      });
      if (res.player_dice) {
        const pd1 = $('p-die1'), pd2 = $('p-die2');
        const dd1 = $('d-die1'), dd2 = $('d-die2');
        if (pd1) pd1.textContent = DIE_FACES[res.player_dice[0]] || res.player_dice[0];
        if (pd2) pd2.textContent = DIE_FACES[res.player_dice[1]] || res.player_dice[1];
        if (dd1) dd1.textContent = DIE_FACES[res.dealer_dice[0]] || res.dealer_dice[0];
        if (dd2) dd2.textContent = DIE_FACES[res.dealer_dice[1]] || res.dealer_dice[1];
        if (pTotal) pTotal.textContent = res.player_total;
        if (dTotal) dTotal.textContent = res.dealer_total;
      }
      showMGResult(res.message, res.result);
      updatePointsDisplay(res.current_points);

      // Enable double-or-nothing only after a win
      const doubleBtn = $('double-btn');
      if (doubleBtn) {
        if (res.result === 'win') {
          doubleBtn.removeAttribute('disabled');
        } else {
          doubleBtn.setAttribute('disabled', true);
        }
      }
    }, 700);
  } catch (e) {
    App.diceRolling = false;
    ['p-die1', 'p-die2', 'd-die1', 'd-die2'].forEach((id) => {
      const el = $(id);
      if (el) el.classList.remove('rolling');
    });
  }
}

// ─── High / Low ───────────────────────────────
async function hlStartGame() {
  const bet = parseInt($('bet-input')?.value || '10', 10);
  try {
    const res = await apiFetch('/api/minigame/play', {
      method: 'POST',
      body: JSON.stringify({ game: 'highlow', bet, action: {} }),
    });
    App.hlCurrentCard = res.current_card;
    App.hlStreak = 0;
    const cardEl = $('hl-card');
    if (cardEl) cardEl.textContent = res.card_name || res.current_card;
    const instrEl = $('hl-instruction');
    if (instrEl) instrEl.textContent = 'Will the next card be higher or lower?';
    $('hl-high-btn')?.removeAttribute('disabled');
    $('hl-low-btn')?.removeAttribute('disabled');
    $('hl-start-btn')?.setAttribute('disabled', true);
    updateStreakDisplay(0);
    $('mg-result').className = 'result-message';
    $('mg-result').textContent = '';
  } catch (e) {}
}

async function playHighLow(guess) {
  const bet = parseInt($('bet-input')?.value || '10', 10);
  try {
    const res = await apiFetch('/api/minigame/play', {
      method: 'POST',
      body: JSON.stringify({
        game: 'highlow',
        bet,
        action: {
          guess,
          current_card: App.hlCurrentCard,
          streak: App.hlStreak,
        },
      }),
    });

    const cardEl = $('hl-card');
    if (cardEl && res.next_card_name) cardEl.textContent = res.next_card_name;

    if (res.result === 'push') {
      showMGResult(res.message, 'push');
      App.hlCurrentCard = res.next_card;
    } else if (res.result === 'win') {
      App.hlCurrentCard = res.next_card;
      App.hlStreak = res.new_streak;
      updateStreakDisplay(App.hlStreak);
      showMGResult(res.message, 'win');
      updatePointsDisplay(res.current_points);
    } else {
      // Lose — reset
      App.hlCurrentCard = null;
      App.hlStreak = 0;
      updateStreakDisplay(0);
      showMGResult(res.message, 'lose');
      updatePointsDisplay(res.current_points);
      $('hl-high-btn')?.setAttribute('disabled', true);
      $('hl-low-btn')?.setAttribute('disabled', true);
      $('hl-start-btn')?.removeAttribute('disabled');
      const instrEl = $('hl-instruction');
      if (instrEl) instrEl.textContent = 'Game over! Press Start for a new round.';
    }
  } catch (e) {}
}

function updateStreakDisplay(streak) {
  const mult = (1 + streak * 0.5).toFixed(1);
  const el = $('hl-streak');
  if (el) el.textContent = `Streak: ${streak} (×${mult})`;
}

// ─── Minigame Shared ─────────────────────────
function showMGResult(message, resultType) {
  const el = $('mg-result');
  if (!el) return;
  el.textContent = message;
  el.className = `result-message show ${resultType || ''}`;
}

function updatePointsDisplay(points) {
  if (points !== undefined && App.gameState) {
    App.gameState.points = points;
    const hudPoints = $('hud-points');
    if (hudPoints) hudPoints.querySelector('.hud-val').textContent = points;
    const mgPts = $('mg-points-display');
    if (mgPts) mgPts.textContent = points + ' pts';
    setLocalHighScore(points);
  }
}

async function leaveMiniGame() {
  // Advance to next level
  try {
    const state = await apiFetch('/api/next_round', {
      method: 'POST',
      body: JSON.stringify({ action: 'next_level' }),
    });
    App.gameState = state;
    updateHUD(state);
    if (state.phase === 'boss') {
      renderBossQuestion(state);
      showScreen('boss-screen');
    } else if (state.phase === 'question') {
      renderQuestion(state);
      showScreen('question-screen');
    } else if (state.phase === 'victory') {
      showVictory(state);
    }
  } catch (e) {}
}

// ─── Boss Screen ──────────────────────────────
function renderBossQuestion(state) {
  const q = state.current_question;
  if (!q) return;
  App.currentQuestion = q;

  $('boss-q-text').textContent = q.question;
  $('boss-q-category').textContent = categoryDisplay(q.category);

  const optionsGrid = $('boss-options-grid');
  optionsGrid.innerHTML = '';
  q.options.forEach((opt, idx) => {
    const letter = String.fromCharCode(65 + idx);
    const btn = document.createElement('button');
    btn.className = 'option-btn';
    btn.dataset.answer = letter;
    btn.innerHTML = `<span class="option-key">${letter}</span><span class="option-text">${opt.replace(/^[A-D]\.\s*/, '')}</span>`;
    btn.addEventListener('click', () => submitBossAnswer(letter, btn));
    optionsGrid.appendChild(btn);
  });

  $('boss-feedback').className = 'feedback-area';
  $('boss-feedback').innerHTML = '';

  // Update goal
  const goalEl = $('boss-goal-progress');
  if (goalEl) goalEl.textContent = `${state.points} / 600 pts`;

  startBossTimer(10);
}

function startBossTimer(seconds) {
  clearBossTimer();
  App.bossTimeLeft = seconds;
  App.bossTimerStarted = true;

  const timerDisplay = $('boss-timer-display');
  const timerBar = $('boss-timer-bar');

  function tick() {
    if (!App.bossTimerStarted) return;
    if (timerDisplay) timerDisplay.textContent = App.bossTimeLeft;
    if (timerBar) timerBar.style.width = `${(App.bossTimeLeft / seconds) * 100}%`;

    if (App.bossTimeLeft <= 3) {
      timerDisplay?.classList.add('urgent');
    } else {
      timerDisplay?.classList.remove('urgent');
    }

    if (App.bossTimeLeft <= 0) {
      // Time's up — auto-submit wrong answer
      timeoutBossQuestion();
      return;
    }
    App.bossTimeLeft--;
    App.bossTimer = setTimeout(tick, 1000);
  }
  tick();
}

function clearBossTimer() {
  App.bossTimerStarted = false;
  if (App.bossTimer) {
    clearTimeout(App.bossTimer);
    App.bossTimer = null;
  }
}

async function timeoutBossQuestion() {
  clearBossTimer();
  $$('.option-btn', $('boss-options-grid')).forEach((b) => (b.disabled = true));

  const feedback = $('boss-feedback');
  if (feedback) {
    feedback.className = 'feedback-area wrong show';
    feedback.innerHTML = `<span class="feedback-icon">⏰</span><div><div class="feedback-points">Time's up! -2 lives</div></div>`;
  }

  try {
    const result = await apiFetch('/api/boss/answer', {
      method: 'POST',
      body: JSON.stringify({
        question_id: App.currentQuestion?.id,
        answer: 'X', // Deliberately wrong
      }),
    });
    App.gameState = { ...App.gameState, ...result };
    updateHUD({ lives: result.lives_remaining, points: result.points, level: 5, current_question_index: 0, total_questions_this_round: 10 });

    if (result.game_over) {
      setTimeout(() => showGameOver({ points: result.points, lives: 0, level: 5 }), 1500);
    } else if (result.victory) {
      setTimeout(() => showVictory({ points: result.points }), 1000);
    } else {
      setTimeout(() => loadNextBossQuestion(), 2000);
    }
  } catch (e) {}
}

async function submitBossAnswer(answer, clickedBtn) {
  if (!App.currentQuestion) return;
  clearBossTimer();
  $$('.option-btn', $('boss-options-grid')).forEach((b) => (b.disabled = true));

  try {
    const result = await apiFetch('/api/boss/answer', {
      method: 'POST',
      body: JSON.stringify({ question_id: App.currentQuestion.id, answer }),
    });
    App.gameState = { ...App.gameState, ...result };

    $$('.option-btn', $('boss-options-grid')).forEach((btn) => {
      if (btn.dataset.answer === result.correct_answer) btn.classList.add('correct');
      else if (btn === clickedBtn && !result.correct) btn.classList.add('wrong');
    });

    const feedback = $('boss-feedback');
    if (result.correct) {
      feedback.className = 'feedback-area correct show';
      feedback.innerHTML = `<span class="feedback-icon">✅</span><div><div class="feedback-points">+${result.points_earned} pts!</div><div class="feedback-text">${result.explanation}</div></div>`;
    } else {
      feedback.className = 'feedback-area wrong show';
      feedback.innerHTML = `<span class="feedback-icon">❌</span><div><div class="feedback-points">-2 lives!</div><div class="feedback-text">${result.explanation}</div></div>`;
    }

    updateHUD({ lives: result.lives_remaining, points: result.points, level: 5, current_question_index: 0, total_questions_this_round: 10 });

    const goalEl = $('boss-goal-progress');
    if (goalEl) goalEl.textContent = `${result.points} / 600 pts`;

    if (result.game_over) {
      setTimeout(() => showGameOver({ points: result.points, lives: 0, level: 5 }), 1500);
    } else if (result.victory) {
      setTimeout(() => showVictory({ points: result.points }), 800);
    } else {
      setTimeout(loadNextBossQuestion, 2000);
    }
  } catch (e) {}
}

async function loadNextBossQuestion() {
  try {
    const state = await apiFetch('/api/state');
    App.gameState = state;
    renderBossQuestion(state);
  } catch (e) {}
}

// ─── Game Over ────────────────────────────────
function showGameOver(state) {
  submitScore(data?.points || 0, data?.level || 1);
  clearBossTimer();
  const score = state.points || 0;
  const isNewRecord = setLocalHighScore(score);

  $('gameover-score').textContent = score;

  const hsEl = $('gameover-hs');
  if (isNewRecord) {
    hsEl.innerHTML = `🏆 New High Score!`;
    hsEl.style.color = 'var(--accent-yellow)';
  } else {
    hsEl.innerHTML = `Best: ${getLocalHighScore()} pts`;
    hsEl.style.color = 'var(--text-secondary)';
  }

  showScreen('gameover-screen');
}

// ─── Victory ─────────────────────────────────
function showVictory(state) {
  submitScore(data?.points || 0, data?.level || 5);
  clearBossTimer();
  const score = state.points || 0;
  const isNewRecord = setLocalHighScore(score);

  $('victory-score').textContent = score;
  const vsHs = $('victory-hs');
  if (isNewRecord) {
    vsHs.textContent = `🏆 New High Score!`;
    vsHs.style.color = 'var(--accent-yellow)';
  } else {
    vsHs.textContent = `Best: ${getLocalHighScore()} pts`;
    vsHs.style.color = 'var(--text-secondary)';
  }

  showScreen('victory-screen');
  spawnConfetti();
}

function spawnConfetti() {
  const container = $('confetti-wrap');
  if (!container) return;
  container.innerHTML = '';
  const colors = ['#22c55e', '#eab308', '#3b82f6', '#ef4444', '#a855f7', '#f97316'];
  for (let i = 0; i < 80; i++) {
    const el = document.createElement('div');
    el.className = 'confetti-piece';
    el.style.left = Math.random() * 100 + 'vw';
    el.style.background = colors[Math.floor(Math.random() * colors.length)];
    el.style.width = (6 + Math.random() * 8) + 'px';
    el.style.height = (6 + Math.random() * 8) + 'px';
    el.style.borderRadius = Math.random() > 0.5 ? '50%' : '2px';
    const duration = 2 + Math.random() * 3;
    const delay = Math.random() * 1.5;
    el.style.animation = `confettiFall ${duration}s ${delay}s linear forwards`;
    container.appendChild(el);
  }
}

// ─── Event Listeners ─────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  // Main menu buttons
  $('btn-new-game')?.addEventListener('click', startNewGame);
  $('btn-continue')?.addEventListener('click', loadSavedGame);
  $('btn-how-to-play')?.addEventListener('click', () => {
    toast('Answer questions to earn points. Complete rounds to unlock minigames. Reach 600pts in the Boss fight to win!', 'info', 6000);
  });

  // Question screen
  $('next-question-btn')?.addEventListener('click', loadNextQuestion);
  $('finish-round-btn')?.addEventListener('click', finishRound);

  // Minigame select
    document.getElementById('btn-leaderboard')?.addEventListener('click', showLeaderboard);

  $$('.minigame-card').forEach((card) => {
    card.addEventListener('click', () => selectMinigame(card.dataset.game));
  });

  // Minigame play: leave / continue
  $('mg-continue-btn')?.addEventListener('click', leaveMiniGame);
  $('mg-back-btn')?.addEventListener('click', showMinigameSelect);

  // Game over / victory
  $('gameover-restart-btn')?.addEventListener('click', startNewGame);
  $('gameover-menu-btn')?.addEventListener('click', () => { showScreen('main-menu'); $('menu-high-score').textContent = getLocalHighScore(); });
  $('victory-restart-btn')?.addEventListener('click', startNewGame);
  $('victory-menu-btn')?.addEventListener('click', () => { showScreen('main-menu'); $('menu-high-score').textContent = getLocalHighScore(); });

  // Init
  $('menu-high-score').textContent = getLocalHighScore();
  showScreen('main-menu');
});


// ══════════════════════════════════════════════════════════
//  SPIN WHEEL
// ══════════════════════════════════════════════════════════
const WHEEL_SEGMENTS = [
  { game: 'blackjack', label: 'Blackjack', color: '#3b82f6' },
  { game: 'highlow',   label: 'High / Low', color: '#22c55e' },
  { game: 'dice',      label: 'Dice Duel',  color: '#f59e0b' },
  { game: 'roulette',  label: 'Roulette',   color: '#ef4444' },
];

let wheelAngle = 0;       // current rotation in degrees
let wheelSpinning = false;
let wheelSelected = null;

function drawWheel(angle) {
  const canvas = document.getElementById('spin-wheel');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const cx = canvas.width / 2;
  const cy = canvas.height / 2;
  const r = cx - 4;
  const n = WHEEL_SEGMENTS.length;
  const arc = (2 * Math.PI) / n;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  WHEEL_SEGMENTS.forEach((seg, i) => {
    const start = (angle * Math.PI / 180) + i * arc;
    const end = start + arc;
    const mid = start + arc / 2;

    // Segment fill
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, r, start, end);
    ctx.closePath();
    ctx.fillStyle = seg.color;
    ctx.fill();
    ctx.strokeStyle = '#0f0f13';
    ctx.lineWidth = 3;
    ctx.stroke();

    // Label — always readable (flip if facing left half)
    ctx.save();
    ctx.translate(cx, cy);
    // Normalise mid angle to 0..2PI
    const normMid = ((mid % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    const facingLeft = normMid > Math.PI / 2 && normMid < 3 * Math.PI / 2;
    if (facingLeft) {
      ctx.rotate(mid + Math.PI);
      ctx.textAlign = 'left';
      ctx.fillStyle = 'rgba(255,255,255,0.95)';
      ctx.font = 'bold 14px system-ui, sans-serif';
      ctx.shadowColor = 'rgba(0,0,0,0.7)';
      ctx.shadowBlur = 4;
      ctx.fillText(seg.label, -(r - 14), 5);
    } else {
      ctx.rotate(mid);
      ctx.textAlign = 'right';
      ctx.fillStyle = 'rgba(255,255,255,0.95)';
      ctx.font = 'bold 14px system-ui, sans-serif';
      ctx.shadowColor = 'rgba(0,0,0,0.7)';
      ctx.shadowBlur = 4;
      ctx.fillText(seg.label, r - 14, 5);
    }
    ctx.restore();
  });

  // Centre circle
  ctx.beginPath();
  ctx.arc(cx, cy, 28, 0, 2 * Math.PI);
  ctx.fillStyle = '#0f0f13';
  ctx.fill();
  ctx.strokeStyle = '#ffffff22';
  ctx.lineWidth = 2;
  ctx.stroke();
}

function spinWheel() {
  if (wheelSpinning) return;
  wheelSpinning = true;

  // Hide result, disable button
  const resultEl = document.getElementById('wheel-result');
  const btnEl    = document.getElementById('wheel-spin-btn');
  if (resultEl) resultEl.style.display = 'none';
  if (btnEl) { btnEl.disabled = true; btnEl.textContent = 'Spinning…'; }

  // Pick a random segment (pointer is at top = 270° = -90°)
  const n = WHEEL_SEGMENTS.length;
  const arc = 360 / n;
  const targetIdx = Math.floor(Math.random() * n);
  // Pointer is at top (270°). Segment i centre is at i*arc + arc/2.
  // We need rotation R so that: (R + i*arc + arc/2) % 360 == 270
  // => R = (270 - i*arc - arc/2 + 360) % 360
  const targetAngle = (270 - (targetIdx * arc + arc / 2) + 720) % 360;
  const extraSpins = 5 + Math.floor(Math.random() * 4); // 5–8 full rotations
  const finalAngle = extraSpins * 360 + targetAngle;

  const duration = 4000 + Math.random() * 1000; // 4–5s
  const start = performance.now();
  const startAngle = wheelAngle % 360;

  function easeOut(t) {
    return 1 - Math.pow(1 - t, 4);
  }

  function animate(now) {
    const elapsed = now - start;
    const progress = Math.min(elapsed / duration, 1);
    const eased = easeOut(progress);
    wheelAngle = startAngle + finalAngle * eased;
    drawWheel(wheelAngle);

    if (progress < 1) {
      requestAnimationFrame(animate);
    } else {
      wheelAngle = (startAngle + finalAngle) % 360;
      wheelSpinning = false;
      wheelSelected = WHEEL_SEGMENTS[targetIdx].game;

      // Show result
      const name = WHEEL_SEGMENTS[targetIdx].label;
      const resultName = document.getElementById('wheel-result-name');
      if (resultName) resultName.textContent = name;
      if (resultEl) resultEl.style.display = 'block';
      if (btnEl) { btnEl.style.display = 'none'; }
      document.getElementById('wheel-spin-wrap').querySelector('p').style.display = 'none';
    }
  }

  requestAnimationFrame(animate);
}

function wheelPlaySelected() {
  if (wheelSelected) selectMinigame(wheelSelected);
}

// Ctrl+Enter shortcut
document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
    const screen = document.getElementById('minigame-select');
    if (screen && screen.classList.contains('active')) spinWheel();
  }
});

function initWheelScreen() {
  // Reset state
  wheelSelected = null;
  wheelSpinning = false;
  const resultEl = document.getElementById('wheel-result');
  const btnEl    = document.getElementById('wheel-spin-btn');
  const spinWrap = document.getElementById('wheel-spin-wrap');
  if (resultEl) resultEl.style.display = 'none';
  if (btnEl) { btnEl.disabled = false; btnEl.style.display = ''; btnEl.textContent = '🌀 SPIN'; }
  if (spinWrap) { const p = spinWrap.querySelector('p'); if (p) p.style.display = ''; }
  drawWheel(wheelAngle);

  // Make canvas clickable
  const canvas = document.getElementById('spin-wheel');
  if (canvas) {
    canvas.onclick = spinWheel;
  }
}


// ══════════════════════════════════════════════════════════
//  LEADERBOARD
// ══════════════════════════════════════════════════════════
async function showLeaderboard() {
  showScreen('leaderboard-screen');
  const tableEl = document.getElementById('leaderboard-table');
  tableEl.innerHTML = '<div style="text-align:center;color:var(--text-secondary);padding:20px">Loading...</div>';
  try {
    const board = await apiFetch('/api/leaderboard');
    if (!board || board.length === 0) {
      tableEl.innerHTML = '<div style="text-align:center;color:var(--text-secondary);padding:20px">No scores yet. Be the first!</div>';
      return;
    }
    const rows = board.slice(0, 10).map((entry, i) => {
      const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i+1}.`;
      const lvlNames = {1:'Beginner',2:'Intermediate',3:'Advanced',4:'Expert',5:'Boss'};
      const lvl = lvlNames[entry.level] || `Level ${entry.level}`;
      return `<div style="display:flex;align-items:center;gap:12px;padding:10px 16px;border-radius:8px;background:var(--card-bg);margin-bottom:6px;">
        <span style="font-size:1.2rem;min-width:32px">${medal}</span>
        <span style="flex:1;font-weight:600;color:var(--text-primary)">${entry.name}</span>
        <span style="color:var(--text-secondary);font-size:0.8rem">${lvl}</span>
        <span style="font-weight:800;color:var(--accent);font-family:var(--mono)">${entry.points} pts</span>
      </div>`;
    }).join('');
    tableEl.innerHTML = rows;
  } catch(e) {
    tableEl.innerHTML = '<div style="text-align:center;color:#ef4444;padding:20px">Failed to load leaderboard.</div>';
  }
}

async function submitScore(points, level) {
  const name = App.playerName || 'Anonymous';
  try {
    await apiFetch('/api/leaderboard/submit', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ name, points, level })
    });
  } catch(e) { /* silent */ }
}
