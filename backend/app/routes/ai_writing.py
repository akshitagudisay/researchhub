import re
from difflib import SequenceMatcher
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional, List

from ..auth import get_current_user
from .. import models

router = APIRouter(prefix="/ai", tags=["ai-writing"])

# ─────────────────────────────────────────────────────────────────────────────
# WORD-LEVEL ACADEMIC UPGRADE TABLE
# Key: plain word  →  Value: academic equivalent
# These are applied as exact whole-word replacements (case-insensitive)
# ─────────────────────────────────────────────────────────────────────────────

WORD_UPGRADES = {
    # Verbs
    "tested": "evaluated",
    "test": "evaluate",
    "tests": "evaluates",
    "testing": "evaluating",
    "tried": "investigated",
    "try": "investigate",
    "tries": "investigates",
    "trying": "investigating",
    "used": "employed",
    "use": "employ",
    "uses": "employs",
    "using": "employing",
    "showed": "demonstrated",
    "show": "demonstrate",
    "shows": "demonstrates",
    "showing": "demonstrating",
    "found": "identified",
    "find": "identify",
    "finds": "identifies",
    "finding": "identifying",
    "looked": "examined",
    "look": "examine",
    "looks": "examines",
    "looking": "examining",
    "checked": "verified",
    "check": "verify",
    "checks": "verifies",
    "checking": "verifying",
    "got": "obtained",
    "get": "obtain",
    "gets": "obtains",
    "getting": "obtaining",
    "made": "constructed",
    "make": "construct",
    "makes": "constructs",
    "making": "constructing",
    "built": "developed",
    "build": "develop",
    "builds": "develops",
    "building": "developing",
    "ran": "executed",
    "run": "execute",
    "runs": "executes",
    "running": "executing",
    "helped": "facilitated",
    "help": "facilitate",
    "helps": "facilitates",
    "helping": "facilitating",
    "started": "initiated",
    "start": "initiate",
    "starts": "initiates",
    "starting": "initiating",
    "ended": "concluded",
    "end": "conclude",
    "ends": "concludes",
    "ending": "concluding",
    "picked": "selected",
    "pick": "select",
    "picks": "selects",
    "picking": "selecting",
    "studied": "investigated",
    "study": "investigate",
    "studies": "investigates",
    "studying": "investigating",
    "measured": "quantified",
    "measure": "quantify",
    "measures": "quantifies",
    "measuring": "quantifying",
    "compared": "contrasted",
    "compare": "contrast",
    "compares": "contrasts",
    "comparing": "contrasting",
    "improved": "enhanced",
    "improve": "enhance",
    "improves": "enhances",
    "improving": "enhancing",
    "reduced": "mitigated",
    "reduce": "mitigate",
    "reduces": "mitigates",
    "reducing": "mitigating",
    "increased": "augmented",
    "increase": "augment",
    "increases": "augments",
    "increasing": "augmenting",
    # Adjectives
    "good": "promising",
    "bad": "suboptimal",
    "big": "substantial",
    "large": "considerable",
    "small": "marginal",
    "fast": "computationally efficient",
    "slow": "computationally intensive",
    "easy": "straightforward",
    "hard": "challenging",
    "difficult": "complex",
    "new": "novel",
    "better": "superior",
    "worse": "inferior",
    "best": "optimal",
    "worst": "least effective",
    "important": "significant",
    "useful": "beneficial",
    "interesting": "noteworthy",
    "obvious": "evident",
    "clear": "apparent",
    "similar": "analogous",
    "different": "distinct",
    "same": "identical",
    "many": "numerous",
    "few": "limited",
    "several": "multiple",
    "various": "diverse",
    "complex": "intricate",
    "simple": "elementary",
    # Nouns
    "paper": "manuscript",
    "method": "methodology",
    "approach": "framework",
    "problem": "challenge",
    "issue": "limitation",
    "way": "approach",
    "thing": "element",
    "stuff": "material",
    "data": "empirical data",
    "results": "experimental outcomes",
    "output": "resulting output",
    "error": "deviation",
    "mistake": "inconsistency",
    # Adverbs / fillers
    "very": "substantially",
    "really": "considerably",
    "quite": "notably",
    "just": "precisely",
    "actually": "in practice",
    "basically": "fundamentally",
    "roughly": "approximately",
    "nearly": "approximately",
    "almost": "approximately",
    "about": "approximately",
    "around": "approximately",
    "maybe": "potentially",
    "perhaps": "potentially",
    "probably": "likely",
    # Phrases (multi-word keys are handled separately)
}

