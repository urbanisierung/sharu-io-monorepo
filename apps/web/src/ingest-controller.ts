// View-state machine for the drag-drop ingest flow (plan §2.4). It owns exactly
// the interaction states the design review flagged as missing — first-run key
// entry, drag-over valid/invalid, chunking/progress, success, error — as a
// single `@preact/signals` signal the UI renders directly. No useState/useEffect.
//
// The actual encrypt → store → record work is injected as `ingest`, so the
// controller (and its states) are testable without the crypto WASM or a peer.
import { type ReadonlySignal, signal } from '@preact/signals';

export type Phase =
  | { kind: 'first-run' }
  | { kind: 'idle' }
  | { kind: 'drag'; valid: boolean }
  | { kind: 'chunking'; done: number; total: number }
  | { kind: 'success'; count: number }
  | { kind: 'error'; message: string };

/** Encrypts and records one file under `passphrase`; the controller drives the
 *  surrounding UX. */
export type IngestFile = (file: File, passphrase: string) => Promise<void>;

/** Per-file feedback for the "what's being backed up right now" list, so the
 *  user sees each file move from queued → adding → safe (or failed), not just a
 *  global counter. */
export interface FileProgress {
  name: string;
  size: number;
  status: 'queued' | 'adding' | 'done' | 'error';
}

export class IngestController {
  readonly #phase = signal<Phase>({ kind: 'first-run' });
  readonly #progress = signal<readonly FileProgress[]>([]);
  #passphrase = '';

  /** `onUnlock` lets the runtime capture the passphrase (key material) so it can
   *  also restore/decrypt, not just ingest. */
  constructor(
    private readonly ingest: IngestFile,
    private readonly onUnlock?: (passphrase: string) => void,
  ) {}

  get phase(): ReadonlySignal<Phase> {
    return this.#phase;
  }

  /** Live per-file progress for the current/last drop (empty when idle). */
  get progress(): ReadonlySignal<readonly FileProgress[]> {
    return this.#progress;
  }

  /** Whether a passphrase has been entered (gates the drop zone). */
  get unlocked(): boolean {
    return this.#passphrase.length > 0;
  }

  /** First-run: accept the passphrase and move to the idle drop state. */
  unlock(passphrase: string): void {
    if (passphrase.length === 0) return;
    this.#passphrase = passphrase;
    this.onUnlock?.(passphrase);
    this.#phase.value = { kind: 'idle' };
  }

  /** A drag entered the drop zone; `valid` reflects whether it carries files. */
  dragOver(valid: boolean): void {
    if (!this.unlocked) return;
    this.#phase.value = { kind: 'drag', valid };
  }

  /** The drag left without dropping. */
  dragLeave(): void {
    if (this.#phase.value.kind === 'drag') this.#phase.value = { kind: 'idle' };
  }

  /** Encrypt and record each dropped file, surfacing progress then the outcome. */
  async drop(files: readonly File[]): Promise<void> {
    if (!this.unlocked || files.length === 0) {
      this.#phase.value = { kind: 'idle' };
      return;
    }
    this.#progress.value = files.map((file) => ({
      name: file.name,
      size: file.size,
      status: 'queued',
    }));
    let done = 0;
    this.#phase.value = { kind: 'chunking', done, total: files.length };
    for (const [index, file] of files.entries()) {
      this.#mark(index, 'adding');
      try {
        await this.ingest(file, this.#passphrase);
      } catch (cause) {
        this.#mark(index, 'error');
        this.#phase.value = {
          kind: 'error',
          message: cause instanceof Error ? cause.message : String(cause),
        };
        return;
      }
      this.#mark(index, 'done');
      done += 1;
      this.#phase.value = { kind: 'chunking', done, total: files.length };
    }
    this.#phase.value = { kind: 'success', count: done };
  }

  /** Return to the idle drop state after a success or error, clearing the list. */
  reset(): void {
    if (!this.unlocked) return;
    this.#progress.value = [];
    this.#phase.value = { kind: 'idle' };
  }

  /** Update one file's status, leaving the rest of the list untouched. */
  #mark(index: number, status: FileProgress['status']): void {
    this.#progress.value = this.#progress.value.map((item, i) =>
      i === index ? { ...item, status } : item,
    );
  }
}
