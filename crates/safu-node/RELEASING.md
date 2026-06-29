# Releasing safu-node (signed)

Releases are **signed with [minisign](https://jedisct1.github.io/minisign/)** so
the in-binary updater (`safu-node update --apply`) can verify a download is
authentic before replacing the running binary. The public key is committed at
`keys/safu-node.pub` and embedded in the binary; the private key lives only as a
GitHub Actions secret.

> The committed key is a **placeholder** (its private half was discarded). Do the
> one-time setup below before the first signed release, or the updater will
> correctly refuse every download as unverifiable.

## One-time key setup

Generate a passwordless signing key (passwordless so CI can sign
non-interactively — the secret is protected by being a GitHub secret, not by a
passphrase):

```sh
minisign -G -W -p safu-node.pub -s safu-node.sec
```

Then:

1. **Commit the public key.** Replace `crates/safu-node/keys/safu-node.pub` with
   the generated `safu-node.pub` and commit it. It is embedded in the binary at
   build time, so the updater trusts exactly this key.
2. **Store the secret key.** Add the *contents* of `safu-node.sec` as the repo
   Actions secret **`MINISIGN_SECRET_KEY`**
   (Settings → Secrets and variables → Actions). Keep `safu-node.sec` offline;
   never commit it.
3. Delete your local `safu-node.sec` once it is in the secret store (or keep it
   in a password manager as the sole backup — losing it means rotating the key).

## Cutting a release

Push a `safu-node-v<version>` tag (matching the crate version), or run the
workflow manually from the Actions tab:

```sh
git tag safu-node-v0.1.0 && git push origin safu-node-v0.1.0
```

The `Release safu-node` workflow builds every target, then in the publish job
signs each archive with `MINISIGN_SECRET_KEY`, producing a `<asset>.minisig`
next to each `<asset>` and `<asset>.sha256`, and attaches the public key
(`safu-node.pub`) to the release. If `MINISIGN_SECRET_KEY` is unset the workflow
still publishes, but **unsigned** (with a warning) — and the updater will decline
to self-apply such a release.

## Rotating the key

Generate a new keypair, commit the new public key, and update
`MINISIGN_SECRET_KEY`. Clients pick up the new key when they next upgrade the
binary; releases signed by the old key are no longer accepted by builds carrying
the new key — so publish at least one release that overlaps (or communicate the
rotation) to avoid stranding users mid-upgrade.

## What the updater checks

`safu-node update --apply` downloads the target's archive plus its `.minisig`,
verifies the signature against the embedded public key (and the `.sha256` when
present), extracts the binary, and atomically replaces the running executable.
Any failure aborts without touching the installed binary, and the data dir is
never involved — see the "Updating" section of the README.
