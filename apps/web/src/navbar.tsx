// The global, sticky top navbar (plan §2.4) — one bar across every surface:
// marketing pages, the running app, and the public share viewer. It always
// carries the brand and the reading-mode toggle; on marketing routes it adds the
// section links + Launch, and in the unlocked app it absorbs what used to be the
// app's own topbar and tab bar (wallet name, sync status, Files/Devices/Settings).
// The toggle's own labels come from the stable `nav` namespace via `t`; every
// other label re-voices with the reading mode via `tr`. No hooks; route +
// runtime arrive as props, the rest is read from signals.
import { cn } from '@cascivo/core';
import { type Message, t } from '@cascivo/i18n';
import { landing, messages, nav } from './messages.js';
import styles from './navbar.module.css';
import { type Mode, readingMode, tr } from './reading-mode.js';
import { navigate, type Route } from './router.js';
import type { Runtime } from './runtime.js';
import { Button } from './ui/button.js';
import { Icon, type IconName } from './ui/icon.js';
import { SegmentedControl } from './ui/segmented-control.js';
import { type AppView, activeView } from './view-state.js';

const MARKETING_ROUTES: readonly Route[] = ['landing', 'whitepaper', 'comparison', 'how-it-works'];

const LINKS: readonly { route: Route; label: Message<string> }[] = [
  { route: 'whitepaper', label: landing.whitepaper },
  { route: 'comparison', label: landing.comparison },
  { route: 'how-it-works', label: landing.watchFlow },
];

const TABS: readonly { id: AppView; icon: IconName; label: Message<string> }[] = [
  { id: 'files', icon: 'files', label: messages.navFiles },
  { id: 'devices', icon: 'devices', label: messages.navDevices },
  { id: 'settings', icon: 'settings', label: messages.navSettings },
];

export interface NavbarProps {
  route: Route;
  /** The unlocked runtime, or null on marketing/picker/unlock/share screens. */
  runtime: Runtime | null;
  /** Open the app (reuses Root's wallet-selection logic). */
  onLaunch: () => void;
}

export function Navbar({ route, runtime, onLaunch }: NavbarProps) {
  const isMarketing = MARKETING_ROUTES.includes(route);
  const inApp = route === 'app' && runtime !== null;

  const modeOptions: readonly { id: Mode; label: string }[] = [
    { id: 'regular', label: t(nav.modeRegular) },
    { id: 'eli5', label: t(nav.modeEli5) },
    { id: 'machine', label: t(nav.modeMachine) },
  ];

  return (
    <header class={styles.bar}>
      <div class={styles.inner}>
        <button type="button" class={styles.brand} onClick={() => navigate('landing')}>
          <img class={styles.logo} src="/logo.png" alt={tr(messages.logoAlt)} />
          <span class={styles.wordmark}>{tr(landing.brand)}</span>
          {inApp && runtime ? <span class={styles.walletTag}>{runtime.walletName}</span> : null}
        </button>

        {isMarketing ? (
          <nav class={styles.links} aria-label={tr(messages.primaryNav)}>
            {LINKS.map((link) => (
              <button
                key={link.route}
                type="button"
                class={cn(styles.link, route === link.route && styles.linkActive)}
                aria-current={route === link.route ? 'page' : undefined}
                onClick={() => navigate(link.route)}
              >
                {tr(link.label)}
              </button>
            ))}
          </nav>
        ) : null}

        {inApp && runtime ? <SyncIndicator runtime={runtime} /> : null}

        <div class={styles.right}>
          <SegmentedControl
            options={modeOptions}
            value={readingMode.value}
            onChange={(mode) => {
              readingMode.value = mode;
            }}
            label={t(nav.modeLabel)}
          />
          {isMarketing ? (
            <Button intent="primary" onClick={onLaunch}>
              {tr(landing.launch)}
            </Button>
          ) : null}
        </div>
      </div>

      {inApp ? (
        <nav class={styles.tabs} aria-label={tr(messages.primaryNav)}>
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              class={cn(styles.tab, activeView.value === tab.id && styles.tabActive)}
              aria-current={activeView.value === tab.id ? 'page' : undefined}
              onClick={() => {
                activeView.value = tab.id;
              }}
            >
              <Icon name={tab.icon} class={styles.tabIcon} />
              <span class={styles.tabLabel}>{tr(tab.label)}</span>
            </button>
          ))}
        </nav>
      ) : null}
    </header>
  );
}

function SyncIndicator({ runtime }: { runtime: Runtime }) {
  const sync = runtime.syncStatus.value;
  const label =
    sync === 'syncing'
      ? tr(messages.syncingNow)
      : sync === 'error'
        ? tr(messages.syncProblem)
        : tr(messages.syncUpToDate);
  const dotClass =
    sync === 'syncing' ? styles.dotSyncing : sync === 'error' ? styles.dotError : styles.dotIdle;
  return (
    <span class={styles.sync}>
      <span class={cn(styles.dot, dotClass)} aria-hidden="true" />
      {label}
    </span>
  );
}
