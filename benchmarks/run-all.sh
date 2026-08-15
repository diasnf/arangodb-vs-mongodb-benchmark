#!/usr/bin/env bash
# Orquestra o benchmark completo: MongoDB (sempre) + ArangoDB (se este host for
# compatível; senão pula com instruções) e gera o relatório final comparando os
# dois em results/REPORT.md.
#
# Uso:
#   ./run-all.sh [opções]
#   ./run-all.sh --help
#
# Todas as opções são as mesmas do run-target.sh (--count, --seed, --load-vus,
# --query-vus, --api-port, etc.) e são repassadas para os dois alvos.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  echo "Uso: run-all.sh [opções]  — roda mongo e arango em sequência e gera results/REPORT.md"
  echo
  "$SCRIPT_DIR/run-target.sh" --help
  exit 0
fi

echo "=== Benchmark MongoDB ==="
"$SCRIPT_DIR/run-target.sh" mongo "$@"

echo
echo "=== Benchmark ArangoDB ==="
if ! "$SCRIPT_DIR/run-target.sh" arango "$@"; then
  echo
  echo "=== ArangoDB pulado neste host (ver mensagem de erro acima) ==="
  echo "Rode em outra máquina compatível:"
  echo "  1. copie este repositório (e benchmarks/seed/dataset.jsonl já gerado) pra lá"
  echo "  2. ./benchmarks/run-target.sh arango"
  echo "  3. copie de volta results/arango-load-summary.json e results/arango-query-summary.json"
  echo "  4. rode 'node $SCRIPT_DIR/report.js' de novo aqui para o relatório completo"
fi

echo
echo "=== Gerando relatório final ==="
node "$SCRIPT_DIR/report.js"
