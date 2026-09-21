// Device linking, made mom-friendly (Phase 3): show this device's link as a QR
// the other device's camera can open (plus copy/share), prefill the link field
// when arriving via a pairing deep link, walk the user through the safety-number
// check in plain language, and let them give each paired device a friendly name
// instead of reading a raw key id. Signal-driven, no hooks; copy via i18n.
//
// The page is a stack of Cards — the backup-node prompt, This device, Share,
// Link, Manage — so the jobs (add an always-on replica, hand out this device's
// code, paste another's, look after the ones already linked) read as distinct
// steps. The prompt is the one tinted block on the screen, because it is the
// recommended next action. The link code is masked to its first and last
// characters so the full secret isn't left sitting on screen.

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
import { Card, CardTitle } from './ui/card.js';
import { CopyButton } from './ui/copy-button.js';
import { DataList, DataListItem } from './ui/data-list.js';
import { Icon } from './ui/icon.js';
import { Input } from './ui/input.js';

// Prefilled from a `#pair=…` deep link, so a device opened by scanning a QR
// arrives with the other device's code already in the field.
const draftPeerCode = signal(readPairingFromHash(globalThis.location?.hash ?? '') ?? '');
const pairFailed = signal(false);
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
    <section class={styles.screen}>
      <header class={styles.screenHead}>
        <h1 class={styles.screenTitle}>{t(messages.devicesHeading)}</h1>
        <p class={styles.screenIntro}>{t(messages.devicesIntro)}</p>
      </header>

      {/* The one tinted block on this screen — it is the recommended next step. */}
      <Card as="article" tone="accent">
        <div class={styles.splitRow}>
          <div class={styles.cardStack}>
            <CardTitle>{t(messages.onboardCliTitle)}</CardTitle>
            <p class={styles.cardText}>{t(messages.onboardCliDesc)}</p>
          </div>
          <Button intent="primary" onClick={openCliOnboarding}>
            {t(messages.onboardCliStart)}
          </Button>
        </div>
      </Card>

      {self && (
        <Card as="article">
          <CardTitle>{t(messages.identityTitle)}</CardTitle>
          <p class={styles.cardText}>{t(messages.identityDesc)}</p>
          {/* Technical values stack label over value, so a 64-character id never
              has to share a row's width with its own caption. */}
          <DataList orientation="vertical" dividers>
            <DataListItem
              label={t(messages.signingIdLabel)}
              action={
                <CopyButton
                  value={self.signId}
                  label={t(messages.copy)}
                  copiedLabel={t(messages.copied)}
                />
              }
            >
              {self.signId}
            </DataListItem>
            <DataListItem label={t(messages.transportIdLabel)}>{self.id}</DataListItem>
            <DataListItem label={t(messages.relayLabel)}>
              {self.relayUrl ?? t(messages.relayUnknown)}
            </DataListItem>
          </DataList>
        </Card>
      )}

      {code && (
        <Card as="article">
          <CardTitle>{t(messages.shareSectionTitle)}</CardTitle>
          <p class={styles.cardText}>{t(messages.shareSectionDesc)}</p>
          <div class={styles.sharePanel}>
            <QrCode value={link} label={t(messages.qrLabel)} />
            <div class={styles.shareAside}>
              <p class={styles.cardText}>{t(messages.scanPrompt)}</p>
              <code class={styles.shareCode} title={code}>
                {maskCode(code)}
              </code>
              <div class={styles.shareActions}>
                <CopyButton
                  intent="primary"
                  value={link}
                  label={t(messages.copyLink)}
                  copiedLabel={t(messages.copied)}
                />
                <CopyButton
                  value={code}
                  label={t(messages.copyCode)}
                  copiedLabel={t(messages.copied)}
                />
                {canShare && (
                  <Button intent="neutral" onClick={() => void navigator.share({ url: link })}>
                    {t(messages.shareLink)}
                  </Button>
                )}
              </div>
            </div>
          </div>
        </Card>
      )}

      <Card as="article">
        <CardTitle>{t(messages.linkSectionTitle)}</CardTitle>
        <p class={styles.cardText}>{t(messages.linkSectionDesc)}</p>
        {draftPeerCode.value && <p class={styles.muted}>{t(messages.incomingPair)}</p>}
        <div class={styles.cardRow}>
          <Input
            class={styles.cardField}
            aria-label={t(messages.peerCodePlaceholder)}
            placeholder={t(messages.peerCodePlaceholder)}
            value={draftPeerCode.value}
            error={pairFailed.value ? t(messages.pairError) : undefined}
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
      </Card>

      {peers.value.length > 0 && (
        <Card as="article">
          <CardTitle>{t(messages.manageSectionTitle)}</CardTitle>
          <p class={styles.cardText}>{t(messages.manageSectionDesc)}</p>
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
                  <tr key={peer.id}>
                    <td>
                      <button
                        type="button"
                        class={styles.deviceExpand}
                        aria-expanded={open}
                        onClick={() => (expandedId.value = open ? null : peer.id)}
                      >
                        <span class={cn(styles.chevron, open && styles.chevronOpen)}>
                          <Icon name="chevronRight" />
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
                        <p class={styles.cardText}>
                          {t(messages.sasPrompt)} <strong>{peer.sas}</strong>
                        </p>

                        <DataList orientation="vertical" dividers>
                          <DataListItem label={t(messages.signingIdLabel)}>{peer.id}</DataListItem>
                          {peer.addr && (
                            <DataListItem label={t(messages.transportIdLabel)}>
                              {peer.addr.id}
                            </DataListItem>
                          )}
                          {peer.addr && (
                            <DataListItem label={t(messages.relayLabel)}>
                              {peer.addr.relayUrl ?? t(messages.relayUnknown)}
                            </DataListItem>
                          )}
                        </DataList>

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
                                <Input
                                  class={styles.cardField}
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
        </Card>
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
    <section class={styles.screen}>
      <header class={styles.screenHead}>
        <h1 class={styles.screenTitle}>{t(messages.onboardHeading)}</h1>
        <p class={styles.screenIntro}>{t(messages.onboardIntro)}</p>
      </header>

      <div>
        <Button intent="neutral" onClick={() => (cliOnboarding.value = false)}>
          {t(messages.onboardBack)}
        </Button>
      </div>

      <Card as="article">
        <CardTitle>{t(messages.onboardStep1Title)}</CardTitle>
        <p class={styles.cardText}>{t(messages.onboardStep1Desc)}</p>
        <div class={styles.cardRow}>
          <span class={styles.fieldLabel}>{t(messages.deviceCodeLabel)}</span>
        </div>
        <code class={styles.deviceCode}>{code}</code>
        <div class={styles.cardRow}>
          <CopyButton
            intent="primary"
            value={code}
            label={t(messages.copyCode)}
            copiedLabel={t(messages.copied)}
          />
        </div>
      </Card>

      <Card as="article">
        <CardTitle>{t(messages.onboardStep2Title)}</CardTitle>
        <p class={styles.cardText}>{t(messages.onboardStep2Desc)}</p>
        <div class={styles.cardRow}>
          <Input
            class={styles.cardField}
            aria-label={t(messages.peerCodePlaceholder)}
            placeholder={t(messages.peerCodePlaceholder)}
            value={draftPeerCode.value}
            error={pairFailed.value ? t(messages.pairError) : undefined}
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
      </Card>

      <Card as="article">
        <CardTitle>{t(messages.onboardStep3Title)}</CardTitle>
        <p class={styles.cardText}>{t(messages.onboardStep3Desc)}</p>
        {pending.length === 0 && verified.length === 0 && (
          <p class={styles.muted}>{t(messages.onboardWaiting)}</p>
        )}
        {pending.map((peer) => (
          <div class={styles.safetyCheck} key={peer.id}>
            <p class={styles.cardText}>{t(messages.sasPrompt)}</p>
            <span class={styles.safetyNumber}>{peer.sas}</span>
            {onVerify && onReject && (
              <div class={styles.shareActions}>
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
          <p class={cn(styles.cardText, styles.statusOk)} key={peer.id}>
            {t(messages.onboardVerified)}
          </p>
        ))}
      </Card>
    </section>
  );
}
