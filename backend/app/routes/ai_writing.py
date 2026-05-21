import re
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional

from ..auth import get_current_user
from .. import models

router = APIRouter(prefix="/ai", tags=["ai-writing"])

# ── Academic phrase replacements ──────────────────────────────────────────────

TONE_REPLACEMENTS = [
    (r"\bwe tested\b", "we conducted experimental evaluation of"),
    (r"\bwe tried\b", "we investigated"),
    (r"\bwe used\b", "we employed"),
    (r"\bwe show\b", "we demonstrate"),
    (r"\bwe found\b", "we observed"),
    (r"\bwe think\b", "we hypothesize"),
    (r"\bwe believe\b", "we posit"),
    (r"\bwe looked at\b", "we examined"),
    (r"\bwe checked\b", "we verified"),
    (r"\bwe got\b", "we obtained"),
    (r"\bwe made\b", "we developed"),
    (r"\bwe built\b", "we constructed"),
    (r"\bwe ran\b", "we executed"),
    (r"\ba lot of\b", "a significant number of"),
    (r"\blots of\b", "numerous"),
    (r"\bbig\b", "substantial"),
    (r"\bsmall\b", "marginal"),
    (r"\bgood results\b", "promising experimental outcomes"),
    (r"\bbad results\b", "suboptimal experimental outcomes"),
    (r"\bbetter results\b", "improved experimental outcomes"),
    (r"\bworks well\b", "demonstrates strong performance"),
    (r"\bdoesn'?t work\b", "fails to yield satisfactory results"),
    (r"\bfast\b", "computationally efficient"),
    (r"\bslow\b", "computationally intensive"),
    (r"\beasy\b", "straightforward"),
    (r"\bhard\b", "challenging"),
    (r"\bvery\b", "notably"),
    (r"\breally\b", "substantially"),
    (r"\bquite\b", "considerably"),
    (r"\balmost\b", "approximately"),
    (r"\babout\b", "approximately"),
    (r"\baround\b", "approximately"),
    (r"\bimportant\b", "significant"),
    (r"\binteresting\b", "noteworthy"),
    (r"\bobvious\b", "evident"),
    (r"\bclear\b", "apparent"),
    (r"\bnew\b", "novel"),
    (r"\bbetter\b", "superior"),
    (r"\bworse\b", "inferior"),
    (r"\buse\b", "utilize"),
    (r"\bhelp\b", "facilitate"),
    (r"\bshow\b", "demonstrate"),
    (r"\bcheck\b", "verify"),
    (r"\btry\b", "attempt"),
    (r"\bstart\b", "initiate"),
    (r"\bend\b", "conclude"),
    (r"\bdo\b", "perform"),
    (r"\bmake\b", "construct"),
    (r"\bput\b", "place"),
    (r"\bget\b", "obtain"),
    (r"\bpaper\b", "manuscript"),
    (r"\bthis paper\b", "this study"),
    (r"\bin this paper\b", "in this study"),
]

GRAMMAR_FIXES = [
    (r"\bi\b", "I"),
    (r"\s{2,}", " "),
    (r"([.!?])\s*([a-z])", lambda m: m.group(1) + " " + m.group(2).upper()),
]

CLARITY_TEMPLATES = [
    ("passive_voice", r"\bwas (done|made|tested|evaluated|analyzed|performed)\b",
     "active voice construction"),
    ("hedge_words", r"\b(might|could|possibly|perhaps|maybe)\b",
     "more definitive phrasing"),
    ("nominalizations", r"\b(utilization|implementation|optimization|initialization)\b",
     "verb form"),
]

CONCISE_REPLACEMENTS = [
    (r"\bdue to the fact that\b", "because"),
    (r"\bin order to\b", "to"),
    (r"\bat this point in time\b", "currently"),
    (r"\bfor the purpose of\b", "to"),
    (r"\bin the event that\b", "if"),
    (r"\bprior to\b", "before"),
    (r"\bsubsequent to\b", "after"),
    (r"\bwith respect to\b", "regarding"),
    (r"\bwith regard to\b", "regarding"),
    (r"\bin spite of the fact that\b", "although"),
    (r"\bit is worth noting that\b", "notably"),
    (r"\bit should be noted that\b", "notably"),
    (r"\bin light of the fact that\b", "given that"),
    (r"\ba large number of\b", "many"),
    (r"\ba small number of\b", "few"),
    (r"\bthe majority of\b", "most"),
    (r"\bthe fact that\b", "that"),
    (r"\bmake use of\b", "use"),
    (r"\btake into account\b", "consider"),
    (r"\bon a regular basis\b", "regularly"),
    (r"\bat the present time\b", "currently"),
    (r"\bin close proximity to\b", "near"),
    (r"\bhas the ability to\b", "can"),
    (r"\bis able to\b", "can"),
]


# ── Core engine ───────────────────────────────────────────────────────────────