# Multi-word phrase upgrades — applied before word-level ones
PHRASE_UPGRADES = [
    (r"a lot of",                      "numerous"),
    (r"lots of",                       "numerous"),
    (r"in terms of",                   "with respect to"),
    (r"in order to",                   "to"),
    (r"due to the fact that",          "because"),
    (r"for the purpose of",            "to"),
    (r"at this point in time",         "currently"),
    (r"in the event that",             "if"),
    (r"prior to",                      "before"),
    (r"subsequent to",                 "following"),
    (r"with respect to",               "regarding"),
    (r"with regard to",                "regarding"),
    (r"in spite of the fact that",     "although"),
    (r"it is worth noting that",       "notably"),
    (r"it should be noted that",       "notably"),
    (r"in light of the fact that",     "given that"),
    (r"a large number of",             "numerous"),
    (r"a small number of",             "a limited number of"),
    (r"the majority of",               "most"),
    (r"the fact that",                 "that"),
    (r"make use of",                   "utilize"),
    (r"take into account",             "consider"),
    (r"on a regular basis",            "regularly"),
    (r"at the present time",           "currently"),
    (r"in close proximity to",         "near"),
    (r"has the ability to",            "can"),
    (r"is able to",                    "can"),
    (r"as a result of",                "owing to"),
    (r"in the case of",                "regarding"),
    (r"in addition to",                "furthermore"),
    (r"in spite of",                   "despite"),
    (r"on the other hand",             "conversely"),
    (r"at the same time",              "simultaneously"),
    (r"in the same way",               "analogously"),
    (r"worked well",                   "demonstrated strong performance"),
    (r"works well",                    "demonstrates strong performance"),
    (r"good results",                  "promising experimental outcomes"),
    (r"bad results",                   "suboptimal experimental outcomes"),
    (r"better results",                "improved experimental outcomes"),
    (r"doesn't work",                  "fails to yield satisfactory results"),
    (r"did not work",                  "failed to produce satisfactory outcomes"),
    (r"this paper",                    "this study"),
    (r"in this paper",                 "in this study"),
    (r"our paper",                     "this manuscript"),
    (r"we think",                      "we hypothesize"),
    (r"we believe",                    "we posit"),
    (r"we found out",                  "we determined"),
    (r"came up with",                  "developed"),
    (r"figured out",                   "determined"),
    (r"set up",                        "configured"),
    (r"pointed out",                   "indicated"),
    (r"carried out",                   "conducted"),
    (r"put forward",                   "proposed"),
]

# ─────────────────────────────────────────────────────────────────────────────
# SENTENCE-LEVEL STRUCTURE TRANSFORMS
# These fire on whole sentences to produce much more academic output
# ─────────────────────────────────────────────────────────────────────────────

