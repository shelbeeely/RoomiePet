# RoomiePet

Roommates' chores with a tamagotchi pet each (README.md has the whole picture).

- `shared/` holds the rules (pet needs, rewards, growth; chore schedules and
  turns). Change behaviour there, so server and app stay in agreement, and
  extend `shared/rules.test.js`.
- `server/src/app.js` is the API; every mutation calls `hub.notify(household)`
  so other phones refresh. Server tests: `server/test/api.test.js` (real HTTP,
  in-memory SQLite, a clock the test moves).
- `client/src/` is React with Vite; `HouseScene.jsx` draws the shared room on
  a canvas, `components.jsx` the rest.
- Art: edit `art/make_spec.py`, then `npm run art` (uses the pixel-art skill).
  Never hand-edit `client/public/sprites/*`.

Check a change with `npm test` and `npm run build`. Data in `data/` and any
`*.db` is real households' -- never commit it.
