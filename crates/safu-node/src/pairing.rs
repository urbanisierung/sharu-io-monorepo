//! The copy-paste pairing code — byte-compatible with the web app's
//! `pairing.ts`. It bundles what a peer needs to both *reach* this node (the
//! transport address: Iroh endpoint id + home relay) and *trust* it (the signing
//! id, whose pubkey authorizes the peer's ops). Encoded as URL-safe base64
//! (no padding) of a small JSON object, ready to wrap in a QR code.

use data_encoding::BASE64URL_NOPAD;
use serde::{Deserialize, Serialize};

/// Everything a peer needs to link with another: its transport address and its
/// signing id. `relay_url` is optional only for completeness; a relay-routed
/// peer (the browser, or a node behind NAT) always carries one.
#[derive(Clone, Serialize, Deserialize)]
pub struct PairingInfo {
    pub id: String,
    #[serde(rename = "relayUrl", skip_serializing_if = "Option::is_none")]
    pub relay_url: Option<String>,
    #[serde(rename = "signId")]
    pub sign_id: String,
}

impl PairingInfo {
    /// Encode to the URL-safe base64 pairing code the web app accepts.
    pub fn encode(&self) -> String {
        let json = serde_json::to_vec(self).expect("serialize pairing info");
        BASE64URL_NOPAD.encode(&json)
    }

    /// Decode a pairing code produced by this node, a TS peer, or the web app.
    pub fn decode(code: &str) -> Result<Self, String> {
        let code = code.trim();
        let bytes = BASE64URL_NOPAD
            .decode(code.as_bytes())
            .map_err(|_| "pairing code: not base64url".to_string())?;
        let info: PairingInfo =
            serde_json::from_slice(&bytes).map_err(|e| format!("pairing code: {e}"))?;
        if info.id.is_empty() {
            return Err("pairing code: missing id".into());
        }
        if info.sign_id.is_empty() {
            return Err("pairing code: missing signing id".into());
        }
        Ok(info)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn round_trips() {
        let info = PairingInfo {
            id: "endpointid".into(),
            relay_url: Some("https://relay.example/".into()),
            sign_id: "abcdef".into(),
        };
        let decoded = PairingInfo::decode(&info.encode()).unwrap();
        assert_eq!(decoded.id, "endpointid");
        assert_eq!(decoded.relay_url.as_deref(), Some("https://relay.example/"));
        assert_eq!(decoded.sign_id, "abcdef");
    }

    #[test]
    fn decodes_web_app_shape() {
        // `btoa(JSON.stringify({id, signId, relayUrl}))`, url-safe, no padding —
        // exactly what `apps/web/src/pairing.ts` emits.
        let json = r#"{"id":"epid","signId":"sid","relayUrl":"https://r/"}"#;
        let code = BASE64URL_NOPAD.encode(json.as_bytes());
        let decoded = PairingInfo::decode(&code).unwrap();
        assert_eq!(decoded.id, "epid");
        assert_eq!(decoded.sign_id, "sid");
        assert_eq!(decoded.relay_url.as_deref(), Some("https://r/"));
    }

    #[test]
    fn rejects_garbage() {
        assert!(PairingInfo::decode("!!! not base64 !!!").is_err());
    }
}
