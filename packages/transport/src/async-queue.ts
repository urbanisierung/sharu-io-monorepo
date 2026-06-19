// A minimal single-consumer async queue: producers `push`, the consumer awaits
// values via the async iterator, and `close` ends the iteration once drained.
// Used to back loopback channels and inbound-channel streams.
export class AsyncQueue<T> implements AsyncIterableIterator<T> {
  readonly #items: T[] = [];
  #pending: ((r: IteratorResult<T>) => void) | undefined;
  #closed = false;

  push(item: T): void {
    if (this.#closed) return;
    if (this.#pending) {
      const resolve = this.#pending;
      this.#pending = undefined;
      resolve({ value: item, done: false });
      return;
    }
    this.#items.push(item);
  }

  close(): void {
    this.#closed = true;
    if (this.#pending) {
      const resolve = this.#pending;
      this.#pending = undefined;
      resolve({ value: undefined, done: true });
    }
  }

  next(): Promise<IteratorResult<T>> {
    const item = this.#items.shift();
    if (item !== undefined) return Promise.resolve({ value: item, done: false });
    if (this.#closed) return Promise.resolve({ value: undefined, done: true });
    return new Promise((resolve) => {
      this.#pending = resolve;
    });
  }

  [Symbol.asyncIterator](): AsyncIterableIterator<T> {
    return this;
  }
}
