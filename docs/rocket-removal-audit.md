# Rocket Remnants Audit (Phase 1)

Search scope:
- Case-insensitive repo scan for: `rocket`, `rocket.js`, `rocket.ew`, `data-rocket`, `rocketcdn`
- Additional pattern checks for `<script` and `import(` combinations

## HTML script tags (index/public)

- `index.html:13`  
  `<script type="module" async src="https://static.rocket.new/rocket-web.js?..."></script>`
- `index.html:14`  
  `<script type="module" defer src="https://static.rocket.new/rocket-shot.js?v=0.0.2"></script>`

## React imports/usages (src/)

- No matches found.

## Dynamic loaders/runtime hooks

- No matches found for Rocket-specific dynamic script injection or runtime hooks.

## Build artifact references (dist/)

- `dist/index.html:13` Rocket web script reference
- `dist/index.html:14` Rocket shot script reference
