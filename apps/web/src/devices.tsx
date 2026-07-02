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
import { formatDate } from './format.js';
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
const codeCopied = signal(false);
const idCopied = signal(false);
const renamingId = signal<string | null>(null);
const renameDraft = signal('');
// The device awaiting a "really remove?" confirmation, so removal is two steps.
const removingId = signal<string | null>(null);
// Which device row is expanded to show its full details, if any. The Manage
// table stays a scannable name/linked/status overview until a row is opened.
const expandedId = signal<string | null>(null);
// Whether the focused "Onboard a backup node" flow is open, replacing the normal
// Devices content. It surfaces the two values `sharu serve` asks for — this
// device's code and the safety number — so both are impossible to miss.
const cliOnboarding = signal(false);

/** Open the focused backup-node onboarding flow. Called from the button in the
 *  Devices view and from `/link` (root.tsx) so continuing from the CLI's deep
 *  link lands straight on the device code + safety number. */
export function openCliOnboarding(): void {
  cliOnboarding.value = true;
}

/** Reset module-level view state — for deterministic tests. */
export function resetDevicesView(): void {
  draftPeerCode.value = readPairingFromHash(globalThis.location?.hash ?? '') ?? '';
  pairFailed.value = false;
  copied.value = false;
  codeCopied.value = false;
  idCopied.value = false;
  renamingId.value = null;
  renameDraft.value = '';
  removingId.value = null;
  expandedId.value = null;
  cliOnboarding.value = false;
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
  /** Permanently unlink a paired device (revokes its write access). */
  onRemove?: (id: string) => void;
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
  onRemove,
  onRename,
  shareHostId,
  onSetShareHost,
}: DevicesProps) {
  const code = connectionCode?.value ?? '';
  const origin = globalThis.location?.origin ?? '';
  const link = code ? pairingLink(code, origin) : '';
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';
  const self = selfIdentity(code);

  if (cliOnboarding.value) {
    return (
      <CliOnboarding
        code={code}
        peers={peers}
        onPair={onPair}
        onVerify={onVerify}
        onReject={onReject}
      />
    );
  }

  return (
    <section class={styles.settings}>
      <header class={styles.settingsHead}>
        <h2 class={styles.settingsTitle}>{t(messages.devicesHeading)}</h2>
        <p class={styles.settingsIntro}>{t(messages.devicesIntro)}</p>
      </header>

      <article class={styles.setting}>
        <h3 class={styles.settingTitle}>{t(messages.onboardCliTitle)}</h3>
        <p class={styles.settingDesc}>{t(messages.onboardCliDesc)}</p>
        <div class={styles.settingRow}>
          <Button intent="primary" onClick={openCliOnboarding}>
            {t(messages.onboardCliStart)}
          </Button>
        </div>
      </article>

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
            <Button
              intent="neutral"
              onClick={() => {
                void navigator.clipboard?.writeText(code);
                codeCopied.value = true;
              }}
            >
              {codeCopied.value ? t(messages.copied) : t(messages.copyCode)}
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
          <table class={styles.deviceTable}>
            <thead>
              <tr>
                <th scope="col">{t(messages.colDeviceName)}</th>
                <th scope="col">{t(messages.linkedLabel)}</th>
                <th scope="col">{t(messages.colStatus)}</th>
              </tr>
            </thead>
            <tbody>
              {peers.value.flatMap((peer) => {
                const open = expandedId.value === peer.id;
                const summary = (
                  <tr key={peer.id} class={styles.deviceRow}>
                    <td>
                      <button
                        type="button"
                        class={styles.deviceExpand}
                        aria-expanded={open}
                        onClick={() => (expandedId.value = open ? null : peer.id)}
                      >
                        <span class={styles.chevron} aria-hidden="true">
                          {open ? '▾' : '▸'}
                        </span>
                        <span class={styles.deviceName}>
                          {peer.name ?? t(messages.unnamedDevice)}
                        </span>
                      </button>
                    </td>
                    <td class={styles.deviceLinked}>
                      {peer.linkedAt !== undefined ? formatDate(peer.linkedAt) : '—'}
                    </td>
                    <td>
                      <span
                        class={cn(
                          styles.peerStatus,
                          peer.status === 'verified' && styles.statusOk,
                          peer.status === 'rejected' && styles.warn,
                        )}
                      >
                        {statusLabel(peer.status)}
                      </span>
                    </td>
                  </tr>
                );
                if (!open) return [summary];
                const detail = (
                  <tr key={`${peer.id}-detail`} class={styles.deviceDetailRow}>
                    <td colSpan={3}>
                      <div class={styles.deviceDetail}>
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
                                <span class={styles.peerActionHint}>
                                  {t(messages.hostSharesHint)}
                                </span>
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

                          {onRemove &&
                            peer.status !== 'rejected' &&
                            (removingId.value === peer.id ? (
                              <div class={styles.peerAction}>
                                <span class={styles.peerActionHint}>
                                  {t(messages.removePrompt)}
                                </span>
                                <div class={styles.peerRename}>
                                  <Button
                                    intent="primary"
                                    onClick={() => {
                                      onRemove(peer.id);
                                      removingId.value = null;
                                    }}
                                  >
                                    {t(messages.confirmRemove)}
                                  </Button>
                                  <Button
                                    intent="neutral"
                                    onClick={() => (removingId.value = null)}
                                  >
                                    {t(messages.cancelRemove)}
                                  </Button>
                                </div>
                              </div>
                            ) : (
                              <div class={styles.peerAction}>
                                <Button
                                  intent="neutral"
                                  onClick={() => (removingId.value = peer.id)}
                                >
                                  {t(messages.removeDevice)}
                                </Button>
                                <span class={styles.peerActionHint}>{t(messages.removeHint)}</span>
                              </div>
                            ))}
                        </div>
                      </div>
                    </td>
                  </tr>
                );
                return [summary, detail];
              })}
            </tbody>
          </table>
        </article>
      )}
    </section>
  );
}

