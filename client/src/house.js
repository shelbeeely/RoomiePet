// The apartment's floor plan: about 750 sq ft (30 x 25 ft), seen front-on
// from a little above like a doll's house, 16 pixels to the foot. Left to
// right: the two bedrooms, one behind the other, each opening onto the main
// area -- kitchen along its back wall, living room in front -- and the
// bathroom with the laundry in the back right corner. Each room shows the
// wall at its back and its floor. Rooms, the doors between them, where the
// furniture stands, where pets go for what, and the way from room to room.
// Pure data and geometry, so it is testable.

export const FT = 16;
export const W = 30 * FT; // 480
export const H = 25 * FT; // 400
export const WALL_H = 48;  // a back wall strip, 3 ft as seen

// A room's area is one or more rectangles; each rectangle's top edge has a back wall.
// `free` is where a pet may stand (its feet), clear of the furniture.
export const ROOMS = {
  bedA: { label: "Bedroom", areas: [{ x0: 0, x1: 176, y0: 0, y1: 196 }], paper: "wall@rose", floor: "floor/wood",
    free: [{ x0: 92, x1: 166, y0: 112, y1: 190 }] },
  bedB: { label: "Bedroom", areas: [{ x0: 0, x1: 176, y0: 196, y1: 400 }], paper: "wall@lilac", floor: "floor/wood",
    free: [{ x0: 92, x1: 166, y0: 310, y1: 392 }] },
  main: { label: "Kitchen & living room", areas: [{ x0: 176, x1: 336, y0: 0, y1: 400 }, { x0: 336, x1: 480, y0: 152, y1: 400 }],
    paper: "wall@butter", floor: "floor/wood",
    free: [{ x0: 196, x1: 326, y0: 118, y1: 176 }, { x0: 196, x1: 326, y0: 226, y1: 392 }, { x0: 346, x1: 470, y0: 252, y1: 312 }] },
  bath: { label: "Bathroom & laundry", areas: [{ x0: 336, x1: 480, y0: 0, y1: 152 }], paper: "tile@aqua/wall", floor: "tile@aqua/check",
    free: [{ x0: 352, x1: 428, y0: 120, y1: 148 }] },
};

// The kitchen floor is tiled: the back of the main area.
export const KITCHEN_FLOOR = { x0: 176, x1: 336, y0: WALL_H, y1: 184 };

// Doors: the rooms they join, a point on either side, and how they are drawn --
// a gap in a side wall, or a doorway in a back wall.
export const DOORS = [
  { rooms: ["bedA", "main"], at: { bedA: { x: 158, y: 166 }, main: { x: 196, y: 166 } }, gap: { x: 176, y0: 112, y1: 180 } },
  { rooms: ["bedB", "main"], at: { bedB: { x: 158, y: 362 }, main: { x: 196, y: 362 } }, gap: { x: 176, y0: 308, y1: 376 } },
  { rooms: ["bath", "main"], at: { bath: { x: 356, y: 146 }, main: { x: 356, y: 218 } }, doorway: { x: 356, y: 200 } },
];

// Furniture: frame, bottom-centre position. `wall` pieces hang on a back wall
// and `flat` ones lie on the floor -- both drawn before the pets; the rest
// stand on the floor and are drawn with the pets, back to front.
export const FURNITURE = [
  // Bedroom 1
  { frame: "window/main", night: "window/night", x: 138, y: 42, wall: true },
  { frame: "picture/main", x: 40, y: 30, wall: true },
  { frame: "rug@pink/main", x: 120, y: 160, flat: true },
  { frame: "bed/main", x: 40, y: 140 },
  { frame: "nightstand/off", night: "nightstand/main", x: 88, y: 80 },
  // Bedroom 2
  { frame: "window/main", night: "window/night", x: 138, y: 238, wall: true },
  { frame: "picture@sea/main", x: 40, y: 226, wall: true },
  { frame: "rug@sage/main", x: 120, y: 356, flat: true },
  { frame: "bed@blue/main", x: 40, y: 336 },
  { frame: "nightstand/off", night: "nightstand/main", x: 88, y: 276 },
  // Kitchen, along the back of the main area
  { frame: "fridge/main", x: 198, y: 86 },
  { frame: "counter/main", x: 274, y: 80 },
  { frame: "table/main", x: 266, y: 214 },
  // Living room, the front of the main area
  { frame: "bookshelf/main", x: 204, y: 300 },
  { frame: "tv/main", x: 426, y: 214 },
  { frame: "rug/main", x: 404, y: 304, flat: true },
  { frame: "sofa/main", x: 404, y: 384 },
  { frame: "plant/main", x: 300, y: 398 },
  // Bathroom & laundry
  { frame: "bathtub/main", x: 390, y: 104 },
  { frame: "toilet/main", x: 456, y: 96 },
  { frame: "mat/main", x: 392, y: 132, flat: true },
  { frame: "washer/main", x: 458, y: 150 },
];

