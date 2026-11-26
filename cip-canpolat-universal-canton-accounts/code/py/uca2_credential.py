"""UCA-2 account credential, Python reference. Same canonical form as ts/uca2-credential.ts.

Requires: cryptography
"""
import hashlib
import json

from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey, Ed25519PublicKey
from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat

CREDENTIAL_TYPE = "uca-account-v1"


def account_id(namespace_public_key_hex: str) -> str:
    pk = bytes.fromhex(namespace_public_key_hex)
    if len(pk) != 32:
        raise ValueError("public_key_must_be_32_bytes")
    return hashlib.sha256(pk).hexdigest()[:48]


def canonical(value) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def issue_credential(namespace_private_key_hex: str, claims: dict) -> dict:
    priv = Ed25519PrivateKey.from_private_bytes(bytes.fromhex(namespace_private_key_hex))
    ns_pub = priv.public_key().public_bytes(Encoding.Raw, PublicFormat.Raw).hex()
    full = {"type": CREDENTIAL_TYPE, "accountId": account_id(ns_pub), "namespacePublicKey": ns_pub, **claims}
    return {"claims": full, "signature": priv.sign(canonical(full).encode()).hex()}


def verify_signature(cred: dict) -> bool:
    c = cred["claims"]
    if c.get("type") != CREDENTIAL_TYPE or c.get("accountId") != account_id(c["namespacePublicKey"]):
        return False
    try:
        Ed25519PublicKey.from_public_bytes(bytes.fromhex(c["namespacePublicKey"])).verify(
            bytes.fromhex(cred["signature"]), canonical(c).encode())
        return True
    except Exception:
        return False


if __name__ == "__main__":
    import pathlib
    import sys

    cred = json.loads(pathlib.Path(sys.argv[1]).read_text())
    print("python verifies credential:", verify_signature(cred))
