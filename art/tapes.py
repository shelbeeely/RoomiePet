"""
The VHS tapes' spine artwork, cut out of a photo of her shelf: each spine's four corners in
the photo (as it shows at 1500 px wide; it leans), straightened to a 48 x 320 picture in
client/public/tapes/ for the room builder, and boiled down to the few pixels a spine gets in
the room -- 1 x 9 at the scene's size, 2 x 18 drawn sharp -- in shared/tapeArt.js.

    python3 art/tapes.py path/to/shelf-photo.jpg [path/to/floppies-front.jpg]

The photo itself stays out of the repo. A new tape: add its corners and label below.

The rest of the shelf is filled from the Retro-Daze VHS Tape Cover Collection on archive.org
(ARCHIVE below: each a scan of a whole sleeve, back, spine and front). Those aren't copied
into the app: each links to archive.org's picture of its page, which the room builder shows
whole as the cover and cropped to the spine strip as the spine; only the spine's few averaged
colours, for the room, are worked out here.

Every cover is also turned into pixel art (COVER_PIXELS, a VHS box's shape at 24 x 42 in a few
colours of its own): the room builder shows that, and a tape standing face out in the room is
drawn from it. A cover pasted in later, which isn't here, is pixelated by the builder itself.
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
    "memorex_floppies": ("Memorex floppy disks", [[852, 642], [838, 862], [970, 860], [978, 640]]),   # a 10-pack of floppies, its box face out
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


# Covers from VHSCollector.com, for hers: the scan, and where on it the front is (a share of its
# width; one is a whole sleeve). Keyed as the tapes link them.
VC = "https://vhscollector.com/sites/default/files/styles/250_height_full_page/public/vhsimages/{}.jpg"
VC_COVERS = {
    "19992_Independence%2520Day%25201": (0, 1), "20892_Matrix%25201": (0, 1),
    "30312_The%2520Matrix%2520Reloaded": (0.53, 1), "18612_244-Untitled-108%2520copy": (0, 1),
}
COVER_W, COVER_H, COVER_COLOURS = 24, 42, 24
LETTERS = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"


def pixel_cover(im, w=COVER_W, h=COVER_H):
    """A cover as pixel art: shrunk to the box's shape, its colours cut to a few of its own."""
    COVER_W, COVER_H = w, h
    small = im.convert("RGB").resize((COVER_W, COVER_H), Image.BOX)
    q = small.quantize(colors=COVER_COLOURS, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
    pal = q.getpalette()
    used = sorted({q.getpixel((x, y)) for x in range(COVER_W) for y in range(COVER_H)})
    hexes = ["#%02x%02x%02x" % tuple(pal[i * 3:i * 3 + 3]) for i in used]
    letter = {i: LETTERS[k] for k, i in enumerate(used)}
    rows = ["".join(letter[q.getpixel((x, y))] for x in range(COVER_W)) for y in range(COVER_H)]
    return {"p": hexes, "r": rows}


def front(im, x0, x1):
    return im.crop((round(im.width * x0), 0, round(im.width * x1), im.height))


# The box of floppies isn't a tape's shape: a squat file box, its clear lid showing the coloured
# disks, the Memorex sleeve round its foot. From a photo straight at its front: where the box is.
FLOPPIES_BOX = (0.117, 0.158, 0.914, 0.803)


# The Matrix trilogy, drawn rather than cut from the photo (where they came out dim): one set --
# a black spine with a faint green rain of code, the Warner shield in gold at the top, MATRIX in
# silver down it, each film's name under that in its own colour.
FONT = {   # 3 x 5 capitals
    "A": [".#.", "#.#", "###", "#.#", "#.#"], "D": ["##.", "#.#", "#.#", "#.#", "##."], "E": ["###", "#..", "##.", "#..", "###"],
    "I": ["###", ".#.", ".#.", ".#.", "###"], "L": ["#..", "#..", "#..", "#..", "###"], "M": ["#.#", "###", "###", "#.#", "#.#"],
    "N": ["#.#", "###", "###", "###", "#.#"], "O": [".#.", "#.#", "#.#", "#.#", ".#."], "R": ["##.", "#.#", "##.", "#.#", "#.#"],
    "S": [".##", "#..", ".#.", "..#", "##."], "T": ["###", ".#.", ".#.", ".#.", ".#."], "U": ["#.#", "#.#", "#.#", "#.#", "###"],
    "V": ["#.#", "#.#", "#.#", "#.#", ".#."], "X": ["#.#", "#.#", ".#.", "#.#", "#.#"],
}
MATRIX = {
    "the_matrix": (None, (60, 207, 106)),
    "matrix_reloaded": ("RELOADED", (143, 179, 217)),
    "matrix_revolutions": ("REVOLUTIONS", (47, 179, 165)),
}
SPINE_W, SPINE_H = 10, 100
INK, RAIN, SILVER, GOLD = (11, 13, 12), (22, 70, 40), (205, 212, 217), (201, 166, 74)


def drawn_spine(sub, accent):
    """One of the trilogy's spines as pixel art, 10 x 100, top to bottom, the words reading down it."""
    g = [[INK] * SPINE_W for _ in range(SPINE_H)]
    for y in range(SPINE_H):                                   # the rain of code, the same on all three
        for x in range(SPINE_W):
            if (x * 7 + y * 3) % 11 == 0 and (y // 3 + x) % 4 == 0:
                g[y][x] = RAIN
    shield = ["..####..", ".#GGGG#.", ".#GGGG#.", ".#GGGG#.", "..#GG#..", "...##..."]
    for r, row in enumerate(shield):
        for c, ch in enumerate(row):
            if ch != ".":
                g[3 + r][1 + c] = GOLD if ch == "#" else (150, 120, 50)

    def word(text, y, colour):
        # Turned to read down the spine: each letter's top to the right.
        for ch in text:
            glyph = FONT[ch]
            for r in range(5):
                for c in range(3):
                    if glyph[r][c] == "#":
                        g[y + c][2 + (4 - r)] = colour
            y += 4
        return y

    for x in range(1, SPINE_W - 1):
        g[11][x] = accent
    y = word("MATRIX", 14, SILVER)
    for x in range(1, SPINE_W - 1):
        g[y + 1][x] = accent
    if sub:
        word(sub, y + 4, accent)
    else:
        # The first film has no second line: streams of its green code run down under the title.
        for x, start, length in ((2, 2, 30), (4, 10, 22), (6, 0, 34), (8, 6, 26)):
            for k in range(length):
                yy = y + 4 + start + k
                if yy < SPINE_H - 7 and k % 3 != 2:
                    g[yy][x] = accent if k < 3 else tuple(int(v * (0.85 - 0.6 * k / length)) for v in accent)
    for x in range(3, 7):                                        # the label at the foot
        g[SPINE_H - 4][x] = SILVER
    return g


def bands(g, rows, cols):
    """The spine as the room shows it, rows x cols: each cell its strongest colour, else black."""
    out = []
    for r in range(rows):
        row = []
        for c in range(cols):
            cells = [g[y][x] for y in range(r * SPINE_H // rows, (r + 1) * SPINE_H // rows)
                     for x in range(c * SPINE_W // cols, (c + 1) * SPINE_W // cols)]
            lit = [p for p in cells if p not in (INK, RAIN)]
            pick = max(set(lit), key=lit.count) if len(lit) >= len(cells) * 0.15 else INK
            row.append("#%02x%02x%02x" % pick)
        out.append(row)
    return out


def main(photo, floppies=None):
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
    for name, (sub, accent) in MATRIX.items():
        g = drawn_spine(sub, accent)
        im = Image.new("RGB", (SPINE_W, SPINE_H))
        for y in range(SPINE_H):
            for x in range(SPINE_W):
                im.putpixel((x, y), g[y][x])
        im.resize((SPINE_W * 4, SPINE_H * 4), Image.NEAREST).save(os.path.join(out, f"{name}.png"), optimize=True)
        art[name] = {**art[name], "drawn": True, "hd": bands(g, 18, 2), "lo": bands(g, 9, 1)}
    archive = {}
    covers = {"art:memorex_floppies": pixel_cover(Image.open(os.path.join(out, "memorex_floppies.png")))}
    if floppies:
        im = ImageOps.exif_transpose(Image.open(floppies)).convert("RGB")
        box = [round(f * d) for f, d in zip(FLOPPIES_BOX, (im.width, im.height, im.width, im.height))]
        covers["art:memorex_floppies"] = pixel_cover(im.crop(box), 24, 26)
    for name, (title, page) in ARCHIVE.items():
        sleeve = fetch(page_url(page))
        x0 = round(sleeve.width * SPINE[0])
        im = sleeve.crop((x0, 0, x0 + round(sleeve.width * SPINE[1]), sleeve.height))
        hd, lo = grids(im)
        art[name] = {"label": title, "img": page_url(page), "spine": list(SPINE), "hd": hd, "lo": lo}
        archive[name] = {"t": title, "c": nearest(im.resize((1, 1), Image.BOX).getpixel((0, 0))), "a": name,
                         "cover": page_url(page)}
        covers[page_url(page)] = pixel_cover(front(sleeve, SPINE[0] + SPINE[1], 1))
    for file, (x0, x1) in VC_COVERS.items():
        req = urllib.request.Request(VC.format(file), headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=180) as res:
            covers[VC.format(file)] = pixel_cover(front(Image.open(io.BytesIO(res.read())), x0, x1))
    body = ",\n".join(f"  {json.dumps(k)}: {json.dumps(v, separators=(',', ':'))}" for k, v in art.items())
    with open(os.path.join(ROOT, "shared", "tapeArt.js"), "w") as fh:
        fh.write("// Spine artwork for the VHS tapes, from the photo of her shelf (client/public/tapes/*.png are the\n"
                 "// spines cut out of it and straightened): each boiled down to the few pixels a spine gets in the room,\n"
                 "// top to bottom -- 1 x 9 at the scene's size, 2 x 18 drawn sharp. Written by art/tapes.py; don't edit.\n"
                 f"export const TAPE_ART = {{\n{body},\n}};\n\n"
                 "// The tapes from the Retro-Daze collection on archive.org, as tapes for the shelf: spine colour,\n"
                 "// spine art and a link to the front of the sleeve.\n"
                 f"export const ARCHIVE_TAPES = {{\n" + ",\n".join(f"  {json.dumps(k)}: {json.dumps(v)}" for k, v in archive.items()) + ",\n};\n\n"
                 "// Every cover as pixel art, 24 x 42 (the box of floppies 24 x 26): p its colours, r its rows (a letter a colour), keyed by the\n"
                 "// cover's link, or art:<spine art> for one from the photo of her shelf.\n"
                 f"export const COVER_PIXELS = {{\n" + ",\n".join(f"  {json.dumps(k)}: {json.dumps(v, separators=(',', ':'))}" for k, v in covers.items()) + ",\n};\n")
    print("wrote", len(art), "spines")


if __name__ == "__main__":
    main(*sys.argv[1:3])