export const BOWL = { x: 214, y: 134 };

// Where pets sleep: on their bed, then beside it. Bedrooms alternate by roommate.
const BEDS = {
  bedA: [{ x: 30, y: 118 }, { x: 54, y: 118 }, { x: 110, y: 150 }, { x: 142, y: 178 }],
  bedB: [{ x: 30, y: 314 }, { x: 54, y: 314 }, { x: 110, y: 346 }, { x: 142, y: 374 }],
};

export function bedroomOf(index) {
  return index % 2 === 0 ? "bedA" : "bedB";
}

export function bedSpot(index) {
  const room = bedroomOf(index);
  const slots = BEDS[room];
  return { room, ...slots[Math.floor(index / 2) % slots.length] };
}

export function bowlSpot(index) {
  return { room: "main", x: BOWL.x + 30 + (index % 3) * 22, y: BOWL.y + 8 + Math.floor(index / 3) * 10 };
}

export function bathSpot(index) {
  return { room: "bath", x: 362 + (index % 3) * 22, y: 140 + Math.floor(index / 3) * 4 };
}

export function roomAt(x, y) {
  for (const [id, r] of Object.entries(ROOMS)) {
    if (r.areas.some((a) => x >= a.x0 && x <= a.x1 && y >= a.y0 && y <= a.y1)) return id;
  }
  return "main";
}

/** A random spot a pet can wander to in a room. */
export function wanderSpot(room, rand = Math.random) {
  const areas = ROOMS[room].free;
  const a = areas[Math.floor(rand() * areas.length)];
  return { room, x: a.x0 + rand() * (a.x1 - a.x0), y: a.y0 + rand() * (a.y1 - a.y0) };
}

/** The rooms to pass through from one to another (breadth first through the doors). */
export function roomPath(from, to) {
  if (from === to) return [from];
  const prev = { [from]: null };
  const queue = [from];
  while (queue.length) {
    const r = queue.shift();
    for (const d of DOORS) {
      if (!d.rooms.includes(r)) continue;
      const next = d.rooms[0] === r ? d.rooms[1] : d.rooms[0];
      if (next in prev) continue;
      prev[next] = r;
      if (next === to) {
        const out = [to];
        for (let cur = r; cur !== null; cur = prev[cur]) out.unshift(cur);
        return out;
      }
      queue.push(next);
    }
  }
  return [from];
}

/** The points to walk through to get from a room to a spot in another: each door's two sides. */
export function route(fromRoom, to) {
  const rooms = roomPath(fromRoom, to.room);
  const points = [];
  for (let i = 0; i + 1 < rooms.length; i++) {
    const d = DOORS.find((door) => door.rooms.includes(rooms[i]) && door.rooms.includes(rooms[i + 1]));
    points.push({ ...d.at[rooms[i]], room: rooms[i] }, { ...d.at[rooms[i + 1]], room: rooms[i + 1] });
  }
  points.push({ x: to.x, y: to.y, room: to.room });
  return points;
}

/**
 * Where a pet heads, from how it is and what just happened:
 *   asleep -> its bed; a chore that fed it -> the bowl; one that cleaned it ->
 *   the bathroom; hungry -> about the kitchen; grubby -> the bathroom;
 *   sad or poorly -> its own room; otherwise mostly the living room.
 */
export function destination(cond, effect, index, rand = Math.random) {
  if (cond.state === "egg") return null;
  if (cond.state === "asleep") return bedSpot(index);
  if (effect === "eat") return bowlSpot(index);
  if (effect === "clean") return bathSpot(index);
  if (cond.flags?.hungry && rand() < 0.7) return { room: "main", x: 200 + rand() * 120, y: 122 + rand() * 50 };
  if (cond.flags?.grubby && rand() < 0.6) return wanderSpot("bath", rand);
  if (cond.state === "sad" || cond.state === "poorly") return wanderSpot(bedroomOf(index), rand);
  const r = rand();
  return wanderSpot(r < 0.6 ? "main" : r < 0.85 ? bedroomOf(index) : r < 0.93 ? bedroomOf(index + 1) : "bath", rand);
}
