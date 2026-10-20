"""
RoomiePet's pets at 64 x 64, drawn from shapes.

Every pet is the same round chibi body with a face; each species adds its
own ears, markings and tail. A frame is built for a pose (how high the body
sits, where the feet are) and an expression (eyes, brows, mouth), so all
species share every mood and animation. Colours are palette letters, so the
colour variants in make_spec.py recolour them, shading included.

Letters: o outline, b body, l light, d shade, w belly/face white, p inner ear,
e eyes, h eye shine, m mouth, k mouth inside, c cheeks, plus each species' own.
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".claude", "skills", "pixel-art", "scripts"))
from painter import Painter  # noqa: E402  (the pixel-art skill's shape painter)

N = 64
CX = 32

# Expressions: (eyes, brows, mouth)
EXPRESSIONS = {
    "open": ("open", None, "rest"),
    "blink": ("closed", None, "rest"),
    "happy": ("happy", None, "open"),
    "sad": ("open_small", "sad", "frown"),
    "sleep": ("closed", None, "small"),
    "eat": ("happy", None, "eat"),
    "poorly": ("x", "sad", "wavy"),
}

# Frames: name -> (expression, body dy, feet, whole-sprite dy)
FRAMES = {
    "idle_0": ("open", 0, "stand", 0),
    "idle_1": ("open", 2, "stand", 0),
    "blink": ("blink", 0, "stand", 0),
    "walk_0": ("open", 1, "walk", 0),
    "walk_1": ("open", 2, "walk2", 0),
    "happy": ("happy", 0, "stand", 0),
    "happy_1": ("happy", -1, "stand", -4),
    "sad": ("sad", 3, "stand", 0),
    "sleep_0": ("sleep", 3, "stand", 0),
    "sleep_1": ("sleep", 2, "stand", 0),
    "eat": ("eat", 1, "stand", 0),
    "eat_1": ("eat", 2, "stand", 0),
    "poorly": ("poorly", 3, "stand", 0),
}

ANIMATIONS = {
    "idle": {"frames": ["idle_0", "idle_1", "idle_0", "idle_1", "blink"], "fps": 3},
    "walk": {"frames": ["walk_0", "walk_1"], "fps": 6},
    "happy": {"frames": ["happy", "happy_1"], "fps": 4},
    "sad": {"frames": ["sad"], "fps": 1},
    "sleep": {"frames": ["sleep_0", "sleep_1"], "fps": 1.5},
    "eat": {"frames": ["eat", "eat_1"], "fps": 4},
    "poorly": {"frames": ["poorly", "sad"], "fps": 1},
}


class Pet:
    """A species: shape hooks around a shared body and face. Override what differs."""

    body = (21, 17)            # radii of the round body
    body_cy = 40
    eye_y = 39
    eye_dx = 9                 # eyes' distance from the middle
    mouth = "w"                # resting mouth: w (cat-like), smile, beak
    belly = (11, 7, 50)        # rx, ry, cy of the white tummy (None for none)
    feet_letter = "b"

    def ears(self, p, dy):
        pass

    def behind(self, p, dy):       # tails and wings behind the body
        pass

    def markings(self, p, dy):     # masks, faces, patches -- on the body
        pass

    def front(self, p, dy, expr):  # things in front of the face (bandages)
        pass

    def eye_backing(self, p, ex, ey):
        pass

    # -- the shared parts ---------------------------------------------------
    def feet(self, p, mode):
        f = self.feet_letter
        if mode == "stand":
            p.ellipse(CX - 10, 59, 6, 3.5, f)
            p.ellipse(CX + 10, 59, 6, 3.5, f)
        elif mode == "walk":
            p.ellipse(CX - 12, 59, 6, 3.5, f)
            p.ellipse(CX + 9, 57, 6, 3.5, f)
        else:
            p.ellipse(CX - 9, 57, 6, 3.5, f)
            p.ellipse(CX + 12, 59, 6, 3.5, f)

    def eyes(self, p, kind, dy):
        y = self.eye_y + dy
        for side, ex in ((-1, CX - self.eye_dx), (1, CX + self.eye_dx)):
            if self.eye_override(p, side, ex, y, kind):
                continue
            self.eye_backing(p, ex, y)
            if kind in ("open", "open_small"):
                ry = 4.2 if kind == "open" else 3.4
                p.ellipse(ex, y, 3.2, ry, "e")
                p.rect(ex - 2, y - 3, 2, 2, "h")
                p._set(ex + 1, y + 2, "h")
            elif kind == "closed":
                p.ring(ex, y - 1, 4, 3, 1.4, "e", half="bottom")
            elif kind == "happy":
                p.ring(ex, y + 2, 4, 3.5, 1.5, "e", half="top")
            elif kind == "x":
                p.line(ex - 3, y - 3, ex + 3, y + 3, "e", 1.6)
                p.line(ex + 3, y - 3, ex - 3, y + 3, "e", 1.6)

    def eye_override(self, p, side, ex, y, kind):
        return False

    def brows(self, p, kind, dy):
        if kind != "sad":
            return
        y = self.eye_y + dy
        for side, ex in ((-1, CX - self.eye_dx), (1, CX + self.eye_dx)):
            # Inner ends up, outer ends down: worried, not cross.
            p.line(ex - 4 * side, y - 9, ex + 3 * side, y - 6, "e", 1.4)

    def cheeks(self, p, dy):
        y = self.eye_y + dy + 6
        p.ellipse(CX - self.eye_dx - 6, y, 3, 2, "c", only="bldw")
        p.ellipse(CX + self.eye_dx + 6, y, 3, 2, "c", only="bldw")

    def mouth_shape(self, p, kind, dy):
        y = self.eye_y + dy + 8
        if kind in ("rest", "small"):
            kind = self.mouth if kind == "rest" else ("small_" + self.mouth)
        if kind in ("w", "small_w"):
            p.ring(CX - 2, y - 1, 2.5, 2.2, 1.1, "m", half="bottom")
            p.ring(CX + 2, y - 1, 2.5, 2.2, 1.1, "m", half="bottom")
            if self.nose:
                p.ellipse(CX, y - 3, 1.6, 1.1, "n")
        elif kind in ("smile", "small_smile"):
            p.ring(CX, y - 2, 3.5 if kind == "smile" else 2.5, 2.5, 1.2, "m", half="bottom")
            if self.nose:
                p.ellipse(CX, y - 3.5, 1.4, 1, "n")
        elif kind in ("beak", "small_beak"):
            p.poly([(CX - 4, y - 3), (CX + 4, y - 3), (CX, y + 2)], "y")
            p.line(CX - 3, y - 3, CX + 3, y - 3, "Y", 1)
        elif kind == "open":
            if self.mouth == "beak":
                p.poly([(CX - 4, y - 4), (CX + 4, y - 4), (CX, y - 1)], "y")
                p.poly([(CX - 3, y), (CX + 3, y), (CX, y + 3)], "y")
                p.rect(CX - 2, y - 1, 4, 1, "k")
            else:
                p.ellipse(CX, y, 3.5, 3, "m")
                p.ellipse(CX, y + 1, 2, 1.4, "k")
                if self.nose:
                    p.ellipse(CX, y - 4, 1.6, 1.1, "n")
        elif kind == "eat":
            if self.mouth == "beak":
                p.poly([(CX - 4, y - 4), (CX + 4, y - 4), (CX, y)], "y")
                p.poly([(CX - 3, y + 1), (CX + 3, y + 1), (CX, y + 3)], "y")
            else:
                p.ellipse(CX, y + 1, 4, 3.4, "m")
                p.ellipse(CX, y + 2, 2.6, 1.6, "k")
            p.ellipse(CX + 6, y + 3, 1.5, 1.5, "F")    # a crumb
        elif kind == "frown":
            if self.mouth == "beak":
                p.poly([(CX - 3, y - 2), (CX + 3, y - 2), (CX, y + 1)], "y")
            else:
                p.ring(CX, y + 2, 3.2, 2.4, 1.2, "m", half="top")
        elif kind == "wavy":
            if self.mouth == "beak":
                p.poly([(CX - 3, y - 2), (CX + 3, y - 2), (CX, y + 1)], "y")
            else:
                for i, x in enumerate(range(CX - 4, CX + 5, 2)):
                    p.rect(x, y + (i % 2), 2, 1, "m")

    nose = True

    # -- building a frame ---------------------------------------------------
    def frame(self, expr_name, body_dy=0, feet="stand", lift=0):
        eyes, brows, mouth = EXPRESSIONS[expr_name]
        p = Painter(N, N)
        dy = body_dy
        self.behind(p, dy)
        self.ears(p, dy)
        rx, ry = self.body
        p.ellipse(CX, self.body_cy + dy, rx, ry, "b")
        p.shade(body="b", dark="d", light="l", deep=3, glow=2, light_above=40 + dy)
        # Feet after the shading, so small shapes aren't all shadow: a dark sole only.
        self.feet(p, feet)
        if self.feet_letter == "b":
            for y in range(N - 6, N):
                for x in range(N):
                    if p.get(x, y) == "b" and p.get(x, y + 1) == ".":
                        p._set(x, y, "d")
        if self.belly:
            brx, bry, bcy = self.belly
            p.ellipse(CX, bcy + dy, brx, bry, "w", only="bld")
        self.markings(p, dy)
        self.cheeks(p, dy)
        self.eyes(p, eyes, dy)
        self.brows(p, brows, dy)
        self.mouth_shape(p, mouth, dy)
        self.front(p, dy, expr_name)
        p.outline("o")
        if lift:
            p.shift(0, lift)
        return p.rows()

    def frames(self):
        return {name: self.frame(expr, dy, feet, lift) for name, (expr, dy, feet, lift) in FRAMES.items()}


# -- the species --------------------------------------------------------------

class Cat(Pet):
    def ears(self, p, dy):
        for s in (-1, 1):
            p.poly([(CX + s * 21, 34 + dy), (CX + s * 15, 8 + dy), (CX + s * 3, 26 + dy)], "b")
            p.poly([(CX + s * 17, 30 + dy), (CX + s * 15, 15 + dy), (CX + s * 8, 27 + dy)], "p")

    def behind(self, p, dy):
        p.path([(48, 52 + dy), (56, 50 + dy), (60, 43 + dy), (59, 35 + dy), (56, 31 + dy)], "b", 3)


class Bunny(Pet):
    mouth = "smile"

    def ears(self, p, dy):
        for s in (-1, 1):
            p.ellipse(CX + s * 9, 13 + dy, 5, 14, "b")
            p.ellipse(CX + s * 9, 14 + dy, 2.2, 10, "p")

    def behind(self, p, dy):
        p.ellipse(54, 50 + dy, 5, 5, "w")      # a tuft of tail


class Chick(Pet):
    mouth = "beak"
    nose = False
    belly = (10, 7, 51)
    feet_letter = "y"
    body = (20, 18)
    body_cy = 39

    def ears(self, p, dy):
        for x, y, r in ((29, 21, 3), (32, 19, 3.5), (35, 21, 3)):
            p.ellipse(x, y + dy, r, r + 1, "b")

    def markings(self, p, dy):
        for s in (-1, 1):
            p.ellipse(CX + s * 19, 45 + dy, 5, 8, "d")
            p.ellipse(CX + s * 19, 44 + dy, 3.4, 6, "b")

    def feet(self, p, mode):
        offs = {"stand": (0, 0), "walk": (-2, 2), "walk2": (2, -2)}[mode]
        for s, o in ((-1, offs[0]), (1, offs[1])):
            x = CX + s * 8
            y = 58 + (o if o < 0 else 0)
            p.rect(x - 1, y - 2, 2, 3, "y")
            for dx in (-3, 0, 3):
                p.rect(x + dx - 1, y, 2, 3, "y")


class Lop(Pet):
    mouth = "smile"

    def markings(self, p, dy):
        # Ears hang down over the sides of the face, with their own dark edge.
        for s in (-1, 1):
            p.ellipse(CX + s * 19, 36 + dy, 7, 15, "o")
            p.ellipse(CX + s * 19, 36 + dy, 5.8, 13.8, "a")
            p.ellipse(CX + s * 19, 38 + dy, 2.6, 9.5, "p")
        p.ellipse(CX, 23 + dy, 9, 4, "a", only="bl")   # the fold of fur between the ears


class Raccoon(Pet):
    belly = None

    def ears(self, p, dy):
        for s in (-1, 1):
            p.ellipse(CX + s * 15, 22 + dy, 6.5, 7, "b")
            p.ellipse(CX + s * 15, 23 + dy, 3.5, 4, "j")

    def behind(self, p, dy):
        pts = [(48, 54 + dy), (56, 50 + dy), (60, 42 + dy), (60, 34 + dy)]
        p.path(pts, "b", 4.2)
        for i, (x, y) in enumerate([(52, 53 + dy), (58, 46 + dy), (60, 37 + dy)]):
            p.ellipse(x, y, 4.3, 2, "j")

    def markings(self, p, dy):
        y = self.eye_y + dy
        p.ellipse(CX, y + 9, 9, 6, "w", only="bld")                  # muzzle
        for s in (-1, 1):
            p.ellipse(CX + s * self.eye_dx, y - 6, 7, 2.5, "w", only="bld")  # brows
            p.ellipse(CX + s * self.eye_dx, y, 8, 5.5, "j", only="bldw")     # mask
        p.rect(CX - 3, y - 2, 6, 4, "j", only="bldw")

    def eye_backing(self, p, ex, ey):
        p.ellipse(ex, ey, 4.4, 5.4, "i")


class Ferret(Pet):
    body = (18, 19)
    body_cy = 39
    belly = None

    def ears(self, p, dy):
        for s in (-1, 1):
            p.ellipse(CX + s * 13, 22 + dy, 4.5, 4.5, "b")
            p.ellipse(CX + s * 13, 22 + dy, 2.2, 2.2, "p")

    def behind(self, p, dy):
        p.path([(46, 54 + dy), (55, 55 + dy), (61, 51 + dy), (62, 45 + dy)], "b", 3.2)

    def markings(self, p, dy):
        y = self.eye_y + dy
        p.ellipse(CX, y + 4, 15, 11, "w", only="bld")                # cream face
        for s in (-1, 1):
            p.ellipse(CX + s * self.eye_dx, y, 6.5, 4.5, "j", only="bldw")   # the band
        p.rect(CX - 4, y - 2, 8, 3, "j", only="bldw")
        p.ellipse(CX, 52 + dy, 9, 6, "w", only="bld")


class Possum(Pet):
    belly = None

    def ears(self, p, dy):
        for s in (-1, 1):
            p.ellipse(CX + s * 17, 18 + dy, 8, 9, "K")
            p.ellipse(CX + s * 17, 19 + dy, 5, 6, "p")

    def behind(self, p, dy):
        p.path([(48, 54 + dy), (56, 54 + dy), (61, 49 + dy), (60, 43 + dy), (56, 42 + dy)], "t", 1.8)

    def markings(self, p, dy):
        y = self.eye_y + dy
        p.ellipse(CX, y - 1, 19, 14, "w", only="bld")                 # white face
        for s in (-1, 1):
            p.ellipse(CX + s * self.eye_dx, y, 5.2, 5.6, "r", only="bldw")  # grey rings

    def mouth_shape(self, p, kind, dy):
        super().mouth_shape(p, kind, dy)
        p.ellipse(CX, self.eye_y + dy + 5, 2.2, 1.6, "n")


class Stitched(Bunny):
    """A creepy-cute plush: an X-stitched eye, a button eye, stitched mouth, bandage, patch, heart, stuffing."""

    def eye_override(self, p, side, ex, y, kind):
        if side < 0:  # sewn shut, always
            p.line(ex - 4, y - 4, ex + 4, y + 4, "x", 2.2)
            p.line(ex + 4, y - 4, ex - 4, y + 4, "x", 2.2)
            return True
        # A button: rim, face, four holes, thread, shine. Buttons don't blink.
        p.ellipse(ex, y, 5.5, 5.5, "u")
        p.ellipse(ex, y, 4.3, 4.3, "U")
        for hx, hy in ((-1.5, -1.5), (1.5, -1.5), (-1.5, 1.5), (1.5, 1.5)):
            p.rect(ex + hx - 0.5, y + hy - 0.5, 1, 1, "v")
        p.line(ex - 1.5, y - 1.5, ex + 1.5, y + 1.5, "x", 1)
        p.rect(ex - 4, y - 4, 2, 1, "h")
        return True

    def mouth_shape(self, p, kind, dy):
        y = self.eye_y + dy + 8
        if kind in ("open", "eat"):
            super().mouth_shape(p, kind, dy)
            return
        # A stitched zigzag, turned up, down or wobbly with the mood.
        lift = {"frown": 2, "wavy": 1}.get(kind, 0)
        pts = [(CX - 6 + i * 2, y + ((i % 2) * 2 if kind != "frown" else (1 - i % 2) * 2) + lift) for i in range(7)]
        for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
            p.line(x0, y0, x1, y1, "x", 1)

    def markings(self, p, dy):
        # Stuffing puffing out of a split seam on top of the head, with stitches.
        p.ellipse(CX, 24 + dy, 4.5, 3, "W")
        p.ellipse(CX - 3, 23 + dy, 2.5, 2.2, "W")
        p.ellipse(CX + 3, 22 + dy, 2.6, 2.4, "W")
        p.rect(CX - 6, 25 + dy, 1, 2, "x")
        p.rect(CX + 5, 25 + dy, 1, 2, "x")
        # A patch on the left of the tummy, stitched round.
        px, py = CX - 15, 47 + dy
        p.rect(px, py, 8, 7, "q", only="bldw")
        for i in range(0, 8, 2):
            p._set(px + i, py, "x")
            p._set(px + i, py + 6, "x")
        for j in range(0, 7, 2):
            p._set(px, py + j, "x")
            p._set(px + 7, py + j, "x")
        # A heart on the right of the tummy.
        p.blit(CX + 6, 48 + dy, [
            ".rr.rr.",
            "rHrrrrr",
            "rrrrrrR",
            ".rrrrR.",
            "..rRR..",
            "...R...",
        ])

    def front(self, p, dy, expr):
        # The right ear bandaged: a wrap with a fold, and a loose end.
        x = CX + 9
        p.rect(x - 6, 11 + dy, 12, 5, "B")
        p.rect(x - 6, 13 + dy, 12, 1, "C")
        p.rect(x + 2, 11 + dy, 1, 5, "C")
        p.rect(x + 6, 14 + dy, 2, 6, "B")
        p.rect(x + 7, 19 + dy, 2, 2, "C")


SPECIES = {
    "cat": Cat(), "bunny": Bunny(), "chick": Chick(), "lop": Lop(),
    "raccoon": Raccoon(), "ferret": Ferret(), "possum": Possum(), "stitched": Stitched(),
}


def egg_frames():
    frames = {}
    for name, dx in (("egg_0", 0), ("egg_1", 2), ("egg_2", -2)):
        p = Painter(N, N)
        p.ellipse(CX, 40, 15, 19, "w")
        p.shade(body="w", dark="d", light="l", deep=3, glow=2)
        for x, y, r in ((26, 32, 3), (37, 40, 3.5), (28, 48, 2.5), (38, 28, 2), (34, 52, 2)):
            p.ellipse(x, y, r, r, "s", only="wld")
        p.outline("o")
        if dx:
            p.shift(dx, 0)
        frames[name] = p.rows()
    return frames


def crown():
    p = Painter(24, 14)
    p.poly([(1, 13), (1, 4), (6, 9), (12, 1), (18, 9), (23, 4), (23, 13)], "y")
    p.rect(1, 10, 23, 3, "Y")
    for x in (6, 12, 18):
        p.ellipse(x, 11.5, 1.5, 1.5, "r")
    p.ellipse(12, 3, 1.5, 1.5, "r")
    p.outline("o")
    return p.rows()
