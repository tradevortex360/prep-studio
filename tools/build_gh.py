#!/usr/bin/env python3
"""Prep Studio GitHub Pages builder.
usage: build_gh.py add NAME | remove ID | rotate | list | build
Private material lives in private/master.json (never pushed)."""
import json, os, sys, secrets, base64, shutil, datetime
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from cryptography.hazmat.primitives import hashes

HERE = os.path.dirname(os.path.abspath(__file__))
SITE = "/home/claude/site"
PRIV = os.path.join(HERE, "private", "master.json")
DIST = os.path.join(HERE, "dist")
ITER = 600_000
ALPH = "abcdefghjkmnpqrstuvwxyz23456789"
b64 = lambda b: base64.b64encode(b).decode()

def load():
    if os.path.exists(PRIV):
        return json.load(open(PRIV))
    os.makedirs(os.path.dirname(PRIV), exist_ok=True)
    m = {"v": 1, "ck": b64(AESGCM.generate_key(256)), "people": {}, "clientId": "", "repo": "prep-studio"}
    json.dump(m, open(PRIV, "w"), indent=1); return m

def save(m): json.dump(m, open(PRIV, "w"), indent=1)
def rnd(n): return "".join(secrets.choice(ALPH) for _ in range(n))
def fmt(pid, sec): return f"{pid}-{sec[:4]}-{sec[4:]}"

def add(m, name):
    pid = rnd(4)
    while pid in m["people"]: pid = rnd(4)
    sec = rnd(8)
    m["people"][pid] = {"name": name, "secret": sec, "added": datetime.date.today().isoformat()}
    save(m); print(f"{name}: {fmt(pid, sec)}")

def wrap(ck, secret):
    salt = secrets.token_bytes(16); iv = secrets.token_bytes(12)
    kek = PBKDF2HMAC(algorithm=hashes.SHA256(), length=32, salt=salt, iterations=ITER).derive(secret.encode())
    return {"salt": b64(salt), "iv": b64(iv), "wrapped": b64(AESGCM(kek).encrypt(iv, ck, None))}

def enc(ck, data):
    iv = secrets.token_bytes(12)
    return {"iv": b64(iv), "ct": b64(AESGCM(ck).encrypt(iv, data, None))}

def build(m):
    ck = base64.b64decode(m["ck"])
    out = os.path.join(DIST, "ido")
    if os.path.exists(DIST):
        for f in os.listdir(DIST):
            if f == ".git": continue
            p = os.path.join(DIST, f); shutil.rmtree(p) if os.path.isdir(p) else os.remove(p)
    os.makedirs(os.path.join(out, "content"), exist_ok=True)
    for f in sorted(os.listdir(os.path.join(SITE, "content"))):
        if f.endswith(".json"):
            raw = open(os.path.join(SITE, "content", f), "rb").read()
            json.dump(enc(ck, raw), open(os.path.join(out, "content", f + ".enc"), "w"))
    keys = {"v": m["v"], "iter": ITER, "people": {pid: wrap(ck, p["secret"]) for pid, p in m["people"].items()}}
    json.dump(keys, open(os.path.join(out, "keys.json"), "w"))
    env = open(os.path.join(HERE, "gh_env.js")).read().replace("/*CFG*/{}", json.dumps({"clientId": m.get("clientId", "")}))
    html = open(os.path.join(SITE, "index.html")).read()
    html = html.replace("<title>IDO Exam Study App</title>", "<title>IDO Prep · Prep Studio</title>\n<meta name=\"robots\" content=\"noindex\">")
    html = html.replace("</head>", "<script>\n" + env + "\n</script>\n</head>", 1)
    open(os.path.join(out, "index.html"), "w").write(html)
    open(os.path.join(DIST, ".nojekyll"), "w").write("")
    open(os.path.join(DIST, "index.html"), "w").write(LANDING)
    open(os.path.join(DIST, "robots.txt"), "w").write("User-agent: *\nDisallow: /\n")
    print("built", len(m["people"]), "people, key v", m["v"])

LANDING = """<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Prep Studio</title><meta name="robots" content="noindex">
<link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;600;700&display=swap" rel="stylesheet">
<style>:root{--bg:#f4f6f9;--surface:#fff;--ink:#152033;--muted:#5b6678;--line:#dfe4ec;--gold:#a8701a;color-scheme:light}
@media (prefers-color-scheme:dark){:root{--bg:#0e131a;--surface:#161d27;--ink:#e6ebf2;--muted:#9aa5b5;--line:#283241;--gold:#e3ad55;color-scheme:dark}}
body{margin:0;background:var(--bg);color:var(--ink);font-family:Manrope,system-ui,sans-serif}main{max-width:640px;margin:0 auto;padding:48px 16px}
h1{font-size:28px;margin:0 0 6px}h1 span{color:var(--gold)}p{color:var(--muted)}a.c{display:block;margin-top:20px;padding:18px;border:1px solid var(--line);border-radius:12px;background:var(--surface);color:var(--ink);text-decoration:none}
a.c b{font-size:18px}a.c:hover{border-color:var(--gold)}</style></head>
<body><main><h1>Prep <span>Studio</span></h1><p>Private study courses. You need a personal access code to open a course.</p>
<a class="c" href="ido/"><b>WBPSC Industrial Development Officer (IDO)</b><br><span style="color:var(--muted)">Lessons, past papers, mocks and a study plan</span></a></main></body></html>"""

if __name__ == "__main__":
    m = load(); cmd = sys.argv[1] if len(sys.argv) > 1 else "build"
    if cmd == "add": add(m, " ".join(sys.argv[2:]))
    elif cmd == "remove": m["people"].pop(sys.argv[2], None); save(m); print("removed", sys.argv[2])
    elif cmd == "rotate": m["ck"] = b64(AESGCM.generate_key(256)); m["v"] += 1; save(m); print("rotated to v", m["v"])
    elif cmd == "list":
        for pid, p in m["people"].items(): print(p["name"], fmt(pid, p["secret"]), p["added"])
    elif cmd == "build": build(m)
