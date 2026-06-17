# System Architecture Blueprint: Sharu Modernization (Project Safu)
## Context & Objective
This document outlines the architectural vision, technical specifications, and procedural execution roadmap for rewriting a decentralized, zero-knowledge data backup and synchronization platform. This blueprint is explicitly optimized for consumption by advanced autonomous software engineering agents, technical architects, and system orchestration models.

The primary objective is to replace legacy decentralized storage primitives (specifically 2019-era `js-ipfs` patterns, heavy Electron runtimes, and complex Distributed Hash Table overhead) with a highly optimized, local-first, native-feeling peer-to-peer delivery network.

---

## 1. Architectural Vision & Core Value Props

### 1.1 Direct QUIC-Driven P2P Networking
Legacy P2P storage solutions relied heavily on querying global Distributed Hash Tables (DHT) to resolve content addresses and discover routing paths. This introduced significant latency, connection fragility, and high CPU overhead behind strict symmetric NAT boundaries. 
* **The Modern Vision:** Replace content-routing discovery with direct node-to-node transport layer routing. By utilizing public keys directly as addresses and executing native QUIC transport streams, connection establishment transitions from an administrative network bottleneck to instant line-speed data transit.

### 1.2 Multi-Runtime Runtime Parity (Web & Native)
The modern execution target demands that cryptographic operations and network orchestration are decoupled from individual runtime environments. The core logic must be compiled to execute seamlessly in both low-privilege sandboxed browser spaces (Web App) and high-privilege operating system environments (Desktop App) without duplicating the business logic.

### 1.3 Zero-Knowledge, Streaming Local-First Cryptography
Security must be completely decoupled from storage infrastructure. All data assets are transformed into cryptographically opaque blocks before entering any transmission pipeline.
* **Stream Slicing:** Data ingestion handles multi-gigabyte structures by processing them via asynchronous stream pipelines rather than inflating memory buffers.
* **Invisible Synchronization:** Data persistence is treated as an operational background layer. The system writes state immediately to native or browser-contained storage targets, allowing synchronization engines to handle network replication out-of-band and out-of-sight.

---

## 2. Technical Stack Specification

### 2.1 Workspace & Repository Topology
The project is structured as a strictly typed, uniform package-managed monorepo utilizing `pnpm`. This guarantees rigorous separation of concerns, rapid builds, and shared internal utilities.

* `apps/web/`: A client-side Single Page Application utilizing a modern, compiler-optimized frontend engine (e.g., Vite, TypeScript, Tailwind) to serve as the user interface layer.
* `apps/desktop/`: A native system wrapper utilizing a memory-safe system-interface framework (e.g., Tauri 2.0) that injects the web interface while running a low-footprint background system service.
* `packages/crypto/`: A standalone cryptographic package compiled to target both Web Crypto API bindings and hardware-accelerated system modules.
* `packages/sdk/`: The core abstraction layer managing state machine routing, data ingestion pipelines, and P2P synchronization primitives.

### 2.2 Network & Transport Layer Engine
* **Protocol Selection:** Driven by next-generation P2P data engines built in Rust (such as Iroh) that focus on direct block transfer (`iroh-blobs`) and structured state synchronization (`iroh-docs`).
* **Web Runtime Transport:** Utilizes WebRTC data channels for browser-to-browser interactions and WebTransport (QUIC-based) over TLS-secured connections for browser-to-server relay routing.
* **Native Runtime Transport:** Operates via direct UDP hole-punching, utilizing STUN/TURN primitives or automated network relay networks (DERP/Relay infrastructure) exclusively when strict symmetric NAT configurations prevent direct puncture.

### 2.3 Storage & Persistence Primitives
* **Sandboxed Browser Storage:** Utilizes the Origin Private File System (OPFS) via the standard File System Access API. This provides access to an optimized, high-throughput private filesystem pool that bypasses standard storage limits and prevents browser engine throttling.
* **Native Host Storage:** Direct file handle operations managed via the desktop core layer, ensuring arbitrary read/write access to localized file structures and system tracking folders.

