# RoomiePet

Chores for roommates, tamagotchi style. Everyone in the household gets their
own little pixel pet. Doing your chores keeps it fed, clean and happy, and it
grows up as you do more; leave them undone and it gets hungry, grubby, bored
and eventually a bit poorly (it never dies -- one chore starts bringing it
back). All the pets live together in a shared house you can watch on any
phone, and you can cheer each other's chores.

## How it works

- **A household** is made by one roommate; the others join with its invite
  code (or the invite link). Each phone stays signed in; a roommate can add
  another device with a one-time code (House → Add another device).
- **Chores** repeat daily, weekly or every few days, or happen once. They're
  for anyone, for one person, or taken in turns. Done early or late, the next
  one is due an interval from when it was actually done.
- **Pets** have three needs that fade over time -- food (about two days from
  full to empty), clean (three) and fun (four). A chore meets its kind of
  need: kitchen and groceries feed, cleaning, bathroom, laundry and trash
  clean, anything else is fun. Bigger chores give more. Your own late chores
  make your pet's fun fade faster; late chores that are anyone's make every
  home a little grubbier.
- **Growing up**: an egg hatches with your first chore, grows up at 200 xp
  and becomes a star (with a crown) at 600.
- **Covering for someone** is welcome: whoever does the chore gets the reward
  for their pet, and the feed says who covered for whom.
- **Kudos**: a 💖 on a roommate's chore gives their pet some fun.
- Pets sleep from 11pm to 7am on your phone's clock.

The rules live in `shared/pet.js` and `shared/chores.js`, used by both the
server (which keeps the real numbers) and the app.

## Running it

Needs Node 22.5 or later (it uses Node's built-in SQLite, so nothing native
to compile).

```bash
npm install
npm run dev        # API on :3000 and the app on :5173, reloading as you edit
```

To run it for real (one process serves the app and the API):

```bash
npm run build
npm start          # http://localhost:3000
```

Settings, as environment variables: `PORT` (3000), `HOST` (0.0.0.0),
`DB_PATH` (`data/roomiepet.db`), and `TRUST_PROXY` (e.g. `1`) when it runs
behind a reverse proxy, so the rate limit sees real addresses.

Roommates on their own phones need to reach the server: on a home network,
open `http://<your computer's address>:3000`; to use it from anywhere, run it
on a small host (any that runs Node and keeps a disk, e.g. Fly.io, Render
with a disk, a Raspberry Pi) behind HTTPS. Sign-in tokens travel with every
request, so use HTTPS for anything beyond your own Wi-Fi.

## Tests

```bash
npm test           # server API tests (node:test) and the shared rules (vitest)
```

## Art

The pets and the room are pixel art written as letter grids in
`art/make_spec.py` (which writes `art/sprites.json`), rendered with the
pixel-art skill in `.claude/skills/pixel-art`:

```bash
npm run art        # -> client/public/sprites/sheet.png + sheet.json, art/preview.png
```

## Layout

```
shared/        pet and chore rules, used by both sides (+ their tests)
server/        Express API, SQLite, live updates (server-sent events)
client/        React app (Vite)
art/           the sprite spec and its preview
.claude/       the pixel-art skill
```
