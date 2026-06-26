# Landing Page & App — Evaluation and Fix Plan

_Evaluation of `apps/web` (the marketing landing pages and the unlocked app) from
three lenses — **Business Analyst**, **Architect**, **Designer** — across
**Desktop** and **Mobile**, with a prioritized action plan._

## Method & scope

- **Reviewed:** `landing.tsx`, `root.tsx`, `router.ts`, `navbar.tsx`, `app.tsx`,
  `unlock-gate.tsx`, `wallet-picker.tsx`, the in-app surfaces (file table,
  devices, settings, ingest, shares, share viewer), the marketing routes
  (whitepaper, comparison, cli-docs, flow), all `messages/*`, `theme.css`,
  `index.html`, `public/`, and every `*.module.css`.
- **Not run live:** the workspace has no `node_modules` and a build requires a
  network install plus the Rust→WASM step, so findings are code-grounded
  (contrast ratios computed by hand; responsive behavior read from media
  queries). Where a finding needs a real device to confirm severity it is marked
  _(verify on device)_.

Overall the app is **well-built**: consistent design tokens, three reading modes
(regular / ELI5 / machine), 44px touch targets, broad ARIA coverage, `100dvh`
auth screens, reduced-motion handling, and a fixed bottom tab bar on phones. The
must-fix list below is therefore short and specific rather than structural.

---

## 1. Business Analyst

The product story is strong and consistent (problem → pipeline → guarantees →
CTA). The gaps are in **discoverability, trust, and conversion plumbing** — the
things that decide whether the page is ever found and believed.

### Desktop & Mobile (these apply to both)

- **MUST FIX — No shareability / SEO metadata.** `index.html` has only
  `<title>Sharu</title>` (`apps/web/index.html:9`). There is **no meta
  description, no Open Graph, no Twitter card, no `theme-color`, no canonical**.
  A pasted link renders as a bare URL with no preview — fatal for a product whose
  growth is word-of-mouth/social. (`apps/web/index.html`, `public/`.)
- **MUST FIX — Every route shares one title.** `navigate()` never sets
  `document.title` (`router.ts`), so `/whitepaper`, `/comparison`, `/cli-docs`
  and `/s` all read "Sharu". Hurts SEO, bookmarks, browser history, and is an
  accessibility issue (screen readers announce the same title everywhere).
- **MUST FIX — No trust signals for a zero-knowledge claim.** The landing makes
  strong security promises ("Built on guarantees, not promises") but offers **no
  link to source code / GitHub, no audit statement, no threat-model link**, and
  the footer (`landing.tsx:147`) is just a wordmark + tagline — **no nav, no
  legal/privacy, no copyright, no whitepaper link**. For a privacy product the
  "show me, don't tell me" links are the conversion lever.
- **SHOULD FIX — `curl … | sh` shown without verification guidance.** The
  install commands (`messages/landing.ts:70,72`) are the standard pattern but
  the audience is security-conscious; offer a checksum / "read the script first"
  affordance next to the one-liner.
- **SHOULD FIX — Desktop app is invisible on the landing.** M3 ships a Tauri
  desktop app, but the page only offers web "Launch the app" + the CLI backup
  node. There is no "Download for macOS / Windows / Linux." Decide whether to
  surface it; if not yet, that's fine, but it's a stated product surface with no
  funnel.
- **CONSIDER — The reading-mode toggle dilutes the first impression.** Putting
  `regular / eli5 / machine` in the primary navbar (`navbar.tsx:108`) is a
  delightful idea but it competes with the one job of the marketing bar
  (Launch). On mobile it's buried in the burger menu, so its discoverability is
  inconsistent. Consider demoting it to a smaller control or in-page affordance.
- **POSITIVE:** "No account. No upload to anyone." is a clear, honest value
  prop; the ELI5 and machine modes are a genuine differentiator.

---

## 2. Architect

Architecture is clean and deliberate: signals-only state, runtime created per
wallet **only at unlock** (so marketing pages stay instant — `root.tsx:79`), a
dependency-free path router, and a thin UI over the SDK. The issues are mostly
**web-platform integration** rather than internal design.

### Desktop & Mobile

