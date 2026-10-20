"""
RoomiePet's pets, chibi and kawaii: on all fours and facing us, seen from a
little above like the dollhouse. The head and face are most of the pet --
big low-set eyes, a little muzzle, blushing cheeks -- in front; behind the head the back and rump rise away from us, the tail comes
up off the rump, the front legs stand straight down under the chest and the
hind legs stand further back. No side views: walking the other way mirrors
them. Earlier tries taught what this has to avoid: round blobs with a face
read as people, side views put the tail by the face, and an upright body
under the head read as sitting.

The pet is drawn in two layers, each shaded and outlined on its own -- what
is behind the head (rump, hind legs, tail) and what is in front (chest,
front legs, head and ears) -- so the head always stands clear of the body
and the tail plainly grows from the rump.

64 x 64 frames, drawn with the pixel-art skill's Painter. Every species is
the same build with its own ears, muzzle, tail and markings, so they all
share every mood.

Letters: o outline, b body, a further back (hind legs; a shade darker), d
shadow, l light, w muzzle/chest white, p inner ear, e eyes, h shine, m mouth,
k inside of mouth, n nose, c cheeks, s tears; species add their own.
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".claude", "skills", "pixel-art", "scripts"))
from painter import Painter  # noqa: E402

N = 64
GROUND = 61         # where the front feet stand
HIND_GROUND = 53    # and the hind feet, further from us so higher up the frame

# pose: dy moves the body, hdy the head; legs: stand / walk_a / walk_b / tuck; lift raises
# the whole pet (a hop); lying is curled up asleep, chin on its paws.
POSES = {
    "stand": dict(dy=0, hdy=0, legs="stand"),
    "breathe": dict(dy=1, hdy=1, legs="stand"),
    "walk_a": dict(dy=0, hdy=-1, legs="walk_a"),
    "walk_b": dict(dy=0, hdy=0, legs="walk_b"),
    "hop": dict(dy=-1, hdy=-2, legs="tuck", lift=-3),
    "droop": dict(dy=1, hdy=3, legs="stand", droop=True),
    "eat": dict(dy=0, hdy=5, legs="stand"),
    "eat_2": dict(dy=0, hdy=6, legs="stand"),
    "lie": dict(dy=0, hdy=0, legs="none", lying=True),
    "lie_2": dict(dy=1, hdy=1, legs="none", lying=True),
}
LIFT = {"stand": (0, 0), "walk_a": (2, 0), "walk_b": (0, 2), "tuck": (4, 4), "none": (0, 0)}

# frame -> (pose, eyes, mouth, brows)
FRAMES = {
    "idle_0": ("stand", "open", "rest", None),
    "idle_1": ("breathe", "open", "rest", None),
    "blink": ("stand", "closed", "rest", None),
    "walk_0": ("walk_a", "open", "rest", None),
    "walk_1": ("walk_b", "open", "rest", None),
    "happy": ("stand", "happy", "open", None),
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


def rimmed(p, x, y, rx, ry, fill):
    """A part laid over another with its own outline, so it reads apart from what it lies on."""
    p.ellipse(x, y, rx + 1, ry + 1, "o")
    p.ellipse(x, y, rx, ry, fill)


def over(back, front):
    """The front layer laid on the back one."""
    for y in range(N):
        for x in range(N):
            if front.g[y][x] != ".":
                back.g[y][x] = front.g[y][x]
    return back


class Where:
    """Where the parts sit in one frame: head (hx, hy), rump (rx, ry), chest (cx, cy)."""

    def __init__(self, animal, pose):
        P = POSES[pose]
        self.pose = pose
        self.lying = bool(P.get("lying"))
        self.legs = P["legs"]
        self.droop = bool(P.get("droop"))
        if self.lying:
            self.hx, self.hy = 32, 42 + P["hdy"]
            self.rx, self.ry = 32, 40 + P["dy"]
            self.cx, self.cy = 32, 57 + P["dy"]
        else:
            self.hx, self.hy = animal.head_at[0], animal.head_at[1] + P["hdy"]
            self.rx, self.ry = animal.rump_at[0], animal.rump_at[1] + P["dy"]
            self.cx, self.cy = animal.chest_at[0], animal.chest_at[1] + P["dy"]


class Animal:
    """A four-legged pet standing facing us. Species override sizes and the hooks."""

    # Chibi proportions: the head is most of the pet, the body a little loaf behind it on stubby legs.
    head = (18, 15)           # radii: wider than tall
    head_at = (32, 38)
    rump = (10, 9)            # the back, seen from above behind the head
    rump_at = (32, 21)
    chest = (8, 4)
    chest_at = (32, 53)
    leg_w = 7
    legs_apart = 6.5          # front legs either side of the middle
    hind_apart = 12
    eye_apart = 8
    eye_y = 2                 # eyes a little below the head's middle: big, low and wide reads as cute
    muzzle = (5.5, 3.8)       # the pale muzzle round nose and mouth, or None
    bib = True                # a pale chest
    whiskers = False

    # -- hooks ---------------------------------------------------------------
    def ears(self, p, at):
        """Ears behind or on top of the head, in the front layer before the head."""

    def ears_front(self, p, at):
        """Ears that hang over the head (lops), drawn after it."""

    def tail(self, p, at):
        """In the back layer, before the rump: it grows up off the rump."""

    def back_marks(self, p, at):
        """On the rump, after shading (patches, stripes)."""

    def markings(self, p, at):
        """On the face and chest, after shading."""

    def extra(self, p, at):
        """Things on top of everything else (bandages)."""

    # -- faces ---------------------------------------------------------------
    def eye(self, p, x, y, kind, left):
        if kind == "open":
            p.ellipse(x, y, 3.3, 4.2, "e")
            p.rect(x - 2, y - 3, 2, 2, "h")
            p.rect(x + 1, y + 1, 1, 1, "h")
        elif kind == "closed":
            p.ring(x, y - 1, 3.6, 2.6, 1.3, "e", half="bottom")
        elif kind == "happy":
            p.ring(x, y + 1, 3.6, 3, 1.4, "e", half="top")
        elif kind == "sad":
            p.ellipse(x, y + 1, 2.8, 3.4, "e")
            p.rect(x - 1.5, y - 1, 1.5, 1.5, "h")
            if left:
                p.rect(x - 1, y + 4, 1, 3, "s")
        elif kind == "x":
            p.line(x - 2, y - 2, x + 2, y + 2, "e", 1.3)
            p.line(x + 2, y - 2, x - 2, y + 2, "e", 1.3)

    def face(self, p, hx, hy, eyes, mouth, brows):
        ey = hy + self.eye_y
        ex1, ex2 = hx - self.eye_apart, hx + self.eye_apart
        my = ey + 5
        if self.muzzle:
            p.ellipse(hx, my + 1, *self.muzzle, "w", only="bld")
        self.eye(p, ex1, ey, eyes, True)
        self.eye(p, ex2, ey, eyes, False)
        if brows == "sad":
            p.line(ex1 - 2, ey - 6, ex1 + 2, ey - 4, "e", 1)
            p.line(ex2 - 2, ey - 4, ex2 + 2, ey - 6, "e", 1)
        p.ellipse(ex1 - 4, ey + 5, 3, 1.7, "c", only="bwl")
        p.ellipse(ex2 + 4, ey + 5, 3, 1.7, "c", only="bwl")
        self.mouth_shape(p, hx, my, mouth)

    def mouth_shape(self, p, mx, my, kind):
        p.poly([(mx - 2, my - 1), (mx + 2, my - 1), (mx, my + 1)], "n")      # a little nose on the muzzle
        if kind in ("rest", "small"):
            p.rect(mx, my + 1, 1, 1, "m")
            p.ring(mx - 1.5, my + 2, 1.8, 1.6, 0.9, "m", half="bottom")
            p.ring(mx + 1.5, my + 2, 1.8, 1.6, 0.9, "m", half="bottom")
        elif kind == "open":
            p.ellipse(mx, my + 3.5, 2.8, 2.4, "m")
            p.ellipse(mx, my + 4.4, 1.6, 1.1, "k")
        elif kind in ("eat", "eat2"):
            p.ellipse(mx, my + 3.2, 2.4, 2 if kind == "eat" else 1.3, "m")
            p.ellipse(mx + 5, my + 5, 1.2, 1.2, "F")
        elif kind == "frown":
            p.ring(mx, my + 5, 2.4, 1.8, 0.9, "m", half="top")
        elif kind == "wavy":
            for i, x in enumerate(range(int(mx) - 3, int(mx) + 4, 2)):
                p.rect(x, my + 3 + (i % 2), 2, 1, "m")

    def whisker_lines(self, p, hx, hy):
        rx = self.head[0]
        for dy, tilt in ((self.eye_y + 6, -1), (self.eye_y + 8, 1)):
            p.line(hx - rx + 3, hy + dy, hx - rx - 4, hy + dy + tilt, "e", 1)
            p.line(hx + rx - 3, hy + dy, hx + rx + 4, hy + dy + tilt, "e", 1)

    # -- the shared build ----------------------------------------------------
    def head_shape(self, p, at):
        rx, ry = self.head
        p.ellipse(at.hx, at.hy, rx, ry, "b")
        # Fluffy cheeks: a little ruff at the sides.
        p.ellipse(at.hx - rx + 2, at.hy + ry * 0.35, 3.2, 3.6, "b")
        p.ellipse(at.hx + rx - 2, at.hy + ry * 0.35, 3.2, 3.6, "b")

    def back_layer(self, at):
        p = Painter(N, N)
        self.tail(p, at)
        if at.lying:
            p.ellipse(at.rx, at.ry, self.rump[0] + 8, self.rump[1] + 1, "b")
        else:
            lift = LIFT[at.legs]
            for side, up in ((-1, lift[1]), (1, lift[0])):        # hind legs, opposite the front ones
                x = at.rx + side * self.hind_apart
                top = at.ry + 2
                p.rect(x - 2.5, top, 5, HIND_GROUND - top - up, "a")
                p.ellipse(x, HIND_GROUND - up, 3.4, 1.8, "a")
            p.ellipse(at.rx, at.ry, *self.rump, "b")
        p.shade(body="b", dark="d", light="l", deep=2, glow=2)
        self.back_marks(p, at)
        p.outline("o")
        return p

    def front_layer(self, at, eyes, mouth, brows):
        p = Painter(N, N)
        lift = LIFT[at.legs]
        if at.lying:
            for side in (-1, 1):                               # chin on its front paws
                p.ellipse(at.cx + side * 6, at.cy, 4.6, 2.6, "b")
        else:
            p.ellipse(at.cx, at.cy, *self.chest, "b")
            for side, up in ((-1, lift[0]), (1, lift[1])):
                lx = at.cx + side * self.legs_apart
                top = at.cy
                length = GROUND - top - up - 1
                p.rect(lx - self.leg_w / 2, top, self.leg_w, length, "b")
                p.ellipse(lx, top + length, self.leg_w / 2 + 0.6, 2, "b")
        self.ears(p, at)
        self.head_shape(p, at)
        self.ears_front(p, at)
        p.shade(body="b", dark="d", light="l", deep=2, glow=2)
        if self.bib and not at.lying:
            p.ellipse(at.cx, at.cy - 1, 5, 4, "w", only="bld")
        if not at.lying:
            for side, up in ((-1, lift[0]), (1, lift[1])):        # toes
                lx = at.cx + side * self.legs_apart
                y = GROUND - 1 - up
                p.rect(lx - 1, y - 1, 1, 2, "d")
                p.rect(lx + 1, y - 1, 1, 2, "d")
        self.markings(p, at)
        self.face(p, at.hx, at.hy, eyes, mouth, brows)
        self.extra(p, at)
        p.outline("o")
        return p

    def draw(self, eyes, mouth, brows, pose):
        at = Where(self, pose)
        p = over(self.back_layer(at), self.front_layer(at, eyes, mouth, brows))
        if self.whiskers:
            self.whisker_lines(p, at.hx, at.hy)
        if POSES[pose].get("lift"):
            p.shift(0, POSES[pose]["lift"])
        return p.rows()

    def frames(self):
        return {name: self.draw(eyes, mouth, brows, pose) for name, (pose, eyes, mouth, brows) in FRAMES.items()}


# -- the species ----------------------------------------------------------------------

def rump_tail(p, at, animal, pts, radius, letter="b", tip=None):
    """A tail up off the top of the rump: pts are relative to where it leaves it.
    Lying down it curls round the side instead."""
    if at.lying:
        root = (at.rx + animal.rump[0] + 1, at.ry + 1)
        pts = [(3, 4), (4, 10), (0, 16), (-6, 18)]
    else:
        root = (at.rx + 3, at.ry - animal.rump[1] + 4)
    path = [root] + [(root[0] + dx, root[1] + dy) for dx, dy in pts]
    p.path(path, letter, radius)
    if tip:
        p.ellipse(path[-1][0], path[-1][1], radius, radius, tip)
    return path


class Cat(Animal):
    whiskers = True

    def ears(self, p, at):
        droop = 3 if at.droop else 0
        for side in (-1, 1):
            ex = at.hx + side * 10
            tip = (ex + side * (3 + droop), at.hy - 23 + droop * 2)
            p.poly([(ex - 6.5, at.hy - 8), tip, (ex + 6.5, at.hy - 8)], "b")
            p.poly([(ex - 3.5, at.hy - 9), (tip[0] - side * 0.5, tip[1] + 4), (ex + 3.5, at.hy - 9)], "p")

    def tail(self, p, at):
        rump_tail(p, at, self, [(2, -4), (5, -8), (9, -10), (12, -8)], 2.4)

    def back_marks(self, p, at):
        if not at.lying:
            for dy in (-6, -3):                             # tabby stripes across the back
                p.rect(at.rx - 6, at.ry + dy, 12, 1.5, "d", only="bl")

    def markings(self, p, at):
        for dx in (-3, 0, 3):                               # and on the forehead
            p.rect(at.hx + dx, at.hy - 13, 1, 3 + (dx == 0), "d", only="bl")


class Bunny(Animal):
    head = (17, 14)
    head_at = (32, 40)
    rump = (10, 8)
    rump_at = (32, 25)
    chest = (7, 4)
    chest_at = (32, 54)
    legs_apart = 6
    leg_w = 6
    hind_apart = 12
    muzzle = (4.6, 3.4)

    def ears(self, p, at):
        lean = 3 if at.droop else 0
        if at.lying:
            for side in (-1, 1):                            # laid flat out to the sides
                p.ellipse(at.hx + side * 17, at.hy - 7, 8, 3.2, "b")
                p.ellipse(at.hx + side * 17.5, at.hy - 7, 5.5, 1.4, "p")
            return
        for side in (-1, 1):
            x = at.hx + side * (6 + lean)
            p.ellipse(x, at.hy - 21 + lean, 4.2, 11, "b")
            p.ellipse(x, at.hy - 20 + lean, 1.9, 8, "p")

    def tail(self, p, at):
        if at.lying:
            p.ellipse(at.rx + self.rump[0] + 4, at.ry - 2, 4, 4, "W")
        else:
            p.ellipse(at.rx + 11, at.ry - self.rump[1] + 7, 4.2, 4.2, "W")   # a puff at the far end of its back


class Lop(Bunny):
    def ears(self, p, at):
        pass

    def ears_front(self, p, at):
        # Ears hang down either side of the face, over the cheeks.
        down = 2 if at.droop else 0
        for side in (-1, 1):
            rimmed(p, at.hx + side * 16, at.hy + 3 + down, 4.6, 11, "b")
            p.ellipse(at.hx + side * 16.5, at.hy + 5 + down, 1.8, 7.5, "p")
        p.ellipse(at.hx, at.hy - 13, 8, 3, "b")           # the crown between them


class Chick(Animal):
    """A bird stands on two legs: a round body with its head on top, wings at its sides."""
    head = (14, 13)
    head_at = (32, 28)
    chest = (13, 11)
    chest_at = (32, 48)
    muzzle = None
    bib = False
    eye_apart = 6
    eye_y = 1

    def back_layer(self, at):
        p = Painter(N, N)
        p.poly([(at.cx + 9, at.cy - 6), (at.cx + 19, at.cy - 15), (at.cx + 16, at.cy - 3)], "a")   # tail feathers
        p.outline("o")
        return p

    def front_layer(self, at, eyes, mouth, brows):
        p = Painter(N, N)
        cx, cy = (32, 52) if at.lying else (at.cx, at.cy)
        hx, hy = (32, 36) if at.lying else (at.hx, at.hy)
        lift = LIFT[at.legs]
        if not at.lying:
            for side, up in ((-1, lift[0]), (1, lift[1])):
                x = cx + side * 5
                top = cy + self.chest[1] - 3
                length = GROUND - top - up
                p.rect(x - 1, top, 2, length, "y")
                for dx in (-3, 0, 2):
                    p.rect(x + dx, top + length - 1, 3, 2, "y")
        p.ellipse(cx, cy, *self.chest, "b") if not at.lying else p.ellipse(cx, cy, 16, 9, "b")
        for x, y, r in ((hx - 2, hy - 9, 2.4), (hx + 1, hy - 11, 2.8), (hx + 4, hy - 9, 2.2)):
            p.ellipse(x, y, r, r + 1, "b")
        p.ellipse(hx, hy, *self.head, "b")
        p.shade(body="b", dark="d", light="l", deep=2, glow=2)
        for side in (-1, 1):                                # wings at its sides
            p.ellipse(cx + side * 11, cy + 1, 5, 7 if not at.lying else 5, "a", only="bld")
            p.ring(cx + side * 11, cy + 1, 5, 7 if not at.lying else 5, 1, "d", only="a")
        self.face(p, hx, hy, eyes, mouth, brows)
        p.outline("o")
        return p

    def mouth_shape(self, p, mx, my, kind):
        y = my - 3
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
    head = (18.5, 15)
    rump = (11, 9)
    muzzle = (5.5, 3.8)

    def ears(self, p, at):
        drop = 2 if at.droop else 0
        for side in (-1, 1):
            p.ellipse(at.hx + side * 12, at.hy - 12 + drop, 5.2, 5.6, "b")
            p.ellipse(at.hx + side * 12, at.hy - 11.5 + drop, 2.6, 3, "j")

    def tail(self, p, at):
        path = rump_tail(p, at, self, [(3, -3), (7, -6), (11, -7)], 4)
        for x, y in path[1:]:                             # rings across the bushy tail
            p.ellipse(x, y, 4.4, 1.5, "j", only="b")

    def markings(self, p, at):
        hx, ey = at.hx, at.hy + self.eye_y
        p.ellipse(hx, ey - 9, 3, 4, "w", only="bld")       # pale stripe up the forehead
        for side in (-1, 1):
            x = hx + side * self.eye_apart
            p.ellipse(x, ey - 7, 4.6, 1.5, "w", only="bld")   # pale brows
            # The mask: a patch round each eye running down and out to the cheek, apart over the nose.
            p.poly([(x - side * 3.5, ey - 4.5), (x + side * 5, ey - 4.5), (x + side * 7, ey + 3), (x + side * 3, ey + 6), (x - side * 3.5, ey + 3)], "j", only="bldw")

    def eye(self, p, x, y, kind, left):
        super().eye(p, x, y, kind, left)
        if kind in ("open", "sad"):
            p.rect(x - 1, y - 2 + (kind == "sad"), 2, 2, "h")    # a bigger shine, so the eye shows in the mask


class Ferret(Animal):
    head = (17, 14)
    head_at = (32, 39)
    rump = (11, 10)           # a longer body, stretching further away behind the head
    rump_at = (32, 20)
    chest = (7, 4)
    leg_w = 6
    legs_apart = 6
    hind_apart = 11
    muzzle = (5.5, 3.8)
    bib = False

    def ears(self, p, at):
        for side in (-1, 1):
            p.ellipse(at.hx + side * 12.5, at.hy - 10, 4, 4, "b")
            p.ellipse(at.hx + side * 12.5, at.hy - 10, 2, 2, "p")

    def tail(self, p, at):
        rump_tail(p, at, self, [(3, -2), (7, -4), (11, -4), (14, -2)], 2.4)

    def markings(self, p, at):
        hx, ey = at.hx, at.hy + self.eye_y
        p.ellipse(hx, ey + 4, 12, 7.5, "w", only="bld")    # pale face
        p.ellipse(hx, ey - 9, 7, 2.6, "w", only="bld")     # and a pale blaze above the eyes
        for side in (-1, 1):                                # a soft patch at each eye
            p.ellipse(hx + side * self.eye_apart, ey + 0.5, 4.6, 3.8, "j", only="bldw")
        if not at.lying:
            p.ellipse(at.cx, at.cy, 5, 4, "w", only="bld")


class Possum(Animal):
    muzzle = (6, 4.2)
    bib = False

    def ears(self, p, at):
        drop = 2 if at.droop else 0
        for side in (-1, 1):
            p.ellipse(at.hx + side * 13.5, at.hy - 11 + drop, 6, 6.4, "K")
            p.ellipse(at.hx + side * 13.5, at.hy - 10.5 + drop, 3.4, 3.8, "p")

    def tail(self, p, at):
        rump_tail(p, at, self, [(3, -5), (8, -8), (12, -7), (13, -4), (10, -2)], 1.5, letter="t")

    def markings(self, p, at):
        hx, hy, ey = at.hx, at.hy, at.hy + self.eye_y
        p.ellipse(hx, hy + 2, 15.5, 13, "w", only="bld")   # white face
        p.poly([(hx - 3.5, hy - 15), (hx + 3.5, hy - 15), (hx, hy - 4)], "d", only="w")   # the grey line down the forehead
        for side in (-1, 1):                                # grey round the eyes
            p.ellipse(hx + side * self.eye_apart, ey, 4.4, 4.8, "r", only="bldw")

    def mouth_shape(self, p, mx, my, kind):
        super().mouth_shape(p, mx, my, kind)
        p.ellipse(mx, my - 1, 2.4, 1.6, "n")               # a big pink nose


class Stitched(Bunny):
    """A creepy-cute plush bunny: a button eye and an X-stitched one, a stitched mouth, a bandaged ear,
    a patch and a heart sewn on its back and stuffing out of a seam."""

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

    def back_marks(self, p, at):
        # A patch on its back, stitched round.
        px, py = at.rx - 9, at.ry - 4
        p.rect(px, py, 6, 5, "q", only="bld")
        for i in range(0, 6, 2):
            p._set(px + i, py, "x")
            p._set(px + i, py + 4, "x")
        if not at.lying:
            p.blit(at.rx + 2, at.ry - 5, ["rr.rr", "rHrrR", ".rrR.", "..R.."])   # and a heart sewn on beside it

    def markings(self, p, at):
        # Stuffing out of a seam on top of its head.
        sx, sy = at.hx + 10, at.hy - 12
        p.ellipse(sx, sy, 2.6, 2.2, "W")
        p.ellipse(sx + 1.5, sy - 1.5, 1.8, 1.8, "W")

    def extra(self, p, at):
        if at.lying:
            return
        # The left ear bandaged, a loose end hanging.
        lean = 3 if at.droop else 0
        x = at.hx - 6 - lean
        y = at.hy - 25 + lean
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
        p.shade(body="w", dark="d", light="l", deep=2, glow=2)
        for x, y, r in ((27, 38, 2.6), (37, 45, 3), (29, 52, 2.2), (36, 34, 1.8)):
            p.ellipse(x, y, r, r, "s", only="wld")
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
