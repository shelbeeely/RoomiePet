"""
The VHS tapes' spine artwork, cut out of a photo of her shelf: each spine's four corners in
the photo (as it shows at 1500 px wide; it leans), straightened to a 48 x 320 picture in
client/public/tapes/ for the room builder, and boiled down to the few pixels a spine gets in
the room -- 1 x 9 at the scene's size, 2 x 18 drawn sharp -- in shared/tapeArt.js.

    python3 art/tapes.py path/to/shelf-photo.jpg

The photo itself stays out of the repo. A new tape: add its corners and label below.

The rest of the shelf is filled from the Retro-Daze VHS Tape Cover Collection on archive.org
(ARCHIVE below: each a scan of a whole sleeve, back, spine and front). Those aren't copied
into the app: each links to archive.org's picture of its page, which the room builder shows
whole as the cover and cropped to the spine strip as the spine; only the spine's few averaged
colours, for the room, are worked out here.
"""
import io
import json
import os
import sys
import urllib.request

from PIL import Image, ImageOps

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, "..")

# id: (label, corners top-left, bottom-left, bottom-right, top-right)
SPINES = {
    "independence_day_1": ("Independence Day", [[357, 628], [273, 1020], [332, 1016], [408, 622]]),
    "independence_day_2": ("Independence Day (the other one)", [[412, 622], [335, 1012], [393, 1006], [466, 616]]),
    "the_matrix": ("The Matrix", [[461, 716], [401, 1113], [456, 1108], [510, 708]]),
    "matrix_reloaded": ("Matrix Reloaded", [[513, 706], [457, 1108], [515, 1102], [572, 698]]),
    "matrix_revolutions": ("Matrix Revolutions", [[576, 698], [517, 1102], [578, 1096], [636, 690]]),
    "indiana_jones": ("Indiana Jones", [[641, 682], [582, 1094], [640, 1088], [697, 676]]),
    "memorex_blank": ("Memorex blank", [[852, 642], [838, 862], [970, 860], [978, 640]]),   # its box, cover out
}


COLLECTION = "retro-daze_vcs_tape_cover_collection"
# id: (title, page of the collection)
ARCHIVE = {
    "twelve_monkeys": ("12 Monkeys", 0), "beetlejuice": ("Beetlejuice", 96), "care_bears": ("Care Bears", 152),
    "death_wish": ("Death Wish", 240), "dinosaurs": ("Dinosaurs", 256), "grinch_night": ("Grinch Night", 272),
    "ducktales": ("DuckTales", 280), "godzilla": ("Godzilla", 360), "masters_universe": ("Masters of the Universe", 496),
    "rugrats": ("Rugrats", 648), "sonic": ("Sonic the Hedgehog", 696), "starchaser": ("Starchaser", 704),
    "turtles": ("Ninja Turtles", 744), "wizards": ("Wizards", 1000),
}
# The sleeves lie back | spine | front: where the spine is, as shares of the scan's width.
SPINE = (0.455, 0.08)
TAPE_COLORS = {
    "black": "#1f1c26", "silver": "#8e96a3", "teal": "#2f8f8a", "red": "#c8323c", "orange": "#e8894a", "peach": "#f2b3a0",
    "yellow": "#efc23a", "green": "#3f8a4a", "blue": "#2f5fb8", "purple": "#7a4fb0", "pink": "#f08cb8", "white": "#ece8e0",
}


def fetch(url, tries=4):
    """A picture from archive.org, tried again when it's slow (a crop is made the first time it's asked for)."""
    for k in range(tries):
        try:
            with urllib.request.urlopen(url, timeout=180) as res:
                return Image.open(io.BytesIO(res.read())).convert("RGB")
        except OSError:
            if k == tries - 1:
                raise


def page_url(page):
    return f"https://archive.org/download/{COLLECTION}/page/n{page}_w400.jpg"


def nearest(rgb):
    def dist(h):
        c = tuple(int(h[i:i + 2], 16) for i in (1, 3, 5))
        return sum((a - b) ** 2 for a, b in zip(c, rgb))
    return min(TAPE_COLORS, key=lambda k: dist(TAPE_COLORS[k]))


def grids(im):
    hx = lambda p: "#%02x%02x%02x" % p
    hd = im.resize((2, 18), Image.BOX)
    lo = im.resize((1, 9), Image.BOX)
    return ([[hx(hd.getpixel((x, y))) for x in range(2)] for y in range(18)],
            [[hx(lo.getpixel((0, y)))] for y in range(9)])


def main(photo):
    src = ImageOps.exif_transpose(Image.open(photo)).convert("RGB")
    k = src.width / 1500
    out = os.path.join(ROOT, "client", "public", "tapes")
    os.makedirs(out, exist_ok=True)
    hx = lambda p: "#%02x%02x%02x" % p
    art = {}
    for name, (label, quad) in SPINES.items():
        im = src.transform((48, 320), Image.QUAD, [c * k for pt in quad for c in pt], Image.BICUBIC)
        im = ImageOps.autocontrast(im, cutoff=1)                     # the photo was dim and warm
        im.save(os.path.join(out, f"{name}.png"), optimize=True)
        hd, lo = grids(im)
        art[name] = {"label": label, "img": f"/tapes/{name}.png", "hd": hd, "lo": lo}
    archive = {}
    for name, (title, page) in ARCHIVE.items():
        sleeve = fetch(page_url(page))
        x0 = round(sleeve.width * SPINE[0])
        im = sleeve.crop((x0, 0, x0 + round(sleeve.width * SPINE[1]), sleeve.height))
        hd, lo = grids(im)
        art[name] = {"label": title, "img": page_url(page), "spine": list(SPINE), "hd": hd, "lo": lo}
        archive[name] = {"t": title, "c": nearest(im.resize((1, 1), Image.BOX).getpixel((0, 0))), "a": name,
                         "cover": page_url(page)}
    body = ",\n".join(f"  {json.dumps(k)}: {json.dumps(v, separators=(',', ':'))}" for k, v in art.items())
    with open(os.path.join(ROOT, "shared", "tapeArt.js"), "w") as fh:
        fh.write("// Spine artwork for the VHS tapes, from the photo of her shelf (client/public/tapes/*.png are the\n"
                 "// spines cut out of it and straightened): each boiled down to the few pixels a spine gets in the room,\n"
                 "// top to bottom -- 1 x 9 at the scene's size, 2 x 18 drawn sharp. Written by art/tapes.py; don't edit.\n"
                 f"export const TAPE_ART = {{\n{body},\n}};\n\n"
                 "// The tapes from the Retro-Daze collection on archive.org, as tapes for the shelf: spine colour,\n"
                 "// spine art and a link to the front of the sleeve.\n"
                 f"export const ARCHIVE_TAPES = {{\n" + ",\n".join(f"  {json.dumps(k)}: {json.dumps(v)}" for k, v in archive.items()) + ",\n};\n")
    print("wrote", len(art), "spines")


if __name__ == "__main__":
    main(sys.argv[1])
