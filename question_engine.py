import json
import os
import random

QUESTIONS_FILE = os.path.join(os.path.dirname(__file__), "questions.json")

LEVEL_DIFFICULTY_MAP = {
    1: ["beginner"],
    2: ["intermediate"],
    3: ["advanced"],
    4: ["expert"],
    5: ["advanced", "expert"],  # Boss level uses advanced + expert mix
}

LEVEL_NAME_MAP = {
    "beginner": 1,
    "intermediate": 2,
    "advanced": 3,
    "expert": 4,
}


class QuestionEngine:
    def __init__(self, questions_file=None):
        self.questions_file = questions_file or QUESTIONS_FILE
        self.questions = []
        self._questions_by_id = {}
        self._questions_by_level = {}
        self._load_questions()

    def _load_questions(self):
        try:
            with open(self.questions_file, "r", encoding="utf-8") as f:
                data = json.load(f)
            self.questions = data.get("questions", data) if isinstance(data, dict) else data
        except (json.JSONDecodeError, IOError, FileNotFoundError) as e:
            print(f"Warning: Could not load questions: {e}")
            self.questions = []

        self._questions_by_id = {}
        self._questions_by_level = {}

        LEVEL_STR_TO_NUM = {
            "beginner": 1,
            "intermediate": 2,
            "advanced": 3,
            "expert": 4,
        }

        for q in self.questions:
            qid = q.get("id")
            level = q.get("level")
            # Normalise string levels to numbers
            if isinstance(level, str):
                level = LEVEL_STR_TO_NUM.get(level.lower(), None)
                q["level"] = level  # update in place so get_question_by_id works too
            if qid:
                self._questions_by_id[qid] = q
            if level is not None:
                if level not in self._questions_by_level:
                    self._questions_by_level[level] = []
                self._questions_by_level[level].append(q)

    def get_question_by_id(self, question_id):
        """Return a single question by its ID."""
        return self._questions_by_id.get(question_id)

    def get_questions_for_level(self, level, count=10):
        """
        Return a list of questions appropriate for the given game level.
        Level 1 = beginner, 2 = intermediate, 3 = advanced, 4 = expert,
        5 = boss (mix of advanced + expert).
        """
        if level == 5:
            advanced = list(self._questions_by_level.get(3, []))
            expert = list(self._questions_by_level.get(4, []))
            pool = [q for q in advanced + expert if q.get('category') != 'trivia']
        else:
            pool = [q for q in self._questions_by_level.get(level, []) if q.get('category') != 'trivia']

        if not pool:
            pool = [q for q in self.questions if q.get('category') != 'trivia']

        random.shuffle(pool)
        return pool[:count]

    def get_all_questions(self):
        """Return all questions."""
        return list(self.questions)

    def get_categories(self):
        """Return all unique categories."""
        return list({q.get("category", "general") for q in self.questions})

    def get_questions_by_category(self, category, level=None):
        """Return questions filtered by category and optionally level."""
        results = [q for q in self.questions if q.get("category") == category]
        if level is not None:
            if level == 5:
                results = [q for q in results if q.get("level") in (3, 4)]
            else:
                results = [q for q in results if q.get("level") == level]
        return results

    def reload(self):
        """Reload questions from file."""
        self._load_questions()
