# Vendored fonts

The design handoff specifies Archivo (display + UI) and JetBrains Mono
(machine-produced values and small uppercase labels). Sharu is local-first, so
the faces are served from here rather than a font CDN: the app must render
offline and must not leak a request on every page view.

Both families are variable, so one file per unicode range covers every weight
the design uses — 400–800 for Archivo, 400–500 for JetBrains Mono.

| File | Family | Range | Weights |
| --- | --- | --- | --- |
| `archivo-latin.woff2` | Archivo | latin | 400–800 |
| `archivo-latin-ext.woff2` | Archivo | latin-ext | 400–800 |
| `jetbrains-mono-latin.woff2` | JetBrains Mono | latin | 400–500 |
| `jetbrains-mono-latin-ext.woff2` | JetBrains Mono | latin-ext | 400–500 |

Both are licensed under the SIL Open Font License 1.1:

- Archivo — <https://github.com/Omnibus-Type/Archivo>
- JetBrains Mono — <https://github.com/JetBrains/JetBrainsMono>

Outside these ranges the stacks in `--cascivo-font-sans` / `--cascivo-font-mono`
(`src/theme.css`) fall back to the platform's own faces.

The `@font-face` rules live in `src/theme.css`.
