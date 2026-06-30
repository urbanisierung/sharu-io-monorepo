// Device linking, made mom-friendly (Phase 3): show this device's link as a QR
// the other device's camera can open (plus copy/share), prefill the link field
// when arriving via a pairing deep link, walk the user through the safety-number
// check in plain language, and let them give each paired device a friendly name
// instead of reading a raw key id. Signal-driven, no hooks; copy via i18n.
//
// The page is organised into Settings-style cards — Share, Link, Manage — so the
// three jobs (hand out this device's code, paste another's, look after the ones
// already linked) read as distinct steps. The link code is masked to its first
// and last characters so the full secret isn't left sitting on screen.

import { cn } from '@cascivo/core';
import { type ReadonlySignal, signal } from '@preact/signals';
import styles from './app.module.css';
import { messages } from './messages.js';
import { decodePairingCode, pairingLink, readPairingFromHash } from './pairing.js';
import { QrCode } from './qr-code.js';
import { tr as t } from './reading-mode.js';
import type { PeerInfo } from './runtime.js';
import { Button } from './ui/button.js';

// Prefilled from a `#pair=…` deep link, so a device opened by scanning a QR
// arrives with the other device's code already in the field.
const draftPeerCode = signal(readPairingFromHash(globalThis.location?.hash ?? '') ?? '');
const pairFailed = signal(false);
const copied = signal(false);
const idCopied = signal(false);
const renamingId = signal<string | null>(null);
const renameDraft = signal('');

/** Reset module-level view state — for deterministic tests. */
export function resetDevicesView(): void {
  draftPeerCode.value = readPairingFromHash(globalThis.location?.hash ?? '') ?? '';
  pairFailed.value = false;
  copied.value = false;
  idCopied.value = false;
  renamingId.value = null;
  renameDraft.value = '';
}

/** Decode this device's own identity (signing id + transport address) from its
 *  connection code, for the read-only "This device" card. Returns undefined for
 *  an empty or unparseable code rather than throwing, so the card simply hides. */
function selfIdentity(code: string): { signId: string; id: string; relayUrl?: string } | undefined {
  if (!code) return undefined;
  try {
    const { addr, signId } = decodePairingCode(code);
    return { signId, id: addr.id, relayUrl: addr.relayUrl };
  } catch {
    return undefined;
  }
}

/**
 * Mask a code down to its first and last `visible` characters with an ellipsis
 * between, so the full secret isn't rendered on screen. Short codes (where
 * masking would reveal almost everything anyway) are returned untouched.
 */
export function maskCode(value: string, visible = 6): string {
  if (value.length <= visible * 2 + 1) return value;
  return `${value.slice(0, visible)}…${value.slice(-visible)}`;
}

function shortId(id: string): string {
  return id.length > 12 ? `${id.slice(0, 12)}…` : id;
}

