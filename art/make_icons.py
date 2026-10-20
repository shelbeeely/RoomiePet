"""
The app's icons, from the pixel art (no image library needed): the ginger
cat's happy face on the app's colour, at the sizes iOS and Android ask for,
plus a white silhouette for Android's notification badge. Run by `npm run art`.
"""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", ".claude", "skills", "pixel-art", "scripts"))
import pixelart  # noqa: E402

OUT = os.path.join(HERE, "..", "client", "public", "icons")
BG = (255, 243, 224, 255)       # cream: the ginger cat stands out on it
BG_DARK = (43, 34, 56, 255)


def sprite(key="cat@ginger", frame="happy"):
    spec = pixelart.load(os.path.join(HERE, "sprites.json"))
    for k, frames, _ in pixelart.compile_spec(spec):
        if k == key:
            return frames[frame]
    raise SystemExit(f"no {key}/{frame}")


def icon(size, grid, art_fraction, bg, round_corners=False):
    """The sprite scaled by a whole number to about art_fraction of the icon, centred on bg."""
    scale = max(1, int(size * art_fraction) // len(grid))
    art = pixelart.scaled(grid, scale)
    out = pixelart.blank(size, size, bg)
    x0 = (size - len(art[0])) // 2
    y0 = (size - len(art)) // 2
    pixelart.paste(out, art, x0, y0, over=True)
    if round_corners:  # only for the favicon; iOS and Android round their own
        r = size // 5
        for y in range(size):
            for x in range(size):
                cx = r if x < r else size - 1 - r if x >= size - r else x
                cy = r if y < r else size - 1 - r if y >= size - r else y
                if (x - cx) ** 2 + (y - cy) ** 2 > r * r:
                    out[y][x] = None
    return out


def silhouette(size, grid, art_fraction=0.7):
    """White where the cat is, clear elsewhere: Android tints this for the status bar."""
    white = [[(255, 255, 255, 255) if p else None for p in row] for row in grid]
    return icon(size, white, art_fraction, None)


def write(name, pixels):
    os.makedirs(OUT, exist_ok=True)
    with open(os.path.join(OUT, name), "wb") as fh:
        fh.write(pixelart.png_bytes(pixels))


cat = sprite()
write("icon-192.png", icon(192, cat, 0.75, BG))
write("icon-512.png", icon(512, cat, 0.75, BG))
# Maskable: Android may crop to a circle, so the art stays inside the middle 60%.
write("maskable-512.png", icon(512, cat, 0.56, BG))
write("apple-touch-icon.png", icon(180, cat, 0.72, BG))
write("badge-96.png", silhouette(96, cat))
write("favicon-64.png", icon(64, cat, 0.75, BG, round_corners=True))
# Small icons for the long-press shortcuts on Android.
write("shortcut-chores.png", icon(96, sprite("bowl", "full"), 0.8, BG_DARK))
write("shortcut-add.png", icon(96, sprite("cat@mint", "idle_0"), 0.7, BG_DARK))
print("icons ->", os.path.relpath(OUT))
