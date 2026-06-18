// M0 scaffold. Iroh bindings (plan §2.1) land in M2, backed by the
// `safu-transport` crate compiled to WASM via `pnpm build:wasm`.
//
// Browser transport is relay-only via WebSocket through the Iroh n0.computer
// relay network; direct UDP hole-punching is desktop-only (plan §3.2). Both
// runtimes sit behind one TS interface defined here in M2.
export const TRANSPORT_PACKAGE = '@safu/transport';
