# ADR 0003 — Fronteira WASM

Status: accepted

O crate WASM será uma fachada pequena sobre o core. A serialização e os contratos entre TypeScript e Rust serão versionados; lógica de UI não será duplicada no WASM.
