//! Browser binding: an Iroh endpoint and bidirectional, length-prefixed message
//! channels exposed to JavaScript (plan §2.1). Runs relay-only over WebSocket
//! through the n0.computer relay network. The TypeScript `IrohTransport`
//! (`packages/transport/src/iroh.ts`) wraps these into the `Transport` interface.
//!
//! Exported async methods return `Promise`s rather than being `async fn`s: a
//! wasm-bindgen `async fn` may not borrow `self`, so each method captures cloned
//! handles and drives an owned future via `future_to_promise`. Streams are not
//! `Clone`, so they live in `Rc<RefCell<Option<…>>>` and are taken out for the
//! duration of each await (sound on the single-threaded wasm executor).

use std::cell::RefCell;
use std::rc::Rc;
use std::str::FromStr;

use iroh::endpoint::{presets, RecvStream, SendStream};
use iroh::{Endpoint, EndpointAddr, EndpointId, RelayUrl};
use js_sys::Promise;
use wasm_bindgen::prelude::*;
use wasm_bindgen_futures::future_to_promise;

fn err(e: impl std::fmt::Display) -> JsValue {
    JsValue::from_str(&e.to_string())
}

/// A relay-only Iroh endpoint advertising one or more protocols (ALPNs).
#[wasm_bindgen]
pub struct IrohEndpoint {
    ep: Endpoint,
}

#[wasm_bindgen]
impl IrohEndpoint {
    /// Bind an endpoint advertising `protocols`. Resolves to an `IrohEndpoint`.
    pub fn create(protocols: Vec<String>) -> Promise {
        future_to_promise(async move {
            let alpns: Vec<Vec<u8>> = protocols.iter().map(|p| p.as_bytes().to_vec()).collect();
            let ep = Endpoint::builder(presets::N0)
                .alpns(alpns)
                .bind()
                .await
                .map_err(err)?;
            Ok(JsValue::from(IrohEndpoint { ep }))
        })
    }

    /// This endpoint's id (Ed25519 public key) as a z-base-32 string.
    #[wasm_bindgen(getter)]
    pub fn id(&self) -> String {
        self.ep.id().to_string()
    }

    /// The home relay URL once assigned (empty until the relay connection is up).
    #[wasm_bindgen(getter, js_name = relayUrl)]
    pub fn relay_url(&self) -> Option<String> {
        self.ep.addr().relay_urls().next().map(|u| u.to_string())
    }

    /// Resolve once the endpoint has selected a home relay (is "online"),
    /// returning its URL. `addr()`/`relayUrl` only include the relay after this.
    pub fn online(&self) -> Promise {
        let ep = self.ep.clone();
        future_to_promise(async move {
            ep.online().await;
            let url = ep.addr().relay_urls().next().map(|u| u.to_string());
            Ok(url.map_or(JsValue::NULL, |u| JsValue::from_str(&u)))
        })
    }

    /// Dial `peer` (id + relay URL) and open a bi-stream tagged `protocol`.
    pub fn connect(&self, peer: String, relay: String, protocol: String) -> Promise {
        let ep = self.ep.clone();
        future_to_promise(async move {
            let id = EndpointId::from_str(&peer).map_err(err)?;
            let relay_url = RelayUrl::from_str(&relay).map_err(err)?;
            let addr = EndpointAddr::new(id).with_relay_url(relay_url);
            let conn = ep.connect(addr, protocol.as_bytes()).await.map_err(err)?;
            let remote = conn.remote_id().to_string();
            let (send, recv) = conn.open_bi().await.map_err(err)?;
            Ok(JsValue::from(IrohChannel::new(remote, protocol, send, recv)))
        })
    }

    /// Accept the next inbound channel (any advertised protocol), or null once
    /// the endpoint stops accepting. The caller routes by the channel's protocol.
    pub fn accept(&self) -> Promise {
        let ep = self.ep.clone();
        future_to_promise(async move {
            let Some(incoming) = ep.accept().await else {
                return Ok(JsValue::NULL);
            };
            let conn = incoming.await.map_err(err)?;
            let protocol = String::from_utf8_lossy(conn.alpn()).into_owned();
            let remote = conn.remote_id().to_string();
            let (send, recv) = conn.accept_bi().await.map_err(err)?;
            Ok(JsValue::from(IrohChannel::new(remote, protocol, send, recv)))
        })
    }
}

/// One bidirectional channel: length-prefixed frames over an Iroh bi-stream.
#[wasm_bindgen]
pub struct IrohChannel {
    peer: String,
    protocol: String,
    send: Rc<RefCell<Option<SendStream>>>,
    recv: Rc<RefCell<Option<RecvStream>>>,
}

impl IrohChannel {
    fn new(peer: String, protocol: String, send: SendStream, recv: RecvStream) -> Self {
        Self {
            peer,
            protocol,
            send: Rc::new(RefCell::new(Some(send))),
            recv: Rc::new(RefCell::new(Some(recv))),
        }
    }
}

#[wasm_bindgen]
impl IrohChannel {
    /// The authenticated id of the peer on the other end.
    #[wasm_bindgen(getter)]
    pub fn peer(&self) -> String {
        self.peer.clone()
    }

    /// The protocol (ALPN) this channel was opened for.
    #[wasm_bindgen(getter)]
    pub fn protocol(&self) -> String {
        self.protocol.clone()
    }

    /// Send one frame: a big-endian u32 length prefix followed by `data`.
    pub fn send(&self, data: Vec<u8>) -> Promise {
        let cell = self.send.clone();
        future_to_promise(async move {
            let mut stream = cell.borrow_mut().take().ok_or_else(|| err("channel closed"))?;
            let len = (data.len() as u32).to_be_bytes();
            let result = async {
                stream.write_all(&len).await?;
                stream.write_all(&data).await
            }
            .await;
            *cell.borrow_mut() = Some(stream);
            result.map_err(err)?;
            Ok(JsValue::UNDEFINED)
        })
    }

    /// Receive the next frame as a `Uint8Array`, or null once the channel ends.
    pub fn recv(&self) -> Promise {
        let cell = self.recv.clone();
        future_to_promise(async move {
            let mut stream = cell.borrow_mut().take().ok_or_else(|| err("channel closed"))?;
            let frame: Result<Option<Vec<u8>>, JsValue> = async {
                let mut len = [0u8; 4];
                if stream.read_exact(&mut len).await.is_err() {
                    return Ok(None);
                }
                let n = u32::from_be_bytes(len) as usize;
                let mut buf = vec![0u8; n];
                stream.read_exact(&mut buf).await.map_err(err)?;
                Ok(Some(buf))
            }
            .await;
            *cell.borrow_mut() = Some(stream);
            match frame? {
                Some(buf) => Ok(JsValue::from(js_sys::Uint8Array::from(buf.as_slice()))),
                None => Ok(JsValue::NULL),
            }
        })
    }

    /// Finish the send side and drop the receive side.
    pub fn close(&self) -> Promise {
        let send = self.send.clone();
        let recv = self.recv.clone();
        future_to_promise(async move {
            if let Some(mut stream) = send.borrow_mut().take() {
                let _ = stream.finish();
            }
            let _ = recv.borrow_mut().take();
            Ok(JsValue::UNDEFINED)
        })
    }
}
