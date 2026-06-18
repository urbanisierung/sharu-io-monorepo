# Vision

The vision is described in document docs/sharu_modernization_blueprint.md - this must be studied, learned and understood. It's about building a modern version of https://github.com/sharu-io.

Tech stack: monorepo, typescript, vite+, preact, pnpm, signals everywhere (`@preact/signals-core` for SDK/domain state, `@preact/signals` for view state — no Zustand)
Only external dependencies if really needed and useful and reasonable, and only the latest versions of everything.

Add "Phase 3" to CLAUDE.md with the specialized part of this repo.