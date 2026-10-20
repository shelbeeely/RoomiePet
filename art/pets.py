"""
RoomiePet's pets, drawn from scratch as animals: a head, a body, four legs
and a tail that grows from the rump, seen three-quarter from above like the
apartment, always facing us: to the left as drawn, mirrored to go right.
(A back view for walking away was tried and dropped -- they're nicer seen
from the front.)

64 x 64 frames, drawn with the pixel-art skill's Painter. Every species is
the same build -- where the head, body, legs and tail go for each pose -- with
its own ears, tail, snout and markings, so they all share every mood.

Letters: o outline, b body, a far side (a shade darker), d shadow, l light,
w chest/muzzle white, p inner ear, e eyes, h shine, m mouth, k inside of
mouth, n nose, c cheeks, s tears; species add their own.
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".claude", "skills", "pixel-art", "scripts"))
from painter import Painter  # noqa: E402

N = 64
GROUND = 61

# pose: where things sit. dy moves the body, hdy the head; legs: stand / walk_a / walk_b / tuck;
# lift raises the whole pet (a hop); lying curls it up asleep.
POSES = {
    "stand": dict(dy=0, hdy=0, legs="stand"),
    "breathe": dict(dy=1, hdy=1, legs="stand"),
    "walk_a": dict(dy=0, hdy=0, legs="walk_a"),
    "walk_b": dict(dy=1, hdy=1, legs="walk_b"),
    "hop": dict(dy=-1, hdy=-2, legs="tuck", lift=-5),
    "droop": dict(dy=1, hdy=4, legs="stand"),
    "eat": dict(dy=0, hdy=7, legs="stand"),
    "eat_2": dict(dy=0, hdy=8, legs="stand"),
    "lie": dict(dy=0, hdy=0, legs="none", lying=True),
    "lie_2": dict(dy=1, hdy=1, legs="none", lying=True),
}

# frame -> (view, pose, eyes, mouth, brows)
FRAMES = {
    "idle_0": ("front", "stand", "open", "rest", None),
    "idle_1": ("front", "breathe", "open", "rest", None),
    "blink": ("front", "stand", "closed", "rest", None),
    "walk_0": ("front", "walk_a", "open", "rest", None),
    "walk_1": ("front", "walk_b", "open", "rest", None),
    "happy": ("front", "stand", "happy", "open", None),
    "happy_1": ("front", "hop", "happy", "open", None),
    "sad": ("front", "droop", "sad", "frown", "sad"),
    "sleep_0": ("front", "lie", "closed", "small", None),
    "sleep_1": ("front", "lie_2", "closed", "small", None),
    "eat": ("front", "eat", "happy", "eat", None),
    "eat_1": ("front", "eat_2", "happy", "eat2", None),
    "poorly": ("front", "droop", "x", "wavy", "sad"),
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


class Animal:
    """A four-legged pet. Species override sizes and the hooks."""

    head = (12.5, 11.5)       # radii
    body = (15, 10)
    head_at = (23, 30)        # front view centre
    body_at = (39, 46)
    leg_w = 6
    snout = None              # (length, ry) for a pointed snout
    mouth = "w"
    chest = True
    nose = True

    # -- hooks ---------------------------------------------------------------
    def ears(self, p, hx, hy, view, pose):
        pass

    def tail(self, p, view, bx, by, pose):
        pass

    def markings(self, p, hx, hy, view, pose):
        pass

    def extra(self, p, hx, hy, bx, by, view, pose):
        """Things on top of everything else (bandages)."""

    def eye(self, p, x, y, kind, near):
        if kind == "open":
            p.ellipse(x, y, 2.4 if near else 2.0, 3.2, "e")
            p.rect(x - 1, y - 2, 1, 2, "h")
        elif kind == "closed":
            p.ring(x, y - 1, 3, 2.4, 1.2, "e", half="bottom")
        elif kind == "happy":
            p.ring(x, y + 1, 3, 2.6, 1.3, "e", half="top")
        elif kind == "sad":
            p.ellipse(x, y + 1, 2.0, 2.6, "e")
            p.rect(x - 1, y, 1, 1, "h")
            if near:
                p.rect(x - 1, y + 4, 1, 2, "s")
        elif kind == "x":
            p.line(x - 2, y - 2, x + 2, y + 2, "e", 1.3)
            p.line(x + 2, y - 2, x - 2, y + 2, "e", 1.3)

    # -- the shared build ----------------------------------------------------
    def legs(self, p, mode, far, bx, by):
        """Two legs, front and back, near (b) or far (a, drawn first, behind the body)."""
        if mode == "none":
            return
        letter = "a" if far else "b"
        front_x = bx - self.body[0] + 7 + (5 if far else 0)
        back_x = bx + self.body[0] - 7 + (5 if far else 0)
        top = by + 2
        step = {"stand": (0, 0), "walk_a": (-3, 3), "walk_b": (3, -3), "tuck": (0, 0)}[mode]
        length = GROUND - top - (1 if far else 0)
        if mode == "tuck":
            length -= 6
        for x, s in ((front_x, step[0]), (back_x, step[1])):
            lx = x + (s if not far else -s)
            p.rect(lx - self.leg_w / 2, top, self.leg_w, length, letter)
            p.ellipse(lx - 1, top + length, self.leg_w / 2 + 1, 2, letter)   # paw
            if not far:
                p.rect(lx - self.leg_w / 2, top + length - 1, self.leg_w, 1, "d")

    def head_shape(self, p, hx, hy, view):
        rx, ry = self.head
        p.ellipse(hx, hy, rx + 1, ry + 1, "o", only=".ab")   # a line where the head meets the body
        p.ellipse(hx, hy, rx, ry, "b")
        if self.snout and view == "front":
            length, sry = self.snout
            p.ellipse(hx - rx + 2 - length / 2, hy + 4, length, sry, "b")

    def face(self, p, hx, hy, eyes, mouth, brows):
        fx = hx - 5                                      # the face looks left
        ex1, ex2, ey = fx - 4, fx + 6, hy
        self.eye(p, ex1, ey, eyes, True)
        self.eye(p, ex2, ey, eyes, False)
        if brows == "sad":
            p.line(ex1 - 2, ey - 4, ex1 + 2, ey - 6, "e", 1)
            p.line(ex2 - 2, ey - 6, ex2 + 2, ey - 4, "e", 1)
        p.ellipse(ex1 - 3, ey + 4, 2, 1.3, "c", only="bwl")
        p.ellipse(ex2 + 4, ey + 4, 2, 1.3, "c", only="bwl")
        self.mouth_shape(p, fx, hy + 6, mouth)

    def mouth_shape(self, p, mx, my, kind):
        if self.snout:
            mx -= self.snout[0] - 2
        if self.nose:
            p.ellipse(mx, my - 1, 1.6, 1.1, "n")
        if kind in ("rest", "small"):
            if self.mouth == "w":
                p.ring(mx - 1.5, my + 1, 1.8, 1.6, 0.9, "m", half="bottom")
                p.ring(mx + 1.5, my + 1, 1.8, 1.6, 0.9, "m", half="bottom")
            else:
                p.ring(mx, my + 1, 2.4, 1.8, 0.9, "m", half="bottom")
        elif kind == "open":
            p.ellipse(mx, my + 2.5, 2.6, 2.2, "m")
            p.ellipse(mx, my + 3.2, 1.5, 1, "k")
        elif kind in ("eat", "eat2"):
            p.ellipse(mx, my + 2.5, 2.4, 2 if kind == "eat" else 1.4, "m")
            p.ellipse(mx - 4, my + 4, 1.2, 1.2, "F")
        elif kind == "frown":
            p.ring(mx, my + 4, 2.4, 1.8, 0.9, "m", half="top")
        elif kind == "wavy":
            for i, x in enumerate(range(int(mx) - 3, int(mx) + 4, 2)):
                p.rect(x, my + 2 + (i % 2), 2, 1, "m")

    def draw_front(self, eyes, mouth, brows, pose):
        P = POSES[pose]
        p = Painter(N, N)
        if P.get("lying"):
            return self.draw_lying(p, eyes, pose)
        bx, by = self.body_at[0], self.body_at[1] + P["dy"]
        hx, hy = self.head_at[0], self.head_at[1] + P["hdy"]
        self.tail(p, "front", bx, by, pose)
        self.legs(p, P["legs"], True, bx, by)
        p.ellipse(bx, by, *self.body, "b")
        self.ears(p, hx, hy, "front", pose)
        self.head_shape(p, hx, hy, "front")
        p.shade(body="b", dark="d", light="l", deep=2, glow=2)
        self.legs(p, P["legs"], False, bx, by)
        if self.chest:
            p.ellipse(bx - self.body[0] + 6, by + 1, 6, 6, "w", only="bld")
        self.markings(p, hx, hy, "front", pose)
        self.face(p, hx, hy, eyes, mouth, brows)
        self.extra(p, hx, hy, bx, by, "front", pose)
        p.outline("o")
        if P.get("lift"):
            p.shift(0, P["lift"])
        return p.rows()

    def draw_lying(self, p, eyes, pose):
        """Curled up asleep: body low and long, head resting on the floor in front, tail round the front."""
        P = POSES[pose]
        bx, by = 36, 51 + P["dy"]
        hx, hy = 21, 47 + P["hdy"]
        p.ellipse(bx, by, self.body[0] + 3, self.body[1] - 1, "b")
        self.ears(p, hx, hy, "lying", pose)
        self.head_shape(p, hx, hy, "lying")
        p.shade(body="b", dark="d", light="l", deep=2, glow=2)
        self.tail(p, "lying", bx, by, pose)
        self.markings(p, hx, hy, "front", pose)
        fx = hx - 5
        self.eye(p, fx - 4, hy, "closed", True)
        self.eye(p, fx + 6, hy, "closed", False)
        p.ellipse(fx - 7, hy + 4, 2, 1.3, "c", only="bwl")
        self.mouth_shape(p, fx, hy + 6, "small")
        self.extra(p, hx, hy, bx, by, "lying", pose)
        p.outline("o")
        return p.rows()

    def frames(self):
        out = {}
        for name, (_view, pose, eyes, mouth, brows) in FRAMES.items():
            out[name] = self.draw_front(eyes, mouth, brows, pose)
        return out


def rimmed(p, x, y, rx, ry, fill):
    """A part laid over the body with its own outline, so it reads apart from what it lies on."""
    p.ellipse(x, y, rx + 1, ry + 1, "o")
    p.ellipse(x, y, rx, ry, fill)


# -- the species ----------------------------------------------------------------------

def tail_path(p, view, bx, by, rx, pts_front, radius, letter="a", tip=None):
    """A tail from the rump: pts are relative to the rump (right end of the body in front view)."""
    if view == "front":
        root = (bx + rx - 2, by - 3)
        pts = [(root[0] + dx, root[1] + dy) for dx, dy in pts_front]
    else:                                                                   # lying: round the front
        root = (bx + rx + 1, by + 2)
        pts = [(root[0] + 2, root[1] + 3), (root[0] - 8, root[1] + 7), (root[0] - 20, root[1] + 7), (root[0] - 28, root[1] + 5)]
        letter = "b"
    p.path(pts, letter, radius)
    if tip:
        p.ellipse(pts[-1][0], pts[-1][1], radius, radius, tip)


class Cat(Animal):
    def ears(self, p, hx, hy, view, pose):
        droop = 3 if pose in ("droop",) else 0
        for ex, far in ((hx - 6, False), (hx + 6, True)):
            pts = [(ex - 6, hy - 5), (ex - 2, hy - 19 + droop), (ex + 6, hy - 7)]
            p.poly(pts, "a" if far else "b")
            if not far:
                p.poly([(ex - 3, hy - 7), (ex - 2, hy - 15 + droop), (ex + 2, hy - 8)], "p")

    def tail(self, p, view, bx, by, pose):
        tail_path(p, view, bx, by, self.body[0], [(3, -2), (7, -8), (8, -16), (5, -21)], 2.6)


class Bunny(Animal):
    mouth = "y"
    body = (14, 10)

    def ears(self, p, hx, hy, view, pose):
        lean = 4 if pose == "droop" else 0
        if view == "lying":
            return
        p.ellipse(hx + 2 + lean, hy - 16 + lean, 3.4, 10, "a")
        p.ellipse(hx - 4 + lean, hy - 16 + lean, 3.6, 10.5, "b")
        p.ellipse(hx - 4 + lean, hy - 15 + lean, 1.6, 7.5, "p")

    def extra(self, p, hx, hy, bx, by, view, pose):
        if view == "lying":
            rimmed(p, hx + 12, hy - 5, 10, 3.2, "a")
            rimmed(p, hx + 11, hy - 2, 10, 3.4, "b")
            p.ellipse(hx + 11, hy - 2, 7, 1.3, "p")

    def tail(self, p, view, bx, by, pose):
        if view == "front":
            p.ellipse(bx + self.body[0], by - 3, 4, 4, "W")


class Lop(Bunny):
    def ears(self, p, hx, hy, view, pose):
        if view == "lying":
            return
        # Ears hang down beside the head: the far one behind, the near one in front of the cheek.
        p.ellipse(hx + 10, hy + 2, 3.8, 10, "a")

    def extra(self, p, hx, hy, bx, by, view, pose):
        if view == "front":
            p.ellipse(hx - 11, hy + 3, 4.6, 10.6, "o")
            p.ellipse(hx - 11, hy + 3, 3.8, 9.8, "b")
            p.ellipse(hx - 11, hy + 4, 1.6, 7, "p")
            p.ellipse(hx - 1, hy - 10, 6, 2.5, "b")        # the crown between the ears
        else:
            rimmed(p, hx + 2, hy + 5, 4, 8, "b")


class Chick(Animal):
    head = (10, 9.5)
    body = (15, 13)
    head_at = (24, 26)
    body_at = (34, 44)
    mouth = "beak"
    nose = False
    chest = False

    def legs(self, p, mode, far, bx, by):
        if mode == "none" or far:
            return
        step = {"stand": (0, 0), "walk_a": (-3, 2), "walk_b": (2, -3), "tuck": (0, 0)}[mode]
        for x, s in ((bx - 5, step[0]), (bx + 4, step[1])):
            top = by + self.body[1] - 2
            length = GROUND - top - (5 if mode == "tuck" else 0)
            p.rect(x + s, top, 2, length, "y")
            for dx in (-3, 0, 2):
                p.rect(x + s + dx, top + length - 1, 3, 2, "y")

    def ears(self, p, hx, hy, view, pose):
        for x, y, r in ((hx - 2, hy - 9, 2.4), (hx + 1, hy - 11, 2.8), (hx + 4, hy - 9, 2.2)):
            p.ellipse(x, y, r, r + 1, "b")

    def tail(self, p, view, bx, by, pose):
        if view == "front":
            p.poly([(bx + 12, by - 4), (bx + 21, by - 13), (bx + 17, by - 1)], "a")

    def markings(self, p, hx, hy, view, pose):
        if view == "front":
            p.ellipse(self.body_at[0] + 3, self.body_at[1] + 1, 8, 6, "a", only="bld")   # the wing
            p.ring(self.body_at[0] + 3, self.body_at[1] + 1, 8, 6, 1, "d", only="a")

    def mouth_shape(self, p, mx, my, kind):
        bx, by = mx - 5, my - 4
        if kind in ("open", "eat", "eat2"):
            p.poly([(bx + 6, by - 2), (bx - 3, by), (bx + 6, by + 1)], "y")
            p.poly([(bx + 6, by + 2), (bx - 1, by + 3), (bx + 6, by + 4)], "Y")
        else:
            p.poly([(bx + 6, by - 2), (bx - 3, by + 1), (bx + 6, by + 3)], "y")
            p.line(bx, by + 1, bx + 5, by + 1, "Y", 1)
        if kind == "frown":
            p.rect(bx + 1, by + 4, 3, 1, "m")


class Raccoon(Animal):
    body = (16, 11)

    def ears(self, p, hx, hy, view, pose):
        for i, (x, y) in enumerate(((hx - 8, hy - 9), (hx + 6, hy - 10))):
            p.ellipse(x, y, 4.2, 4.6, "a" if (i and view == "front") else "b")
            if view == "front" and not i:
                p.ellipse(x, y + 0.5, 2, 2.4, "j")

    def tail(self, p, view, bx, by, pose):
        rel = [(4, -1), (9, -6), (11, -13), (10, -20)]
        tail_path(p, view, bx, by, self.body[0], rel, 4.2, letter="b")
        # Rings across the bushy tail.
        if view == "front":
            for dx, dy in ((7, -3), (10, -9), (11, -16)):
                p.ellipse(bx + self.body[0] - 2 + dx, by - 3 + dy, 4.6, 1.6, "j", only="bad")

    def markings(self, p, hx, hy, view, pose):
        fx = hx - 5
        p.ellipse(fx, hy + 6, 7, 4.6, "w", only="bld")                       # muzzle
        p.ellipse(fx - 4, hy - 4.5, 4, 1.4, "w", only="bld")                 # pale brows
        p.ellipse(fx + 6, hy - 4.5, 3.6, 1.4, "w", only="bld")
        # The mask: a patch round each eye that runs down and out to the cheek, apart over the nose,
        # so it reads as a bandit's mask and not a pair of glasses.
        p.poly([(fx - 8, hy - 2), (fx - 1, hy - 2), (fx, hy + 2), (fx - 5, hy + 5), (fx - 9, hy + 3)], "j", only="bldw")
        p.poly([(fx + 3, hy - 2), (fx + 9, hy - 2), (fx + 11, hy + 4), (fx + 8, hy + 5), (fx + 3, hy + 2)], "j", only="bldw")

    def eye(self, p, x, y, kind, near):
        super().eye(p, x, y, kind, near)
        if kind in ("open", "sad"):
            p.rect(x - 1, y - 2 + (kind == "sad"), 2, 2, "h")              # a bigger shine, so the eye shows in the mask


class Ferret(Animal):
    body = (20, 8)
    body_at = (38, 48)
    head = (10, 9)
    head_at = (18, 36)
    leg_w = 5
    snout = (4, 3.4)
    chest = False

    def ears(self, p, hx, hy, view, pose):
        for x in ((hx - 5, hx + 5) if view != "front" else (hx - 4, hx + 6)):
            p.ellipse(x, hy - 8, 3, 3, "b")
            if view == "front":
                p.ellipse(x, hy - 8, 1.4, 1.4, "p")

    def tail(self, p, view, bx, by, pose):
        tail_path(p, view, bx, by, self.body[0], [(5, 1), (11, 0), (16, -4), (18, -9)], 2.4)

    def markings(self, p, hx, hy, view, pose):
        fx = hx - 5
        p.ellipse(fx - 1, hy + 4, 9, 5.5, "w", only="bld")                   # pale face
        p.ellipse(fx - 4, hy + 0.5, 3.6, 2.8, "j", only="bldw")              # the band: a soft patch at each eye
        p.ellipse(fx + 6, hy + 0.5, 3.4, 2.6, "j", only="bldw")
        p.rect(fx - 1, hy - 0.5, 4, 2, "j", only="bldw")
        p.ellipse(self.body_at[0] - 12, self.body_at[1] + 2, 6, 4, "w", only="bld")


class Possum(Animal):
    snout = (5, 3.6)
    chest = False

    def ears(self, p, hx, hy, view, pose):
        for i, (x, y) in enumerate(((hx - 8, hy - 9), (hx + 7, hy - 10))):
            p.ellipse(x, y, 5.2, 5.6, "K")
            if view == "front":
                p.ellipse(x, y + 0.5, 3, 3.4, "p")

    def tail(self, p, view, bx, by, pose):
        tail_path(p, view, bx, by, self.body[0], [(4, 1), (10, 1), (14, -3), (14, -9), (10, -12)], 1.5, letter="t")

    def markings(self, p, hx, hy, view, pose):
        p.ellipse(hx - 3, hy + 1, 11, 9.5, "w", only="bld")                  # white face
        p.ellipse(hx - 14, hy + 5, 5, 3.6, "w", only="bld")
        fx = hx - 5
        p.ellipse(fx - 4, hy, 3.6, 3.8, "r", only="bldw")                    # grey rings round the eyes
        p.ellipse(fx + 6, hy, 3.2, 3.6, "r", only="bldw")

    def mouth_shape(self, p, mx, my, kind):
        super().mouth_shape(p, mx, my, kind)
        p.ellipse(mx - self.snout[0] - 1, my - 1, 2, 1.6, "n")               # pink nose at the tip


class Stitched(Bunny):
    """A creepy-cute plush bunny: a button eye and an X-stitched one, a stitched mouth, a bandaged ear,
    a patch on its side, a heart on its chest and stuffing out of a seam."""

    def eye(self, p, x, y, kind, near):
        if near:   # a button: doesn't blink
            p.ellipse(x, y, 3.4, 3.4, "u")
            p.ellipse(x, y, 2.4, 2.4, "U")
            for hx, hy in ((-1, -1), (1, -1), (-1, 1), (1, 1)):
                p.rect(x + hx - 0.5, y + hy - 0.5, 1, 1, "v")
            p.rect(x - 3, y - 3, 1, 1, "h")
        else:      # sewn shut
            p.line(x - 2.5, y - 2.5, x + 2.5, y + 2.5, "x", 1.4)
            p.line(x + 2.5, y - 2.5, x - 2.5, y + 2.5, "x", 1.4)

    def mouth_shape(self, p, mx, my, kind):
        if kind in ("open", "eat", "eat2"):
            return super().mouth_shape(p, mx, my, kind)
        p.ellipse(mx, my - 1, 1.6, 1.1, "n")
        drop = 1 if kind == "frown" else 0
        for i in range(4):
            p.line(mx - 3 + i * 2, my + 2 + (i % 2) * (1 - 2 * drop), mx - 2 + i * 2, my + 2 + ((i + 1) % 2) * (1 - 2 * drop), "x", 1)

    def markings(self, p, hx, hy, view, pose):
        bx, by = self.body_at
        if pose in ("lie", "lie_2"):
            bx, by = 36, 51
        # A patch on its side, stitched round.
        px, py = bx + 3, by - 6
        p.rect(px, py, 7, 6, "q", only="bld")
        for i in range(0, 7, 2):
            p._set(px + i, py, "x")
            p._set(px + i, py + 5, "x")
        if view == "front" and pose not in ("lie", "lie_2"):
            p.blit(bx - 14, by - 3, ["rr.rr", "rHrrR", ".rrR.", "..R.."])   # a heart on its chest
        # Stuffing out of a seam at the back of its head.
        sx, sy = hx + 9, hy - 6
        p.ellipse(sx, sy, 3, 2.4, "W")
        p.ellipse(sx + 1, sy - 2, 2, 2, "W")

    def extra(self, p, hx, hy, bx, by, view, pose):
        super().extra(p, hx, hy, bx, by, view, pose)
        if view == "front":
            # The near ear bandaged, a loose end hanging.
            x = hx - 4
            lean = 4 if pose == "droop" else 0
            y = hy - 18 + lean
            p.rect(x - 4 + lean, y, 9, 4, "B")
            p.rect(x - 4 + lean, y + 2, 9, 1, "C")
            p.rect(x + 4 + lean, y + 2, 2, 5, "B")


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
