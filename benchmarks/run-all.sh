#!/usr/bin/env bash
# Orquestra o benchmark completo: MongoDB (sempre, roda localmente) + ArangoDB
# (só se este host tiver páginas de 4KB; senão pula com instruções) e gera o
# relatório final comparando os dois em results/REPORT.md.
#
# Uso:
#   ./run-all.sh
#
# Repassa as mesmas variáveis de ambiente do run-target.sh (COUNT, SEED,
# LOAD_MAX_VUS, VUS, DURATION, etc.) para ambos os alvos.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "=== Benchmark MongoDB ==="
"$SCRIPT_DIR/run-target.sh" mongo

echo
if [[ "$(getconf PAGESIZE)" == "4096" || "${SKIP_DOCKER:-0}" == "1" ]]; then
  echo "=== Benchmark ArangoDB ==="
  "$SCRIPT_DIR/run-target.sh" arango
else
  echo "=== Benchmark ArangoDB: PULADO ==="
  echo "Este host usa páginas de $(getconf PAGESIZE) bytes; a imagem oficial do ArangoDB"
  echo "não roda aqui (ver README.md). Rode em outra máquina:"
  echo "  1. copie este repositório (e benchmarks/seed/dataset.jsonl já gerado) pra lá"
  echo "  2. ./benchmarks/run-target.sh arango"
  echo "  3. copie de volta results/arango-load-summary.json e results/arango-query-summary.json"
  echo "  4. rode 'node $SCRIPT_DIR/report.js' de novo aqui para o relatório completo"
fi

echo
echo "=== Gerando relatório final ==="
node "$SCRIPT_DIR/report.js"
