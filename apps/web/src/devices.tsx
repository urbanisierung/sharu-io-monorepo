// Device linking, made mom-friendly (Phase 3): show this device's link as a QR
// the other device's camera can open (plus copy/share), prefill the link field
// when arriving via a pairing deep link, walk the user through the safety-number
// check in plain language, and let them give each paired device a friendly name
// instead of reading a raw key id. Signal-driven, no hooks; copy via i18n.
import { t } from '@cascivo/i18n';
import { type ReadonlySignal, signal } from '@preact/signals';
import styles from './app.module.css';
import { messages } from './messages.js';
import { pairingLink, readPairingFromHash } from './pairing.js';
import { QrCode } from './qr-code.js';
import type { PeerInfo } from './runtime.js';
import { Button } from './ui/button.js';

// Prefilled from a `#pair=…` deep link, so a device opened by scanning a QR
// arrives with the other device's code already in the field.
const draftPeerCode = signal(readPairingFromHash(globalThis.location?.hash ?? '') ?? '');
const pairFailed = signal(false);
const copied = signal(false);
const renamingId = signal<string | null>(null);
const renameDraft = signal('');

/** Reset module-level view state — for deterministic tests. */
export function resetDevicesView(): void {
  draftPeerCode.value = readPairingFromHash(globalThis.location?.hash ?? '') ?? '';
  pairFailed.value = false;
  copied.value = false;
  renamingId.value = null;
  renameDraft.value = '';
}

function shortId(id: string): string {
  return id.length > 12 ? `${id.slice(0, 12)}…` : id;
}

export interface DevicesProps {
  connectionCode?: ReadonlySignal<string>;
  peers: ReadonlySignal<readonly PeerInfo[]>;
  onPair: (code: string) => Promise<void>;
  onVerify?: (id: string) => void;
  onReject?: (id: string) => void;
  onRename?: (id: string, name: string) => void;
  /** The signing id of the peer currently chosen to host public shares. */
  shareHostId?: ReadonlySignal<string | undefined>;
  /** Choose this peer to host public shares. */
  onSetShareHost?: (id: string) => void;
}

export function Devices({
  connectionCode,
  peers,
  onPair,
  onVerify,
  onReject,
  onRename,
  shareHostId,
  onSetShareHost,
}: DevicesProps) {
  const code = connectionCode?.value ?? '';
  const origin = globalThis.location?.origin ?? '';
  const link = code ? pairingLink(code, origin) : '';
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  return (
    <section class={styles.gate}>
      <h2>{t(messages.devicesHeading)}</h2>

      {code && (
        <div class={styles.qrBlock}>
          <p class={styles.muted}>{t(messages.scanPrompt)}</p>
          <QrCode value={link} label={t(messages.qrLabel)} />
          <span class={styles.peerActions}>
            <Button
              intent="neutral"
              onClick={() => {
                void navigator.clipboard?.writeText(link);
                copied.value = true;
              }}
            >
              {copied.value ? t(messages.copied) : t(messages.copyLink)}
            </Button>
            {canShare && (
              <Button intent="neutral" onClick={() => void navigator.share({ url: link })}>
                {t(messages.shareLink)}
              </Button>
            )}
          </span>
          <code class={styles.code}>{code}</code>
        </div>
      )}

      {draftPeerCode.value && <p class={styles.muted}>{t(messages.incomingPair)}</p>}
      <input
        class={styles.input}
        aria-label={t(messages.peerCodePlaceholder)}
        placeholder={t(messages.peerCodePlaceholder)}
        value={draftPeerCode.value}
        onInput={(event) => {
          draftPeerCode.value = (event.target as HTMLInputElement).value;
          pairFailed.value = false;
        }}
      />
      <Button
        intent="primary"
        onClick={() => {
          pairFailed.value = false;
          onPair(draftPeerCode.value).catch(() => {
            pairFailed.value = true;
          });
        }}
      >
        {t(messages.pair)}
      </Button>
      {pairFailed.value && <p class={styles.warn}>{t(messages.pairError)}</p>}

      {peers.value.length > 0 && (
        <ul class={styles.list}>
          {peers.value.map((peer) => (
            <li key={peer.id} class={styles.peerRow}>
              <span class={styles.deviceName}>{peer.name ?? t(messages.unnamedDevice)}</span>
              <code class={styles.code}>{shortId(peer.id)}</code>
              <span class={styles.muted}>
                {t(messages.sasPrompt)} <strong>{peer.sas}</strong>
              </span>
              <span class={styles.muted}>
                {peer.status === 'verified'
                  ? t(messages.statusVerified)
                  : peer.status === 'rejected'
                    ? t(messages.statusRejected)
                    : t(messages.statusPending)}
              </span>

              {onSetShareHost &&
                (shareHostId?.value === peer.id ? (
                  <span class={styles.muted}>{t(messages.hostingShares)}</span>
                ) : (
                  <span class={styles.peerActions}>
                    <Button intent="neutral" onClick={() => onSetShareHost(peer.id)}>
                      {t(messages.hostShares)}
                    </Button>
                  </span>
                ))}

              {peer.status === 'pending' && onVerify && onReject && (
                <span class={styles.peerActions}>
                  <Button intent="primary" onClick={() => onVerify(peer.id)}>
                    {t(messages.confirm)}
                  </Button>
                  <Button intent="neutral" onClick={() => onReject(peer.id)}>
                    {t(messages.reject)}
                  </Button>
                </span>
              )}

              {onRename &&
                (renamingId.value === peer.id ? (
                  <span class={styles.peerActions}>
                    <input
                      class={styles.input}
                      aria-label={t(messages.renamePlaceholder)}
                      placeholder={t(messages.renamePlaceholder)}
                      value={renameDraft.value}
                      onInput={(event) => {
                        renameDraft.value = (event.target as HTMLInputElement).value;
                      }}
                    />
                    <Button
                      intent="primary"
                      onClick={() => {
                        onRename(peer.id, renameDraft.value);
                        renamingId.value = null;
                      }}
                    >
                      {t(messages.saveName)}
                    </Button>
                    <Button intent="neutral" onClick={() => (renamingId.value = null)}>
                      {t(messages.cancelName)}
                    </Button>
                  </span>
                ) : (
                  <span class={styles.peerActions}>
                    <Button
                      intent="neutral"
                      onClick={() => {
                        renamingId.value = peer.id;
                        renameDraft.value = peer.name ?? '';
                      }}
                    >
                      {t(messages.renameDevice)}
                    </Button>
                  </span>
                ))}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
