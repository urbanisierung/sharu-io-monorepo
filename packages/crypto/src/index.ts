// M0 scaffold. The streaming chunk → hash → encrypt engine (plan §1.2) lands in
// M1, backed by the `safu-crypto` crate compiled to WASM via `pnpm build:wasm`.
//
// Planned public API (M1):
//   createIngestStream(input: ReadableStream, passphrase: string): AsyncIterable<EncryptedBlock>
//   createEgressStream(blocks: AsyncIterable<EncryptedBlock>, passphrase: string): ReadableStream
export const CRYPTO_PACKAGE = '@safu/crypto';
