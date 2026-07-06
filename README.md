# Theme RGB for Zyn Agent

## What it provides
- A new `rgb` theme
- High-contrast neon palette
- Theme metadata compatible with Zyn's plugin format

## Files
- `manifest.json` — Zyn plugin metadata
- `rgb-theme.json` — theme definition
- `index.js` — plugin entrypoint

## Install
From the Zyn plugin manager:

```bash
/plugins install ./path/to/zyn-theme-rgb-plugin
```

Or publish it to npm and install it by name:

```bash
/plugins install zyn-theme-rgb
```

## Theme colors
The theme is designed around:
- bright red accent
- cyan secondary accent
- neon green success color
- dark background for terminal readability

## Notes
Zyn's current theme list is still mostly built-in, so this plugin exposes the theme data in a plugin-friendly format. If your Zyn build supports dynamic theme registration, it can register automatically through `registerTheme(api)`.
