"""UCA-1 key derivation and UCA-2 hint, Python reference.

Standard: BIP-39 seed -> SLIP-0010 ed25519 (hardened only).
  Namespace key:  m/44'/6767'/a'/0'/0'  (fixes the partyID)
  Signing key i:  m/44'/6767'/a'/1'/i'  (rotates without changing the partyID)
Requires: cryptography
"""
import hashlib
import hmac
import unicodedata

from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat

CANTON_COIN_TYPE = 6767
HARDENED = 0x80000000


def bip39_seed(mnemonic: str, passphrase: str = "") -> bytes:
    # Wordlist checksum validation is left to the wallet's BIP-39 library.
    m = unicodedata.normalize("NFKD", " ".join(mnemonic.strip().lower().split()))
    salt = unicodedata.normalize("NFKD", "mnemonic" + passphrase)
    return hashlib.pbkdf2_hmac("sha512", m.encode(), salt.encode(), 2048)


def slip10_ed25519(seed: bytes, path: list[int]) -> tuple[bytes, bytes]:
    i = hmac.new(b"ed25519 seed", seed, hashlib.sha512).digest()
    key, chain = i[:32], i[32:]
    for index in path:
        data = b"\x00" + key + ((index | HARDENED) & 0xFFFFFFFF).to_bytes(4, "big")
        i = hmac.new(chain, data, hashlib.sha512).digest()
        key, chain = i[:32], i[32:]
    return key, chain


def public_key(priv: bytes) -> bytes:
    return Ed25519PrivateKey.from_private_bytes(priv).public_key().public_bytes(Encoding.Raw, PublicFormat.Raw)


def party_hint(pub: bytes) -> str:
    return hashlib.sha256(pub).hexdigest()[:48]


def derive_signing(mnemonic: str, account: int = 0, index: int = 0) -> dict:
    priv, _ = slip10_ed25519(bip39_seed(mnemonic), [44, CANTON_COIN_TYPE, account, 1, index])
    pub = public_key(priv)
    return {"scheme": "uca-1-signing", "path": f"m/44'/{CANTON_COIN_TYPE}'/{account}'/1'/{index}'",
            "privateKey": priv.hex(), "publicKey": pub.hex()}


LEGACY_SCHEMES = {
    "wallet-sdk-seed32": lambda seed: seed[:32],
}


def register_context_scheme(name: str, context: str) -> None:
    LEGACY_SCHEMES[name] = lambda seed: hashlib.sha256(seed + context.encode()).digest()


def derive_all(mnemonic: str, accounts: int = 1) -> list[dict]:
    seed = bip39_seed(mnemonic)
    out = []
    for a in range(accounts):
        priv, _ = slip10_ed25519(seed, [44, CANTON_COIN_TYPE, a, 0, 0])
        out.append({"scheme": "uca-1", "path": f"m/44'/{CANTON_COIN_TYPE}'/{a}'/0'/0'", "privateKey": priv.hex()})
    for name, fn in LEGACY_SCHEMES.items():
        out.append({"scheme": name, "privateKey": fn(seed).hex()})
    for k in out:
        pub = public_key(bytes.fromhex(k["privateKey"]))
        k["publicKey"] = pub.hex()
        k["hint"] = party_hint(pub)
    return out


if __name__ == "__main__":
    import json
    import pathlib
    import sys

    register_context_scheme("vendor-native-v1", "VENDOR_CONTEXT")
    vec = json.loads(pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else "vectors.json").read_text())
    got = derive_all(vec["mnemonic"], 2)
    want = vec["keys"]
    for g, w in zip(got, want):
        for f in ("scheme", "privateKey", "publicKey", "hint"):
            assert g[f] == w[f], (f, g, w)
    sig = [derive_signing(vec["mnemonic"], 0, i) for i in range(2)]
    for g, w in zip(sig, vec["signingKeys"]):
        for f in ("path", "privateKey", "publicKey"):
            assert g[f] == w[f], (f, g, w)
    print("python matches vectors:", len(got), "keys,", len(sig), "signing keys")