- **MUST FIX (small) — Title/SEO is a routing concern with no owner.** Tie
  `document.title` (and ideally a per-route meta description) to the `route`
  signal in `router.ts`. This is the architectural home for the BA SEO fixes
  above; doing it once in the router covers all six routes.
- **SHOULD FIX — Marketing pages are client-rendered only (no SSR/prerender).**
  The whole site is an SPA rendered after JS loads; crawlers and link unfurlers
  get an empty `#app`. For the static marketing/whitepaper/comparison routes,
  prerendering to static HTML (Vite SSG or a build-time prerender of the known
  routes) would fix SEO and first paint without touching the app runtime.
- **SHOULD FIX — Password lives in module-global signal state.** `unlock-gate.tsx`
  keeps `password`/`confirm` in module-level signals reset on success
  (`resetUnlockGate`), but if the user navigates away **without submitting**
  (e.g. "Use a different wallet", or route change) the plaintext can linger in
  memory until the next gate mount. Clear the gate fields on unmount / on
  `onBack`, not only on success — cheap hygiene for a zero-knowledge product.
- **CONSIDER — Module-singleton view state.** `activeView`, `menuOpen`,
  `draftWatchPath` are module globals reset via exported `reset*()` test hooks
  (`navbar.tsx:49`, `app.tsx:66`). It works for a single app instance but is a
  testability/encapsulation smell; fine to leave, worth noting.
- **CONSIDER — Service worker without a manifest.** `public/sw.js` exists (for
  public-share sites) and there's an `apple-touch-icon`, but there is **no web
  app manifest**, so the local-first app isn't installable as a PWA. Either add
  a manifest (aligns with the "local-first, works offline" positioning) or drop
  the half-signal.
- **POSITIVE:** View Transitions are correctly guarded for reduced motion and
  for unsupported browsers (`router.ts:54`); the runtime-per-wallet boundary
  keeps the crypto/WASM cost off the marketing path.

---

## 3. Designer

Strong visual system (cyberpunk tokens, glow, consistent spacing/type scales).
The defects are **contrast** and a few **mobile-layout** rough edges.

### Both viewports

- **MUST FIX — Warning text fails WCAG AA contrast.** `.warn` is `color:
  #b45309` (`app.module.css:44`) used as **text on the near-black background**
  (`#07070f`) — measured ≈ **3.9:1**, below the 4.5:1 AA threshold for body
  text. It's used for the most important safety message ("No other devices
  yet… ") and the `.notice` block reuses the same dark amber
  (`app.module.css:154`). Use a brighter warning token (the theme already
  defines `--cascivo-color-danger #ff4d6d` and `--cascivo-color-success`; add a
  legible amber, e.g. ~`#f0a850`).

### Mobile

- **MUST FIX (verify on device) — `background-attachment: fixed` on `body`.**
  `theme.css:83` fixes the neon grid + radial glow. On iOS Safari this is a
  well-known source of scroll jank/repaint and inconsistent rendering. Switch to
  a non-fixed background or a fixed pseudo-element layer on touch.
- **SHOULD FIX — In-app navbar can wrap on small phones.** `.inner` is
  `flex-wrap: wrap` (`navbar.module.css:17`) and in-app it carries brand +
  wallet tag + sync indicator + burger; the always-visible `SyncIndicator` text
  (`navbar.tsx:106`) can push the row to two lines on narrow widths. Verify and,
  if needed, collapse the sync text to a dot-only on `max-width: 32rem`.
- **SHOULD FIX — Comparison table needs horizontal scroll on phones.** The 3-col
  table is `overflow-x: auto; min-width: 38rem`, so the old-vs-new comparison
  can't be seen side-by-side on a phone. Consider a stacked card fallback under
  ~32rem.
- **SHOULD FIX — Fixed `80vh` preview iframes** (share viewer PDF/site) leave
  little room on a short/landscape phone. Prefer `min-height` + flexible height.
- **CONSIDER — Readonly "copy link" inputs lack labels.** The share-link inputs
  in the file table / site-share / published-shares are `readonly` with no
  `aria-label`, so screen-reader users don't know what they are. Add labels.
