"""
Drawing pixel art with shapes on a grid of palette letters, for art too big to
type row by row (pets at 64 x 64, the apartment's furniture). Shapes first,
then `shade` works out light and shadow from the shape itself (light from the
top-left), `outline` puts the dark line round everything, and the details go
on by hand. Same letters-and-palette idea as the pixel-art skill's specs.
"""
import math


class Painter:
    def __init__(self, w, h):
        self.w, self.h = w, h
        self.g = [["."] * w for _ in range(h)]

    # -- reading
    def get(self, x, y):
        return self.g[y][x] if 0 <= x < self.w and 0 <= y < self.h else "."

    def rows(self):
        return ["".join(r) for r in self.g]

    def _set(self, x, y, ch, only=None, keep=None):
        if 0 <= x < self.w and 0 <= y < self.h:
            cur = self.g[y][x]
            if only is not None and cur not in only:
                return
            if keep is not None and cur in keep:
                return
            self.g[y][x] = ch

    # -- shapes
    def rect(self, x, y, w, h, ch, only=None, keep=None):
        for yy in range(int(round(y)), int(round(y + h))):
            for xx in range(int(round(x)), int(round(x + w))):
                self._set(xx, yy, ch, only, keep)

    def ellipse(self, cx, cy, rx, ry, ch, only=None, keep=None):
        for y in range(int(cy - ry - 1), int(cy + ry + 2)):
            for x in range(int(cx - rx - 1), int(cx + rx + 2)):
                if ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2 <= 1:
                    self._set(x, y, ch, only, keep)

    def ring(self, cx, cy, rx, ry, t, ch, half=None, only=None):
        """An ellipse's rim, t thick; half='top' or 'bottom' keeps one side (closed eyes, smiles)."""
        for y in range(int(cy - ry - 1), int(cy + ry + 2)):
            for x in range(int(cx - rx - 1), int(cx + rx + 2)):
                px, py = x + 0.5, y + 0.5
                outer = ((px - cx) / rx) ** 2 + ((py - cy) / ry) ** 2 <= 1
                inner = ((px - cx) / max(rx - t, 0.1)) ** 2 + ((py - cy) / max(ry - t, 0.1)) ** 2 <= 1
                if outer and not inner:
                    if half == "top" and py > cy:
                        continue
                    if half == "bottom" and py < cy:
                        continue
                    self._set(x, y, ch, only)

    def poly(self, pts, ch, only=None):
        xs = [p[0] for p in pts]
        ys = [p[1] for p in pts]
        for y in range(int(min(ys)), int(max(ys)) + 1):
            for x in range(int(min(xs)), int(max(xs)) + 1):
                if self._inside(pts, x + 0.5, y + 0.5):
                    self._set(x, y, ch, only)

    @staticmethod
    def _inside(pts, x, y):
        n, c = len(pts), False
        j = n - 1
        for i in range(n):
            xi, yi = pts[i]
            xj, yj = pts[j]
            if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi + 1e-9) + xi:
                c = not c
            j = i
        return c

    def line(self, x0, y0, x1, y1, ch, thick=1.0, only=None):
        steps = int(max(abs(x1 - x0), abs(y1 - y0)) * 2) + 1
        r = thick / 2
        for i in range(steps + 1):
            t = i / steps
            x, y = x0 + (x1 - x0) * t, y0 + (y1 - y0) * t
            for yy in range(int(y - r - 1), int(y + r + 2)):
                for xx in range(int(x - r - 1), int(x + r + 2)):
                    if (xx + 0.5 - x) ** 2 + (yy + 0.5 - y) ** 2 <= max(r * r, 0.26):
                        self._set(xx, yy, ch, only)

    def path(self, pts, ch, radius, only=None):
        """A thick stroke through points (tails)."""
        for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
            steps = int(math.hypot(x1 - x0, y1 - y0)) + 1
            for i in range(steps + 1):
                t = i / steps
                self.ellipse(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, radius, radius, ch, only)

    def blit(self, x0, y0, rows, keep="."):
        for y, row in enumerate(rows):
            for x, ch in enumerate(row):
                if ch not in keep:
                    self._set(x0 + x, y0 + y, ch)

    def shift(self, dx, dy):
        g = [["."] * self.w for _ in range(self.h)]
        for y in range(self.h):
            for x in range(self.w):
                if 0 <= x - dx < self.w and 0 <= y - dy < self.h:
                    g[y][x] = self.g[y - dy][x - dx]
        self.g = g

    # -- light and line
    def shade(self, body="b", dark="d", light="l", deep=3, glow=2, light_above=None):
        """Light from the top-left: body pixels near the upper-left edge go light, near the lower-right edge dark."""
        inside = lambda x, y: self.get(x, y) != "."
        out = [r[:] for r in self.g]
        for y in range(self.h):
            for x in range(self.w):
                if self.g[y][x] not in body:
                    continue
                if any(not inside(x + k, y + k) or not inside(x, y + k + 1) for k in range(1, deep + 1)):
                    out[y][x] = dark
                elif any(not inside(x - k, y - k) for k in range(1, glow + 1)) and (light_above is None or y < light_above):
                    out[y][x] = light
        self.g = out

    def outline(self, ch="o", against="."):
        edge = []
        for y in range(self.h):
            for x in range(self.w):
                if self.g[y][x] != against:
                    continue
                if any(self.get(x + dx, y + dy) not in (against, ch) for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))):
                    edge.append((x, y))
        for x, y in edge:
            self.g[y][x] = ch
