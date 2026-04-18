"""
classifier.py — Rule-based sentiment classifier
r past s
Classifies text into positive / neutral / negative
using keyword scoring with confidence estimation.

Usage:
    from classifier import SentimentClassifier

    clf = SentimentClassifier()
    result = clf.classify("I love this product!")
    # {'label': 'positive', 'confidence': 0.87}

    output = clf.process_payload({
        "rows": [{"id": 1, "text": "Great service!"}],
        "language": "en",
    })
"""

import re
import json
import math
from datetime import datetime, timezone
from typing import Any


class SentimentClassifier:
    """Rule-based sentiment classifier with negation & intensifier support."""

    # ── Word lists ──────────────────────────────────────────────────────

    POSITIVE_WORDS: set[str] = {
        # emotion
        "love", "happy", "great", "excellent", "amazing", "wonderful",
        "fantastic", "awesome", "brilliant", "superb", "outstanding",
        "magnificent", "delightful", "joyful", "cheerful", "glad",
        "pleased", "thrilled", "excited", "grateful", "thankful", "blessed",
        # approval
        "good", "nice", "best", "better", "perfect", "impressive",
        "beautiful", "elegant", "remarkable", "exceptional", "fabulous",
        "terrific", "marvelous", "splendid",
        # action / intent
        "recommend", "enjoy", "appreciate", "adore", "admire", "praise",
        "celebrate", "like", "liked", "loving", "enjoyed", "helpful",
        "useful", "easy", "fast", "smooth", "friendly", "kind", "generous",
        "reliable", "comfortable", "affordable", "satisfied", "pleasant",
        "positive", "favorite", "favourite", "worth", "worthy",
        "incredible", "phenomenal", "stunning", "glorious", "heartwarming",
        "uplifting", "inspiring", "motivating", "supportive", "caring",
        "thoughtful", "genuine", "innovative", "creative", "efficient",
        "effective", "valuable", "quality", "premium", "luxurious",
        "seamless", "intuitive", "user-friendly", "responsive",
        "congratulations", "congrats", "bravo", "kudos", "cheers", "bless",
        "hooray", "yay", "wow", "cool", "neat", "sweet", "fine", "stellar",
        "top-notch", "world-class", "first-rate", "five-star", "unbeatable",
        "unmatched",
    }

    NEGATIVE_WORDS: set[str] = {
        # emotion
        "hate", "terrible", "awful", "horrible", "disgusting", "angry",
        "sad", "frustrated", "annoyed", "disappointed", "unhappy",
        "miserable", "depressed", "furious", "outraged", "upset", "worried",
        "anxious", "fearful", "scared", "dreadful", "pathetic",
        # complaint
        "bad", "worst", "worse", "poor", "ugly", "broken", "useless",
        "waste", "boring", "slow", "confusing", "complicated", "difficult",
        "expensive", "overpriced", "unreliable", "uncomfortable",
        "unpleasant", "rude", "unfriendly", "disrespectful", "incompetent",
        "unprofessional", "inadequate", "inferior", "mediocre",
        # action / intent
        "complain", "regret", "dislike", "avoid", "return", "refund",
        "cancel", "fail", "failed", "failure", "error", "bug", "crash",
        "problem", "issue", "scam", "fraud", "fake", "misleading",
        "deceptive", "dishonest", "unethical", "disgusted", "appalled",
        "horrified", "heartbroken", "devastating", "toxic", "nightmare",
        "disaster", "catastrophe", "unacceptable", "intolerable",
        "shameful", "disgraceful", "abysmal", "atrocious", "horrendous",
        "lousy", "sucks", "crappy", "trash", "garbage", "junk", "rubbish",
        "crap", "damn", "stupid", "idiotic", "ridiculous", "absurd",
        "nonsense",
    }

    NEGATION_WORDS: set[str] = {
        "not", "no", "never", "neither", "nor", "nobody", "nothing",
        "nowhere", "hardly", "barely", "scarcely",
        "don't", "doesn't", "didn't", "won't", "wouldn't", "couldn't",
        "shouldn't", "isn't", "aren't", "wasn't", "weren't",
        "haven't", "hasn't", "hadn't", "cannot", "can't",
    }

    INTENSIFIERS: set[str] = {
        "very", "really", "extremely", "absolutely", "incredibly", "highly",
        "totally", "completely", "utterly", "truly", "deeply", "so", "super",
        "exceptionally", "remarkably", "extraordinarily",
    }

    # ── Tokenizer ───────────────────────────────────────────────────────

    _SMART_QUOTES = re.compile(r"[\u2018\u2019]")       # ' '  →  '
    _NON_ALPHA    = re.compile(r"[^a-z0-9' \-]")        # keep letters, digits, apostrophes, hyphens

    @staticmethod
    def _tokenize(text: str) -> list[str]:
        """Lowercase, normalize quotes, strip non-alpha, split on whitespace."""
        text = SentimentClassifier._SMART_QUOTES.sub("'", text.lower())
        text = SentimentClassifier._NON_ALPHA.sub(" ", text)
        return [t for t in text.split() if t]

    # ── Classify a single text ──────────────────────────────────────────

    def classify(self, text: str) -> dict[str, Any]:
        """
        Classify a single text string.

        Returns:
            dict with 'label' (positive | neutral | negative)
            and 'confidence' (float 0–1).
        """
        tokens = self._tokenize(text)
        if not tokens:
            return {"label": "neutral", "confidence": 0.5}

        score = 0.0
        matched_words = 0

        for i, token in enumerate(tokens):
            prev  = tokens[i - 1] if i > 0 else ""
            prev2 = tokens[i - 2] if i > 1 else ""

            # Check negation (within 2-word window)
            negated = prev in self.NEGATION_WORDS or prev2 in self.NEGATION_WORDS
            # Check intensifier
            intensified = 1.5 if prev in self.INTENSIFIERS else 1.0

            if token in self.POSITIVE_WORDS:
                delta = (-1 if negated else 1) * intensified
                score += delta
                matched_words += 1
            elif token in self.NEGATIVE_WORDS:
                delta = (1 if negated else -1) * intensified
                score += delta
                matched_words += 1

        # Exclamation marks & CAPS amplify
        exclamations = text.count("!")
        non_space = re.sub(r"\s", "", text)
        caps_count = sum(1 for c in text if c.isupper())
        caps_ratio = caps_count / max(len(non_space), 1)

        if caps_ratio > 0.5 and len(text) > 4:
            score *= 1.3

        if score != 0:
            sign = 1 if score > 0 else -1
            score += sign * min(exclamations, 3) * 0.2

        # Normalize score → label + confidence
        normalized_score = score / math.sqrt(len(tokens)) if tokens else 0.0

        if normalized_score > 0.25:
            label = "positive"
            confidence = min(0.5 + abs(normalized_score) * 0.25, 0.99)
        elif normalized_score < -0.25:
            label = "negative"
            confidence = min(0.5 + abs(normalized_score) * 0.25, 0.99)
        else:
            label = "neutral"
            if matched_words == 0:
                confidence = 0.8  # no sentiment words → likely factual
            else:
                confidence = 0.5 + (0.25 - abs(normalized_score)) * 0.5

        return {
            "label": label,
            "confidence": round(confidence, 2),
        }

    # ── Process full payload ────────────────────────────────────────────

    def process_payload(self, payload: dict[str, Any]) -> dict[str, Any]:
        """
        Process a complete payload matching the input schema.

        Args:
            payload: dict with 'rows' (list of {id, text}),
                     optional 'language' (ISO code),
                     optional 'max_samples' (int).

        Returns:
            dict with 'results', 'counts', 'errors', and 'meta'.
        """
        if not payload or not isinstance(payload.get("rows"), list):
            raise ValueError('Payload must contain a "rows" array.')

        max_samples = payload.get("max_samples")
        if not isinstance(max_samples, int) or max_samples <= 0:
            max_samples = float("inf")

        results: list[dict] = []
        errors:  list[dict] = []
        counts = {"positive": 0, "neutral": 0, "negative": 0}
        labeled = 0

        for index, row in enumerate(payload["rows"]):
            # ── Validation ──
            if not isinstance(row, dict):
                errors.append({
                    "index": index,
                    "data": row,
                    "reason": "Row is not an object.",
                })
                continue

            if row.get("id") is None:
                errors.append({
                    "index": index,
                    "data": row,
                    "reason": 'Missing required field "id".',
                })
                continue

            text = row.get("text")
            if not isinstance(text, str) or not text.strip():
                errors.append({
                    "index": index,
                    "data": row,
                    "reason": 'Missing or empty "text" field.',
                })
                continue

            if labeled >= max_samples:
                continue  # respect max_samples

            result = self.classify(text)
            results.append({
                "id":         row["id"],
                "text":       text,
                "label":      result["label"],
                "confidence": result["confidence"],
            })
            counts[result["label"]] += 1
            labeled += 1

        return {
            "results": results,
            "counts":  counts,
            "errors":  errors,
            "meta": {
                "total_labeled": labeled,
                "language":      payload.get("language", "en"),
                "timestamp":     datetime.now(timezone.utc).isoformat(),
            },
        }


