import json
import os
from flask import Flask, request, jsonify, render_template
import pathlib

LEADERBOARD_FILE = pathlib.Path("leaderboard.json")

def load_leaderboard():
    if LEADERBOARD_FILE.exists():
        return json.loads(LEADERBOARD_FILE.read_text())
    return []

def save_to_leaderboard(name, points, level):
    import datetime
    board = load_leaderboard()
    board.append({"name": name, "points": points, "level": level, "date": datetime.date.today().isoformat()})
    board = sorted(board, key=lambda x: x["points"], reverse=True)[:100]
    LEADERBOARD_FILE.write_text(json.dumps(board, indent=2))

from game_engine import GameEngine
from question_engine import QuestionEngine
from minigame_engine import MinigameEngine

app = Flask(__name__, template_folder="templates", static_folder="static")

# ─────────────────────────────────────────────
# Initialization
# ─────────────────────────────────────────────
question_engine = QuestionEngine()
game_engine = GameEngine(question_engine)
minigame_engine = MinigameEngine()

# In-memory blackjack state (per session — single user app)
_blackjack_session = {}


# ─────────────────────────────────────────────
# Routes
# ─────────────────────────────────────────────
@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/start", methods=["POST"])
def api_start():
    """Start a new game."""
    data = request.get_json(silent=True) or {}
    player_name = data.get('player_name', 'Anonymous')
    state = game_engine.start_new_game(player_name=player_name)
    return jsonify(state)


@app.route("/api/state", methods=["GET"])
def api_state():
    """Get current game state."""
    state = game_engine.get_state()
    return jsonify(state)


@app.route("/api/answer", methods=["POST"])
def api_answer():
    """Submit an answer to the current question."""
    data = request.get_json()
    if not data:
        return jsonify({"error": "No data provided"}), 400

    question_id = data.get("question_id")
    answer = data.get("answer")

    if not question_id or not answer:
        return jsonify({"error": "question_id and answer required"}), 400

    answer_meta = {"time_bonus": data.get("time_bonus", 0)}
    result = game_engine.answer_question(question_id, answer, answer_meta=answer_meta)
    return jsonify(result)


@app.route("/api/next_round", methods=["POST"])
def api_next_round():
    """Advance to the next round or level."""
    data = request.get_json() or {}
    action = data.get("action", "minigame")  # "minigame" | "next_level"

    if action == "minigame":
        state = game_engine.advance_to_minigame()
    elif action == "next_level":
        state = game_engine.advance_to_next_level()
    else:
        return jsonify({"error": f"Unknown action: {action}"}), 400

    return jsonify(state)


@app.route("/api/minigame/play", methods=["POST"])
def api_minigame_play():
    """Play a minigame."""
    data = request.get_json()
    if not data:
        return jsonify({"error": "No data provided"}), 400

    game = data.get("game")
    bet = int(data.get("bet", 10))
    action_data = data.get("action", {})

    if not game:
        return jsonify({"error": "game required"}), 400

    # Clamp bet between 1 and current points (minimum 1 even if broke)
    current_points = game_engine.state.get("points", 0)
    bet = max(1, min(bet, max(1, current_points)))

    result = {}

    if game == "blackjack":
        action = action_data.get("action", "deal")
        bj_state = _blackjack_session.get("state")
        result = minigame_engine.blackjack(bet, action, state=bj_state)
        if not result.get("game_over"):
            _blackjack_session["state"] = result.get("_state")
            _blackjack_session["bet"] = bet
        else:
            _blackjack_session.clear()
            if result.get("points_delta", 0) != 0:
                game_engine.apply_minigame_result(result["points_delta"])
        # Don't expose internal state
        result.pop("_state", None)
        result.pop("_dealer_hand_raw", None)
        result["current_points"] = game_engine.state.get("points", 0)

    elif game == "roulette":
        bet_type = action_data.get("bet_type", "red")
        result = minigame_engine.roulette(bet, bet_type)
        if result.get("points_delta", 0) != 0:
            game_engine.apply_minigame_result(result["points_delta"])
        result["current_points"] = game_engine.state.get("points", 0)

    elif game == "dice":
        double_or_nothing = action_data.get("double_or_nothing", False)
        result = minigame_engine.dice_duel(bet, double_or_nothing)
        if result.get("points_delta", 0) != 0:
            game_engine.apply_minigame_result(result["points_delta"])
        result["current_points"] = game_engine.state.get("points", 0)

    elif game == "highlow":
        guess = action_data.get("guess")
        current_card = action_data.get("current_card")
        streak = int(action_data.get("streak", 0))

        if guess is None and current_card is None:
            # Starting the game — draw first card
            result = minigame_engine.high_low(bet, "high", current_card=None, streak=0)
        else:
            result = minigame_engine.high_low(bet, guess, current_card=current_card, streak=streak)
            if result.get("points_delta", 0) != 0:
                game_engine.apply_minigame_result(result["points_delta"])

        result["current_points"] = game_engine.state.get("points", 0)

    else:
        return jsonify({"error": f"Unknown game: {game}"}), 400

    return jsonify(result)


@app.route("/api/boss/answer", methods=["POST"])
def api_boss_answer():
    """Submit an answer during the boss fight."""
    data = request.get_json()
    if not data:
        return jsonify({"error": "No data provided"}), 400

    question_id = data.get("question_id")
    answer = data.get("answer")

    if not question_id or not answer:
        return jsonify({"error": "question_id and answer required"}), 400

    result = game_engine.answer_boss_question(question_id, answer)
    return jsonify(result)


# ─────────────────────────────────────────────
# Error handlers
# ─────────────────────────────────────────────
@app.errorhandler(404)
def not_found(e):
    return jsonify({"error": "Not found"}), 404


@app.errorhandler(500)
def server_error(e):
    return jsonify({"error": "Internal server error"}), 500


if __name__ == "__main__":
    app.run(debug=True, host="0.0.0.0", port=5000)

@app.route('/api/leaderboard', methods=['GET'])
def get_leaderboard():
    return jsonify(load_leaderboard())

@app.route('/api/leaderboard/submit', methods=['POST'])
def submit_score():
    data = request.get_json(silent=True) or {}
    name = data.get('name', 'Anonymous')
    points = int(data.get('points', 0))
    level = int(data.get('level', 1))
    save_to_leaderboard(name, points, level)
    return jsonify({'ok': True, 'leaderboard': load_leaderboard()[:10]})

