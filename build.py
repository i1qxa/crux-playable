import base64
import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent
SRC = ROOT / "src"
ASSETS = ROOT / "assets"
DIST = ROOT / "dist"

FONTS = {
    "__FONT_BARLOW_400__": "barlow_400.ttf",
    "__FONT_COND_500__": "barlow_condensed_500.ttf",
    "__FONT_COND_600__": "barlow_condensed_600.ttf",
    "__FONT_COND_700__": "barlow_condensed_700.ttf",
}

MODES = ("tide", "race")

NETWORKS = {
    "mraid": ('<script src="mraid.js"></script>', 5 * 1024 * 1024),
    "meta": ("", 2 * 1024 * 1024),
}

ART_TYPES = {".png": "image/png", ".webp": "image/webp", ".jpg": "image/jpeg", ".jpeg": "image/jpeg"}


def b64(path):
    return base64.b64encode(path.read_bytes()).decode("ascii")


def main():
    script = "\n".join((SRC / name).read_text(encoding="utf-8") for name in ("engine.js", "route.js", "assist.js", "race.js", "game.js"))
    sfx = {p.stem: b64(p) for p in sorted((ASSETS / "sfx").glob("*.wav"))}
    page = (SRC / "template.html").read_text(encoding="utf-8")
    for token, name in FONTS.items():
        page = page.replace(token, b64(ASSETS / "fonts" / name))
    music = json.loads((ASSETS / "music" / "loop.json").read_text(encoding="utf-8"))
    music["data"] = b64(ASSETS / "music" / "loop.mp3")
    art = {p.stem: f"data:{ART_TYPES[p.suffix.lower()]};base64,{b64(p)}" for p in sorted((ASSETS / "art").iterdir()) if p.suffix.lower() in ART_TYPES}
    page = page.replace("__SFX__", json.dumps(sfx)).replace("__MUSIC__", json.dumps(music)).replace("__SCRIPT__", script)
    DIST.mkdir(exist_ok=True)
    for old in DIST.glob("*.html"):
        old.unlink()
    ok = True
    for mode in MODES:
        picked = {k: v for k, v in art.items() if "_" not in k or k.endswith("_" + mode)}
        print(f"{mode} art:", ", ".join(sorted(picked)) or "none")
        moded = page.replace("__ART__", json.dumps(picked))
        for network, (mraid, limit) in NETWORKS.items():
            name = f"crux-{mode}-{network}.html"
            out = DIST / name
            out.write_text(moded.replace("__MRAID__", mraid).replace("__MODE__", mode), encoding="utf-8")
            size = out.stat().st_size
            fits = size <= limit
            ok = ok and fits
            print(f"{name:28} {size / 1024:8.1f} KB {'ok' if fits else f'OVER {limit // 1024} KB'}")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
