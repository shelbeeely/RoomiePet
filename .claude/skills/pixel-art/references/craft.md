# Drawing small pixel art that reads

Short notes for making 8-32 px art look alive. Check every point against the
enlarged preview, and imagine it at 1x too -- that is how it will be seen.

## Size and silhouette

- Pick the smallest size that holds the idea: 16x16 for pets and characters,
  8x8-16x16 for items and icons, 16x16 tiles (32x32 only if detail is needed).
- The silhouette does most of the work. Fill it in one colour first: if it is
  not recognisable as a solid shape, details will not save it. Big heads and
  small bodies read as cute; ears, tails, antennae and leaves make a shape
  unique.
- Leave at least one transparent row at the bottom (and room above the head)
  so a bob or a hop has somewhere to go without clipping.

## Outline, light and shading

- A dark outline (`o`) around the whole sprite separates it from any
  background. Make it a dark, slightly saturated colour of the scene rather
  than pure black; on light characters a darkened body colour also works.
- One light source, from the top-left: highlight (`l`) on the upper-left
  curve, shade (`d`) along the bottom and right. Two or three tones per
  material is plenty at 16 px.
- Shift hue as well as value: shadows a little toward blue/purple
  (`"hue": -8`), highlights a little toward yellow. Pure darkening looks muddy.
- Derive shades from the base colour in the palette so variants recolour
  cleanly. Check each variant's contrast against the outline -- a dark variant
  may need a lighter outline or brighter eyes (see `charcoal` in the example).
- Avoid "pillow shading" (darker all round the edge, light in the middle) and
  lone single pixels of a colour that make noise.

## Faces

- At 16x16, eyes are 1x2 pixels (or 2x2), mouth 1-2 pixels, set in the lower
  half of the head -- low-set features read as younger and cuter.
- Keep the face as a `part` patched onto the body (with `"onto"` set to the
  body letters) so every expression sits in exactly the same place; then the
  expression set is: open, blink, happy (^ ^), sad (droop, mouth turned down),
  sleep (closed lines), surprised (bigger eyes, o-mouth).
- Cheeks (`c`, a soft pink) one pixel below and outside the eyes add warmth.
- Make sure eyes are symmetric: count from both edges.

## Animation

- Two to four frames are enough for idle and walk at these sizes.
- Idle: breathe with a 1-pixel bob (shift the whole sprite down one row, or
  squash: one row shorter and one pixel wider) at 2-4 fps; add a blink frame
  every few loops.
- Walk: alternate the feet (patch the foot row, clearing the old feet with
  `_`) and bob on the passing frame, 6-8 fps. Make the mirrored direction with
  `"flip": "x"` or let the engine flip.
- Sleep: closed eyes and a slow 1-pixel breath at 1-2 fps; a "z" is better
  drawn by the app than baked into frames.
- Only what should move may change between frames -- compare frames in the
  preview row by row. A stray pixel that flickers is very visible.
- Reactions (happy, eat, play) are a single held frame or two, swapped in
  briefly by the app.

## Tiles and items

- A tile must meet itself on every edge: look at the 3x3 preview. Stagger
  plank or brick seams so the repeat is not obvious, and keep strong features
  away from the edges.
- Floors and walls are lower contrast than characters, so characters stay in
  front.
- Items share the characters' outline colour and light direction so they look
  like they belong in the same world.

## Palette

- A small shared palette (8-16 colours) keeps a whole project consistent.
  Put outline, eyes, mouth and cheeks in the top-level palette; give each
  sprite only its own body colours.
- Name letters by role, not colour (`b` body, `d` dark, `l` light, `o`
  outline, `e` eye), so a recolour never needs the rows changed.
