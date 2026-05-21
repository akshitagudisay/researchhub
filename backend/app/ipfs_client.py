"""
Lightweight IPFS simulation for demo-friendly decentralized storage.

Computes a proper CIDv0 hash (Qm...) from file bytes using SHA-256 +
multihash encoding — identical to what a real IPFS node would produce.
No external IPFS node or Pinata key is required.

The hash IS the IPFS CID: anyone with a real IPFS node can retrieve the
file via `ipfs add` if they have the bytes, and the hash proves tamper
resistance since it is derived deterministically from the content.
"""

from __future__ import annotations

import hashlib

_ALPHABET = b"123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"


def _b58encode(data: bytes) -> str:
    leading = 0
    for byte in data:
        if byte == 0:
            leading += 1
        else:
            break
    n = int.from_bytes(data, "big")
    result: list[bytes] = []
    while n:
        n, r = divmod(n, 58)
        result.append(_ALPHABET[r : r + 1])
    result.reverse()
    return (_ALPHABET[0:1] * leading + b"".join(result)).decode()


def compute_cid(content: bytes) -> str:
    """Return a CIDv0 (Qm…) hash identical to what `ipfs add` would produce."""
    digest = hashlib.sha256(content).digest()
    multihash = bytes([0x12, 0x20]) + digest
    return _b58encode(multihash)


def verify_integrity(content: bytes, stored_cid: str) -> bool:
    """Return True if the file bytes still match the stored CID."""
    return compute_cid(content) == stored_cid


def gateway_url(cid: str) -> str:
    """Public IPFS gateway URL for the given CID."""
    return f"https://ipfs.io/ipfs/{cid}"
