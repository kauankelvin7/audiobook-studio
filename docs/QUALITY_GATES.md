# Quality gates

Gates obrigatórios quando as ferramentas existirem no ambiente:

```text
cargo fmt --all -- --check
cargo test --workspace
cd apps/web && npm run typecheck
cd apps/web && npm run build
```

Falhas de ferramenta ausente devem ser registradas como `BLOCKED_TOOLING`, não convertidas em sucesso.