function statusLabel(status: PeerInfo['status']): string {
  if (status === 'verified') return t(messages.statusVerified);
  if (status === 'rejected') return t(messages.statusRejected);
  return t(messages.statusPending);
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
  const self = selfIdentity(code);

  return (
    <section class={styles.settings}>
      <header class={styles.settingsHead}>
        <h2 class={styles.settingsTitle}>{t(messages.devicesHeading)}</h2>
        <p class={styles.settingsIntro}>{t(messages.devicesIntro)}</p>
      </header>

      {self && (
        <article class={styles.setting}>
          <h3 class={styles.settingTitle}>{t(messages.identityTitle)}</h3>
          <p class={styles.settingDesc}>{t(messages.identityDesc)}</p>
          <dl class={styles.identityList}>
            <div class={styles.identityRow}>
              <dt class={styles.identityLabel}>{t(messages.signingIdLabel)}</dt>
              <dd class={styles.identityValue}>
                <code class={styles.code} title={self.signId}>
                  {self.signId}
                </code>
                <Button
                  intent="neutral"
                  onClick={() => {
                    void navigator.clipboard?.writeText(self.signId);
                    idCopied.value = true;
                  }}
                >
                  {idCopied.value ? t(messages.copied) : t(messages.copy)}
                </Button>
              </dd>
            </div>
            <div class={styles.identityRow}>
              <dt class={styles.identityLabel}>{t(messages.transportIdLabel)}</dt>
              <dd class={styles.identityValue}>
                <code class={styles.code}>{self.id}</code>
              </dd>
            </div>
            <div class={styles.identityRow}>
              <dt class={styles.identityLabel}>{t(messages.relayLabel)}</dt>
              <dd class={styles.identityValue}>
                {self.relayUrl ? (
                  <code class={styles.code}>{self.relayUrl}</code>
                ) : (
                  <span class={styles.muted}>{t(messages.relayUnknown)}</span>
                )}
              </dd>
            </div>
          </dl>
        </article>
      )}

      {code && (
        <article class={styles.setting}>
          <h3 class={styles.settingTitle}>{t(messages.shareSectionTitle)}</h3>
          <p class={styles.settingDesc}>{t(messages.shareSectionDesc)}</p>
          <div class={styles.qrBlock}>
            <p class={styles.muted}>{t(messages.scanPrompt)}</p>
            <QrCode value={link} label={t(messages.qrLabel)} />
            <code class={styles.code} title={code}>
              {maskCode(code)}
            </code>
          </div>
          <div class={styles.settingRow}>
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
          </div>
        </article>
      )}

      <article class={styles.setting}>
        <h3 class={styles.settingTitle}>{t(messages.linkSectionTitle)}</h3>
        <p class={styles.settingDesc}>{t(messages.linkSectionDesc)}</p>
        {draftPeerCode.value && <p class={styles.muted}>{t(messages.incomingPair)}</p>}
        <div class={styles.settingRow}>
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
        </div>
        {pairFailed.value && <p class={styles.warn}>{t(messages.pairError)}</p>}
      </article>

      {peers.value.length > 0 && (
        <article class={styles.setting}>
          <h3 class={styles.settingTitle}>{t(messages.manageSectionTitle)}</h3>
          <p class={styles.settingDesc}>{t(messages.manageSectionDesc)}</p>
          <ul class={styles.list}>
            {peers.value.map((peer) => (
              <li key={peer.id} class={styles.peerRow}>
                <div class={styles.peerHead}>
                  <span class={styles.deviceName}>{peer.name ?? t(messages.unnamedDevice)}</span>
                  <span
                    class={cn(
                      styles.peerStatus,
                      peer.status === 'verified' && styles.statusOk,
                      peer.status === 'rejected' && styles.warn,
                    )}
                  >
                    {statusLabel(peer.status)}
                  </span>
                </div>
                <code class={styles.code}>{shortId(peer.id)}</code>
                <p class={styles.settingDesc}>
                  {t(messages.sasPrompt)} <strong>{peer.sas}</strong>
                </p>

                <dl class={styles.identityList}>
                  <div class={styles.identityRow}>
                    <dt class={styles.identityLabel}>{t(messages.signingIdLabel)}</dt>
                    <dd class={styles.identityValue}>
                      <code class={styles.code} title={peer.id}>
                        {peer.id}
                      </code>
                    </dd>
                  </div>
                  {peer.addr && (
                    <>
                      <div class={styles.identityRow}>
                        <dt class={styles.identityLabel}>{t(messages.transportIdLabel)}</dt>
                        <dd class={styles.identityValue}>
                          <code class={styles.code}>{peer.addr.id}</code>
                        </dd>
                      </div>
                      <div class={styles.identityRow}>
                        <dt class={styles.identityLabel}>{t(messages.relayLabel)}</dt>
                        <dd class={styles.identityValue}>
                          {peer.addr.relayUrl ? (
                            <code class={styles.code}>{peer.addr.relayUrl}</code>
                          ) : (
                            <span class={styles.muted}>{t(messages.relayUnknown)}</span>
                          )}
                        </dd>
                      </div>
                    </>
                  )}
                </dl>

                <div class={styles.peerActions}>
                  {onSetShareHost &&
                    (shareHostId?.value === peer.id ? (
                      <p class={styles.peerActionHint}>{t(messages.hostingShares)}</p>
                    ) : (
                      <div class={styles.peerAction}>
                        <Button intent="neutral" onClick={() => onSetShareHost(peer.id)}>
                          {t(messages.hostShares)}
                        </Button>
                        <span class={styles.peerActionHint}>{t(messages.hostSharesHint)}</span>
                      </div>
                    ))}

                  {peer.status === 'pending' && onVerify && onReject && (
                    <>
                      <div class={styles.peerAction}>
                        <Button intent="primary" onClick={() => onVerify(peer.id)}>
                          {t(messages.confirm)}
                        </Button>
                        <span class={styles.peerActionHint}>{t(messages.confirmHint)}</span>
                      </div>
                      <div class={styles.peerAction}>
                        <Button intent="neutral" onClick={() => onReject(peer.id)}>
                          {t(messages.reject)}
                        </Button>
                        <span class={styles.peerActionHint}>{t(messages.rejectHint)}</span>
                      </div>
                    </>
                  )}

                  {onRename &&
                    (renamingId.value === peer.id ? (
                      <div class={styles.peerRename}>
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
                      </div>
                    ) : (
                      <div class={styles.peerAction}>
                        <Button
                          intent="neutral"
                          onClick={() => {
                            renamingId.value = peer.id;
                            renameDraft.value = peer.name ?? '';
                          }}
                        >
                          {t(messages.renameDevice)}
                        </Button>
                        <span class={styles.peerActionHint}>{t(messages.renameHint)}</span>
                      </div>
                    ))}
                </div>
              </li>
            ))}
          </ul>
        </article>
      )}
    </section>
  );
}