# ─────────────────────────────────────────────────────────────────────────────
# CLI entry-point — run directly to test with example data
# ─────────────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    example_payload = {
        "rows": [
            {"id": 1,  "text": "I absolutely love this product! Best purchase I've ever made."},
            {"id": 2,  "text": "The weather today is 72°F with partly cloudy skies."},
            {"id": 3,  "text": "Terrible experience. The item arrived broken and customer service was rude."},
            {"id": 4,  "text": "The meeting has been rescheduled to 3 PM tomorrow."},
            {"id": 5,  "text": "This is amazing! Incredibly fast shipping and beautiful packaging."},
            {"id": 6,  "text": "I'm really disappointed with the quality. Not worth the price at all."},
            {"id": 7,  "text": "Can you send me the report by end of day?"},
            {"id": 8,  "text": "Thank you so much for your help! You've been wonderful."},
            {"id": 9,  "text": "The food was cold and tasteless. Worst restaurant I've been to."},
            {"id": 10, "text": "Our quarterly revenue increased by 12% year-over-year."},
            {"id": 11, "text": "I'm not happy with this update. It broke several features."},
            {"id": 12, "text": "Great job on the presentation! Very impressive work."},
        ],
        "language": "en",
    }

    clf = SentimentClassifier()
    output = clf.process_payload(example_payload)
    print(json.dumps(output, indent=2, ensure_ascii=False))