- **CONSIDER — "Copied" feedback never resets.** Copy buttons latch on "Copied"
  with no timeout, so the state reads stale.
- **POSITIVE:** Bottom tab bar honors `env(safe-area-inset-bottom)`
  (`navbar.module.css:292`); flow diagram has a full reduced-motion static
  fallback; auth screens use `100dvh`.

---

## Consolidated MUST-FIX list

| # | Lens | Issue | Where |
|---|------|-------|-------|
| 1 | BA/Arch | No SEO/social metadata (description, OG, Twitter, theme-color) | `index.html`, `public/` |
| 2 | BA/Arch | Per-route `document.title` (+ meta) never set | `router.ts` |
| 3 | BA | No trust signals (source/audit link); bare footer (no nav/legal) | `landing.tsx`, `messages/landing.ts` |
| 4 | Designer | `.warn` / `.notice` amber text fails AA contrast (~3.9:1) | `app.module.css:44,154` |
| 5 | Designer | `background-attachment: fixed` → mobile scroll jank | `theme.css:83` _(verify)_ |
| 6 | Arch | Clear unlock-gate password fields on unmount/back, not only success | `unlock-gate.tsx` |

---

## Prioritized action plan

### P0 — Must fix before any wider launch (low effort, high impact)

1. **Add SEO + social meta to `index.html`** — description, Open Graph
   (title/description/image/url/type), Twitter card, `theme-color`, canonical;
   add a social preview image to `public/`.
   _Verify:_ a Twitter/Slack/Discord unfurl shows title + image; Lighthouse SEO ≥ 90.
2. **Per-route `document.title` (and description) in `router.ts`** — drive from
   the `route` signal so all six routes get distinct titles.
   _Verify:_ navigating updates the tab title; back/forward keep it correct.
3. **Fix warning/notice contrast** — replace `#b45309` text usage with a legible
   amber token; apply to `.warn` and `.notice`.
   _Verify:_ computed contrast ≥ 4.5:1 against `--cascivo-color-bg`.
4. **Add trust + footer links to the landing** — GitHub/source, whitepaper,
   privacy, and a real footer nav with copyright. Add a "verify the script" note
   beside the `curl | sh` commands.
   _Verify:_ links resolve; footer renders on desktop and mobile.

### P1 — Should fix next (medium effort)

5. **Prerender the static marketing routes** (Vite SSG or build-time prerender
   of `/`, `/whitepaper`, `/comparison`, `/cli-docs`) so crawlers/unfurlers get
   real HTML and first paint is instant.
   _Verify:_ `view-source` of built `/whitepaper` contains the copy; hydration works.
6. **Mobile background fix** — move the fixed grid/glow to a non-`fixed`
   pseudo-element layer (or `background-attachment: scroll` on touch).
   _Verify on a real iPhone:_ smooth scroll, no repaint flashing.
7. **In-app navbar single-row on small phones** — dot-only sync indicator under
   ~32rem so the bar never wraps.
   _Verify:_ 320px width keeps the bar one row in-app.
8. **Clear unlock-gate fields on unmount/`onBack`.**
   _Verify:_ leaving the gate without submit empties the password signals (test).

### P2 — Polish (low effort, do as capacity allows)

9. **Decide & surface the desktop app** (Download buttons) or consciously defer.
10. **Add a PWA manifest** (or remove the apple-touch-icon half-signal).
11. **`aria-label` the readonly copy-link inputs**; add a timeout reset to
    "Copied" feedback.
12. **Comparison table** stacked-card fallback < 32rem; **share-viewer**
    iframes use `min-height` instead of fixed `80vh`.
13. **Reading-mode toggle placement** — evaluate demoting it from the primary
    marketing bar so it doesn't compete with the Launch CTA.

---

## Test/verification gates (per CLAUDE.md)

Any of the above changes must keep the full gate green: `pnpm -r typecheck`,
Biome (lint+format), the vitest suites (incl. the `lint-guard` no-hooks /
no-hardcoded-strings rules — new strings go through `@cascivo/i18n` in all three
reading modes), and the WASM + production build. Contrast and responsive fixes
should add/extend the relevant `*.test.tsx` where practical.