interface CliOnboardingProps {
  /** This device's connection code — the "device code" the CLI prompts for. */
  code: string;
  peers: ReadonlySignal<readonly PeerInfo[]>;
  onPair: (code: string) => Promise<void>;
  onVerify?: (id: string) => void;
  onReject?: (id: string) => void;
}

/** The focused backup-node onboarding flow, reached from the Devices button or
 *  the CLI's `/link` deep link. It shows, big and in order, the two values
 *  `sharu serve` asks for: this device's code to paste at the terminal, and each
 *  freshly-linked node's safety number to confirm on both sides. Linking the node
 *  and confirming its number happen right here, so the whole round trip lives in
 *  one view instead of being scattered across the Manage table. */
function CliOnboarding({ code, peers, onPair, onVerify, onReject }: CliOnboardingProps) {
  // Every not-yet-verified peer needs its safety number checked; in this flow
  // that is the node the operator just linked. Verified ones show as confirmed.
  const pending = peers.value.filter((peer) => peer.status === 'pending');
  const verified = peers.value.filter((peer) => peer.status === 'verified');

  return (
    <section class={styles.settings}>
      <header class={styles.settingsHead}>
        <h2 class={styles.settingsTitle}>{t(messages.onboardHeading)}</h2>
        <p class={styles.settingsIntro}>{t(messages.onboardIntro)}</p>
      </header>

      <div class={styles.settingRow}>
        <Button intent="neutral" onClick={() => (cliOnboarding.value = false)}>
          {t(messages.onboardBack)}
        </Button>
      </div>

      <article class={styles.setting}>
        <h3 class={styles.settingTitle}>{t(messages.onboardStep1Title)}</h3>
        <p class={styles.settingDesc}>{t(messages.onboardStep1Desc)}</p>
        <p class={styles.identityLabel}>{t(messages.deviceCodeLabel)}</p>
        <code class={styles.deviceCode}>{code}</code>
        <div class={styles.settingRow}>
          <Button
            intent="primary"
            onClick={() => {
              void navigator.clipboard?.writeText(code);
              codeCopied.value = true;
            }}
          >
            {codeCopied.value ? t(messages.copied) : t(messages.copyCode)}
          </Button>
        </div>
      </article>

      <article class={styles.setting}>
        <h3 class={styles.settingTitle}>{t(messages.onboardStep2Title)}</h3>
        <p class={styles.settingDesc}>{t(messages.onboardStep2Desc)}</p>
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
            intent="neutral"
            onClick={() => {
              pairFailed.value = false;
              onPair(draftPeerCode.value)
                .then(() => {
                  draftPeerCode.value = '';
                })
                .catch(() => {
                  pairFailed.value = true;
                });
            }}
          >
            {t(messages.pair)}
          </Button>
        </div>
        {pairFailed.value && <p class={styles.warn}>{t(messages.pairError)}</p>}
      </article>

      <article class={styles.setting}>
        <h3 class={styles.settingTitle}>{t(messages.onboardStep3Title)}</h3>
        <p class={styles.settingDesc}>{t(messages.onboardStep3Desc)}</p>
        {pending.length === 0 && verified.length === 0 && (
          <p class={styles.muted}>{t(messages.onboardWaiting)}</p>
        )}
        {pending.map((peer) => (
          <div class={styles.safetyCheck} key={peer.id}>
            <p class={styles.settingDesc}>{t(messages.sasPrompt)}</p>
            <span class={styles.safetyNumber}>{peer.sas}</span>
            {onVerify && onReject && (
              <div class={styles.settingRow}>
                <Button intent="primary" onClick={() => onVerify(peer.id)}>
                  {t(messages.confirm)}
                </Button>
                <Button intent="neutral" onClick={() => onReject(peer.id)}>
                  {t(messages.reject)}
                </Button>
              </div>
            )}
          </div>
        ))}
        {verified.map((peer) => (
          <p class={styles.statusOk} key={peer.id}>
            {t(messages.onboardVerified)}
          </p>
        ))}
      </article>
    </section>
  );
}