def _apply_replacements(text: str, rules: list) -> tuple[str, int]:
    count = 0
    for pattern, replacement in rules:
        if callable(replacement):
            new_text = re.sub(pattern, replacement, text, flags=re.IGNORECASE)
        else:
            new_text = re.sub(pattern, replacement, text, flags=re.IGNORECASE)
        if new_text != text:
            count += 1
        text = new_text
    return text, count


def _capitalize_sentences(text: str) -> str:
    sentences = re.split(r'(?<=[.!?])\s+', text)
    return " ".join(s[0].upper() + s[1:] if s else s for s in sentences)


def _improve_tone(text: str) -> tuple[str, float]:
    improved, hits = _apply_replacements(text, TONE_REPLACEMENTS)
    improved = _capitalize_sentences(improved)
    confidence = min(0.95, 0.60 + hits * 0.05)
    return improved, confidence


def _fix_grammar(text: str) -> tuple[str, float]:
    result = text.strip()
    result = re.sub(r"\s{2,}", " ", result)
    result = re.sub(r"([.!?])\s*([a-z])", lambda m: m.group(1) + " " + m.group(2).upper(), result)
    result = re.sub(r"\bi\b", "I", result)
    result = re.sub(r"\bi'", "I'", result)
    result = re.sub(r",\s*,", ",", result)
    result = re.sub(r"\.\s*\.", ".", result)
    if result and not result[-1] in ".!?":
        result += "."
    confidence = 0.82 if result != text else 0.50
    return result, confidence


def _improve_clarity(text: str) -> tuple[str, float]:
    result, hits = _apply_replacements(text, CONCISE_REPLACEMENTS)
    result = re.sub(r"\b(very|really|quite|just|simply|basically|literally|honestly)\b\s*", "", result, flags=re.IGNORECASE)
    result = re.sub(r"\s{2,}", " ", result).strip()
    confidence = min(0.93, 0.65 + hits * 0.06)
    return result, confidence


def _rewrite(text: str) -> tuple[str, float]:
    result, _ = _apply_replacements(text, TONE_REPLACEMENTS)
    result, _ = _apply_replacements(result, CONCISE_REPLACEMENTS)
    result = _capitalize_sentences(result)
    result = re.sub(r"\s{2,}", " ", result).strip()
    confidence = 0.78
    return result, confidence


# ── Schemas ───────────────────────────────────────────────────────────────────

class AIWritingRequest(BaseModel):
    text: str
    project_id: Optional[int] = None


class AIWritingResponse(BaseModel):
    title: str
    original: str
    suggestion: str
    confidence: float
    changes_made: int


# ── Routes ────────────────────────────────────────────────────────────────────

def _validate_text(text: str) -> None:
    if not text or not text.strip():
        raise HTTPException(status_code=422, detail="Text cannot be empty")
    if len(text) > 10000:
        raise HTTPException(status_code=422, detail="Text exceeds maximum length of 10,000 characters")


@router.post("/improve-writing", response_model=AIWritingResponse)
def improve_writing(
    payload: AIWritingRequest,
    current_user: models.User = Depends(get_current_user),
):
    _validate_text(payload.text)
    suggestion, confidence = _improve_tone(payload.text)
    changes = sum(1 for a, b in zip(payload.text.split(), suggestion.split()) if a != b)
    return AIWritingResponse(
        title="Academic Tone Improvement",
        original=payload.text,
        suggestion=suggestion,
        confidence=round(confidence, 2),
        changes_made=changes,
    )


@router.post("/rewrite", response_model=AIWritingResponse)
def rewrite_section(
    payload: AIWritingRequest,
    current_user: models.User = Depends(get_current_user),
):
    _validate_text(payload.text)
    suggestion, confidence = _rewrite(payload.text)
    changes = sum(1 for a, b in zip(payload.text.split(), suggestion.split()) if a != b)
    return AIWritingResponse(
        title="Academic Rewrite",
        original=payload.text,
        suggestion=suggestion,
        confidence=round(confidence, 2),
        changes_made=changes,
    )


@router.post("/clarity", response_model=AIWritingResponse)
def improve_clarity(
    payload: AIWritingRequest,
    current_user: models.User = Depends(get_current_user),
):
    _validate_text(payload.text)
    suggestion, confidence = _improve_clarity(payload.text)
    changes = sum(1 for a, b in zip(payload.text.split(), suggestion.split()) if a != b)
    return AIWritingResponse(
        title="Clarity & Conciseness",
        original=payload.text,
        suggestion=suggestion,
        confidence=round(confidence, 2),
        changes_made=changes,
    )


@router.post("/grammar", response_model=AIWritingResponse)
def fix_grammar(
    payload: AIWritingRequest,
    current_user: models.User = Depends(get_current_user),
):
    _validate_text(payload.text)
    suggestion, confidence = _fix_grammar(payload.text)
    changes = sum(1 for a, b in zip(payload.text.split(), suggestion.split()) if a != b)
    return AIWritingResponse(
        title="Grammar & Style Fix",
        original=payload.text,
        suggestion=suggestion,
        confidence=round(confidence, 2),
        changes_made=changes,
    )
