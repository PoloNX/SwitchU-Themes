# SwitchU Themes

This repository is the public catalog for SwitchU themes.

The client can fetch the full list of available themes with a single request to the root `index.json` file. Each theme then keeps its own manifest, screenshots, and optional audio inside a dedicated folder.

## Repository layout

```text
SwitchU-Themes/
├── index.json
├── themes/
│   └── <theme-id>/
│       ├── theme.json
│       ├── media/
│       │   ├── backgrounds/
│       │   └── screenshots/
│       │       ├── 00.png
│       │       ├── 01.png
│       │       └── ...
│       ├── fonts/
│       ├── assets/
│       │   └── icons/
│       └── sounds/
│           ├── music/
│           └── sfx/
└── templates/
    └── theme-template/
        ├── theme.json
        ├── media/
    │   ├── backgrounds/
        │   └── screenshots/
    ├── fonts/
    ├── assets/
    │   └── icons/
        └── sounds/
            ├── music/
            └── sfx/
```

## Root catalog

`index.json` is the entry point for the client.

- `schemaVersion`: version of the catalog format
- `themes`: list of published themes

Each theme entry should contain enough data to build the grid without downloading the full theme package first.

Example:

```json
{
  "schemaVersion": 1,
  "themes": [
    {
      "id": "wiiu-clean",
      "name": "Wii U Clean",
      "author": "PoloNX",
      "version": "1.0.0",
      "path": "themes/wiiu-clean",
      "manifest": "themes/wiiu-clean/theme.json"
    }
  ]
}
```

`cover` is optional. Add it when preview assets are available.
If `cover` is omitted, the client can fall back to the first entry in `preview.screenshots` from the theme manifest.

## Theme folder rules

- The folder name must match the theme `id`.
- The manifest file must be named `theme.json`.
- Screenshot filenames are typically numbered: `00`, `01`, `02`, and so on.
- Recommended screenshot format: `.png`.
- Supported screenshot formats for the client: `.png`, `.jpg`, `.jpeg`, `.webp`.
- If screenshots exist, the first one can be used as the default catalog cover.
- `media/backgrounds`, `fonts`, and `assets/icons` are optional and can be omitted if the theme only changes colors.
- `sounds/music` and `sounds/sfx` are optional and can be omitted if the theme does not ship audio.
- Paths declared in `theme.json` are resolved relative to the theme root when they are not absolute.

## Manifest format

Required fields:

- `id`
- `name`
- `author`
- `version`

Rules:

- `version` uses SemVer, for example `1.0.0`.
- `id` should stay lowercase and use hyphens.
- Extra metadata is allowed. Current SwitchU builds read the theme settings they need and ignore unknown fields.

Recommended manifest:

```json
{
  "id": "wiiu-clean",
  "name": "Wii U Clean",
  "author": "PoloNX",
  "version": "1.0.0",
  "preview": {
    "screenshots": [
      "media/screenshots/00.png",
      "media/screenshots/01.png"
    ]
  },
  "theme": {
    "mode": "dark",
    "colors": {
      "accent": [0.53, 0.80, 0.55],
      "background": [0.58, 0.50, 0.08],
      "backgroundAccent": [0.56, 0.55, 0.14],
      "shapes": [0.56, 0.40, 0.30]
    },
    "background": {
      "image": {
        "path": "media/backgrounds/hero.webp",
        "opacity": 0.24,
        "fit": "cover"
      },
      "layout": "grid",
      "shape": "square",
      "symmetry": "quad",
      "count": 72,
      "grid": {
        "columns": 16,
        "rows": 9,
        "spacing": [74, 74]
      },
      "size": [7, 12],
      "speed": [0, 0],
      "rotationSpeed": 0.04,
      "opacity": 0.82
    },
    "fonts": {
      "regular": "fonts/Sora-Regular.ttf",
      "small": "fonts/Sora-Regular.ttf"
    },
    "icons": {
      "path": "assets/icons"
    }
  },
  "audio": {
    "bundled": true
  }
}
```

## Theme capabilities

Current SwitchU builds read these optional theme sections in addition to colors:

- `theme.background`: procedural background controls plus an optional background image.
- `theme.fonts` or `theme.font`: custom UI fonts.
- `theme.icons`: custom static and animated sidebar icons, plus the game card badge icon.

Unknown fields are still ignored, so themes can safely keep extra metadata for tooling.

## Background settings

Supported `theme.background` fields:

- `image`: string path shorthand, or an object with `path`, `opacity`, and `fit`.
- `layout`: `floating` or `grid`.
- `shape`: `mixed`, `circle`, `triangle`, `square`, `diamond`, or `hexagon`.
- `symmetry`: `none`, `horizontal`, `vertical`, or `quad`.
- `count`: total number of procedural shapes for floating layouts.
- `grid.columns`, `grid.rows`, `grid.spacing`: grid configuration when `layout` is `grid`.
- `size`: `[min, max]` shape size range.
- `speed`: `[min, max]` motion speed range.
- `wobble`: side-to-side drift amount for floating layouts.
- `rotationSpeed`: base spin speed.
- `opacity`: multiplier for the procedural shape layer.

Notes:

- `fit: "cover"` fills the screen. `fit: "contain"` keeps the whole image visible.
- Background images are loaded at source resolution. Keep them reasonably sized for Switch memory budgets.
- A static square grid can be authored by combining `layout: "grid"`, `shape: "square"`, and `speed: [0, 0]`.

## Font settings

Supported font fields:

- `theme.font`: string shorthand for one font used for both normal and small UI text.
- `theme.fonts.regular`: main UI font.
- `theme.fonts.small`: small UI font.

If `small` is omitted, SwitchU reuses `regular`. If a custom font fails to load, the client falls back to the default bundled font.

## Icon settings

`theme.icons.path` points to a directory containing optional overrides for these filenames:

- `album.png`
- `mii_editor.png`
- `controller.png`
- `power.png`
- `themes.png`
- `settings.png`
- `gamecard.png`
- `album.webp`
- `mii_editor.webp`
- `controller.webp`
- `power.webp`
- `themes.webp`
- `settings.webp`

Rules:

- Overrides are partial. Missing files automatically fall back to the default client assets.
- `.png` files replace the static icons.
- `.webp` files replace the animated focus versions when present.
- Custom icon assets currently affect the sidebar buttons and the game card badge only.

## Installation mapping

Once downloaded, a theme folder is expected to map directly to:

```text
sdmc:/config/SwitchU/themes/<theme-id>/
```

That means the repository layout is already close to the installed layout, which keeps client-side installation simple.

## Adding a theme

1. Copy `templates/theme-template`.
2. Rename the folder to the final theme `id`.
3. Fill in `theme.json`.
4. Add screenshots in `media/screenshots` when preview assets are ready, preferably as `.png` files.
5. Add optional background images in `media/backgrounds`.
6. Add optional fonts in `fonts`.
7. Add optional icon overrides in `assets/icons`.
8. Add optional audio in `sounds/music` and `sounds/sfx`.
9. Add a new entry to `index.json`.

Keep the catalog stable: if a theme is updated, keep the same `id` and only bump `version`.