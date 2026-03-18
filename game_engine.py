import json
import os
import random
from datetime import datetime

GAMESTATE_FILE = os.path.join(os.path.dirname(__file__), "gamestate.json")

POINTS_PER_LEVEL = {1: 10, 2: 20, 3: 35, 4: 55}
POINTS_TO_ADVANCE = {1: 60, 2: 150, 3: 280, 4: 450}

BOSS_LEVEL = 5
BOSS_WRONG_LIVES_PENALTY = 2
VICTORY_THRESHOLD = 600


class GameEngine:
    def __init__(self, question_engine):
        self.question_engine = question_engine
        self.state = self._default_state()
        self._load_state()

    def _default_state(self):
        return {
            "lives": 5,
            "points": 0,
            "level": 1,
            "current_round_questions": [],
            "current_question_index": 0,
            "phase": "question",  # question | minigame | boss | gameover | victory
            "round_number": 1,
            "questions_answered_this_round": 0,
            "boss_active": False,
            "boss_time_limit": 10,  # seconds per boss question
            "high_score": 0,
        }

    def _load_state(self):
        if os.path.exists(GAMESTATE_FILE):
            try:
                with open(GAMESTATE_FILE, "r") as f:
                    saved = json.load(f)
                self.state.update(saved)
            except (json.JSONDecodeError, IOError):
                self.state = self._default_state()

    def _save_state(self):
        try:
            with open(GAMESTATE_FILE, "w") as f:
                json.dump(self.state, f, indent=2)
        except IOError as e:
            print(f"Warning: Could not save game state: {e}")

    def get_state(self):
        """Return current game state with question data attached."""
        state = dict(self.state)
        # Attach current question if in question/boss phase
        if state["phase"] in ("question", "boss"):
            questions = state["current_round_questions"]
            idx = state["current_question_index"]
            if questions and idx < len(questions):
                qid = questions[idx]
                question = self.question_engine.get_question_by_id(qid)
                state["current_question"] = question
            else:
                state["current_question"] = None
        state["points_to_advance"] = POINTS_TO_ADVANCE.get(state["level"], None)
        state["points_per_correct"] = POINTS_PER_LEVEL.get(state["level"], 10)
        state["total_questions_this_round"] = len(state["current_round_questions"])
        return state

    def start_new_game(self, player_name='Anonymous'):
        self.player_name = player_name.strip() or 'Anonymous'
        """Reset game to initial state and load first round questions."""
        high_score = self.state.get("high_score", 0)
        self.state = self._default_state()
        self.state["high_score"] = high_score
        self.state["phase"] = "question"
        questions = self.question_engine.get_questions_for_level(1, count=10)
        self.state["current_round_questions"] = [q["id"] for q in questions]
        self.state["current_question_index"] = 0
        self._save_state()
        return self.get_state()

    def answer_question(self, question_id, answer, answer_meta=None):
        """Process a question answer. Returns result dict."""
        if self.state["phase"] not in ("question",):
            return {"error": "Not in question phase"}

        question = self.question_engine.get_question_by_id(question_id)
        if not question:
            return {"error": "Question not found"}

        timed_out = answer.strip() == '__TIMEOUT__'
        correct = (not timed_out) and answer.strip().upper() == question["answer"].upper()
        points_earned = 0
        time_bonus = 0
        explanation = question.get("explanation", "")

        if correct:
            base = POINTS_PER_LEVEL.get(self.state["level"], 10)
            time_bonus = int(answer_meta.get("time_bonus", 0)) if isinstance(answer_meta, dict) else 0
            points_earned = base + time_bonus
            self.state["points"] += points_earned
        else:
            self.state["lives"] -= 1

        self.state["questions_answered_this_round"] += 1
        self.state["current_question_index"] += 1

        game_over = self.state["lives"] <= 0
        if game_over:
            self.state["phase"] = "gameover"
            if self.state["points"] > self.state["high_score"]:
                self.state["high_score"] = self.state["points"]

        # Check if round is complete
        round_complete = (
            self.state["current_question_index"]
            >= len(self.state["current_round_questions"])
        )

        self._save_state()

        return {
            "correct": correct,
            "timed_out": timed_out,
            "explanation": explanation,
            "correct_answer": question["answer"],
            "points_earned": points_earned,
            "time_bonus": time_bonus,
            "lives_remaining": self.state["lives"],
            "points": self.state["points"],
            "game_over": game_over,
            "round_complete": round_complete and not game_over,
            "phase": self.state["phase"],
        }

    def answer_boss_question(self, question_id, answer):
        """Process a boss question answer."""
        if self.state["phase"] != "boss":
            return {"error": "Not in boss phase"}

        question = self.question_engine.get_question_by_id(question_id)
        if not question:
            return {"error": "Question not found"}

        correct = answer.strip().upper() == question["answer"].upper()
        points_earned = 0
        explanation = question.get("explanation", "")

        if correct:
            points_earned = POINTS_PER_LEVEL.get(4, 55)  # Expert-level points in boss
            self.state["points"] += points_earned
        else:
            self.state["lives"] -= BOSS_WRONG_LIVES_PENALTY

        self.state["questions_answered_this_round"] += 1
        self.state["current_question_index"] += 1

        game_over = self.state["lives"] <= 0
        victory = self.state["points"] >= VICTORY_THRESHOLD

        if game_over:
            self.state["phase"] = "gameover"
            if self.state["points"] > self.state["high_score"]:
                self.state["high_score"] = self.state["points"]
        elif victory:
            self.state["phase"] = "victory"
            if self.state["points"] > self.state["high_score"]:
                self.state["high_score"] = self.state["points"]

        round_complete = (
            not game_over
            and not victory
            and self.state["current_question_index"]
            >= len(self.state["current_round_questions"])
        )

        if round_complete:
            # Load more boss questions
            more_questions = self.question_engine.get_questions_for_level(5, count=5)
            self.state["current_round_questions"].extend(
                [q["id"] for q in more_questions]
            )

        self._save_state()

        return {
            "correct": correct,
            "explanation": explanation,
            "correct_answer": question["answer"],
            "points_earned": points_earned,
            "lives_remaining": self.state["lives"],
            "points": self.state["points"],
            "game_over": game_over,
            "victory": victory,
            "phase": self.state["phase"],
            "boss_active": True,
        }

    def advance_to_minigame(self):
        """Move from question phase to minigame phase."""
        if self.state["phase"] != "question":
            return {"error": "Not in question phase"}
        self.state["phase"] = "minigame"
        self._save_state()
        return self.get_state()

    def advance_to_next_level(self):
        """Advance player to next level after completing minigame."""
        current_level = self.state["level"]

        if current_level >= 4:
            # Transition to boss fight
            return self.start_boss()

        self.state["level"] = current_level + 1
        self.state["round_number"] += 1
        self.state["questions_answered_this_round"] = 0
        self.state["phase"] = "question"

        questions = self.question_engine.get_questions_for_level(
            self.state["level"], count=10
        )
        self.state["current_round_questions"] = [q["id"] for q in questions]
        self.state["current_question_index"] = 0

        self._save_state()
        return self.get_state()

    def check_level_complete(self):
        """Check if current level's points threshold has been reached."""
        required = POINTS_TO_ADVANCE.get(self.state["level"])
        if required is None:
            return False
        return self.state["points"] >= required

    def start_boss(self):
        """Initiate the boss fight at level 5."""
        self.state["level"] = BOSS_LEVEL
        self.state["phase"] = "boss"
        self.state["boss_active"] = True
        self.state["round_number"] += 1
        self.state["questions_answered_this_round"] = 0

        questions = self.question_engine.get_questions_for_level(5, count=10)
        self.state["current_round_questions"] = [q["id"] for q in questions]
        self.state["current_question_index"] = 0

        self._save_state()
        return self.get_state()

    def apply_minigame_result(self, points_delta):
        """Apply minigame result (positive or negative points)."""
        self.state["points"] = max(0, self.state["points"] + points_delta)
        if self.state["points"] > self.state["high_score"]:
            self.state["high_score"] = self.state["points"]
        self._save_state()
        return self.get_state()
