import re
import string
from difflib import SequenceMatcher

MATCH_THRESHOLD = 0.72
MIN_CONTAINMENT_LENGTH = 4

_PUNCTUATION = str.maketrans("", "", string.punctuation)


def normalize_name(name: str) -> str:
    cleaned = name.casefold().replace("-", " ").translate(_PUNCTUATION)
    return re.sub(r"\s+", " ", cleaned).strip()


def _containment_score(left: str, right: str) -> float:
    if not left or not right:
        return 0.0
    short, long = (left, right) if len(left) <= len(right) else (right, left)
    if short == long:
        return 1.0
    if len(short) < MIN_CONTAINMENT_LENGTH or short not in long:
        return 0.0
    return 0.8 + 0.2 * (len(short) / len(long))


def find_best_match(name: str, items):
    """Return (item, score) for a strong catalog-name match, or None."""
    normalized = normalize_name(name)
    if not normalized:
        return None
    best = None
    best_score = 0.0
    for item in items:
        candidate = normalize_name(item.name)
        if not candidate:
            continue
        score = max(
            _containment_score(normalized, candidate),
            SequenceMatcher(None, normalized, candidate).ratio(),
        )
        if score > best_score:
            best = item
            best_score = score
    if best is not None and best_score >= MATCH_THRESHOLD:
        return best, best_score
    return None


def initial_actions(match_ids: list[int | None]) -> list[str]:
    """Suggest update for the first row that matches each catalog item.

    Later rows that match the same item are adds, so one photo cannot
    overwrite a catalog row twice.
    """
    claimed: set[int] = set()
    actions: list[str] = []
    for match_id in match_ids:
        if match_id is not None and match_id not in claimed:
            actions.append("update")
            claimed.add(match_id)
        else:
            actions.append("create")
    return actions
