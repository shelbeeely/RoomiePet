"""
A sample at 32 x 32 -- four times the pixels of the pets now (16 x 16) -- to
see what a bigger grid buys before redrawing every pet. The stitched bunny,
lilac, as one frame: drawn with shapes (ellipses for body and ears), then an
outline and light/shade edges worked out by code, then the details placed by
hand: an X-stitched eye, a button eye with four holes, a zigzag stitched
mouth, a bandaged ear, a stitched patch, a shaded heart, stuffing at a seam.

    python3 art/sample32.py   -> art/sample32.json, art/sample32-preview.png
It is not part of the app's sprites.
"""
import json
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
N = 32


def canvas():
    return [["."] * N for _ in range(N)]


def ellipse(g, cx, cy, rx, ry, ch, only=None):
    for y in range(N):
        for x in range(N):
            if ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2 <= 1 and (only is None or g[y][x] in only):
                g[y][x] = ch


def put(g, points, ch):
    for x, y in points:
        g[y][x] = ch


def blit(g, x0, y0, rows, keep="."):
    for y, row in enumerate(rows):
        for x, ch in enumerate(row):
            if ch != keep:
                g[y0 + y][x0 + x] = ch


def shade(g, body="b", light="l", dark="d"):
    """Light from the top-left: body pixels on the upper-left rim go light, the lower-right rim (2 deep) dark."""
    out = [row[:] for row in g]
    inside = lambda x, y: 0 <= x < N and 0 <= y < N and g[y][x] != "."
    for y in range(N):
        for x in range(N):
            if g[y][x] != body:
                continue
            if not inside(x + 1, y + 1) or not inside(x + 2, y + 2) or not inside(x, y + 2):
                out[y][x] = dark
            elif not inside(x - 1, y - 1) and y < 22:
                out[y][x] = light
    return out


def outline(g, ch="o"):
    edge = [(x, y) for y in range(N) for x in range(N) if g[y][x] == "." and any(
        0 <= x + dx < N and 0 <= y + dy < N and g[y + dy][x + dx] not in ".o"
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)))]
    put(g, edge, ch)
    return g


g = canvas()
# Shapes: ears, then one round body-head, then feet.
ellipse(g, 10.5, 8, 3.2, 7.5, "b")
ellipse(g, 21.5, 8, 3.2, 7.5, "b")
ellipse(g, 16, 20.5, 13, 9.8, "b")
ellipse(g, 10, 29.6, 3.4, 1.8, "b")
ellipse(g, 22, 29.6, 3.4, 1.8, "b")
g = shade(g)
ellipse(g, 10.5, 8, 1.4, 5.5, "p")                # inside the ears
ellipse(g, 21.5, 8, 1.4, 5.5, "p")
ellipse(g, 16, 25.5, 6.5, 4, "w", only="bld")     # tummy

# Left eye: sewn shut with a thick X.
put(g, [(8 + i, 16 + i) for i in range(5)] + [(12 - i, 16 + i) for i in range(5)], "x")
put(g, [(9 + i, 16 + i) for i in range(4)] + [(11 - i, 16 + i) for i in range(4)], "x")
# Right eye: a round button, four holes, thread through them, a shine.
ellipse(g, 22, 18.5, 3.3, 3.3, "u")
ellipse(g, 22, 18.5, 2.3, 2.3, "U")
put(g, [(21, 17), (23, 17), (21, 19), (23, 19)], "v")
put(g, [(22, 18)], "x")
put(g, [(20, 16)], "h")
# A zigzag stitched mouth, pink cheeks.
put(g, [(13, 23), (14, 24), (15, 23), (16, 24), (17, 23), (18, 24), (19, 23)], "m")
put(g, [(6, 21), (7, 21), (25, 21), (26, 21)], "c")

# The right ear bandaged, wrapped twice, a loose end hanging.
blit(g, 18, 5, [
    "BBBBBBB",
    "CBBBBBC",
    "BBBCBBB",
    "BBBBBBB",
])
blit(g, 25, 8, ["B.", "BB", ".B", ".C"])
# Stuffing puffing out of a split seam on top of the head, stitches either side.
blit(g, 14, 9, [
    ".WWW.",
    "WWWWW",
    "xWWWx",
])
# A patch sewn on the left of the tummy, stitches round it.
blit(g, 5, 23, [
    "x.x.x",
    "qqqqq",
    "xqqqx",
    "qqqqq",
    "x.x.x",
])
# A heart sewn on the right of the tummy.
blit(g, 18, 25, [
    ".rr.rr.",
    "rhrrrrr",
    "rrrrrrR",
    ".rrrrR.",
    "..rRR..",
    "...R...",
])
g = outline(g)

palette = {
    "o": "#2b2238", "b": "#c9b6e8", "l": {"from": "b", "shade": 1.35}, "d": {"from": "b", "shade": 0.8, "hue": -8},
    "p": "#f2a6b8", "w": "#f6f0fb", "x": "#4a2c4a", "u": "#2b2238", "U": "#4a3a5e", "v": "#a99bc4", "h": "#ffffff",
    "m": "#4a2c4a", "c": "#f4a6c0", "B": "#f4ecd8", "C": {"from": "B", "shade": 0.82}, "W": "#fffaf0",
    "q": {"from": "b", "hue": 70, "shade": 0.85, "sat": 1.3}, "r": "#d64560", "h2": "#ffffff",
    "R": {"from": "r", "shade": 0.68},
}
palette.pop("h2")
spec = {"palette": palette, "sprites": {"stitched32": {"frames": {"lilac": ["".join(r) for r in g]}}}}
with open(os.path.join(HERE, "sample32.json"), "w") as fh:
    json.dump(spec, fh, indent=1)
tool = os.path.join(HERE, "..", ".claude", "skills", "pixel-art", "scripts", "pixelart.py")
out = os.path.join(HERE, "..", "build-sample32")
subprocess.run([sys.executable, tool, "render", os.path.join(HERE, "sample32.json"), "--out", out, "--preview-scale", "10"], check=True)
os.replace(os.path.join(out, "preview.png"), os.path.join(HERE, "sample32-preview.png"))
for f in os.listdir(out):
    os.remove(os.path.join(out, f))
os.rmdir(out)
print("\n".join("".join(r) for r in g))
