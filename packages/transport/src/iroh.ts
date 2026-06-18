// Browser transport: the `Transport` interface backed by the Iroh WASM binding
// (plan §2.1, §2.4). Relay-only over WebSocket through the n0.computer relay
// network. This module is loaded only in the browser/worker — there is no Node
// build of relay-only Iroh — so it is a separate entry (`@safu/transport/iroh`)
// and is never imported by the runtime-agnostic SDK, which depends only on the
// `Transport` interface and receives an instance by injection.

import init, { type IrohChannel, IrohEndpoint } from '../wasm/safu_transport.js';
import { AsyncQueue } from './async-queue.js';
import type { Channel, PeerAddr, PeerId, Transport } from './transport.js';

let booted: Promise<unknown> | undefined;
const ready = () => (booted ??= init());

/** Adapts one Iroh bi-stream into a message-oriented `Channel`. */
class IrohChannelAdapter implements Channel {
  readonly peer: PeerId;
  readonly #channel: IrohChannel;

  constructor(channel: IrohChannel) {
    this.peer = channel.peer;
    this.#channel = channel;
  }

  async send(message: Uint8Array): Promise<void> {
    await this.#channel.send(message);
  }

  async *messages(): AsyncIterableIterator<Uint8Array> {
    for (;;) {
      const frame = (await this.#channel.recv()) as Uint8Array | null;
      if (frame === null) return;
      yield frame;
    }
  }

  async close(): Promise<void> {
    await this.#channel.close();
  }
}

class IrohTransport implements Transport {
  readonly #endpoint: IrohEndpoint;
  readonly #relayUrl: string | undefined;
  readonly #listeners = new Map<string, AsyncQueue<Channel>>();
  #accepting = false;

  constructor(endpoint: IrohEndpoint, relayUrl: string | undefined) {
    this.#endpoint = endpoint;
    this.#relayUrl = relayUrl;
  }

  id(): PeerId {
    return this.#endpoint.id;
  }

  addr(): PeerAddr {
    return { id: this.#endpoint.id, relayUrl: this.#relayUrl };
  }

  async connect(peer: PeerAddr, protocol: string): Promise<Channel> {
    if (!peer.relayUrl) throw new Error('iroh: relay URL required to dial in the browser');
    const channel = (await this.#endpoint.connect(peer.id, peer.relayUrl, protocol)) as IrohChannel;
    return new IrohChannelAdapter(channel);
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

  /** One endpoint-wide accept loop dispatches inbound channels to the per-protocol
   *  queue matching the negotiated ALPN. */
  #startAcceptLoop(): void {
    if (this.#accepting) return;
    this.#accepting = true;
    void (async () => {
      for (;;) {
        const next = (await this.#endpoint.accept()) as IrohChannel | null;
        if (next === null) break;
        this.#listeners.get(next.protocol)?.push(new IrohChannelAdapter(next));
      }
    })();
  }
}

/** Boot the WASM module, bind a relay-only endpoint advertising `protocols`, and
 *  wait until it is online (has a home relay) so its address is dialable. */
export async function createIrohTransport(protocols: string[]): Promise<Transport> {
  await ready();
  const endpoint = (await IrohEndpoint.create(protocols)) as IrohEndpoint;
  const relayUrl = (await endpoint.online()) as string | null;
  return new IrohTransport(endpoint, relayUrl ?? undefined);
}
