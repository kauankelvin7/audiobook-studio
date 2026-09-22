$ErrorActionPreference = 'Stop'
Push-Location (Join-Path $PSScriptRoot '../..')
cargo fmt --all -- --check
Pop-Location
