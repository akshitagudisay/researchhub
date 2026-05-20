from __future__ import annotations

import json
import re
from typing import List, Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..database import get_db
from .. import models
from ..auth import get_current_user, decode_access_token
from ..schemas import CitationRead

router = APIRouter()

# ── Scoring ───────────────────────────────────────────────────────────────────
SCORE_CITATION_ADD = 4


# ── Keyword-based paper suggestions ──────────────────────────────────────────

SUGGESTIONS = [
    {
        "keywords": ["transformer", "attention mechanism", "bert", "gpt", "self-attention"],
        "title": "Attention Is All You Need",
        "authors": ["Vaswani, A.", "Shazeer, N.", "Parmar, N.", "Uszkoreit, J."],
        "journal": "NeurIPS",
        "year": 2017,
        "doi": "10.48550/arXiv.1706.03762",
        "formatted_apa": "Vaswani, A., Shazeer, N., Parmar, N., & Uszkoreit, J. (2017). Attention Is All You Need. NeurIPS.",
        "formatted_ieee": 'A. Vaswani, N. Shazeer, N. Parmar, J. Uszkoreit, "Attention Is All You Need," NeurIPS, 2017.',
    },
    {
        "keywords": ["graph neural network", "gnn", "graph attention", "node classification"],
        "title": "Graph Attention Networks",
        "authors": ["Veličković, P.", "Cucurull, G.", "Casanova, A."],
        "journal": "ICLR",
        "year": 2018,
        "doi": "10.48550/arXiv.1710.10903",
        "formatted_apa": "Veličković, P., Cucurull, G., & Casanova, A. (2018). Graph Attention Networks. ICLR.",
        "formatted_ieee": 'P. Veličković, G. Cucurull, A. Casanova, "Graph Attention Networks," ICLR, 2018.',
    },
    {
        "keywords": ["convolutional neural network", "cnn", "image classification", "deep learning", "resnet"],
        "title": "Deep Residual Learning for Image Recognition",
        "authors": ["He, K.", "Zhang, X.", "Ren, S.", "Sun, J."],
        "journal": "CVPR",
        "year": 2016,
        "doi": "10.1109/CVPR.2016.90",
        "formatted_apa": "He, K., Zhang, X., Ren, S., & Sun, J. (2016). Deep Residual Learning for Image Recognition. CVPR.",
        "formatted_ieee": 'K. He, X. Zhang, S. Ren, J. Sun, "Deep Residual Learning for Image Recognition," CVPR, 2016.',
    },
    {
        "keywords": ["reinforcement learning", "q-learning", "policy gradient", "reward", "agent"],
        "title": "Playing Atari with Deep Reinforcement Learning",
        "authors": ["Mnih, V.", "Kavukcuoglu, K.", "Silver, D."],
        "journal": "NeurIPS Workshop",
        "year": 2013,
        "doi": "10.48550/arXiv.1312.5602",
        "formatted_apa": "Mnih, V., Kavukcuoglu, K., & Silver, D. (2013). Playing Atari with Deep Reinforcement Learning. NeurIPS Workshop.",
        "formatted_ieee": 'V. Mnih, K. Kavukcuoglu, D. Silver, "Playing Atari with Deep Reinforcement Learning," NeurIPS Workshop, 2013.',
    },
    {
        "keywords": ["natural language processing", "nlp", "language model", "text classification"],
        "title": "BERT: Pre-training of Deep Bidirectional Transformers",
        "authors": ["Devlin, J.", "Chang, M.", "Lee, K.", "Toutanova, K."],
        "journal": "NAACL",
        "year": 2019,
        "doi": "10.48550/arXiv.1810.04805",
        "formatted_apa": "Devlin, J., Chang, M., Lee, K., & Toutanova, K. (2019). BERT: Pre-training of Deep Bidirectional Transformers. NAACL.",
        "formatted_ieee": 'J. Devlin, M. Chang, K. Lee, K. Toutanova, "BERT: Pre-training of Deep Bidirectional Transformers," NAACL, 2019.',
    },
    {
        "keywords": ["generative adversarial", "gan", "image generation", "synthetic data"],
        "title": "Generative Adversarial Networks",
        "authors": ["Goodfellow, I.", "Pouget-Abadie, J.", "Mirza, M."],
        "journal": "NeurIPS",
        "year": 2014,
        "doi": "10.48550/arXiv.1406.2661",
        "formatted_apa": "Goodfellow, I., Pouget-Abadie, J., & Mirza, M. (2014). Generative Adversarial Networks. NeurIPS.",
        "formatted_ieee": 'I. Goodfellow, J. Pouget-Abadie, M. Mirza, "Generative Adversarial Networks," NeurIPS, 2014.',
    },
    {
        "keywords": ["federated learning", "distributed training", "privacy", "communication efficient"],
        "title": "Communication-Efficient Learning of Deep Networks from Decentralized Data",
        "authors": ["McMahan, B.", "Moore, E.", "Ramage, D."],
        "journal": "AISTATS",
        "year": 2017,
        "doi": "10.48550/arXiv.1602.05629",
        "formatted_apa": "McMahan, B., Moore, E., & Ramage, D. (2017). Communication-Efficient Learning of Deep Networks from Decentralized Data. AISTATS.",
        "formatted_ieee": 'B. McMahan, E. Moore, D. Ramage, "Communication-Efficient Learning of Deep Networks from Decentralized Data," AISTATS, 2017.',
    },
    {
        "keywords": ["transfer learning", "fine-tuning", "pretrained", "domain adaptation"],
        "title": "How transferable are features in deep neural networks?",
        "authors": ["Yosinski, J.", "Clune, J.", "Bengio, Y.", "Lipson, H."],
        "journal": "NeurIPS",
        "year": 2014,
        "doi": "10.48550/arXiv.1411.1792",
        "formatted_apa": "Yosinski, J., Clune, J., Bengio, Y., & Lipson, H. (2014). How transferable are features in deep neural networks? NeurIPS.",
        "formatted_ieee": 'J. Yosinski, J. Clune, Y. Bengio, H. Lipson, "How transferable are features in deep neural networks?" NeurIPS, 2014.',
    },
]