### 2.4 Cryptographic Profile
* **Cipher Suites:** End-to-end data packet payload encryption utilizing AES-256-GCM or native `age` (Actual Good Encryption) schemas.
* **Key Derivation:** Cryptographic master keys are derived exclusively client-side via computationally intensive stretching functions such as PBKDF2 or Argon2id with cryptographically secure salt components.
* **Block Serialization:** Ingested payloads are segmented into discrete blocks validated using high-speed BLAKE3 cryptographic hashes. This guarantees absolute data integrity verification at the block level before transmission or compilation.

---

## 3. Detailed Execution Roadmap

### Phase 1: Cryptographic Pipeline & Local Storage Layer
The primary objective of this phase is to construct an isolated data asset pipeline that can ingest, partition, encrypt, and verify files entirely within local machine contexts.

1. **Establish Monorepo Scaffold:** Configure the workspace topology with zero-hoisting lockfiles, strict TypeScript enforcement, and cross-compilation pipeline targets.
2. **Develop Cryptographic Block Engine:** Implement the asynchronous stream chunking system. The engine must accept input streams, divide them into uniform blocks, calculate BLAKE3 fingerprints, and encrypt individual blocks using AES-GCM.
3. **Integrate Local Storage Interfaces:** Build an abstraction layer matching OPFS interfaces on web targets and native OS file access vectors on desktop targets.
4. **Validate Round-Trip Ingestion:** Create automated validation tests that stream a multi-gigabyte test payload through the ingestion layer, write encrypted chunks to local storage, reconstruct them via a decryption stream, and verify absolute hash parity with the original artifact.

### Phase 2: Web App Deployment & P2P Synchronization
The objective of this phase is to extend the localized application into a network-aware web client running within strict browser sandbox networking boundaries.

1. **Inject Assembly Network Bindings:** Compile the core P2P client libraries down to WebAssembly (WASM) and load them inside a Web Worker thread or standard app shell context.
2. **Establish Pair-Wise Discovery Architecture:** Implement a cryptographic handshake pattern. Devices introduce themselves via ephemeral key exchange signatures mapped onto relay servers.
3. **Execute Document Sync Engine:** Integrate automated tracking documents that manage the file allocation tables. Changes in local state tables are broadcast to paired peers via synchronization channels.
4. **Deploy Gateway Transfer Verification:** Validate an end-to-end browser-to-browser transfer where an asset dropped into one isolated browser tab is chunked, encrypted, signaled via relay, pulled by a peer web tab, and compiled without human configuration intervention.

### Phase 3: Tauri Desktop Wrapper & Persistence Services
The final phase lifts network communication out of browser constraints, providing continuous background execution, automated filesystem indexing, and optimized UDP hole-punching.

1. **Configure Desktop Shell Project:** Wrap the shared web frontend engine inside a native desktop core application utilizing Tauri 2.0.
2. **Port Core Network Engine to Native Space:** Migrate the network transport tasks out of WebAssembly layers and execute them inside the native operating system environment. 
3. **Implement OS Intrusive Features:** Build background operating system tray icons, launch-on-boot configuration profiles, and local file system event watchers that monitor targeted sync folders for mutations.
4. **Validate Cross-Runtime Replication Topology:** Perform the complete multi-device benchmark loop. A user drops a file into a web browser application interface on a restricted mobile data network, the browser encrypts it and passes it via a TLS relay, and the native desktop client running on a home local network picks up the payload instantly via direct UDP hole-punching, saving it permanently as an automated, zero-knowledge backup block.

---

## 4. Agent Operations & Constraints

When executing this codebase expansion, autonomous agents must adhere to the following strict boundaries:

* **Memory Budgets:** Never stream raw files directly into memory buffers. Use streaming pipelines exclusively for cryptographic block transformations.
* **Dependency Auditing:** Avoid importing heavy external dependencies or crypto wrappers. Rely strictly on platform-native web cryptography or highly performant native compiled crates.
* **State Machine Consistency:** All state synchronizations must treat conflict resolution deterministically via state documents, completely decoupled from networking transport states.