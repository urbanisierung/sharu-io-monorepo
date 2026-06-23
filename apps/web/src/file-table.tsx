// The backed-up files, presented the way a real file manager does (the "core
// file table" improvement): a sortable, searchable table with a type icon,
// human-readable size, modified date, and chunk count, plus per-row restore and
// a confirm-gated delete, and a storage summary. Signal-driven view state (sort
// key/direction, search query, the row mid-confirm) — no React hooks; all copy
// via @cascivo/i18n. The SDK already carries this metadata on every FileView;
// this component just stops throwing it away.
import { t } from '@cascivo/i18n';
import { type ReadonlySignal, signal } from '@preact/signals';
import type { FileView } from '@safu/sdk';
import styles from './file-table.module.css';
import { fileIcon, formatBytes, formatDate } from './format.js';
import { messages } from './messages.js';
import { AddFilesButton } from './ui/add-files-button.js';
import { Button } from './ui/button.js';

type SortKey = 'name' | 'size' | 'modified';

const query = signal('');
const sortKey = signal<SortKey>('name');
const sortAsc = signal(true);
const pendingDelete = signal<string | null>(null);
const restoreFailedPath = signal<string | null>(null);

/** Reset the module-level view state — for deterministic tests. */
export function resetFileTableView(): void {
  query.value = '';
  sortKey.value = 'name';
  sortAsc.value = true;
  pendingDelete.value = null;
  restoreFailedPath.value = null;
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
  /** Add files through the native picker — shown in the toolbar and the empty state. */
  onAddFiles?: (files: readonly File[]) => void;
}

export function FileTable({ files, onRestore, onDelete, onAddFiles }: FileTableProps) {
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
          <span class={styles.emptyIcon} aria-hidden="true">
            📂
          </span>
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
                      {fileIcon(file.path)}
                    </td>
                    <td class={styles.name}>{file.path}</td>
                    <td class={styles.numeric}>{formatBytes(file.size)}</td>
                    <td class={styles.numeric}>{formatDate(file.modified)}</td>
                    <td class={styles.numeric}>{file.blocks.length}</td>
                    <td class={styles.actions}>
                      {pendingDelete.value === file.path ? (
                        <>
                          <span class={styles.muted}>{t(messages.deleteConfirm)}</span>
                          <Button
                            intent="primary"
                            onClick={() => {
                              onDelete?.(file.path);
                              pendingDelete.value = null;
                            }}
                          >
                            {t(messages.deleteYes)}
                          </Button>
                          <Button intent="neutral" onClick={() => (pendingDelete.value = null)}>
                            {t(messages.deleteCancel)}
                          </Button>
                        </>
                      ) : (
                        <>
                          {onRestore && (
                            <Button
                              intent="neutral"
                              onClick={() => {
                                restoreFailedPath.value = null;
                                onRestore(file.path).catch(() => {
                                  restoreFailedPath.value = file.path;
                                });
                              }}
                            >
                              {t(messages.download)}
                            </Button>
                          )}
                          {onDelete && (
                            <Button
                              intent="neutral"
                              onClick={() => (pendingDelete.value = file.path)}
                            >
                              {t(messages.delete)}
                            </Button>
                          )}
                        </>
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
