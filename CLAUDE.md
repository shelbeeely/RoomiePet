# RoomiePet

Roommates' chores with a tamagotchi pet each (README.md has the whole picture).

- `shared/` holds the rules (pet needs, rewards, growth; chore schedules and
  turns). Change behaviour there, so server and app stay in agreement, and
  extend `shared/rules.test.js`.
- `server/src/app.js` is the API; every mutation calls `hub.notify(household)`
  so other phones refresh. Server tests: `server/test/api.test.js` (real HTTP,
  in-memory SQLite, a clock the test moves).
- `client/src/` is React with Vite; `HouseScene.jsx` draws the shared room on
  a canvas, `components.jsx` the rest, `integrations.jsx` install /
  notifications / Siri & Shortcuts / NFC tags, `pwa.js` the browser APIs.
- Push: `server/src/push.js`; who is told what is `shared/notify.js`, sent by
  `tell()` and the minute `tick()` in `app.js`. Tests pass `send` to
  `createApp` to catch messages. Shortcuts keys are tokens of kind
  "shortcut", limited to `KEY_PATHS`. Integration tests:
  `server/test/integrations.test.js`.
- `client/public/sw.js` is not bundled: bump `VERSION` when what it caches changes.
- Art: pets are 64 x 64 animals, drawn from shapes in `art/pets.py`; furniture in
  `art/house64.py` (16 px to the foot); colours in `art/make_spec.py`. Then
  `npm run art` (the pixel-art skill renders it). Never hand-edit
  `client/public/sprites/*`. The floor plan is `client/src/house.js`.

Check a change with `npm test` and `npm run build`. Data in `data/` and any
`*.db` is real households' -- never commit it.