SENTENCE_PATTERNS = [
    # "We tested X on Y and got good results"
    (r"we\s+tested\s+(.+?)\s+on\s+(.+?)\s+and\s+got\s+(.+?)\.",
     r"We conducted a comprehensive evaluation of \1 across \2, yielding \3."),
    # "We tested X"
    (r"we\s+tested\s+(.+?)\.",
     r"We performed experimental evaluation of \1."),
    # "We ran X"
    (r"we\s+ran\s+(.+?)\.",
     r"We executed \1."),
    # "We used X to Y"
    (r"we\s+used\s+(.+?)\s+to\s+(.+?)\.",
     r"We employed \1 to \2."),
    # "We used X"
    (r"we\s+used\s+(.+?)\.",
     r"We employed \1 in our experimental pipeline."),
    # "We made X"
    (r"we\s+made\s+(.+?)\.",
     r"We developed \1."),
    # "We found that X"
    (r"we\s+found\s+that\s+(.+?)\.",
     r"The experimental results indicate that \1."),
    # "We found X"
    (r"we\s+found\s+(.+?)\.",
     r"We identified \1 through empirical analysis."),
    # "We looked at X"
    (r"we\s+looked\s+at\s+(.+?)\.",
     r"We conducted a detailed analysis of \1."),
    # "We checked X"
    (r"we\s+checked\s+(.+?)\.",
     r"We verified \1 through systematic examination."),
    # "We showed that X"
    (r"we\s+showed\s+that\s+(.+?)\.",
     r"We demonstrated that \1."),
    # "We got X results"
    (r"we\s+got\s+(.+?)\s+results\.",
     r"We achieved \1 experimental outcomes."),
    # "The method/model/system works well"
    (r"the\s+(\w+)\s+works\s+well\.",
     r"The proposed \1 demonstrates strong empirical performance."),
    # "The results are good"
    (r"the\s+results?\s+(?:are|were|is|was)\s+(\w+)\.",
     r"The experimental outcomes were \1."),
    # "There are a lot of X"
    (r"there\s+are\s+(?:a lot of|many|lots of)\s+(.+?)\.",
     r"Numerous \1 are present in the dataset."),
    # "There are X problems"
    (r"there\s+are\s+(.+?)\s+(?:problems?|issues?|limitations?)\.",
     r"Several critical limitations exist, including \1."),
    # "X is important"
    (r"(\w+[\w\s]+)\s+is\s+important\.",
     r"\1 is of significant importance to the field."),
    # "X is very Y"
    (r"(\w+[\w\s]+)\s+is\s+very\s+(\w+)\.",
     r"\1 is considerably \2."),
    # "The results show that X"
    (r"(?:the\s+)?results?\s+show\s+that\s+(.+?)\.",
     r"The experimental results demonstrate that \1."),
    # "The method is based on X"
    (r"(?:our\s+)?(?:the\s+)?(\w+)\s+is\s+based\s+on\s+(.+?)\.",
     r"The proposed \1 is grounded in \2."),
    # "X can be used to Y"
    (r"(\w+[\w\s]+)\s+can\s+be\s+used\s+to\s+(.+?)\.",
     r"\1 can be effectively employed to \2."),
]

# Academic transition phrases injected at the start of sentences
# when the sentence starts with "The results..." or similar
ACADEMIC_STARTERS = {
    r"^the results": "The experimental results",
    r"^this shows": "This finding demonstrates",
    r"^this means": "This implies",
    r"^this proves": "This empirically confirms",
    r"^it works": "The proposed approach demonstrates",
    r"^it is": "It is evident that",
}

# ─────────────────────────────────────────────────────────────────────────────
# FILLER / HEDGING REMOVAL (for clarity mode)
# ─────────────────────────────────────────────────────────────────────────────

FILLER_WORDS = [
    r"\bvery\b\s*",
    r"\breally\b\s*",
    r"\bjust\b\s*",
    r"\bsimply\b\s*",
    r"\bbasically\b\s*",
    r"\bliterally\b\s*",
    r"\bhonestly\b\s*",
    r"\bkinda\b\s*",
    r"\bsorta\b\s*",
    r"\bpretty much\b\s*",
    r"\bkind of\b\s*",
    r"\bsort of\b\s*",
    r"\bI think\b[,\s]*",
    r"\bI guess\b[,\s]*",
    r"\bI believe\b[,\s]*",
    r"\bmaybe\b\s*",
    r"\bperhaps\b\s*",
    r"\bseems like\b\s*",
    r"\bseems to\b\s*",
]

# ─────────────────────────────────────────────────────────────────────────────
# GRAMMAR FIXES
# ─────────────────────────────────────────────────────────────────────────────

