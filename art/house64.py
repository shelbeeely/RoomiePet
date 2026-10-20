"""
The apartment's furniture and surfaces, to go with the 64 x 64 pets: drawn
from shapes at 16 pixels to the foot, seen front-on from a little above (the
top of a table or counter shows, then its front), with the same outline and
light-from-the-top-left as the pets. Each function returns (rows, palette).
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".claude", "skills", "pixel-art", "scripts"))
from painter import Painter  # noqa: E402  (the pixel-art skill's shape painter)

OUT = "#2b2238"
WOOD = {"t": "#c89466", "T": "#a87650", "u": "#7a5232", "U": "#5e3d24"}


def finish(p, light_top=True):
    p.outline("o")
    return p.rows()


def bed(blanket="#e07a8a"):
    """A single bed, head against the wall: 64 x 96."""
    p = Painter(64, 96)
    p.rect(2, 0, 60, 20, "u")              # headboard
    p.rect(2, 0, 60, 3, "U")
    p.rect(6, 4, 52, 13, "T")
    p.rect(2, 18, 60, 70, "m")             # mattress top
    p.rect(8, 22, 48, 18, "w")             # pillow
    p.rect(8, 36, 48, 4, "W")
    p.rect(2, 44, 60, 44, "q")             # blanket
    p.rect(2, 44, 60, 5, "Q")              # its folded edge
    for y in (58, 72):
        p.rect(4, y, 56, 1, "Q")
    p.rect(2, 88, 60, 6, "u")              # the bed's front
    p.rect(4, 94, 5, 2, "U")
    p.rect(55, 94, 5, 2, "U")
    p.rect(3, 19, 2, 68, "M")              # mattress edge shade
    return finish(p), {**WOOD, "m": "#f1ece2", "M": "#d9d0c0", "w": "#ffffff", "W": "#e6e0d4", "q": blanket,
                       "Q": {"from": "q", "shade": 0.8}}


def nightstand():
    p = Painter(28, 52)
    p.rect(2, 26, 24, 6, "t")              # top
    p.rect(2, 32, 24, 18, "u")             # front
    p.rect(4, 34, 20, 6, "T")
    p.rect(4, 42, 20, 6, "T")
    p.rect(12, 36, 4, 1, "h")
    p.rect(12, 44, 4, 1, "h")
    p.rect(12, 14, 4, 12, "U")             # lamp stem
    p.rect(13, 24, 2, 2, "U")
    p.poly([(4, 15), (24, 15), (20, 1), (8, 1)], "L")  # lampshade
    p.rect(8, 3, 4, 9, "l")
    return finish(p), {**WOOD, "h": "#e8c84a", "L": "#f6d98a", "l": "#fff3c4", "s": "#b8b0a0"}


def window():
    p = Painter(64, 40)
    p.rect(0, 0, 64, 36, "f")
    for x in (4, 34):
        p.rect(x, 4, 26, 28, "g")
        for i in range(8):                 # a glint
            p.rect(x + 14 - i, 8 + i, 2, 1, "G")
            p.rect(x + 18 - i, 8 + i, 1, 1, "G")
    p.rect(0, 34, 64, 6, "s")
    p.rect(0, 38, 64, 2, "S")
    return finish(p), {"f": "#f2ede4", "g": "#9fd3f0", "G": "#e6f6ff", "s": "#d9cdb8", "S": "#b8aa92",
                       "n": "#26305c", "N": "#3b4a80"}


def picture(art="g"):
    p = Painter(28, 22)
    p.rect(0, 0, 28, 22, "f")
    p.rect(2, 2, 24, 18, "s")
    p.ellipse(10, 20, 12, 7, art)
    p.ellipse(22, 22, 9, 8, "G" if art == "g" else "B")
    p.ellipse(21, 7, 2.5, 2.5, "y")
    return finish(p), {"f": "#8a5d3a", "s": "#bfe0f2", "g": "#5ab86a", "G": "#3f9a50", "y": "#ffd166",
                       "b": "#5a8ad8", "B": "#3d6fbf"}


def rug(w=112, h=52):
    p = Painter(w, h)
    p.ellipse(w / 2, h / 2, w / 2 - 0.5, h / 2 - 0.5, "r")
    p.ring(w / 2, h / 2, w / 2 - 4, h / 2 - 4, 2, "R")
    p.ring(w / 2, h / 2, w / 2 - 10, h / 2 - 9, 1.5, "R")
    return p.rows(), {"r": "#7fa8c8", "R": "#f1ece2"}


def fridge():
    p = Painter(34, 76)
    p.rect(1, 0, 32, 8, "F")               # top
    p.rect(1, 8, 32, 66, "f")
    p.rect(1, 30, 32, 2, "F")              # freezer door
    p.rect(27, 12, 2, 14, "h")
    p.rect(27, 36, 2, 22, "h")
    p.rect(3, 10, 3, 18, "W")
    p.rect(6, 40, 8, 6, "m")               # a drawing on the door
    p.rect(16, 42, 6, 8, "M")
    p.rect(3, 74, 6, 2, "h")
    p.rect(25, 74, 6, 2, "h")
    return finish(p), {"f": "#eef1f4", "F": "#c9d0d8", "h": "#8a94a0", "W": "#ffffff", "m": "#f08a8a", "M": "#8fc1e8"}


def counter(width=112):
    """A run of kitchen counter: worktop with a sink and a hob, cupboards below."""
    p = Painter(width, 50)
    p.rect(0, 6, width, 14, "T")           # worktop
    p.rect(0, 18, width, 2, "Y")
    p.rect(0, 20, width, 28, "c")          # cupboards
    for x in range(0, width, 28):
        p.rect(x, 20, 1, 28, "C")
        p.rect(x + 22, 30, 2, 6, "h")
    p.rect(10, 9, 26, 8, "S")              # sink
    p.rect(12, 10, 22, 6, "s")
    p.rect(21, 0, 3, 10, "S")              # tap
    p.rect(21, 0, 8, 2, "S")
    for x in (width - 44, width - 24):     # hob
        p.ring(x + 8, 13, 7, 3.5, 1.5, "k")
    return finish(p), {"T": "#d9d2c5", "Y": "#b8b0a2", "c": "#8fc1b5", "C": "#6f9f94", "h": "#3d5a52",
                       "S": "#a8b0b8", "s": "#d8e6ee", "k": "#3a3540"}


def table():
    """A small dining table with two chairs, from a little above: 72 x 56."""
    p = Painter(72, 56)
    for x in (6, 52):                      # chairs behind
        p.rect(x, 2, 14, 18, "u")
        p.rect(x + 2, 4, 10, 4, "T")
    p.ellipse(36, 26, 32, 12, "t")         # round top
    p.ring(36, 26, 32, 12, 2, "T", half="bottom")
    p.rect(32, 36, 8, 16, "U")             # pedestal
    p.ellipse(36, 53, 12, 3, "U")
    p.ellipse(30, 22, 7, 4, "w")           # a plate
    p.ellipse(44, 24, 4, 3, "r")           # an apple
    p.rect(44, 20, 1, 2, "U")
    return finish(p), {**WOOD, "w": "#ffffff", "r": "#e05d5d"}


def sofa_back():
    """The sofa seen from behind, facing the TV: 120 x 52."""
    p = Painter(120, 52)
    p.rect(4, 6, 112, 30, "a")
    p.rect(4, 6, 112, 6, "A")              # top of the back
    p.rect(0, 14, 12, 34, "A")             # arms
    p.rect(108, 14, 12, 34, "A")
    p.rect(12, 36, 96, 12, "s")            # the back's lower panel
    p.rect(60, 12, 1, 24, "s")
    p.rect(14, 0, 18, 10, "p")             # a cushion peeking over
    p.rect(8, 48, 4, 4, "u")
    p.rect(108, 48, 4, 4, "u")
    return finish(p), {"a": "#e08a6a", "A": "#c8705a", "s": "#b8604c", "u": "#5a3a2a", "p": "#f2d36b"}


def tv():
    """A TV on a low stand: 72 x 64."""
    p = Painter(72, 64)
    p.rect(4, 40, 64, 6, "t")              # stand top
    p.rect(4, 46, 64, 16, "u")
    p.rect(8, 48, 26, 12, "U")
    p.rect(38, 48, 26, 12, "U")
    for i, ch in enumerate("rgbyrb"):
        p.rect(10 + i * 4, 50, 3, 9, ch)
    p.rect(8, 0, 56, 36, "k")              # TV
    p.rect(11, 3, 50, 30, "v")
    p.rect(13, 5, 14, 6, "V")
    p.rect(34, 36, 4, 4, "k")
    return finish(p), {**WOOD, "k": "#2b2238", "v": "#4a6b9a", "V": "#8fb8e8",
                       "r": "#e05d5d", "g": "#5ab86a", "b": "#5a8ad8", "y": "#e8c84a"}


def bookshelf():
    p = Painter(40, 80)
    p.rect(0, 0, 40, 80, "u")
    for y in (4, 28, 52):
        p.rect(3, y, 34, 22, "U")
        for i in range(8):
            h = 14 + (i * 5) % 7
            p.rect(5 + i * 4, y + 22 - h, 3, h, "rgbyprgb"[i])
    return finish(p), {**WOOD, "r": "#e05d5d", "g": "#5ab86a", "b": "#5a8ad8", "y": "#e8c84a", "p": "#c58ad8"}


def plant():
    p = Painter(36, 60)
    for x, y, rx, ry, ch in ((18, 14, 6, 13, "g"), (9, 22, 7, 5, "G"), (27, 20, 7, 5, "g"), (8, 34, 7, 4, "g"),
                             (28, 32, 7, 4, "G"), (18, 30, 4, 9, "G")):
        p.ellipse(x, y, rx, ry, ch)
    p.rect(17, 20, 2, 22, "s")
    p.rect(6, 40, 24, 5, "t")              # pot rim
    p.poly([(7, 45), (29, 45), (26, 59), (10, 59)], "T")
    return finish(p), {"g": "#3a9d4a", "G": "#5ab86a", "s": "#2f7a3a", "t": "#9a4d2a", "T": "#c4683b"}


def bathtub():
    p = Painter(84, 56)
    p.rect(2, 4, 80, 40, "w")              # rim and inside, from above
    p.rect(8, 10, 68, 26, "B")             # water
    for x, y in ((14, 14), (30, 22), (52, 16)):
        p.rect(x, y, 10, 1, "b")
    for x, y, r in ((16, 9, 3), (22, 8, 2), (60, 10, 3), (66, 9, 2), (40, 12, 2)):
        p.ellipse(x, y, r, r, "q")         # bubbles
    p.rect(2, 36, 80, 12, "W")             # its front side
    p.rect(6, 48, 6, 6, "S")               # feet
    p.rect(72, 48, 6, 6, "S")
    p.rect(70, 0, 4, 10, "S")              # tap
    p.rect(66, 0, 8, 3, "S")
    return finish(p), {"w": "#f7f7f7", "W": "#dcdcdc", "B": "#8fd0ef", "b": "#c8ecfb", "S": "#a8b0b8", "q": "#ffffff"}


def toilet():
    p = Painter(30, 52)
    p.rect(3, 0, 24, 18, "w")              # cistern
    p.rect(3, 16, 24, 3, "W")
    p.rect(22, 4, 3, 2, "S")
    p.ellipse(15, 30, 12, 9, "w")          # bowl from above
    p.ellipse(15, 30, 8, 6, "W")
    p.rect(8, 36, 14, 14, "w")
    p.rect(8, 46, 14, 4, "W")
    return finish(p), {"w": "#f7f7f7", "W": "#dcdcdc", "S": "#a8b0b8"}


def washer():
    p = Painter(38, 48)
    p.rect(1, 1, 36, 46, "w")
    p.rect(1, 1, 36, 8, "W")               # top and controls
    p.rect(5, 3, 4, 4, "k")
    p.rect(26, 3, 8, 4, "g")
    p.ellipse(19, 28, 13, 13, "S")         # door
    p.ellipse(19, 28, 10, 10, "g")
    p.ellipse(15, 24, 3, 3, "G")
    for x, y, ch in ((20, 31, "p"), (24, 27, "b"), (16, 32, "y")):
        p.ellipse(x, y, 2.5, 2, ch)        # clothes turning
    return finish(p), {"w": "#f2f4f6", "W": "#d7dce2", "k": "#3a3540", "g": "#8fb8d8", "G": "#e6f6ff",
                       "S": "#b8c0c8", "p": "#f2a6b8", "b": "#5a8ad8", "y": "#f2d36b"}


def basket():
    p = Painter(32, 30)
    p.ellipse(16, 10, 13, 4, "b")          # clothes on top
    p.ellipse(11, 8, 5, 3, "p")
    p.ellipse(21, 7, 5, 3, "y")
    p.poly([(2, 10), (30, 10), (27, 29), (5, 29)], "t")
    for y in (14, 19, 24):
        p.rect(3, y, 26, 1, "u")
    return finish(p), {"t": "#d2a86e", "u": "#a87c48", "p": "#f2a6b8", "b": "#8fb8e8", "y": "#f2d36b"}


def bowl(full):
    p = Painter(32, 20)
    p.ellipse(16, 8, 14, 5, "r")
    p.ellipse(16, 8, 11, 3.5, "F" if full else "R")
    if full:
        for x, y in ((10, 6), (15, 5), (20, 6), (13, 9), (19, 9)):
            p.ellipse(x, y, 1.5, 1.2, "f")
    p.poly([(2, 8), (30, 8), (26, 18), (6, 18)], "r")
    p.ellipse(16, 8, 11, 3.5, "F" if full else "R")
    p.rect(6, 14, 20, 1, "R")
    return finish(p), {"r": "#e05d5d", "R": "#b8404a", "F": "#c08a50", "f": "#8a5d3a"}


def door():
    """An open doorway in a wall strip: 36 x 46."""
    p = Painter(36, 46)
    p.rect(0, 0, 36, 46, "f")
    p.rect(3, 3, 30, 43, "k")
    p.rect(5, 5, 26, 41, "K")
    return p.rows(), {"f": "#f2ede4", "k": "#2b2238", "K": "#3a2f48"}


def mat():
    p = Painter(56, 22)
    p.ellipse(28, 11, 27, 10, "r")
    p.ring(28, 11, 23, 7, 1.5, "R")
    return p.rows(), {"r": "#7fcac2", "R": "#f1ece2"}


def surfaces():
    """Tileable 16 x 16 surfaces, at the same density: wallpaper, skirting, floorboards, tiles."""
    paper = ["aaaAaaaaaaaAaaaa"] * 16
    base = ["aaaAaaaaaaaAaaaa"] * 10 + ["tttttttttttttttt"] * 4 + ["TTTTTTTTTTTTTTTT"] * 2
    wood = (["kkkkkkkkkkkkkkks"] * 7 + ["ssssssssssssssss"] + ["KKKKKKsKKKKKKKKK"] * 7 + ["ssssssssssssssss"])
    check = (["aaaaaaaAAAAAAAAg"] * 7 + ["gggggggggggggggg"] + ["AAAAAAAaaaaaaaag"] * 7 + ["gggggggggggggggg"])
    tilewall = (["aaaaaaagaaaaaaag"] * 7 + ["gggggggggggggggg"]) * 2
    return paper, base, wood, check, tilewall