# ── APA / IEEE formatters ─────────────────────────────────────────────────────

def _format_apa(title: str, authors: list[str], journal: str | None, year: int | None) -> str:
    if not authors:
        auth_str = "Unknown"
    elif len(authors) == 1:
        auth_str = authors[0]
    elif len(authors) <= 7:
        auth_str = ", ".join(authors[:-1]) + ", & " + authors[-1]
    else:
        auth_str = ", ".join(authors[:6]) + ", ... & " + authors[-1]
    parts = [auth_str]
    if year:
        parts.append(f"({year}).")
    parts.append(f"{title}.")
    if journal:
        parts.append(f"{journal}.")
    return " ".join(parts)


def _format_ieee(title: str, authors: list[str], journal: str | None, year: int | None) -> str:
    if not authors:
        auth_str = "Unknown"
    elif len(authors) <= 3:
        auth_str = ", ".join(authors)
    else:
        auth_str = ", ".join(authors[:3]) + " et al."
    parts = [auth_str]
    parts.append(f'"{title},"')
    if journal:
        parts.append(f"{journal},")
    if year:
        parts.append(f"{year}.")
    return " ".join(parts)


# ── BibTeX parser ─────────────────────────────────────────────────────────────

def _parse_bibtex(bibtex_str: str) -> list[dict]:
    entries = []
    entry_re = re.compile(r'@(\w+)\s*\{([^,\s]+)\s*,([^@]*)\}', re.DOTALL | re.IGNORECASE)
    field_re = re.compile(r'(\w+)\s*=\s*(?:\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}|"([^"]*)")', re.DOTALL)

    for m in entry_re.finditer(bibtex_str):
        entry_type = m.group(1).lower()
        fields_str = m.group(3)
        fields: dict[str, str] = {}
        for fm in field_re.finditer(fields_str):
            key = fm.group(1).lower()
            val = (fm.group(2) or fm.group(3) or "").strip()
            fields[key] = val

        raw_authors = fields.get("author", "")
        if raw_authors:
            authors_list = [a.strip() for a in re.split(r'\s+and\s+', raw_authors, flags=re.IGNORECASE)]
        else:
            authors_list = []

        year_str = fields.get("year", "")
        year = int(year_str) if year_str.isdigit() else None

        title = fields.get("title", "Untitled").strip("{}")
        journal = (fields.get("journal") or fields.get("booktitle") or "").strip("{}")
        doi = fields.get("doi", "").strip("{}")

        entries.append({
            "type": entry_type,
            "title": title,
            "authors": authors_list,
            "journal": journal or None,
            "year": year,
            "doi": doi or None,
        })

    return entries