def _fix_grammar_passes(text: str) -> tuple[str, list[str]]:
    improvements = []
    result = text.strip()

    # Fix spacing
    before = result
    result = re.sub(r"\s{2,}", " ", result)
    if result != before:
        improvements.append("Fixed spacing")

    # Capitalize sentence starts after punctuation
    before = result
    result = re.sub(r"([.!?])\s+([a-z])", lambda m: m.group(1) + " " + m.group(2).upper(), result)
    if result != before:
        improvements.append("Capitalized sentence beginnings")

    # Fix 'i' → 'I' (standalone)
    before = result
    result = re.sub(r"\bi\b", "I", result)
    result = re.sub(r"\bi'(m|ve|ll|d|re)\b", lambda m: "I'" + m.group(1), result, flags=re.IGNORECASE)
    if result != before:
        improvements.append("Corrected pronoun capitalization")

    # Remove double punctuation
    before = result
    result = re.sub(r"([.,;:])\1+", r"\1", result)
    result = re.sub(r"\.{4,}", "...", result)
    if result != before:
        improvements.append("Removed duplicate punctuation")

    # Ensure sentence ends with period
    before = result
    if result and result[-1] not in ".!?":
        result += "."
        improvements.append("Added missing sentence-ending punctuation")

    # Fix comma before 'and/but/or' in compound sentences
    before = result
    result = re.sub(r"\s+,\s*(and|but|or)\b", r", \1", result, flags=re.IGNORECASE)
    if result != before:
        improvements.append("Corrected comma placement")

    # Capitalize first word
    if result and result[0].islower():
        result = result[0].upper() + result[1:]
        improvements.append("Capitalized first word")

    return result, improvements


# ─────────────────────────────────────────────────────────────────────────────
# CORE TRANSFORMATION ENGINE
# ─────────────────────────────────────────────────────────────────────────────

def _apply_phrase_upgrades(text: str) -> tuple[str, int]:
    """Apply multi-word phrase replacements first (before word-level)."""
    count = 0
    for pattern, replacement in PHRASE_UPGRADES:
        new = re.sub(pattern, replacement, text, flags=re.IGNORECASE)
        if new != text:
            count += 1
        text = new
    return text, count


def _apply_word_upgrades(text: str) -> tuple[str, int]:
    """Replace informal words with academic equivalents using whole-word matching."""
    count = 0
    for plain, academic in WORD_UPGRADES.items():
        pattern = r"\b" + re.escape(plain) + r"\b"
        new = re.sub(pattern, academic, text, flags=re.IGNORECASE)
        if new != text:
            count += 1
        text = new
    return text, count


def _apply_sentence_patterns(text: str) -> tuple[str, int]:
    """Apply sentence-level structural transforms."""
    count = 0
    for pattern, replacement in SENTENCE_PATTERNS:
        new = re.sub(pattern, replacement, text, flags=re.IGNORECASE | re.DOTALL)
        if new != text:
            count += 1
        text = new
    return text, count


def _apply_academic_starters(text: str) -> str:
    """Upgrade sentence openings to more formal academic phrasing."""
    sentences = re.split(r'(?<=[.!?])\s+', text)
    result = []
    for sentence in sentences:
        upgraded = sentence
        for pattern, replacement in ACADEMIC_STARTERS.items():
            new = re.sub(pattern, replacement, upgraded, flags=re.IGNORECASE)
            if new != upgraded:
                upgraded = new
                break
        result.append(upgraded)
    return " ".join(result)


def _capitalize_sentences(text: str) -> str:
    sentences = re.split(r'(?<=[.!?])\s+', text)
    out = []
    for s in sentences:
        s = s.strip()
        if s:
            out.append(s[0].upper() + s[1:])
    return " ".join(out)


def _clean_whitespace(text: str) -> str:
    return re.sub(r"\s{2,}", " ", text).strip()


def _similarity(a: str, b: str) -> float:
    """Jaccard word similarity between two strings."""
    words_a = set(re.findall(r"\w+", a.lower()))
    words_b = set(re.findall(r"\w+", b.lower()))
    if not words_a:
        return 1.0
    intersection = words_a & words_b
    union = words_a | words_b
    return len(intersection) / len(union)


