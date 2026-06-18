// The single transport contract shared by every runtime (plan §2.1).
//
// Channels are message-oriented: each `send` delivers one discrete, ordered,
// reliable frame to the peer. The Iroh bindings length-prefix frames over a
// QUIC bi-stream; the in-process loopback hands the buffer over directly. The
// SDK builds its request/response protocols (doc-sync deltas, block transfer)
// on top of framed messages and never sees Iroh or WASM details.

/** A peer's stable identity: the Iroh endpoint id (Ed25519 public key) as a
 *  z-base-32 string. Public keys are addresses (blueprint §1.1). */
export type PeerId = string;

/** A dialable peer: its id plus the home relay that rendezvous routes through.
 *  In the browser everything is relayed; `relayUrl` is required there. */
export interface PeerAddr {
  id: PeerId;
  relayUrl?: string;
}

/** A bidirectional, ordered, reliable message channel to one peer. */
export interface Channel {
  /** The authenticated identity of the peer on the other end. The transport
   *  guarantees this — the SDK uses it for write-authorization (plan §2.3). */
  readonly peer: PeerId;
  /** Deliver one frame. Resolves once the frame is handed to the transport. */
  send(message: Uint8Array): Promise<void>;
  /** Inbound frames in order, until the channel closes (then the iterator ends). */
  messages(): AsyncIterableIterator<Uint8Array>;
  close(): Promise<void>;
}

/** A runtime-agnostic P2P endpoint. */
export interface Transport {
  /** This endpoint's peer id. */
  id(): PeerId;
  /** This endpoint's dialable address (id + home relay). */
  addr(): PeerAddr;
  /** Dial `peer` and open a channel tagged with `protocol` (an ALPN). */
  connect(peer: PeerAddr, protocol: string): Promise<Channel>;
  /** Inbound channels opened by remote peers for `protocol`, until close. */
  accept(protocol: string): AsyncIterableIterator<Channel>;
  close(): Promise<void>;
}
