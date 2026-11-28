# Real aircraft models

Put downloaded `.glb` models here to ship them with the game, then list them in `models.json`:

```json
{
  "b738": { "file": "b738.glb", "name": "Boeing 737-800", "author": "Artist name", "license": "CC BY 4.0", "link": "https://sketchfab.com/3d-models/..." }
}
```

The key is the aircraft type (`c172`, `cub`, `extra330`, `kingair`, `a320`, `b738`, `b744`, `b789`, `f16`, `fa18`, `trainer`, `airliner`, `fighter`).
The game fits each model automatically (nose direction, size, wheels on the ground). To store a fine-tuned fit, add
`"fit": { "yaw": 0, "pitch": 0, "roll": 0, "scale": 1, "offset": [0, 0, 0], "interior": false }` (press J in flight to adjust a model, then copy the numbers).

Players can also add their own models in the game: the **3D model** button on each aircraft card. Those stay in their browser.

Credit the artist for CC BY models: the name, author and licence show on the aircraft card and on the Controls page.