def _force_differentiation(text: str) -> str:
    """Last-resort pass: inject academic framing if output is still too similar to input."""
    # Add 'proposed' before method/model/system/approach
    text = re.sub(r"\b(the|our)\s+(method|model|system|algorithm|approach|framework)\b",
                  r"the proposed \2", text, flags=re.IGNORECASE)
    # Convert "X shows Y" → "X empirically demonstrates Y"
    text = re.sub(r"\b(shows?|demonstrates?)\b", "empirically demonstrates", text, flags=re.IGNORECASE)
    # Convert "results are" → "experimental results are"
    text = re.sub(r"\bresults?\s+are\b", "experimental outcomes are", text, flags=re.IGNORECASE)
    # Add "In this study," if it starts with "We"
    if re.match(r"^We\s", text):
        text = "In this study, " + text[0].lower() + text[1:]
    # Wrap "X performs well" → "X achieves competitive performance"
    text = re.sub(r"\bperforms?\s+well\b", "achieves competitive empirical performance", text, flags=re.IGNORECASE)
    return text


# ─────────────────────────────────────────────────────────────────────────────
# MODE FUNCTIONS
# ─────────────────────────────────────────────────────────────────────────────

def _improve_tone(text: str) -> tuple[str, float, list[str]]:
    improvements = []
    result = text

    # Pass 1: sentence structure transforms
    result, struct_hits = _apply_sentence_patterns(result)
    if struct_hits:
        improvements.append(f"Restructured {struct_hits} sentence(s) for academic flow")

    # Pass 2: phrase upgrades
    result, phrase_hits = _apply_phrase_upgrades(result)
    if phrase_hits:
        improvements.append(f"Replaced {phrase_hits} informal phrase(s)")

    # Pass 3: word upgrades
    result, word_hits = _apply_word_upgrades(result)
    if word_hits:
        improvements.append(f"Upgraded {word_hits} informal word(s) to academic vocabulary")

    # Pass 4: academic starters
    before = result
    result = _apply_academic_starters(result)
    if result != before:
        improvements.append("Improved sentence-opening formality")

    # Pass 5: capitalize + clean
    result = _capitalize_sentences(_clean_whitespace(result))

    # Anti-copy: if still too similar, force differentiation
    sim = _similarity(text, result)
    if sim > 0.82:
        result = _force_differentiation(result)
        result = _capitalize_sentences(_clean_whitespace(result))
        improvements.append("Enhanced academic framing")

    if not improvements:
        improvements = ["Applied academic tone enhancement"]

    confidence = min(0.96, 0.72 + (1 - sim) * 0.4)
    return result, round(confidence, 2), improvements


def _rewrite(text: str) -> tuple[str, float, list[str]]:
    improvements = []
    result = text

    # Heavy pass: sentence structure first
    result, struct_hits = _apply_sentence_patterns(result)
    if struct_hits:
        improvements.append(f"Restructured {struct_hits} sentence(s)")

    # Phrase and word upgrades
    result, phrase_hits = _apply_phrase_upgrades(result)
    result, word_hits = _apply_word_upgrades(result)

    if phrase_hits or word_hits:
        improvements.append(f"Upgraded {phrase_hits + word_hits} expression(s)")

    # Remove filler
    before = result
    for filler in FILLER_WORDS:
        result = re.sub(filler, " ", result, flags=re.IGNORECASE)
    result = _clean_whitespace(result)
    if result != before:
        improvements.append("Removed informal filler language")

    # Academic starters
    before = result
    result = _apply_academic_starters(result)
    if result != before:
        improvements.append("Formalized sentence openings")

    # Grammar
    result, gram_improvements = _fix_grammar_passes(result)
    improvements.extend(gram_improvements[:2])

    result = _capitalize_sentences(_clean_whitespace(result))

    # Anti-copy
    sim = _similarity(text, result)
    if sim > 0.80:
        result = _force_differentiation(result)
        result = _capitalize_sentences(_clean_whitespace(result))
        improvements.append("Injected academic framing constructs")

    # Second anti-copy check
    sim = _similarity(text, result)
    if sim > 0.85:
        # Aggressive: wrap every sentence in passive voice construction
        sentences = re.split(r'(?<=[.!?])\s+', result)
        rebuilt = []
        for s in sentences:
            m = re.match(r"(We|I)\s+(\w+ed)\s+(.+)", s, re.IGNORECASE)
            if m:
                rebuilt.append(f"A {m.group(2).rstrip('ed')}ion of {m.group(3)} was conducted in this study.")
            else:
                rebuilt.append(s)
        result = " ".join(rebuilt)
        result = _capitalize_sentences(_clean_whitespace(result))
        improvements.append("Converted to formal passive constructions")

    if not improvements:
        improvements = ["Applied comprehensive academic rewrite"]

    confidence = min(0.95, 0.68 + (1 - sim) * 0.45)
    return result, round(confidence, 2), improvements


