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

import json
from datetime import datetime, timezone
from typing import Any

import nltk
from nltk.sentiment.vader import SentimentIntensityAnalyzer


class SentimentClassifier:
    """NLTK VADER based sentiment classifier."""

    def __init__(self):
        # Ensure VADER lexicon is available
        try:
            nltk.data.find('sentiment/vader_lexicon.zip')
        except LookupError:
            nltk.download('vader_lexicon', quiet=True)
            
        self.sia = SentimentIntensityAnalyzer()

    def classify(self, text: str) -> dict[str, Any]:
        """
        Classify a single text string using NLTK VADER.

        Returns:
            dict with 'label' (positive | neutral | negative)
            and 'confidence' (float 0–1).
        """
        if not text or not isinstance(text, str):
            return {"label": "neutral", "confidence": 0.5}

        text = text.strip()
        if not text:
            return {"label": "neutral", "confidence": 0.5}

        scores = self.sia.polarity_scores(text)
        compound = scores['compound']

        if compound >= 0.05:
            label = "positive"
            confidence = min(0.5 + ((compound - 0.05) / 0.95) * 0.49, 0.99)
        elif compound <= -0.05:
            label = "negative"
            confidence = min(0.5 + ((abs(compound) - 0.05) / 0.95) * 0.49, 0.99)
        else:
            label = "neutral"
            confidence = 0.5 + (0.05 - abs(compound)) / 0.05 * 0.49

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
