// The backed-up files, presented the way a real file manager does (the "core
// file table" improvement): a sortable, searchable table with a type icon,
// human-readable size, modified date, and chunk count, plus per-row restore and
// a confirm-gated delete, and a storage summary. Signal-driven view state (sort
// key/direction, search query, the row mid-confirm) — no React hooks; all copy
// via @cascivo/i18n. The SDK already carries this metadata on every FileView;
// this component just stops throwing it away.

import { cn } from '@cascivo/core';
import { type ReadonlySignal, signal } from '@preact/signals';
import type { FileView } from '@safu/sdk';
import styles from './file-table.module.css';
import { fileKind, formatBytes, formatDate } from './format.js';
import { messages } from './messages.js';
import { tr as t } from './reading-mode.js';
import { AddFilesButton } from './ui/add-files-button.js';
import { Icon } from './ui/icon.js';
import { IconButton } from './ui/icon-button.js';

type SortKey = 'name' | 'size' | 'modified';

const query = signal('');
const sortKey = signal<SortKey>('name');
const sortAsc = signal(true);
const pendingDelete = signal<string | null>(null);
const restoreFailedPath = signal<string | null>(null);
// Public-share view state: the link per published path, the row mid-publish, the
// row whose link was just copied, and the per-row publish error (a message key).
const shareLinks = signal<Record<string, string>>({});
const sharingPath = signal<string | null>(null);
const copiedPath = signal<string | null>(null);
const shareErrors = signal<Record<string, string>>({});
// Which row's overflow (three-dots) menu is open, if any.
const openMenuPath = signal<string | null>(null);

/** Reset the module-level view state — for deterministic tests. */
export function resetFileTableView(): void {
  query.value = '';
  sortKey.value = 'name';
  sortAsc.value = true;
  pendingDelete.value = null;
  restoreFailedPath.value = null;
  shareLinks.value = {};
  sharingPath.value = null;
  copiedPath.value = null;
  shareErrors.value = {};
  openMenuPath.value = null;
}

function toggleMenu(path: string): void {
  openMenuPath.value = openMenuPath.value === path ? null : path;
  pendingDelete.value = null;
}

function closeMenu(): void {
  openMenuPath.value = null;
  pendingDelete.value = null;
}

function compare(a: FileView, b: FileView, key: SortKey): number {
  if (key === 'name') return a.path.localeCompare(b.path);
  return key === 'size' ? a.size - b.size : a.modified - b.modified;
}

function toggleSort(key: SortKey): void {
  if (sortKey.value === key) sortAsc.value = !sortAsc.value;
  else {
    sortKey.value = key;
    sortAsc.value = true;
  }
}

export interface FileTableProps {
  files: ReadonlySignal<readonly FileView[]>;
  onRestore?: (path: string) => Promise<void>;
  onDelete?: (path: string) => void;
  /** Publish a file as a public share, resolving to the openable link. Rejects
   *  with a 'no-share-host' error when no always-on node is paired. */
  onShare?: (path: string) => Promise<string>;
  /** Add files through the native picker — shown in the toolbar and the empty state. */
  onAddFiles?: (files: readonly File[]) => void;
}

/** Publish `path`, recording the link or a message-key error against the row. */
async function publishShare(path: string, onShare: (path: string) => Promise<string>) {
  if (sharingPath.value === path) return; // already in flight — ignore re-clicks
  sharingPath.value = path;
  shareErrors.value = { ...shareErrors.value, [path]: '' };
  try {
    const link = await onShare(path);
    shareLinks.value = { ...shareLinks.value, [path]: link };
  } catch (cause) {
    const key =
      cause instanceof Error && cause.message === 'no-share-host' ? 'shareNoHost' : 'shareFailed';
    shareErrors.value = { ...shareErrors.value, [path]: key };
  } finally {
    if (sharingPath.value === path) sharingPath.value = null;
  }
}

