// Desktop transport: the `Transport` interface backed by the native Iroh core
// in the Tauri shell (plan §3.2), reached through Tauri commands. The SDK sees
// the exact same interface as in the browser — only the implementation behind it
// changes (native direct hole-punching instead of relay-only). Loaded only under
// Tauri, so it is a separate entry (`@safu/transport/tauri`).

import { invoke } from '@tauri-apps/api/core';
import { AsyncQueue } from './async-queue.js';
import type { Channel, PeerAddr, PeerId, Transport } from './transport.js';

/** A channel identified by the registry id the native core handed back. */
class TauriChannel implements Channel {
  readonly peer: PeerId;
  readonly #id: number;

  constructor(id: number, peer: PeerId) {
    this.#id = id;
    this.peer = peer;
  }

  async send(message: Uint8Array): Promise<void> {
    await invoke('channel_send', { channel: this.#id, data: Array.from(message) });
  }

  async *messages(): AsyncIterableIterator<Uint8Array> {
    for (;;) {
      const frame = await invoke<number[] | null>('channel_recv', { channel: this.#id });
      if (frame === null) return;
      yield Uint8Array.from(frame);
    }
  }

  async close(): Promise<void> {
    await invoke('channel_close', { channel: this.#id });
  }
}

interface Accepted {
  id: number;
  peer: string;
  protocol: string;
}

class TauriTransport implements Transport {
  readonly #id: PeerId;
  readonly #relayUrl: string | undefined;
  readonly #listeners = new Map<string, AsyncQueue<Channel>>();
  #accepting = false;

  constructor(id: PeerId, relayUrl: string | undefined) {
    this.#id = id;
    this.#relayUrl = relayUrl;
  }

  id(): PeerId {
    return this.#id;
  }

  addr(): PeerAddr {
    return { id: this.#id, relayUrl: this.#relayUrl };
  }

  async connect(peer: PeerAddr, protocol: string): Promise<Channel> {
    const id = await invoke<number>('transport_connect', {
      peer: peer.id,
      relay: peer.relayUrl ?? '',
      protocol,
    });
    return new TauriChannel(id, peer.id);
  }

  accept(protocol: string): AsyncIterableIterator<Channel> {
    let queue = this.#listeners.get(protocol);
    if (!queue) {
      queue = new AsyncQueue<Channel>();
      this.#listeners.set(protocol, queue);
    }
    this.#startAcceptLoop();
    return queue;
  }

  close(): Promise<void> {
    for (const queue of this.#listeners.values()) queue.close();
    this.#listeners.clear();
    return Promise.resolve();
  }

  #startAcceptLoop(): void {
    if (this.#accepting) return;
    this.#accepting = true;
    void (async () => {
      for (;;) {
        const next = await invoke<Accepted | null>('transport_accept');
        if (next === null) break;
        this.#listeners.get(next.protocol)?.push(new TauriChannel(next.id, next.peer));
      }
    })();
  }
}

/** Read the native endpoint's identity and wrap the command bridge. */
export async function createTauriTransport(): Promise<Transport> {
  const id = await invoke<string>('transport_id');
  const relayUrl = await invoke<string | null>('transport_relay');
  return new TauriTransport(id, relayUrl ?? undefined);
}