# ── Crossref DOI lookup ───────────────────────────────────────────────────────

async def _fetch_crossref(doi: str) -> dict:
    url = f"https://api.crossref.org/works/{doi}"
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.get(url, headers={"User-Agent": "ResearchHub/1.0 (mailto:admin@example.com)"})
    if resp.status_code != 200:
        raise HTTPException(status_code=404, detail=f"DOI not found: {doi}")
    data = resp.json().get("message", {})

    title_list = data.get("title", [])
    title = title_list[0] if title_list else "Unknown"

    raw_authors = data.get("author", [])
    authors = []
    for a in raw_authors:
        family = a.get("family", "")
        given = a.get("given", "")
        if family:
            authors.append(f"{family}, {given[0]}." if given else family)

    container = data.get("container-title", [])
    journal = container[0] if container else None

    date_parts = (
        data.get("published-print", {}).get("date-parts")
        or data.get("published-online", {}).get("date-parts")
        or data.get("published", {}).get("date-parts")
        or [[None]]
    )
    year = date_parts[0][0] if date_parts and date_parts[0] else None

    return {
        "title": title,
        "authors": authors,
        "journal": journal,
        "year": year,
        "doi": doi,
        "citation_type": data.get("type", "article"),
    }


# ── Access helpers ────────────────────────────────────────────────────────────

def _check_project_access(project_id: int, user: models.User, db: Session) -> bool:
    project = db.query(models.Project).filter(models.Project.id == project_id).first()
    if not project:
        return False
    if project.owner_id == user.id:
        return True
    return db.query(models.Collaborator).filter(
        models.Collaborator.project_id == project_id,
        models.Collaborator.user_id == user.id,
    ).first() is not None


def _check_write_access(project_id: int, user: models.User, db: Session) -> bool:
    project = db.query(models.Project).filter(models.Project.id == project_id).first()
    if not project:
        return False
    if project.owner_id == user.id:
        return True
    collab = db.query(models.Collaborator).filter(
        models.Collaborator.project_id == project_id,
        models.Collaborator.user_id == user.id,
    ).first()
    return collab is not None and collab.role in ("owner", "editor")


def _log_contribution(db: Session, user_id: int, project_id: int, action_type: str, score: int, meta: dict | None = None):
    db.add(models.Contribution(
        user_id=user_id,
        project_id=project_id,
        action_type=action_type,
        contribution_score=score,
        extra_data=json.dumps(meta or {}),
    ))
    db.commit()


def _db_to_read(c: models.Citation) -> CitationRead:
    try:
        authors = json.loads(c.authors)
    except Exception:
        authors = []
    return CitationRead(
        id=c.id,
        project_id=c.project_id,
        doi=c.doi,
        title=c.title,
        authors=authors,
        journal=c.journal,
        year=c.year,
        citation_type=c.citation_type,
        formatted_apa=c.formatted_apa,
        formatted_ieee=c.formatted_ieee,
        created_at=c.created_at,
    )


# ── Routes ────────────────────────────────────────────────────────────────────