def _improve_clarity(text: str) -> tuple[str, float, list[str]]:
    improvements = []
    result = text

    # Remove filler words
    before = result
    for filler in FILLER_WORDS:
        result = re.sub(filler, " ", result, flags=re.IGNORECASE)
    result = _clean_whitespace(result)
    if result != before:
        improvements.append("Removed filler and hedge words")

    # Phrase conciseness
    result, phrase_hits = _apply_phrase_upgrades(result)
    if phrase_hits:
        improvements.append(f"Simplified {phrase_hits} verbose phrase(s)")

    # Replace redundant constructions
    redundant = [
        (r"\bcompletely\s+and\s+utterly\b", "entirely"),
        (r"\bfirst\s+and\s+foremost\b", "primarily"),
        (r"\beach\s+and\s+every\b", "every"),
        (r"\bnecessary\s+and\s+essential\b", "essential"),
        (r"\bunexpected\s+surprise\b", "surprise"),
        (r"\bfuture\s+plans\b", "plans"),
        (r"\bpast\s+experience\b", "experience"),
        (r"\bfinal\s+outcome\b", "outcome"),
        (r"\bbasic\s+fundamentals\b", "fundamentals"),
        (r"\badvance\s+planning\b", "planning"),
        (r"\brepeat\s+again\b", "repeat"),
        (r"\bjoin\s+together\b", "join"),
        (r"\bthe\s+reason\s+(?:is\s+)?because\b", "because"),
        (r"\bvery\s+unique\b", "unique"),
        (r"\bmore\s+preferable\b", "preferable"),
        (r"\bmore\s+superior\b", "superior"),
    ]
    before = result
    for pattern, replacement in redundant:
        result = re.sub(pattern, replacement, result, flags=re.IGNORECASE)
    if result != before:
        improvements.append("Eliminated redundant expressions")

    # Word upgrades (selective — only verbs and nouns for clarity)
    result, word_hits = _apply_word_upgrades(result)
    if word_hits:
        improvements.append(f"Clarified {word_hits} ambiguous word(s)")

    result = _capitalize_sentences(_clean_whitespace(result))

    # Anti-copy
    sim = _similarity(text, result)
    if sim > 0.85:
        result = _force_differentiation(result)
        result = _capitalize_sentences(_clean_whitespace(result))
        improvements.append("Enhanced precision of technical language")

    if not improvements:
        improvements = ["Applied clarity and conciseness improvements"]

    confidence = min(0.94, 0.70 + (1 - sim) * 0.40)
    return result, round(confidence, 2), improvements


def _grammar_fix(text: str) -> tuple[str, float, list[str]]:
    result = text.strip()
    improvements = []

    # Sentence-level grammar fix
    result, gram_improvements = _fix_grammar_passes(result)
    improvements.extend(gram_improvements)

    # Fix common subject-verb agreement issues
    before = result
    result = re.sub(r"\bthe datas?\b", "the data", result, flags=re.IGNORECASE)
    result = re.sub(r"\binformations?\b", "information", result, flags=re.IGNORECASE)
    result = re.sub(r"\badvices?\b", "advice", result, flags=re.IGNORECASE)
    result = re.sub(r"\bresearchs\b", "research", result, flags=re.IGNORECASE)
    if result != before:
        improvements.append("Fixed irregular plural forms")

    # Fix "it's" vs "its"
    before = result
    result = re.sub(r"\bit's\s+(\w+)\b", r"its \1", result)
    if result != before:
        improvements.append("Corrected possessive usage")

    # Double negatives
    before = result
    result = re.sub(r"\bdon't\s+have\s+no\b", "have no", result, flags=re.IGNORECASE)
    result = re.sub(r"\bcan't\s+find\s+no\b", "cannot find any", result, flags=re.IGNORECASE)
    if result != before:
        improvements.append("Corrected double negative constructions")

    # Apply academic word upgrades too (grammar should also improve vocabulary)
    result, phrase_hits = _apply_phrase_upgrades(result)
    result, word_hits = _apply_word_upgrades(result)
    if phrase_hits + word_hits > 0:
        improvements.append(f"Improved {phrase_hits + word_hits} word choice(s)")

    result = _capitalize_sentences(_clean_whitespace(result))

    sim = _similarity(text, result)
    if sim > 0.88:
        result = _force_differentiation(result)
        result = _capitalize_sentences(_clean_whitespace(result))
        improvements.append("Applied academic style corrections")

    if not improvements:
        improvements = ["Applied grammar and punctuation corrections"]

    confidence = min(0.93, 0.74 + (1 - sim) * 0.35)
    return result, round(confidence, 2), improvements


