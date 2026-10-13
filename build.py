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

VARIANTS = {
    "crux-playable-mraid.html": '<script src="mraid.js"></script>',
    "crux-playable-meta.html": "",
}

LIMITS = {
    "crux-playable-mraid.html": 5 * 1024 * 1024,
    "crux-playable-meta.html": 2 * 1024 * 1024,
}


def b64(path):
    return base64.b64encode(path.read_bytes()).decode("ascii")


def main():
    script = "\n".join((SRC / name).read_text(encoding="utf-8") for name in ("engine.js", "route.js", "assist.js", "game.js"))
    sfx = {p.stem: b64(p) for p in sorted((ASSETS / "sfx").glob("*.wav"))}
    page = (SRC / "template.html").read_text(encoding="utf-8")
    for token, name in FONTS.items():
        page = page.replace(token, b64(ASSETS / "fonts" / name))
    music = json.loads((ASSETS / "music" / "loop.json").read_text(encoding="utf-8"))
    music["data"] = b64(ASSETS / "music" / "loop.mp3")
    page = page.replace("__SFX__", json.dumps(sfx)).replace("__MUSIC__", json.dumps(music)).replace("__SCRIPT__", script)
    DIST.mkdir(exist_ok=True)
    ok = True
    for name, mraid in VARIANTS.items():
        out = DIST / name
        out.write_text(page.replace("__MRAID__", mraid), encoding="utf-8")
        size = out.stat().st_size
        limit = LIMITS.get(name)
        flag = "" if limit is None else (" ok" if size <= limit else f" OVER {limit // 1024} KB")
        ok = ok and (limit is None or size <= limit)
        print(f"{name:32} {size / 1024:8.1f} KB{flag}")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