@router.get("/projects/{project_id}/citations", response_model=List[CitationRead])
def list_citations(
    project_id: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not _check_project_access(project_id, current_user, db):
        raise HTTPException(status_code=403, detail="No access")
    citations = (
        db.query(models.Citation)
        .filter(models.Citation.project_id == project_id)
        .order_by(models.Citation.created_at.desc())
        .all()
    )
    return [_db_to_read(c) for c in citations]


class DoiLookupRequest(BaseModel):
    doi: str


@router.post("/projects/{project_id}/citations/doi", response_model=CitationRead, status_code=201)
async def add_citation_by_doi(
    project_id: int,
    body: DoiLookupRequest,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not _check_write_access(project_id, current_user, db):
        raise HTTPException(status_code=403, detail="Editor or owner access required")

    meta = await _fetch_crossref(body.doi.strip())

    apa = _format_apa(meta["title"], meta["authors"], meta["journal"], meta["year"])
    ieee = _format_ieee(meta["title"], meta["authors"], meta["journal"], meta["year"])

    citation = models.Citation(
        project_id=project_id,
        doi=meta["doi"],
        title=meta["title"],
        authors=json.dumps(meta["authors"]),
        journal=meta["journal"],
        year=meta["year"],
        citation_type=meta["citation_type"],
        formatted_apa=apa,
        formatted_ieee=ieee,
    )
    db.add(citation)
    db.commit()
    db.refresh(citation)
    _log_contribution(db, current_user.id, project_id, "citation_add", SCORE_CITATION_ADD, {"doi": body.doi})
    return _db_to_read(citation)


class BibtexImportRequest(BaseModel):
    bibtex: str


@router.post("/projects/{project_id}/citations/bibtex", response_model=List[CitationRead], status_code=201)
def import_bibtex(
    project_id: int,
    body: BibtexImportRequest,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not _check_write_access(project_id, current_user, db):
        raise HTTPException(status_code=403, detail="Editor or owner access required")

    entries = _parse_bibtex(body.bibtex)
    if not entries:
        raise HTTPException(status_code=400, detail="No valid BibTeX entries found")

    created = []
    for entry in entries:
        apa = _format_apa(entry["title"], entry["authors"], entry["journal"], entry["year"])
        ieee = _format_ieee(entry["title"], entry["authors"], entry["journal"], entry["year"])
        citation = models.Citation(
            project_id=project_id,
            doi=entry.get("doi"),
            title=entry["title"],
            authors=json.dumps(entry["authors"]),
            journal=entry.get("journal"),
            year=entry.get("year"),
            citation_type=entry.get("type", "article"),
            formatted_apa=apa,
            formatted_ieee=ieee,
        )
        db.add(citation)
        db.commit()
        db.refresh(citation)
        _log_contribution(db, current_user.id, project_id, "citation_add", SCORE_CITATION_ADD, {"title": entry["title"]})
        created.append(_db_to_read(citation))

    return created


@router.delete("/projects/{project_id}/citations/{citation_id}", status_code=204)
def delete_citation(
    project_id: int,
    citation_id: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not _check_write_access(project_id, current_user, db):
        raise HTTPException(status_code=403, detail="Editor or owner access required")
    citation = db.query(models.Citation).filter(
        models.Citation.id == citation_id,
        models.Citation.project_id == project_id,
    ).first()
    if not citation:
        raise HTTPException(status_code=404, detail="Citation not found")
    db.delete(citation)
    db.commit()


@router.get("/projects/{project_id}/citations/suggestions")
def get_suggestions(
    project_id: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not _check_project_access(project_id, current_user, db):
        raise HTTPException(status_code=403, detail="No access")

    manuscript = db.query(models.Manuscript).filter(
        models.Manuscript.project_id == project_id
    ).first()

    if not manuscript:
        return {"suggestions": SUGGESTIONS[:3]}

    try:
        content_dict = json.loads(manuscript.content)
    except Exception:
        content_dict = {}

    full_text = " ".join(content_dict.values()).lower()

    matched = []
    existing_titles = {
        s["title"].lower()
        for s in (
            db.query(models.Citation.title)
            .filter(models.Citation.project_id == project_id)
            .all()
        )
    }

    for suggestion in SUGGESTIONS:
        if suggestion["title"].lower() in existing_titles:
            continue
        if any(kw in full_text for kw in suggestion["keywords"]):
            matched.append(suggestion)

    if not matched:
        matched = [s for s in SUGGESTIONS if s["title"].lower() not in existing_titles][:3]

    return {"suggestions": matched}
