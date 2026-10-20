// The house's floor plan, seen front-on like a doll's house: two bedrooms
// upstairs, the kitchen-living room and the bathroom-laundry downstairs.
// Rooms, the doors between them, where the furniture stands and where pets go
// for what -- and the way from any room to any other through the doors.
// Pure data and geometry (room pixels, 16 to a tile), so it is testable.

export const T = 16;
export const W = 16 * T; // 256
export const H = 15 * T; // 240

// Each room: its back wall strip and its floor. `free` is where a pet may
// wander to (clear of the furniture); feet y is the bottom of the sprite.
export const ROOMS = {
  bedA: { label: "Bedroom", wall: { x0: 0, x1: 128, y0: 0, y1: 32 }, floor: { x0: 0, x1: 128, y0: 32, y1: 112 },
    free: [{ x0: 42, x1: 118, y0: 66, y1: 108 }], paper: "wall@rose" },
  bedB: { label: "Bedroom", wall: { x0: 128, x1: 256, y0: 0, y1: 32 }, floor: { x0: 128, x1: 256, y0: 32, y1: 112 },
    free: [{ x0: 138, x1: 214, y0: 66, y1: 108 }], paper: "wall@lilac" },
  living: { label: "Kitchen & living room", wall: { x0: 0, x1: 176, y0: 112, y1: 144 }, floor: { x0: 0, x1: 176, y0: 144, y1: 240 },
    free: [{ x0: 10, x1: 66, y0: 168, y1: 204 }, { x0: 80, x1: 168, y0: 176, y1: 236 }], paper: "wall" },
  bath: { label: "Bathroom & laundry", wall: { x0: 176, x1: 256, y0: 112, y1: 144 }, floor: { x0: 176, x1: 256, y0: 144, y1: 240 },
    free: [{ x0: 184, x1: 250, y0: 176, y1: 236 }], paper: "tile@aqua/wall" },
};

// The kitchen is the left end of the living room, with a tiled floor.
export const KITCHEN = { x0: 0, x1: 72 };

// Doors: which rooms they join, and a point either side to walk through.
export const DOORS = [
  { rooms: ["bedA", "bedB"], at: { bedA: { x: 118, y: 90 }, bedB: { x: 138, y: 90 } }, wall: { x: 128, y0: 72, y1: 104 } },
  { rooms: ["bedA", "living"], at: { bedA: { x: 72, y: 108 }, living: { x: 72, y: 154 } }, door: { x: 72, y: 144 } },
  { rooms: ["bedB", "living"], at: { bedB: { x: 141, y: 108 }, living: { x: 141, y: 154 } }, door: { x: 141, y: 144 } },
  { rooms: ["living", "bath"], at: { living: { x: 168, y: 206 }, bath: { x: 186, y: 206 } }, wall: { x: 176, y0: 188, y1: 222 } },
];

// What stands where: frame in the atlas, bottom-centre position. Drawn in
// this order, before the pets (everything is against a wall or low).
export const FURNITURE = [
  // Bedroom A
  { frame: "window/day", night: "window/night", x: 76, y: 31 },
  { frame: "picture/hills", x: 112, y: 22 },
  { frame: "rug@pink/oval", x: 80, y: 98 },
  { frame: "bed/bed", x: 20, y: 62 },
  { frame: "nightstand/lamp", night: "nightstand/lamp", day: "nightstand/lamp_off", x: 44, y: 56 },
  // Bedroom B
  { frame: "window/day", night: "window/night", x: 180, y: 31 },
  { frame: "picture/sea", x: 144, y: 22 },
  { frame: "rug/oval", x: 176, y: 98 },
  { frame: "bed/bed", x: 236, y: 62, flip: true },
  { frame: "nightstand/lamp", night: "nightstand/lamp", day: "nightstand/lamp_off", x: 212, y: 56 },
  // Kitchen
  { frame: "fridge/fridge", x: 12, y: 150 },
  { frame: "counter/counter", x: 40, y: 152 },
  { frame: "table/table", x: 34, y: 232 },
  // Living room
  { frame: "window/day", night: "window/night", x: 106, y: 141 },
  { frame: "sofa/sofa", x: 106, y: 168 },
  { frame: "shelf/shelf", x: 164, y: 154 },
  { frame: "rug/oval", x: 120, y: 206 },
  { frame: "plant/plant", x: 82, y: 236 },
  // Bathroom & laundry
  { frame: "bathtub/tub", x: 198, y: 164 },
  { frame: "toilet/toilet", x: 226, y: 160 },
  { frame: "washer/washer", x: 246, y: 166 },
  { frame: "mat/mat", x: 200, y: 196 },
  { frame: "basket/basket", x: 242, y: 232 },
];

// Where a pet goes for something, by its bedroom (0 or 1) and its place in the queue.
const BEDS = [
  [{ x: 12, y: 58 }, { x: 28, y: 58 }, { x: 52, y: 76 }, { x: 66, y: 84 }],
  [{ x: 244, y: 58 }, { x: 228, y: 58 }, { x: 204, y: 76 }, { x: 190, y: 84 }],
];
export const BOWL = { x: 16, y: 186 };

export function bedroomOf(index) {
  return index % 2 === 0 ? "bedA" : "bedB";
}

export function bedSpot(index) {
  const room = index % 2;
  const slots = BEDS[room];
  return { room: bedroomOf(index), ...slots[Math.floor(index / 2) % slots.length] };
}

export function bowlSpot(index) {
  return { room: "living", x: BOWL.x + 16 + (index % 3) * 10, y: BOWL.y + 2 + Math.floor(index / 3) * 6 };
}

export function bathSpot(index) {
  return { room: "bath", x: 194 + (index % 3) * 12, y: 196 + Math.floor(index / 3) * 8 };
}

export function roomAt(x, y) {
  for (const [id, r] of Object.entries(ROOMS)) {
    const f = r.floor;
    if (x >= f.x0 && x <= f.x1 && y >= f.y0 - 4 && y <= f.y1) return id;
  }
  return "living";
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

/** The points to walk through to get from a room to a spot in another: through each door's two sides. */
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
 *   the bathroom; hungry -> hangs about the kitchen; grubby -> the bathroom;
 *   sad or poorly -> its own room; otherwise mostly the living room.
 */
export function destination(cond, effect, index, rand = Math.random) {
  if (cond.state === "egg") return null;
  if (cond.state === "asleep") return bedSpot(index);
  if (effect === "eat") return bowlSpot(index);
  if (effect === "clean") return bathSpot(index);
  if (cond.flags?.hungry && rand() < 0.7) {
    return { room: "living", x: 12 + rand() * 54, y: 168 + rand() * 34 };
  }
  if (cond.flags?.grubby && rand() < 0.6) return wanderSpot("bath", rand);
  if (cond.state === "sad" || cond.state === "poorly") return wanderSpot(bedroomOf(index), rand);
  const r = rand();
  return wanderSpot(r < 0.55 ? "living" : r < 0.8 ? bedroomOf(index) : r < 0.9 ? bedroomOf(index + 1) : "bath", rand);
}
