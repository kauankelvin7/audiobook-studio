# ADR 0003 — Fronteira WASM

Status: accepted

O crate WASM é uma fachada pequena sobre o core. A serialização e os contratos entre TypeScript e Rust são versionados; lógica de UI não é duplicada no WASM. A fachada expõe apenas operações de domínio necessárias ao Web, como validação de DocumentIR v2, construção de ContentModel/SemanticOutline e validação de NarrativePlan.
