"""
RoomiePet's pets, as flat 2D stickers: sitting facing us, a big round head
with big low-set eyes and blushing cheeks, a little round body, two front
paws, and the tail curling out to one side. Flat colours and a dark
outline, no shading or perspective. This is the look picked from two flat
samples; before it came round blobs that read as people, side views that
put the tail by the face, and shaded three-quarter animals on all fours
that were never cute enough.

64 x 64 frames, drawn with the pixel-art skill's Painter. Every species is
the same sticker with its own ears, tail, markings and face details, so they
all share every mood. Walking the other way mirrors them (the tail swaps
sides).

Letters: o outline, b body, a a darker tone of it (markings, the far paw
when lifted), w tummy/muzzle white, p inner ear, e eyes, h shine, m mouth, k
inside of mouth, n nose, c cheeks, s tears; species add their own.
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".claude", "skills", "pixel-art", "scripts"))
from painter import Painter  # noqa: E402

N = 64

# pose: dy moves the body, hdy the head, lift raises the whole pet (a hop), paws which
# paw is up (walking is a little waddle), sway nudges it sideways; lying is curled up asleep.
POSES = {
    "sit": dict(dy=0, hdy=0),
    "breathe": dict(dy=0, hdy=1),
    "step_a": dict(dy=0, hdy=-1, paws=(2, 0), sway=-1),
    "step_b": dict(dy=0, hdy=-1, paws=(0, 2), sway=1),
    "hop": dict(dy=0, hdy=-1, paws=(3, 3), lift=-4),
    "droop": dict(dy=0, hdy=2, droop=True),
    "eat": dict(dy=0, hdy=3),
    "eat_2": dict(dy=0, hdy=4),
    "lie": dict(dy=0, hdy=0, lying=True),
    "lie_2": dict(dy=0, hdy=1, lying=True),
}

# frame -> (pose, eyes, mouth, brows)
FRAMES = {
    "idle_0": ("sit", "open", "rest", None),
    "idle_1": ("breathe", "open", "rest", None),
    "blink": ("sit", "closed", "rest", None),
    "walk_0": ("step_a", "open", "rest", None),
    "walk_1": ("step_b", "open", "rest", None),
    "happy": ("sit", "happy", "open", None),
    "happy_1": ("hop", "happy", "open", None),
    "sad": ("droop", "sad", "frown", "sad"),
    "sleep_0": ("lie", "closed", "small", None),
    "sleep_1": ("lie_2", "closed", "small", None),
    "eat": ("eat", "happy", "eat", None),
    "eat_1": ("eat_2", "happy", "eat2", None),
    "poorly": ("droop", "x", "wavy", "sad"),
}

ANIMATIONS = {
    "idle": {"frames": ["idle_0", "idle_1", "idle_0", "idle_1", "blink"], "fps": 3},
    "walk": {"frames": ["walk_0", "walk_1"], "fps": 6},
    "happy": {"frames": ["happy", "happy_1"], "fps": 4},
    "sad": {"frames": ["sad"], "fps": 1},
    "sleep": {"frames": ["sleep_0", "sleep_1"], "fps": 1.2},
    "eat": {"frames": ["eat", "eat_1"], "fps": 4},
    "poorly": {"frames": ["poorly", "sad"], "fps": 1},
}


def rimmed(p, x, y, rx, ry, fill, only=None):
    """A shape with its own outline where it lies over the rest, so parts read apart."""
    p.ellipse(x, y, rx + 1, ry + 1, "o", only=only)
    p.ellipse(x, y, rx, ry, fill)


class At:
    """Where the parts sit in one frame."""

    def __init__(self, animal, pose):
        P = POSES[pose]
        self.pose = pose
        self.lying = bool(P.get("lying"))
        self.droop = bool(P.get("droop"))
        self.paws = P.get("paws", (0, 0))
        sx = P.get("sway", 0)
        if self.lying:
            self.hx, self.hy = 32 + sx, 39 + P["hdy"]
            self.bx, self.by = 32, 52
        else:
            self.hx, self.hy = animal.head_at[0] + sx, animal.head_at[1] + P["hdy"]
            self.bx, self.by = animal.body_at[0] + sx, animal.body_at[1] + P["dy"]


class Animal:
    """A pet sitting facing us. Species override sizes and the hooks."""

    head = (18, 15)
    head_at = (32, 29)
    body = (14, 9)
    body_at = (32, 50)
    eye_apart = 8
    eye_y = 1                 # eyes a little below the head's middle: big, low and wide reads as cute
    muzzle = (5, 3.6)         # the pale muzzle round nose and mouth, or None
    tummy = True

    # -- hooks ---------------------------------------------------------------
    def tail(self, p, at):
        """Behind the body, curling out to the right."""

    def ears(self, p, at):
        """Behind the head."""

    def ears_front(self, p, at):
        """Ears that hang over the head (lops)."""

    def markings(self, p, at):
        """On the head and body, before the face."""

    def extra(self, p, at):
        """On top of everything (bandages)."""

    # -- faces ---------------------------------------------------------------
    def eye(self, p, x, y, kind, left):
        if kind == "open":
            p.ellipse(x, y, 3.2, 4, "e")
            p.rect(x - 2, y - 3, 2, 2, "h")
            p.rect(x + 1, y + 1, 1, 1, "h")
        elif kind == "closed":
            p.ring(x, y, 3.4, 2.4, 1.3, "e", half="bottom")
        elif kind == "happy":
            p.ring(x, y + 1, 3.4, 2.8, 1.3, "e", half="top")
        elif kind == "sad":
            p.ellipse(x, y + 1, 2.8, 3.4, "e")
            p.rect(x - 1.5, y - 1, 1.5, 1.5, "h")
            if left:
                p.rect(x - 1, y + 5, 1, 3, "s")
        elif kind == "x":
            p.line(x - 2.5, y - 2.5, x + 2.5, y + 2.5, "e", 1.3)
            p.line(x + 2.5, y - 2.5, x - 2.5, y + 2.5, "e", 1.3)

    def face(self, p, at, eyes, mouth, brows):
        hx, ey = at.hx, at.hy + self.eye_y
        my = ey + 5
        if self.muzzle:
            p.ellipse(hx, my + 1.5, *self.muzzle, "w", only="ba")
        for side in (-1, 1):
            x = hx + side * self.eye_apart
            self.eye(p, x, ey, eyes, side < 0)
            p.ellipse(x + side * 4, ey + 5, 2.8, 1.6, "c", only="baw")
            if brows == "sad":
                p.line(x - 2, ey - 5 - (side > 0) * 2, x + 2, ey - 5 - (side < 0) * 2, "e", 1)
        self.mouth_shape(p, hx, my, mouth)

    def mouth_shape(self, p, mx, my, kind):
        p.poly([(mx - 2, my - 1), (mx + 2, my - 1), (mx, my + 1)], "n")      # a little nose
        if kind in ("rest", "small"):
            p.rect(mx, my + 1, 1, 1, "m")
            p.ring(mx - 1.5, my + 2, 1.8, 1.6, 0.9, "m", half="bottom")
            p.ring(mx + 1.5, my + 2, 1.8, 1.6, 0.9, "m", half="bottom")
        elif kind == "open":
            p.ellipse(mx, my + 3.5, 2.6, 2.4, "m")
            p.ellipse(mx, my + 4.4, 1.5, 1.1, "k")
        elif kind in ("eat", "eat2"):
            p.ellipse(mx, my + 3.2, 2.2, 2 if kind == "eat" else 1.3, "m")
            p.ellipse(mx + 5, my + 5, 1.2, 1.2, "F")
        elif kind == "frown":
            p.ring(mx, my + 5, 2.4, 1.8, 0.9, "m", half="top")
        elif kind == "wavy":
            for i, x in enumerate(range(int(mx) - 3, int(mx) + 4, 2)):
                p.rect(x, my + 3 + (i % 2), 2, 1, "m")

    # -- the sticker ---------------------------------------------------------
    def paw(self, p, x, y, up):
        rimmed(p, x, y - up, 4.5, 3, "b", only="b")
        p.rect(x - 1, y - up, 1, 2, "o")                     # toes
        p.rect(x + 1, y - up, 1, 2, "o")

    def draw(self, eyes, mouth, brows, pose):
        at = At(self, pose)
        p = Painter(N, N)
        self.tail(p, at)
        if at.lying:
            rimmed(p, at.bx, at.by, self.body[0] + 5, self.body[1] - 1, "b", only="b")
        else:
            rimmed(p, at.bx, at.by, *self.body, "b", only="b")
            if self.tummy:
                p.ellipse(at.bx, at.by + 2, 7, 5, "w")
        for side, up in ((-1, at.paws[0]), (1, at.paws[1])):
            self.paw(p, at.bx + side * 7, 58 if not at.lying else 57, up)
        self.ears(p, at)
        rx, ry = self.head
        rimmed(p, at.hx, at.hy, rx, ry, "b", only="bwa")       # the chin's line over the body
        self.ears_front(p, at)
        self.markings(p, at)
        self.face(p, at, eyes, mouth, brows)
        self.extra(p, at)
        p.outline("o")
        if POSES[pose].get("lift"):
            p.shift(0, POSES[pose]["lift"])
        return p.rows()

    def frames(self):
        return {name: self.draw(eyes, mouth, brows, pose) for name, (pose, eyes, mouth, brows) in FRAMES.items()}


# -- the species ----------------------------------------------------------------------

def curl(p, at, pts, radius, letter="b"):
    """A tail from behind the body on the right, along pts (relative to the body's middle).
    Lying down it wraps round the front instead."""
    if at.lying:
        pts = [(12, 2), (18, 4), (16, 8), (8, 9), (-2, 9)]
    path = [(at.bx + dx, at.by + dy) for dx, dy in pts]
    p.path(path, letter, radius)
    return path


class Cat(Animal):
    def ears(self, p, at):
        droop = 3 if at.droop else 0
        for side in (-1, 1):
            ex = at.hx + side * 11
            tip = (ex + side * (2 + droop), at.hy - 21 + droop * 2)
            p.poly([(ex - 6.5, at.hy - 7), tip, (ex + 6.5, at.hy - 7)], "b")
            p.poly([(ex - 3.5, at.hy - 8), (tip[0] - side * 0.5, tip[1] + 4), (ex + 3.5, at.hy - 8)], "p")

    def tail(self, p, at):
        curl(p, at, [(10, 2), (19, 0), (23, -7), (21, -13)], 2.6)

    def markings(self, p, at):
        for dx in (-3, 0, 3):                                   # tabby lines on the forehead
            p.rect(at.hx + dx, at.hy - 13, 1, 3 + (dx == 0), "a")


class Bunny(Animal):
    head = (17, 14)
    head_at = (32, 32)
    body = (13, 8.5)
    body_at = (32, 51)
    muzzle = (4.6, 3.4)

    def ears(self, p, at):
        lean = 3 if at.droop else 0
        if at.lying:
            for side in (-1, 1):                                # laid flat out to the sides
                p.ellipse(at.hx + side * 17, at.hy - 6, 8, 3.2, "b")
                p.ellipse(at.hx + side * 17.5, at.hy - 6, 5.5, 1.4, "p")
            return
        for side in (-1, 1):
            x = at.hx + side * (6 + lean)
            p.ellipse(x, at.hy - 19 + lean, 4.2, 11, "b")
            p.ellipse(x, at.hy - 18 + lean, 1.9, 8, "p")

    def tail(self, p, at):
        if at.lying:
            p.ellipse(at.bx + 19, at.by - 1, 4.4, 4.4, "W")
        else:
            p.ellipse(at.bx + 13, at.by + 3, 4.6, 4.6, "W")     # a puff peeping out


class Lop(Bunny):
    def ears(self, p, at):
        pass

    def ears_front(self, p, at):
        # Ears hang down either side of the face, over the cheeks.
        down = 2 if at.droop else 0
        for side in (-1, 1):
            rimmed(p, at.hx + side * 16, at.hy + 3 + down, 4.6, 11, "b")
            p.ellipse(at.hx + side * 16.5, at.hy + 5 + down, 1.8, 7.5, "p")
        p.ellipse(at.hx, at.hy - 13, 8, 3, "b")                # the crown between them


class Chick(Animal):
    """A round little bird: its head and body one soft shape, wings at its sides, a beak, orange feet."""
    head = (15, 13.5)
    head_at = (32, 28)
    body = (15, 12)
    body_at = (32, 47)
    muzzle = None
    tummy = False
    eye_apart = 6

    def paw(self, p, x, y, up):
        for dx in (-3, 0, 3):                                  # three toes
            p.rect(x + dx - 1, y - up, 2, 3, "y")

    def ears(self, p, at):
        for x, y, r in ((at.hx - 2, at.hy - 13, 2.4), (at.hx + 1, at.hy - 15, 2.8), (at.hx + 4, at.hy - 13, 2.2)):
            p.ellipse(x, y, r, r + 1, "b")                     # a tuft

    def tail(self, p, at):
        p.poly([(at.bx + 11, at.by - 4), (at.bx + 21, at.by - 12), (at.bx + 18, at.by + 1)], "b")

    def markings(self, p, at):
        for side in (-1, 1):                                    # wings at its sides
            rimmed(p, at.bx + side * 13, at.by, 4.5, 7 if not at.lying else 4.5, "a", only="b")

    def mouth_shape(self, p, mx, my, kind):
        y = my - 2
        if kind in ("open", "eat", "eat2"):
            p.poly([(mx - 3, y - 1), (mx + 3, y - 1), (mx, y + 2)], "y")
            p.poly([(mx - 2, y + 2), (mx + 2, y + 2), (mx, y + 4)], "Y")
            if kind != "open":
                p.ellipse(mx + 5, y + 5, 1.2, 1.2, "F")
        else:
            p.poly([(mx - 3, y - 1), (mx + 3, y - 1), (mx, y + 3)], "y")
            p.line(mx - 2, y + 1, mx + 2, y + 1, "Y", 1)
        if kind == "frown":
            p.rect(mx - 1, y + 5, 3, 1, "m")


class Raccoon(Animal):
    muzzle = (5.5, 3.8)

    def ears(self, p, at):
        drop = 2 if at.droop else 0
        for side in (-1, 1):
            p.ellipse(at.hx + side * 12, at.hy - 11 + drop, 5.2, 5.6, "b")
            p.ellipse(at.hx + side * 12, at.hy - 10.5 + drop, 2.6, 3, "j")

    def tail(self, p, at):
        path = curl(p, at, [(10, 2), (18, 0), (21, -6), (20, -12)], 4.2)
        for x, y in path[1:]:                                   # rings across the bushy tail
            p.ellipse(x, y, 4.4, 1.5, "j", only="b")

    def markings(self, p, at):
        hx, ey = at.hx, at.hy + self.eye_y
        for side in (-1, 1):
            x = hx + side * self.eye_apart
            # The mask: a patch round each eye running down and out to the cheek, apart over the nose.
            p.poly([(x - side * 3.5, ey - 4.5), (x + side * 5, ey - 4.5), (x + side * 7, ey + 3), (x + side * 3, ey + 6), (x - side * 3.5, ey + 3)], "j", only="b")
            p.ellipse(x, ey - 7, 4.6, 1.5, "w", only="b")      # pale brows

    def eye(self, p, x, y, kind, left):
        super().eye(p, x, y, kind, left)
        if kind in ("open", "sad"):
            p.rect(x - 1, y - 2 + (kind == "sad"), 2, 2, "h")    # a bigger shine, so the eye shows in the mask


class Ferret(Animal):
    head = (17, 14)
    head_at = (32, 30)
    muzzle = (5.5, 3.8)
    tummy = True

    def ears(self, p, at):
        for side in (-1, 1):
            p.ellipse(at.hx + side * 12.5, at.hy - 10, 4, 4, "b")
            p.ellipse(at.hx + side * 12.5, at.hy - 10, 2, 2, "p")

    def tail(self, p, at):
        curl(p, at, [(10, 2), (18, 2), (24, -2), (26, -8)], 2.6)

    def markings(self, p, at):
        hx, ey = at.hx, at.hy + self.eye_y
        p.ellipse(hx, ey + 4, 12, 7.5, "w", only="b")          # pale face
        p.ellipse(hx, ey - 9, 7, 2.6, "w", only="b")           # and a pale blaze above the eyes
        for side in (-1, 1):                                    # a soft patch at each eye
            p.ellipse(hx + side * self.eye_apart, ey + 0.5, 4.6, 3.8, "j", only="bw")


class Possum(Animal):
    muzzle = (6, 4.2)
    tummy = False

    def ears(self, p, at):
        drop = 2 if at.droop else 0
        for side in (-1, 1):
            p.ellipse(at.hx + side * 13.5, at.hy - 10 + drop, 6, 6.4, "K")
            p.ellipse(at.hx + side * 13.5, at.hy - 9.5 + drop, 3.4, 3.8, "p")

    def tail(self, p, at):
        curl(p, at, [(10, 3), (18, 2), (22, -4), (20, -9), (16, -9)], 1.6, letter="t")

    def markings(self, p, at):
        hx, hy, ey = at.hx, at.hy, at.hy + self.eye_y
        p.ellipse(hx, hy + 2, 15.5, 12.5, "w", only="b")       # white face
        p.poly([(hx - 3.5, hy - 14), (hx + 3.5, hy - 14), (hx, hy - 4)], "a", only="w")   # the grey line down the forehead
        for side in (-1, 1):                                    # grey round the eyes
            p.ellipse(hx + side * self.eye_apart, ey, 4.4, 4.8, "r", only="bw")

    def mouth_shape(self, p, mx, my, kind):
        super().mouth_shape(p, mx, my, kind)
        p.ellipse(mx, my - 1, 2.4, 1.6, "n")                   # a big pink nose


class Stitched(Bunny):
    """A creepy-cute plush bunny: a button eye and an X-stitched one, a stitched mouth, a bandaged ear,
    a patch on its body, a heart sewn on its tummy and stuffing out of a seam."""
    tummy = False

    def eye(self, p, x, y, kind, left):
        if left:   # a button: doesn't blink
            p.ellipse(x, y, 4.3, 4.3, "u")
            p.ellipse(x, y, 3.2, 3.2, "U")
            for dx, dy in ((-1, -1), (1, -1), (-1, 1), (1, 1)):
                p.rect(x + dx - 0.5, y + dy - 0.5, 1, 1, "v")
            p.rect(x - 3, y - 3, 1.5, 1.5, "h")
        else:      # sewn shut
            p.line(x - 3, y - 3, x + 3, y + 3, "x", 1.5)
            p.line(x + 3, y - 3, x - 3, y + 3, "x", 1.5)

    def mouth_shape(self, p, mx, my, kind):
        if kind in ("open", "eat", "eat2"):
            return super().mouth_shape(p, mx, my, kind)
        p.poly([(mx - 2, my - 1), (mx + 2, my - 1), (mx, my + 1)], "n")
        drop = 1 if kind == "frown" else 0
        for i in range(4):
            p.line(mx - 4 + i * 2, my + 3 + (i % 2) * (1 - 2 * drop), mx - 3 + i * 2, my + 3 + ((i + 1) % 2) * (1 - 2 * drop), "x", 1)

    def markings(self, p, at):
        if not at.lying:
            # A patch on its side, stitched round, and a heart sewn on its tummy.
            px, py = at.bx + 5, at.by - 4
            p.rect(px, py, 6, 5, "q", only="b")
            for i in range(0, 6, 2):
                p._set(px + i, py, "x")
                p._set(px + i, py + 4, "x")
            p.blit(at.bx - 4, at.by, ["rr.rr", "rHrrR", ".rrR.", "..R.."])
        # Stuffing out of a seam on top of its head.
        sx, sy = at.hx + 10, at.hy - 11
        p.ellipse(sx, sy, 2.6, 2.2, "W")
        p.ellipse(sx + 1.5, sy - 1.5, 1.8, 1.8, "W")

    def extra(self, p, at):
        if at.lying:
            return
        # The left ear bandaged, a loose end hanging.
        lean = 3 if at.droop else 0
        x = at.hx - 6 - lean
        y = at.hy - 24 + lean
        p.rect(x - 4, y, 9, 4, "B")
        p.rect(x - 4, y + 2, 9, 1, "C")
        p.rect(x - 6, y + 2, 2, 5, "B")


SPECIES = {
    "cat": Cat(), "bunny": Bunny(), "chick": Chick(), "lop": Lop(),
    "raccoon": Raccoon(), "ferret": Ferret(), "possum": Possum(), "stitched": Stitched(),
}


def egg_frames():
    frames = {}
    for name, dx in (("egg_0", 0), ("egg_1", 2), ("egg_2", -2)):
        p = Painter(N, N)
        p.ellipse(32, 44, 13, 16, "w")
        p.ellipse(28, 36, 4, 6, "l")                           # a shine, flat like the pets
        for x, y, r in ((27, 46, 2.6), (37, 45, 3), (31, 53, 2.2), (37, 34, 1.8)):
            p.ellipse(x, y, r, r, "s", only="wl")
        p.outline("o")
        if dx:
            p.shift(dx, 0)
        frames[name] = p.rows()
    return frames


def crown():
    p = Painter(20, 12)
    p.poly([(1, 11), (1, 3), (5, 7), (10, 1), (15, 7), (19, 3), (19, 11)], "y")
    p.rect(1, 8, 19, 3, "Y")
    for x in (5, 10, 15):
        p.ellipse(x, 9.5, 1.3, 1.3, "r")
    p.outline("o")
    return p.rows()
