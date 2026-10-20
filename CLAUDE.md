# RoomiePet

Roommates' chores with a tamagotchi pet each (README.md has the whole picture).

- `shared/` holds the rules (pet needs, rewards, growth; chore schedules and
  turns). Change behaviour there, so server and app stay in agreement, and
  extend `shared/rules.test.js`.
- `server/src/app.js` is the API; every mutation calls `hub.notify(household)`
  so other phones refresh. Server tests: `server/test/api.test.js` (real HTTP,
  in-memory SQLite, a clock the test moves).
- `client/src/` is React with Vite; `HouseScene.jsx` draws the shared flat on
  a canvas (a dollhouse, whole or one room, turnable) with `dollhouse.js`, and
  `RoomBuilder.jsx` arranges a room; `house.js` is how pets get about.
  `components.jsx` the rest, `integrations.jsx` install /
  notifications / Siri & Shortcuts / NFC tags, `pwa.js` the browser APIs.
- Push: `server/src/push.js`; who is told what is `shared/notify.js`, sent by
  `tell()` and the minute `tick()` in `app.js`. Tests pass `send` to
  `createApp` to catch messages. Shortcuts keys are tokens of kind
  "shortcut", limited to `KEY_PATHS`. Integration tests:
  `server/test/integrations.test.js`.
- `client/public/sw.js` is not bundled: bump `VERSION` when what it caches changes.
- The flat is `shared/home.js`: rooms and doors in feet, the furniture
  catalog (pieces are boxes), default layouts, and `layoutProblem`, which
  the server checks saved rooms with (`PUT /api/rooms/:room`). A new piece
  goes in `CATALOG`; `shared/home.test.js` checks its materials.
- Art: pets are 64 x 64 animals on all fours facing us (no side views), drawn from shapes in `art/pets.py`; colours
  in `art/make_spec.py`. Then `npm run art` (the pixel-art skill renders it).
  Never hand-edit `client/public/sprites/*`. Furniture isn't sprites: `dollhouse.js`
  draws it from the catalog.

Check a change with `npm test` and `npm run build`. Data in `data/` and any
`*.db` is real households' -- never commit it.
