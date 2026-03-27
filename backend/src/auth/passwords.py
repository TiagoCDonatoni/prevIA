from __future__ import annotations

import base64
import hashlib
import hmac
import os


PBKDF2_ALGORITHM = "pbkdf2_sha256"
PBKDF2_ITERATIONS = 600_000
PASSWORD_MIN_LENGTH = 8


def validate_password_policy(raw_password: str) -> None:
    password = str(raw_password or "")
    if len(password) < PASSWORD_MIN_LENGTH:
        raise ValueError("WEAK_PASSWORD")


def hash_password(raw_password: str) -> str:
    validate_password_policy(raw_password)

    salt = os.urandom(16)
    digest = hashlib.pbkdf2_hmac(
        "sha256",
        raw_password.encode("utf-8"),
        salt,
        PBKDF2_ITERATIONS,
    )

    salt_b64 = base64.b64encode(salt).decode("utf-8")
    digest_b64 = base64.b64encode(digest).decode("utf-8")

    return f"{PBKDF2_ALGORITHM}${PBKDF2_ITERATIONS}${salt_b64}${digest_b64}"


def verify_password(raw_password: str, stored_hash: str | None) -> bool:
    if not stored_hash:
        return False

    try:
        algorithm, iterations_raw, salt_b64, digest_b64 = str(stored_hash).split("$", 3)
        if algorithm != PBKDF2_ALGORITHM:
            return False

        iterations = int(iterations_raw)
        salt = base64.b64decode(salt_b64.encode("utf-8"))
        expected_digest = base64.b64decode(digest_b64.encode("utf-8"))
    except Exception:
        return False

    candidate = hashlib.pbkdf2_hmac(
        "sha256",
        str(raw_password or "").encode("utf-8"),
        salt,
        iterations,
    )

    return hmac.compare_digest(candidate, expected_digest)