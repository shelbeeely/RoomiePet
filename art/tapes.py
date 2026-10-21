"""
The VHS tapes' spine artwork, cut out of a photo of her shelf: each spine's four corners in
the photo (as it shows at 1500 px wide; it leans), straightened to a 48 x 320 picture in
client/public/tapes/ for the room builder, and boiled down to the few pixels a spine gets in
the room -- 1 x 9 at the scene's size, 2 x 18 drawn sharp -- in shared/tapeArt.js.

    python3 art/tapes.py path/to/shelf-photo.jpg

The photo itself stays out of the repo. A new tape: add its corners and label below.
"""
import json
import os
import sys

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
    "orange_one": ("Orange one", [[641, 682], [582, 1094], [640, 1088], [697, 676]]),
    "memorex_blank": ("Memorex blank", [[852, 642], [838, 862], [970, 860], [978, 640]]),   # its box, cover out
}


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
        hd = im.resize((2, 18), Image.BOX)
        lo = im.resize((1, 9), Image.BOX)
        art[name] = {"label": label, "hd": [[hx(hd.getpixel((x, y))) for x in range(2)] for y in range(18)],
                     "lo": [[hx(lo.getpixel((0, y)))] for y in range(9)]}
    body = ",\n".join(f"  {json.dumps(k)}: {json.dumps(v, separators=(',', ':'))}" for k, v in art.items())
    with open(os.path.join(ROOT, "shared", "tapeArt.js"), "w") as fh:
        fh.write("// Spine artwork for the VHS tapes, from the photo of her shelf (client/public/tapes/*.png are the\n"
                 "// spines cut out of it and straightened): each boiled down to the few pixels a spine gets in the room,\n"
                 "// top to bottom -- 1 x 9 at the scene's size, 2 x 18 drawn sharp. Written by art/tapes.py; don't edit.\n"
                 f"export const TAPE_ART = {{\n{body},\n}};\n")
    print("wrote", len(art), "spines")


if __name__ == "__main__":
    main(sys.argv[1])
