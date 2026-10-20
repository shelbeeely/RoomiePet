"""
RoomiePet's pets, facing us: the head and face are the biggest thing in the
frame, the body sits below and behind them on four feet -- two front legs
straight down, the hind feet showing either side -- and the tail comes out
from behind the body on one side, well clear of the face. No side views:
they always look at us, and walking the other way just mirrors them (the
tail swaps sides). Two earlier tries taught what this has to avoid: round
blobs with a face read as people, and side views put the tail by the face.

64 x 64 frames, drawn with the pixel-art skill's Painter. Every species is
the same build -- where the head, body, legs and tail go for each pose -- with
its own ears, muzzle, tail and markings, so they all share every mood.

Letters: o outline, b body, a behind (tail, far feet; a shade darker), d
shadow, l light, w muzzle/chest white, p inner ear, e eyes, h shine, m mouth,
k inside of mouth, n nose, c cheeks, s tears; species add their own.
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".claude", "skills", "pixel-art", "scripts"))
from painter import Painter  # noqa: E402

N = 64
GROUND = 61

# pose: dy moves the body, hdy the head; legs: stand / walk_a / walk_b / tuck; lift raises
# the whole pet (a hop); lying is curled up asleep, chin on its paws.
POSES = {
    "stand": dict(dy=0, hdy=0, legs="stand"),
    "breathe": dict(dy=1, hdy=1, legs="stand"),
    "walk_a": dict(dy=0, hdy=-1, legs="walk_a"),
    "walk_b": dict(dy=0, hdy=0, legs="walk_b"),
    "hop": dict(dy=-1, hdy=-2, legs="tuck", lift=-5),
    "droop": dict(dy=1, hdy=3, legs="stand", droop=True),
    "eat": dict(dy=0, hdy=4, legs="stand"),
    "eat_2": dict(dy=0, hdy=5, legs="stand"),
    "lie": dict(dy=0, hdy=0, legs="none", lying=True),
    "lie_2": dict(dy=1, hdy=1, legs="none", lying=True),
}

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


class Animal:
    """A four-legged pet facing us. Species override sizes and the hooks."""

    head = (15, 12.5)         # radii: wider than tall, a little animal's head
    head_at = (32, 26)
    body = (12, 9.5)
    body_at = (32, 48)
    leg_w = 6
    legs_apart = 6            # front legs either side of the middle
    eye_apart = 7
    eye_y = 0                 # eyes relative to the head's middle
    muzzle = (6.5, 4.6)       # the pale muzzle round nose and mouth, or None
    chest = True
    whiskers = False

    # -- hooks ---------------------------------------------------------------
    def ears(self, p, hx, hy, pose):
        pass

    def ears_front(self, p, hx, hy, pose):
        """Ears that hang over the head (lops), drawn after it."""

    def tail(self, p, bx, by, pose):
        pass

    def markings(self, p, hx, hy, pose):
        pass

    def extra(self, p, hx, hy, bx, by, pose):
        """Things on top of everything else (bandages)."""

    def eye(self, p, x, y, kind, left):
        if kind == "open":
            p.ellipse(x, y, 2.6, 3.4, "e")
            p.rect(x - 1.5, y - 2, 1.5, 2, "h")
            p.rect(x + 1, y + 1, 1, 1, "h")
        elif kind == "closed":
            p.ring(x, y - 1, 3, 2.4, 1.2, "e", half="bottom")
        elif kind == "happy":
            p.ring(x, y + 1, 3, 2.6, 1.3, "e", half="top")
        elif kind == "sad":
            p.ellipse(x, y + 1, 2.2, 2.8, "e")
            p.rect(x - 1, y, 1, 1, "h")
            if left:
                p.rect(x - 1, y + 4, 1, 3, "s")
        elif kind == "x":
            p.line(x - 2, y - 2, x + 2, y + 2, "e", 1.3)
            p.line(x + 2, y - 2, x - 2, y + 2, "e", 1.3)

    # -- the shared build ----------------------------------------------------
    def legs(self, p, mode, bx, by):
        """Front legs straight down from the chest, hind feet out either side behind them."""
        if mode == "none":
            return
        top = by + 1
        lift = {"stand": (0, 0), "walk_a": (2, 0), "walk_b": (0, 2), "tuck": (4, 4)}[mode]
        # Hind feet first: they are behind the body.
        for side, up in ((-1, lift[1]), (1, lift[0])):
            fx = bx + side * (self.body[0] - 1)
            p.ellipse(fx, GROUND - 2 - up, 4.5, 2.6, "a")
        for side, up in ((-1, lift[0]), (1, lift[1])):
            lx = bx + side * self.legs_apart
            length = GROUND - top - up - 1
            p.rect(lx - self.leg_w / 2, top, self.leg_w, length, "b")
            p.ellipse(lx, top + length, self.leg_w / 2 + 0.6, 2, "b")

    def paws(self, p, mode, bx, by):
        """Toe lines on the front paws, after shading."""
        if mode == "none":
            return
        lift = {"stand": (0, 0), "walk_a": (2, 0), "walk_b": (0, 2), "tuck": (4, 4)}[mode]
        for side, up in ((-1, lift[0]), (1, lift[1])):
            lx = bx + side * self.legs_apart
            y = GROUND - 1 - up
            p.rect(lx - 1, y - 1, 1, 2, "d")
            p.rect(lx + 1, y - 1, 1, 2, "d")

    def head_shape(self, p, hx, hy):
        rx, ry = self.head
        p.ellipse(hx, hy, rx + 1, ry + 1, "o", only="ab")   # a line where the head meets the body
        p.ellipse(hx, hy, rx, ry, "b")
        # Fluffy cheeks: the head's outline has a little ruff at the sides.
        p.ellipse(hx - rx + 2, hy + ry * 0.35, 3.2, 3.6, "b")
        p.ellipse(hx + rx - 2, hy + ry * 0.35, 3.2, 3.6, "b")

    def face(self, p, hx, hy, eyes, mouth, brows):
        ey = hy + self.eye_y
        ex1, ex2 = hx - self.eye_apart, hx + self.eye_apart
        if self.muzzle:
            p.ellipse(hx, hy + 6, *self.muzzle, "w", only="bld")
        self.eye(p, ex1, ey, eyes, True)
        self.eye(p, ex2, ey, eyes, False)
        if brows == "sad":
            p.line(ex1 - 2, ey - 6, ex1 + 2, ey - 4, "e", 1)
            p.line(ex2 - 2, ey - 4, ex2 + 2, ey - 6, "e", 1)
        p.ellipse(ex1 - 4, ey + 5, 2.2, 1.4, "c", only="bwl")
        p.ellipse(ex2 + 4, ey + 5, 2.2, 1.4, "c", only="bwl")
        self.mouth_shape(p, hx, hy + 5, mouth)

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
        for dy, tilt in ((4, -1), (6, 1)):
            p.line(hx - rx + 3, hy + dy, hx - rx - 4, hy + dy + tilt, "e", 1)
            p.line(hx + rx - 3, hy + dy, hx + rx + 4, hy + dy + tilt, "e", 1)

    def draw(self, eyes, mouth, brows, pose):
        P = POSES[pose]
        p = Painter(N, N)
        lying = P.get("lying")
        if lying:
            bx, by = 32, 53 + P["dy"]
            hx, hy = 32, 37 + P["hdy"]
        else:
            bx, by = self.body_at[0], self.body_at[1] + P["dy"]
            hx, hy = self.head_at[0], self.head_at[1] + P["hdy"]
        self.tail(p, bx, by, pose)
        if lying:
            p.ellipse(bx, by, self.body[0] + 6, self.body[1] - 2, "b")
        else:
            p.ellipse(bx, by, *self.body, "b")
        self.legs(p, P["legs"], bx, by)
        self.ears(p, hx, hy, pose)
        self.head_shape(p, hx, hy)
        self.ears_front(p, hx, hy, pose)
        if lying:
            for side in (-1, 1):                     # chin on its front paws
                p.ellipse(bx + side * 6, by + 3, 4.5, 2.6, "b")
        p.shade(body="b", dark="d", light="l", deep=2, glow=2)
        if self.chest and not lying:
            p.ellipse(bx, by - 2, 5.5, 5, "w", only="bld")
        self.paws(p, P["legs"], bx, by)
        self.markings(p, hx, hy, pose)
        self.face(p, hx, hy, eyes, mouth, brows)
        self.extra(p, hx, hy, bx, by, pose)
        p.outline("o")
        if self.whiskers:
            self.whisker_lines(p, hx, hy)
        if P.get("lift"):
            p.shift(0, P["lift"])
        return p.rows()

    def frames(self):
        return {name: self.draw(eyes, mouth, brows, pose) for name, (pose, eyes, mouth, brows) in FRAMES.items()}


# -- the species ----------------------------------------------------------------------

def side_tail(p, bx, by, rx, pts, radius, letter="a", tip=None):
    """A tail out from behind the body on the right: pts are relative to where it leaves the body."""
    root = (bx + rx - 4, by + 2)
    path = [(root[0] + dx, root[1] + dy) for dx, dy in pts]
    p.path([root] + path, letter, radius)
    if tip:
        p.ellipse(path[-1][0], path[-1][1], radius, radius, tip)
    return path


class Cat(Animal):
    whiskers = True

    def ears(self, p, hx, hy, pose):
        droop = 3 if pose == "droop" else 0
        for side in (-1, 1):
            ex = hx + side * 9
            tip = (ex + side * (3 + droop), hy - 20 + droop * 2)
            p.poly([(ex - 6, hy - 6), tip, (ex + 6, hy - 6)], "b")
            p.poly([(ex - 3, hy - 7), (tip[0] - side * 0.5, tip[1] + 4), (ex + 3, hy - 7)], "p")

    def tail(self, p, bx, by, pose):
        if pose in ("lie", "lie_2"):
            side_tail(p, bx, by, self.body[0] + 6, [(4, 2), (2, 6), (-6, 7), (-14, 7)], 2.6)
        else:
            side_tail(p, bx, by, self.body[0], [(6, -1), (11, -6), (12, -13), (9, -17)], 2.6)

    def markings(self, p, hx, hy, pose):
        for dx in (-3, 0, 3):                         # tabby lines on the forehead
            p.rect(hx + dx, hy - 11, 1, 3 + (dx == 0), "d", only="bl")


class Bunny(Animal):
    head = (13.5, 11.5)
    head_at = (32, 31)
    body = (11, 8.5)
    body_at = (32, 51)
    legs_apart = 5
    leg_w = 5
    muzzle = (5, 3.6)

    def ears(self, p, hx, hy, pose):
        lean = 3 if pose == "droop" else 0
        if pose in ("lie", "lie_2"):
            for side in (-1, 1):                      # laid flat out to the sides
                p.ellipse(hx + side * 14, hy - 6, 8, 3.2, "b")
                p.ellipse(hx + side * 14.5, hy - 6, 5.5, 1.4, "p")
            return
        for side in (-1, 1):
            x = hx + side * (5 + lean)
            p.ellipse(x, hy - 18 + lean, 3.8, 11, "b")
            p.ellipse(x, hy - 17 + lean, 1.7, 8, "p")

    def tail(self, p, bx, by, pose):
        if pose in ("lie", "lie_2"):
            p.ellipse(bx + self.body[0] + 5, by - 2, 4, 4, "W")
        else:
            p.ellipse(bx + self.body[0] + 1, by + 3, 4.2, 4.2, "W")


class Lop(Bunny):
    def ears(self, p, hx, hy, pose):
        pass

    def ears_front(self, p, hx, hy, pose):
        # Ears hang down either side of the face, over the cheeks.
        down = 2 if pose == "droop" else 0
        for side in (-1, 1):
            rimmed(p, hx + side * 12, hy + 3 + down, 4.2, 10.5, "b")
            p.ellipse(hx + side * 12.5, hy + 5 + down, 1.6, 7, "p")
        p.ellipse(hx, hy - 10, 7, 3, "b")             # the crown between them


class Chick(Animal):
    head = (11, 10)
    head_at = (32, 25)
    body = (15, 13)
    body_at = (32, 45)
    muzzle = None
    chest = False
    eye_apart = 5
    eye_y = 0

    def legs(self, p, mode, bx, by):
        if mode == "none":
            return
        lift = {"stand": (0, 0), "walk_a": (2, 0), "walk_b": (0, 2), "tuck": (4, 4)}[mode]
        for side, up in ((-1, lift[0]), (1, lift[1])):
            x = bx + side * 5
            top = by + self.body[1] - 3
            length = GROUND - top - up
            p.rect(x - 1, top, 2, length, "y")
            for dx in (-3, 0, 2):
                p.rect(x + dx, top + length - 1, 3, 2, "y")

    def paws(self, p, mode, bx, by):
        pass

    def ears(self, p, hx, hy, pose):
        for x, y, r in ((hx - 2, hy - 9, 2.4), (hx + 1, hy - 11, 2.8), (hx + 4, hy - 9, 2.2)):
            p.ellipse(x, y, r, r + 1, "b")

    def head_shape(self, p, hx, hy):
        rx, ry = self.head
        p.ellipse(hx, hy, rx, ry, "b")

    def tail(self, p, bx, by, pose):
        p.poly([(bx + 11, by - 3), (bx + 20, by - 10), (bx + 16, by + 1)], "a")

    def markings(self, p, hx, hy, pose):
        bx, by = (32, 53) if pose in ("lie", "lie_2") else self.body_at
        for side in (-1, 1):                          # wings at its sides
            p.ellipse(bx + side * 11, by + 1, 5, 7, "a", only="bld")
            p.ring(bx + side * 11, by + 1, 5, 7, 1, "d", only="a")

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
    head = (15.5, 12.5)
    muzzle = (6, 4.4)

    def ears(self, p, hx, hy, pose):
        drop = 2 if pose == "droop" else 0
        for side in (-1, 1):
            p.ellipse(hx + side * 10, hy - 10 + drop, 4.6, 5, "b")
            p.ellipse(hx + side * 10, hy - 9.5 + drop, 2.2, 2.6, "j")

    def tail(self, p, bx, by, pose):
        lying = pose in ("lie", "lie_2")
        pts = [(4, 2), (2, 6), (-6, 7), (-14, 7)] if lying else [(6, -1), (11, -6), (12, -13), (10, -18)]
        path = side_tail(p, bx, by, self.body[0] + (6 if lying else 0), pts, 4.4, letter="b")
        for x, y in path[1:]:                          # rings across the bushy tail
            p.ellipse(x, y, 4.6, 1.5, "j", only="bad")

    def markings(self, p, hx, hy, pose):
        p.ellipse(hx, hy - 6, 3, 4, "w", only="bld")            # pale stripe up the forehead
        for side in (-1, 1):
            x = hx + side * self.eye_apart
            p.ellipse(x - side * 0, hy - 5.5, 4, 1.4, "w", only="bld")   # pale brows
            # The mask: a patch round each eye running down and out to the cheek, apart over the nose.
            p.poly([(x - side * 3, hy - 3), (x + side * 4, hy - 3), (x + side * 6, hy + 3), (x + side * 3, hy + 5), (x - side * 3, hy + 2)], "j", only="bldw")

    def eye(self, p, x, y, kind, left):
        super().eye(p, x, y, kind, left)
        if kind in ("open", "sad"):
            p.rect(x - 1, y - 2 + (kind == "sad"), 2, 2, "h")    # a bigger shine, so the eye shows in the mask


class Ferret(Animal):
    head = (13, 11)
    head_at = (32, 28)
    body = (11, 9)
    body_at = (32, 50)
    leg_w = 5
    legs_apart = 5
    muzzle = (6.5, 4.6)
    chest = False

    def ears(self, p, hx, hy, pose):
        for side in (-1, 1):
            p.ellipse(hx + side * 10, hy - 8, 3.4, 3.4, "b")
            p.ellipse(hx + side * 10, hy - 8, 1.6, 1.6, "p")

    def tail(self, p, bx, by, pose):
        lying = pose in ("lie", "lie_2")
        pts = [(4, 2), (2, 6), (-6, 7), (-14, 7)] if lying else [(6, 0), (11, -3), (14, -8), (15, -13)]
        side_tail(p, bx, by, self.body[0] + (6 if lying else 0), pts, 2.6)

    def markings(self, p, hx, hy, pose):
        p.ellipse(hx, hy + 4, 10, 6.5, "w", only="bld")          # pale face
        p.ellipse(hx, hy - 7, 6, 2.4, "w", only="bld")           # and a pale blaze above the eyes
        for side in (-1, 1):                                      # a soft patch at each eye
            p.ellipse(hx + side * self.eye_apart, hy + 0.5, 3.8, 3, "j", only="bldw")
        p.ellipse(32, 52 if pose not in ("lie", "lie_2") else 55, 5, 4, "w", only="bld")


class Possum(Animal):
    muzzle = (7, 5)
    chest = False

    def ears(self, p, hx, hy, pose):
        drop = 2 if pose == "droop" else 0
        for side in (-1, 1):
            p.ellipse(hx + side * 11, hy - 9 + drop, 5.4, 5.8, "K")
            p.ellipse(hx + side * 11, hy - 8.5 + drop, 3, 3.4, "p")

    def tail(self, p, bx, by, pose):
        lying = pose in ("lie", "lie_2")
        pts = [(4, 2), (2, 6), (-6, 7), (-14, 6)] if lying else [(6, 0), (12, -2), (15, -8), (13, -13), (9, -13)]
        side_tail(p, bx, by, self.body[0] + (6 if lying else 0), pts, 1.5, letter="t")

    def markings(self, p, hx, hy, pose):
        p.ellipse(hx, hy + 1, 12, 10.5, "w", only="bld")         # white face
        p.poly([(hx - 3, hy - 13), (hx + 3, hy - 13), (hx, hy - 3)], "d", only="w")   # the grey line down the forehead
        for side in (-1, 1):                                      # grey round the eyes
            p.ellipse(hx + side * self.eye_apart, hy, 3.6, 3.8, "r", only="bldw")

    def mouth_shape(self, p, mx, my, kind):
        super().mouth_shape(p, mx, my, kind)
        p.ellipse(mx, my - 1, 2.4, 1.6, "n")                     # a big pink nose


class Stitched(Bunny):
    """A creepy-cute plush bunny: a button eye and an X-stitched one, a stitched mouth, a bandaged ear,
    a patch on its tummy, a heart on its chest and stuffing out of a seam."""

    def eye(self, p, x, y, kind, left):
        if left:   # a button: doesn't blink
            p.ellipse(x, y, 3.6, 3.6, "u")
            p.ellipse(x, y, 2.6, 2.6, "U")
            for dx, dy in ((-1, -1), (1, -1), (-1, 1), (1, 1)):
                p.rect(x + dx - 0.5, y + dy - 0.5, 1, 1, "v")
            p.rect(x - 3, y - 3, 1, 1, "h")
        else:      # sewn shut
            p.line(x - 2.5, y - 2.5, x + 2.5, y + 2.5, "x", 1.4)
            p.line(x + 2.5, y - 2.5, x - 2.5, y + 2.5, "x", 1.4)

    def mouth_shape(self, p, mx, my, kind):
        if kind in ("open", "eat", "eat2"):
            return super().mouth_shape(p, mx, my, kind)
        p.poly([(mx - 2, my - 1), (mx + 2, my - 1), (mx, my + 1)], "n")
        drop = 1 if kind == "frown" else 0
        for i in range(4):
            p.line(mx - 4 + i * 2, my + 3 + (i % 2) * (1 - 2 * drop), mx - 3 + i * 2, my + 3 + ((i + 1) % 2) * (1 - 2 * drop), "x", 1)

    def markings(self, p, hx, hy, pose):
        lying = pose in ("lie", "lie_2")
        bx, by = (32, 53) if lying else self.body_at
        # A patch on its tummy, stitched round.
        px, py = bx + 2, by - 2
        p.rect(px, py, 6, 5, "q", only="bld")
        for i in range(0, 6, 2):
            p._set(px + i, py, "x")
            p._set(px + i, py + 4, "x")
        if not lying:
            p.blit(bx - 7, by - 4, ["rr.rr", "rHrrR", ".rrR.", "..R.."])   # a heart on its chest
        # Stuffing out of a seam on top of its head.
        sx, sy = hx + 8, hy - 9
        p.ellipse(sx, sy, 2.6, 2.2, "W")
        p.ellipse(sx + 1.5, sy - 1.5, 1.8, 1.8, "W")

    def extra(self, p, hx, hy, bx, by, pose):
        if pose in ("lie", "lie_2"):
            return
        # The left ear bandaged, a loose end hanging.
        lean = 3 if pose == "droop" else 0
        x = hx - 5 - lean
        y = hy - 22 + lean
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
