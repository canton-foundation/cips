"""UCA-3 request signing, Python reference (wallet side)."""
import hashlib
import time

from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey


def canonical_message(ts: int, method: str, path: str, body: str) -> bytes:
    return f"{ts}\n{method.upper()}\n{path}\n{hashlib.sha256(body.encode()).hexdigest()}".encode()


def sign_request(private_key_hex: str, party: str, method: str, path: str, body: str = "") -> dict:
    ts = int(time.time() * 1000)
    key = Ed25519PrivateKey.from_private_bytes(bytes.fromhex(private_key_hex))
    sig = key.sign(canonical_message(ts, method, path, body))
    return {"X-UCA-Party": party, "X-UCA-Ts": str(ts), "X-UCA-Sig": sig.hex()}