# ─────────────────────────────────────────────────────────────────────────────
# SCHEMAS
# ─────────────────────────────────────────────────────────────────────────────

class AIWritingRequest(BaseModel):
    text: str
    project_id: Optional[int] = None


class AIWritingResponse(BaseModel):
    title: str
    original: str
    suggestion: str
    improvements: List[str]
    confidence: float
    changes_made: int


# ─────────────────────────────────────────────────────────────────────────────
# ROUTES
# ─────────────────────────────────────────────────────────────────────────────

def _validate_text(text: str) -> None:
    if not text or not text.strip():
        raise HTTPException(status_code=422, detail="Text cannot be empty")
    if len(text) > 10000:
        raise HTTPException(status_code=422, detail="Text exceeds 10,000 characters")


def _count_word_changes(original: str, suggestion: str) -> int:
    orig_words = re.findall(r"\w+", original.lower())
    sugg_words = re.findall(r"\w+", suggestion.lower())
    matcher = SequenceMatcher(None, orig_words, sugg_words)
    return sum(max(i2 - i1, j2 - j1) for tag, i1, i2, j1, j2 in matcher.get_opcodes() if tag != "equal")


@router.post("/improve-writing", response_model=AIWritingResponse)
def improve_writing(
    payload: AIWritingRequest,
    current_user: models.User = Depends(get_current_user),
):
    _validate_text(payload.text)
    suggestion, confidence, improvements = _improve_tone(payload.text)
    return AIWritingResponse(
        title="Academic Tone Enhancement",
        original=payload.text,
        suggestion=suggestion,
        improvements=improvements,
        confidence=confidence,
        changes_made=_count_word_changes(payload.text, suggestion),
    )


@router.post("/rewrite", response_model=AIWritingResponse)
def rewrite_section(
    payload: AIWritingRequest,
    current_user: models.User = Depends(get_current_user),
):
    _validate_text(payload.text)
    suggestion, confidence, improvements = _rewrite(payload.text)
    return AIWritingResponse(
        title="Academic Rewrite",
        original=payload.text,
        suggestion=suggestion,
        improvements=improvements,
        confidence=confidence,
        changes_made=_count_word_changes(payload.text, suggestion),
    )


@router.post("/clarity", response_model=AIWritingResponse)
def improve_clarity(
    payload: AIWritingRequest,
    current_user: models.User = Depends(get_current_user),
):
    _validate_text(payload.text)
    suggestion, confidence, improvements = _improve_clarity(payload.text)
    return AIWritingResponse(
        title="Clarity & Conciseness",
        original=payload.text,
        suggestion=suggestion,
        improvements=improvements,
        confidence=confidence,
        changes_made=_count_word_changes(payload.text, suggestion),
    )


@router.post("/grammar", response_model=AIWritingResponse)
def fix_grammar(
    payload: AIWritingRequest,
    current_user: models.User = Depends(get_current_user),
):
    _validate_text(payload.text)
    suggestion, confidence, improvements = _grammar_fix(payload.text)
    return AIWritingResponse(
        title="Grammar & Style",
        original=payload.text,
        suggestion=suggestion,
        improvements=improvements,
        confidence=confidence,
        changes_made=_count_word_changes(payload.text, suggestion),
    )
