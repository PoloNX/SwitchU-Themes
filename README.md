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
│       │   └── screenshots/
│       │       ├── 01.webp
│       │       ├── 02.webp
│       │       └── ...
│       └── sounds/
│           ├── music/
│           └── sfx/
└── templates/
    └── theme-template/
        ├── theme.json
        ├── media/
        │   └── screenshots/
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

## Theme folder rules

- The folder name must match the theme `id`.
- The manifest file must be named `theme.json`.
- Screenshot filenames are numbered: `01`, `02`, `03`, and so on.
- If screenshots exist, the first one can be used as the default catalog cover.
- `sounds/music` and `sounds/sfx` are optional and can be omitted if the theme does not ship audio.

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
      "media/screenshots/01.webp",
      "media/screenshots/02.webp"
    ]
  },
  "theme": {
    "mode": "dark",
    "colors": {
      "accent": [0.53, 0.80, 0.55],
      "background": [0.58, 0.50, 0.08],
      "backgroundAccent": [0.56, 0.55, 0.14],
      "shapes": [0.56, 0.40, 0.30]
    }
  },
  "audio": {
    "bundled": true
  }
}
```

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
4. Add screenshots in `media/screenshots` when preview assets are ready.
5. Add optional audio in `sounds/music` and `sounds/sfx`.
6. Add a new entry to `index.json`.

Keep the catalog stable: if a theme is updated, keep the same `id` and only bump `version`.