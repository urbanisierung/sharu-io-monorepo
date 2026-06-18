// An in-process implementation of the transport contract. No relay, no WASM:
// endpoints minted from the same `LoopbackNetwork` can dial each other directly
// in memory. This lets the SDK's sync/transfer protocols be tested for
// correctness and convergence (plan §2.3 verify) without a live relay or a
// browser, exactly as the loopback transport test in plan §2.1 prescribes.
import { AsyncQueue } from './async-queue.js';
import type { Channel, PeerAddr, PeerId, Transport } from './transport.js';

const RELAY = 'loopback';

/** One end of a connected in-memory channel pair. */
class LoopbackChannel implements Channel {
  readonly peer: PeerId;
  readonly #inbound = new AsyncQueue<Uint8Array>();
  #outbound: LoopbackChannel | undefined;

  constructor(peer: PeerId) {
    this.peer = peer;
  }

  /** Cross-wire two channels so each `send` lands in the other's inbound queue. */
  static pair(a: PeerId, b: PeerId): [LoopbackChannel, LoopbackChannel] {
    const left = new LoopbackChannel(b);
    const right = new LoopbackChannel(a);
    left.#outbound = right;
    right.#outbound = left;
    return [left, right];
  }

  send(message: Uint8Array): Promise<void> {
    // Copy so a caller mutating its buffer after send cannot corrupt the peer's
    // view — matches the wire semantics the real transport gives for free.
    if (this.#outbound) this.#outbound.#inbound.push(message.slice());
    return Promise.resolve();
  }

  messages(): AsyncIterableIterator<Uint8Array> {
    return this.#inbound;
  }

  close(): Promise<void> {
    this.#inbound.close();
    if (this.#outbound) this.#outbound.#inbound.close();
    return Promise.resolve();
  }
}

class LoopbackTransport implements Transport {
  readonly #id: PeerId;
  readonly #network: LoopbackNetwork;
  readonly #listeners = new Map<string, AsyncQueue<Channel>>();

  constructor(id: PeerId, network: LoopbackNetwork) {
    this.#id = id;
    this.#network = network;
  }

  id(): PeerId {
    return this.#id;
  }

  addr(): PeerAddr {
    return { id: this.#id, relayUrl: RELAY };
  }

  connect(peer: PeerAddr, protocol: string): Promise<Channel> {
    const target = this.#network.lookup(peer.id);
    if (!target) return Promise.reject(new Error(`loopback: unknown peer ${peer.id}`));
    const incoming = target.#listeners.get(protocol);
    if (!incoming)
      return Promise.reject(new Error(`loopback: peer ${peer.id} not accepting ${protocol}`));
    const [dialer, accepted] = LoopbackChannel.pair(this.#id, peer.id);
    incoming.push(accepted);
    return Promise.resolve(dialer);
  }

  accept(protocol: string): AsyncIterableIterator<Channel> {
    let queue = this.#listeners.get(protocol);
    if (!queue) {
      queue = new AsyncQueue<Channel>();
      this.#listeners.set(protocol, queue);
    }
    return queue;
  }

  close(): Promise<void> {
    for (const queue of this.#listeners.values()) queue.close();
    this.#listeners.clear();
    this.#network.remove(this.#id);
    return Promise.resolve();
  }
}

/** A registry of in-process endpoints that can dial each other by id. */
export class LoopbackNetwork {
  readonly #endpoints = new Map<PeerId, LoopbackTransport>();

  /** Create an endpoint with id `id` joined to this network. */
  endpoint(id: PeerId): Transport {
    const transport = new LoopbackTransport(id, this);
    this.#endpoints.set(id, transport);
    return transport;
  }

  /** @internal */
  lookup(id: PeerId): LoopbackTransport | undefined {
    return this.#endpoints.get(id);
  }

  /** @internal */
  remove(id: PeerId): void {
    this.#endpoints.delete(id);
  }
}