function copyShareLink(path: string, link: string): void {
  void globalThis.navigator?.clipboard?.writeText(link);
  copiedPath.value = path;
}

export function FileTable({ files, onRestore, onDelete, onShare, onAddFiles }: FileTableProps) {
  const all = files.value;
  const totalBytes = all.reduce((sum, file) => sum + file.size, 0);

  const term = query.value.trim().toLowerCase();
  const filtered = term ? all.filter((file) => file.path.toLowerCase().includes(term)) : all;
  const direction = sortAsc.value ? 1 : -1;
  const rows = [...filtered].sort((a, b) => compare(a, b, sortKey.value) * direction);

  return (
    <section class={styles.files}>
      <div class={styles.toolbar}>
        <div class={styles.toolbarMeta}>
          <h2 class={styles.heading}>{t(messages.filesHeading)}</h2>
          {all.length > 0 && (
            <span class={styles.summary}>
              {t(messages.storageSummary, { count: all.length, size: formatBytes(totalBytes) })}
            </span>
          )}
        </div>
        {all.length > 0 && onAddFiles && <AddFilesButton onFiles={onAddFiles} />}
      </div>

      {all.length === 0 ? (
        <div class={styles.empty}>
          <Icon name="inbox" class={styles.emptyIcon} />
          <h3 class={styles.emptyTitle}>{t(messages.emptyTitle)}</h3>
          <p class={styles.emptyBody}>{t(messages.emptyBody)}</p>
          {onAddFiles && <AddFilesButton onFiles={onAddFiles} />}
        </div>
      ) : (
        <>
          <input
            class={styles.search}
            type="search"
            aria-label={t(messages.searchFiles)}
            placeholder={t(messages.searchFiles)}
            value={query.value}
            onInput={(event) => {
              query.value = (event.target as HTMLInputElement).value;
            }}
          />

          {rows.length === 0 ? (
            <p class={styles.muted}>{t(messages.noMatches, { query: query.value })}</p>
          ) : (
            <table class={styles.table}>
              <thead>
                <tr>
                  <th scope="col" class={styles.iconCol} />
                  <SortHeader column="name" label={t(messages.colName)} />
                  <SortHeader column="size" label={t(messages.colSize)} numeric />
                  <SortHeader column="modified" label={t(messages.colModified)} numeric />
                  <SortHeader
                    column="chunks"
                    label={t(messages.colChunks)}
                    numeric
                    sortable={false}
                  />
                  <th scope="col" class={styles.actionsCol} />
                </tr>
              </thead>
              <tbody>
                {rows.map((file) => (
                  <tr key={file.path} class={styles.row}>
                    <td class={styles.icon} aria-hidden="true">
                      <Icon name={fileKind(file.path)} />
                    </td>
                    <td class={styles.name}>{file.path}</td>
                    <td class={styles.numeric}>{formatBytes(file.size)}</td>
                    <td class={styles.numeric}>{formatDate(file.modified)}</td>
                    <td class={styles.numeric}>{file.blocks.length}</td>
                    <td class={styles.actions}>
                      <div class={styles.menuWrap}>
                        <IconButton
                          icon="more"
                          label={t(messages.rowActions)}
                          aria-haspopup="menu"
                          aria-expanded={openMenuPath.value === file.path}
                          onClick={() => toggleMenu(file.path)}
                        />
                        {openMenuPath.value === file.path && (
                          <>
                            <button
                              type="button"
                              class={styles.backdrop}
                              aria-hidden="true"
                              tabIndex={-1}
                              onClick={closeMenu}
                            />
                            <div
                              class={styles.menu}
                              role="menu"
                              onKeyDown={(event) => {
                                if (event.key === 'Escape') closeMenu();
                              }}
                            >
                              {pendingDelete.value === file.path ? (
                                <>
                                  <span class={styles.menuLabel}>{t(messages.deleteConfirm)}</span>
                                  <button
                                    type="button"
                                    role="menuitem"
                                    class={cn(styles.menuItem, styles.menuItemDanger)}
                                    onClick={() => {
                                      onDelete?.(file.path);
                                      closeMenu();
                                    }}
                                  >
                                    <Icon name="trash" />
                                    {t(messages.deleteYes)}
                                  </button>
                                  <button
                                    type="button"
                                    role="menuitem"
                                    class={styles.menuItem}
                                    onClick={() => (pendingDelete.value = null)}
                                  >
                                    <Icon name="close" />
                                    {t(messages.deleteCancel)}
                                  </button>
                                </>
                              ) : (
                                <>
                                  {onRestore && (
                                    <button
                                      type="button"
                                      role="menuitem"
                                      class={styles.menuItem}
                                      onClick={() => {
                                        restoreFailedPath.value = null;
                                        closeMenu();
                                        onRestore(file.path).catch(() => {
                                          restoreFailedPath.value = file.path;
                                        });
                                      }}
                                    >
                                      <Icon name="download" />
                                      {t(messages.download)}
                                    </button>
                                  )}
                                  {onShare && (
                                    <button
                                      type="button"
                                      role="menuitem"
                                      class={styles.menuItem}
                                      onClick={() => {
                                        closeMenu();
                                        void publishShare(file.path, onShare);
                                      }}
                                    >
                                      <Icon name="share" />
                                      {t(messages.share)}
                                    </button>
                                  )}
                                  {onDelete && (
                                    <button
                                      type="button"
                                      role="menuitem"
                                      class={cn(styles.menuItem, styles.menuItemDanger)}
                                      onClick={() => (pendingDelete.value = file.path)}
                                    >
                                      <Icon name="trash" />
                                      {t(messages.delete)}
                                    </button>
                                  )}
                                </>
                              )}
                            </div>
                          </>
                        )}
                      </div>
                      {sharingPath.value === file.path && (
                        <span class={styles.muted}>{t(messages.sharePublishing)}</span>
                      )}
                      {shareErrors.value[file.path] && (
                        <p class={styles.warn}>
                          {t(
                            messages[shareErrors.value[file.path] as 'shareNoHost' | 'shareFailed'],
                          )}
                        </p>
                      )}
                      {shareLinks.value[file.path] && (
                        <div class={styles.shareLink}>
                          <input
                            class={styles.shareInput}
                            type="text"
                            readonly
                            value={shareLinks.value[file.path]}
                            aria-label={t(messages.shareLink)}
                          />
                          <IconButton
                            icon={copiedPath.value === file.path ? 'check' : 'copy'}
                            label={
                              copiedPath.value === file.path
                                ? t(messages.shareCopied)
                                : t(messages.shareCopy)
                            }
                            onClick={() =>
                              copyShareLink(file.path, shareLinks.value[file.path] as string)
                            }
                          />
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}

      {restoreFailedPath.value && <p class={styles.warn}>{t(messages.restoreFailed)}</p>}
    </section>
  );
}

interface SortHeaderProps {
  column: SortKey | 'chunks';
  label: string;
  numeric?: boolean;
  sortable?: boolean;
}

/** A column header that toggles the sort key/direction, with an active arrow.
 *  The chunk column is not sortable, so it renders as plain header text. */
function SortHeader({ column, label, numeric = false, sortable = true }: SortHeaderProps) {
  const cls = numeric ? styles.numericCol : undefined;
  if (!sortable || column === 'chunks') {
    return (
      <th scope="col" class={cls}>
        {label}
      </th>
    );
  }
  const active = sortKey.value === column;
  return (
    <th
      scope="col"
      class={cls}
      aria-sort={active ? (sortAsc.value ? 'ascending' : 'descending') : 'none'}
    >
      <button type="button" class={styles.sortButton} onClick={() => toggleSort(column)}>
        {label}
        <span class={styles.arrow} aria-hidden="true">
          {active ? (sortAsc.value ? '▲' : '▼') : ''}
        </span>
      </button>
    </th>
  );
}
