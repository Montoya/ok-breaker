# Art Breaker local prototype

This dependency-free prototype demonstrates the intended Reddit post preview, expanded Play surface, and expanded Create surface.

You can open `index.html` directly. The prototype deliberately uses a classic local script so Play and Create work from a `file://` URL.

You can also serve the repository root with any static web server and open `/prototype/`. For example:

```sh
python3 -m http.server 8877
```

Then visit `http://127.0.0.1:8877/prototype/`.

Routes are represented by URL fragments:

- `#post` — seeded/community post preview
- `#play` — fixed-step Canvas game
- `#create` — fully drawable 20 × 18 board editor

Boards and per-board best scores are stored in browser local storage. **Post board** is a local simulation and makes no Reddit or network request.

The locally embedded **JetBrains Mono** variable font comes from Google Fonts and is distributed under the SIL Open Font License. Its license is saved beside the font in `assets/fonts/JetBrainsMono-OFL.txt`.
