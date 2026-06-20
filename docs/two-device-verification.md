# Two-device verification

How to verify Sharu end-to-end across two devices: pairing, the safety-number
check, live sync, restore, and the safety nets (single-device warning,
wrong-password). Cross-device sync rides the public **n0 relay**, so the real
flow can only be exercised on a machine with network — not in the headless CI
sandbox.

## What's already covered automatically

| Check | Where | Runs in CI? |
| --- | --- | --- |
| Logic-level two-peer sync + auto-pull + restore (loopback transport) | `apps/web/src/sync.integration.test.ts` | ✅ `pnpm test` |
| Headless backup peer converges + persists | `apps/peer/src/peer.integration.test.ts` | ✅ `pnpm test` |
| Real browser-to-browser transfer over the **n0 relay** | `packages/sdk/src/transfer.e2e.browser.test.ts` | ⛔ gated — `pnpm test:e2e` |

`pnpm test:e2e` runs the gated relay test (`SAFU_E2E=1`). It needs a real
browser and relay access: `pnpm exec playwright install chromium` first, then
run it from a normal network. It **cannot pass in the CI sandbox** (Iroh's
net-report HTTPS probes fail at the browser fetch/CORS layer); that's an
environment limit, not a code defect.

This runbook covers what those can't: the actual cross-device **UI** experience.

## Prerequisites (once)

Rust + `wasm-pack` are needed to build the two WASM crates:

```bash
pnpm install
pnpm -r build          # builds @safu/crypto + @safu/transport WASM, then the web app
```

## Path A — one machine, two browser profiles (fastest)

`localhost` is a secure context (so OPFS works), and each browser profile /
private window has its own OPFS storage + identity — so they behave as two
independent devices. Both reach each other through the n0 relay.

```bash
pnpm --filter @safu/web dev      # open the printed http://localhost:5173
```

Open the same URL twice in **independent** profiles — e.g. a normal window
(**Device A**) and a private/incognito window (**Device B**), or two different
browsers. Then run the checklist below.

## Path B — two real devices (phone + laptop)

OPFS (`navigator.storage.getDirectory`) requires a **secure context**, so plain
`http://<lan-ip>` will fail on a remote device. Use HTTPS one of two ways:

- **Deployed URL (recommended):** open the Cloudflare Pages URL (see
  [`deployment.md`](./deployment.md)) on both devices.
- **HTTPS tunnel to localhost:** `pnpm --filter @safu/web preview` (after
  `pnpm -r build`), then expose it over HTTPS, e.g.
  `cloudflared tunnel --url http://localhost:4173`, and open the `https://…` URL
  on both devices.

On real devices you can also actually **scan the QR** with the phone camera.

## Checklist

Labels below match the shipped UI exactly.

### 1. Device A — first run
- [ ] Lands on **"Create your password"** with **Password** + **Repeat password**.
- [ ] Mismatched passwords show *"The two passwords don't match."*; < 8 chars
      shows *"Use at least 8 characters."*
- [ ] **Show password** toggle reveals the field; the *"only key … no reset"*
      warning is visible; **Save a recovery sheet** downloads a `.txt`.
- [ ] After **Create password**, the top bar shows **Sharu** + **Up to date**.

### 2. Device A — back up a file (no second device yet)
- [ ] Banner warns: *"These files are only on this device…"*
- [ ] **Add files** (button) and drag-drop both ingest; the **Backing up** list
      shows each file go **Waiting → Adding… → Safe**.
- [ ] **Your files** lists each file with size, modified date, chunk count.
      Search filters; clicking **Name/Size/Modified** re-sorts.
- [ ] **Download** restores a file; its bytes match the original.
- [ ] **Delete** asks *"Delete it?"* → **Remove** drops it (or **Keep** cancels).

### 3. Pair Device B
- [ ] On A → **Devices**: a QR is shown with **Copy link** / **Share link** and
      the raw link code.
- [ ] On B: open the pairing link (Path B: scan the QR) — the **"Paste the link
      code…"** field is **prefilled** and *"A device wants to link…"* shows.
      (Or paste the code manually.)
- [ ] On B: set/enter the password, then **Link device**.
- [ ] **Both** devices show the **same 6-digit safety number** → tap
      **Codes match** on each. A's banner flips to *"Backed up · synced to 1
      device(s)"*.

### 4. Live sync & restore
- [ ] A file backed up on **A** appears under **Your files** on **B**;
      **Download** on B reproduces the bytes.
- [ ] A file added on **B** appears on **A**.
- [ ] **Delete** on A removes it from B too.

### 5. Names, returning, safety nets
- [ ] On A, **Rename** device B (e.g. *Mom's phone*) → shows the name instead of
      a key id.
- [ ] Reload A → **"Welcome back"** → enter the password → files are still there.
- [ ] Reload A and type the **wrong** password → *"That password doesn't match
      the one set on this device."* (nothing is lost).

## Known limits / gotchas
- **OPFS needs a secure context** — HTTPS or `localhost`, never bare LAN HTTP.
- **QR scanning uses the phone's native camera**, not an in-app scanner; the QR
  encodes a `#pair=…` deep link that opens the app prefilled.
- **Device names are local** (not synced) — each device labels its own peers.
- The relay hop can't be exercised in the CI sandbox; use a real network.
