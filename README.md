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

## On your phone

RoomiePet is a PWA: install it from the browser and it behaves like an app.

- **Install.** iPhone/iPad: in Safari, Share → *Add to Home Screen*. Android:
  the *Install* button in the app (Me tab) or Chrome's menu → *Install app*.
  Long-press the Android icon for *My chores* / *Add a chore*.
- **Notifications** (Me → Notifications): a morning list of your chores at the
  hour you pick, your pet getting hungry/grubby/bored/poorly (daytime only),
  a chore given to you or your turn coming round, someone covering for you,
  cheers -- each can be turned off. The app icon shows how many chores are
  yours today. On iPhone they need iOS 16.4+ and the app on the Home Screen.
- **Siri and Apple Shortcuts** (Me → Siri & Shortcuts): make a *key* (it can
  only do chores and tags), then build the shortcuts the app describes --
  "Hey Siri, I did a chore" → "the dishes" → "Done! Mochi got 34 food",
  "What are my chores?", or pick from a list on the Home Screen, Action
  button or Apple Watch. The endpoints answer `{ok, speak}` for Speak Text:
  `GET /api/shortcuts/summary`, `GET /api/shortcuts/chores`,
  `POST /api/shortcuts/done` with `{"chore": "dishes"}` or `{"id": ...}`,
  each with `Authorization: Bearer <key>`. Tasker, MacroDroid or Google
  Assistant routines on Android can call the same ones.
- **NFC tags** (Chores → a chore → *Add an NFC tag*): stick a tag where the
  chore happens and tapping it marks it done for whoever tapped.
  - Android (Chrome): *Write to a tag now* writes it from the app; tapping
    it opens the chore with a big Done button (or ticks it straight away,
    if you turn that on for your phone).
  - iPhone: a Shortcuts automation (Automation → NFC → scan the tag → Get
    Contents of URL `POST /api/tags/<id>/tap` with your key) ticks it
    without opening anything -- the app shows the exact values. Or write
    the tag's link with an app like NFC Tools; iPhones read it in the
    background and show a banner.
  - A tag only holds `https://<your server>/t/<id>` -- no key, nothing
    personal. It does nothing for a phone that isn't signed in to your
    household, and a chore tapped twice within half an hour counts once.

**These need HTTPS** (browsers allow service workers, push and NFC only on
secure pages; `localhost` is the one exception). Plain `http://192.168…`
on your Wi-Fi works for chores but not for any of this. Easy ways to get a
real certificate: Tailscale (`tailscale serve 3000`, for phones on your
tailnet), a Cloudflare Tunnel, or Caddy in front with your own domain.

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
behind a reverse proxy, so the rate limit sees real addresses. For push:
`VAPID_SUBJECT` -- a `mailto:` or `https:` contact for the push services
(Apple requires a real one) -- and optionally `VAPID_PUBLIC_KEY` /
`VAPID_PRIVATE_KEY`; without them a key pair is made once and kept in the
database (moving to new keys means everyone turns notifications on again).

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
npm run art        # -> client/public/sprites/sheet.png + sheet.json, art/preview.png, client/public/icons/
```

The house is a doll's-house cutaway (`client/src/house.js`: rooms, doors,
furniture, where pets go): two bedrooms upstairs, the kitchen-living room and
the bathroom-laundry downstairs. Pets sleep in their bedroom (alternating
between the two), run to the bowl after a kitchen chore and to the bath after
a cleaning one, hang about the kitchen when hungry, and otherwise mostly the
living room.

Pets are drawn on a 16 x 16 grid and the house in 16-pixel tiles.
`art/sample32.py` draws one pet at 32 x 32 (`art/sample32-preview.png`) to
show what a bigger grid looks like before redrawing the rest.

## Layout

```
shared/        pet and chore rules, used by both sides (+ their tests)
server/        Express API, SQLite, live updates (server-sent events), web push
client/public/ service worker (sw.js), manifest, icons
client/        React app (Vite)
art/           the sprite spec and its preview
.claude/       the pixel-art skill
```
