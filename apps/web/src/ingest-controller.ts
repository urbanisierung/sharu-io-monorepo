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

export class IngestController {
  readonly #phase = signal<Phase>({ kind: 'first-run' });
  #passphrase = '';

  constructor(private readonly ingest: IngestFile) {}

  get phase(): ReadonlySignal<Phase> {
    return this.#phase;
  }

  /** Whether a passphrase has been entered (gates the drop zone). */
  get unlocked(): boolean {
    return this.#passphrase.length > 0;
  }

  /** First-run: accept the passphrase and move to the idle drop state. */
  unlock(passphrase: string): void {
    if (passphrase.length === 0) return;
    this.#passphrase = passphrase;
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
    let done = 0;
    this.#phase.value = { kind: 'chunking', done, total: files.length };
    try {
      for (const file of files) {
        await this.ingest(file, this.#passphrase);
        done += 1;
        this.#phase.value = { kind: 'chunking', done, total: files.length };
      }
      this.#phase.value = { kind: 'success', count: done };
    } catch (cause) {
      this.#phase.value = {
        kind: 'error',
        message: cause instanceof Error ? cause.message : String(cause),
      };
    }
  }

  /** Return to the idle drop state after a success or error. */
  reset(): void {
    if (this.unlocked) this.#phase.value = { kind: 'idle' };
  }
}
