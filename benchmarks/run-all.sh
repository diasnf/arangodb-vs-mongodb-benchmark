#!/usr/bin/env bash
# Orquestra o benchmark completo: MongoDB (sempre) + ArangoDB (se este host for
# compatível; senão pula com instruções) e gera o relatório final comparando os
# dois em results/REPORT.md.
#
# Uso:
#   ./run-all.sh [opções]                     # mesmas opções pros dois alvos
#   ./run-all.sh [opções-mongo] -- [opções-arango]   # opções diferentes por alvo
#   ./run-all.sh --help
#
# As opções são as mesmas do run-target.sh (--count, --seed, --load-vus,
# --query-vus, --api-port, --skip-docker, etc — ./run-target.sh --help lista
# todas). Sem "--" na linha de comando, a mesma lista de opções vale pros dois
# bancos. Com "--", tudo antes é só do mongo e tudo depois é só do arango —
# útil por exemplo quando o arango roda em outra máquina (--skip-docker
# --base-url ...) enquanto o mongo roda local com docker, ou quando cada
# banco precisa de uma porta/escala de VUs diferente.
#
# --count/--seed/--force-regen são exceção: o dataset (seed/dataset.jsonl) é
# UM SÓ, compartilhado pelos dois bancos de propósito — é o que garante que a
# comparação é justa (mesmos dados nos dois lados). O primeiro alvo a rodar
# (mongo) gera o dataset; se você passar --count diferente pro arango depois
# do "--", ele é ignorado a menos que venha junto com --force-regen (e aí o
# mongo já rodou com o dataset anterior, então normalmente não é isso que
# você quer).
#
# Exemplos:
#   ./run-all.sh --count 200000
#   ./run-all.sh --api-port 3000 --query-vus 100 -- --api-port 3001 --query-vus 40
#   ./run-all.sh -- --skip-docker --base-url http://outra-maquina:3000

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  echo "Uso: run-all.sh [opções-mongo] [-- opções-arango]  — roda mongo e arango em sequência e gera results/REPORT.md"
  echo "Sem \"--\", as mesmas opções valem pros dois alvos. Com \"--\", separa opções por alvo."
  echo
  "$SCRIPT_DIR/run-target.sh" --help
  exit 0
fi

# Separa "$@" em dois grupos por um "--" literal: tudo antes é do mongo, tudo
# depois é do arango. Sem "--", os dois grupos ficam iguais (comportamento
# antigo, repassa tudo pros dois).
mongo_args=()
arango_args=()
sep_found=0
for arg in "$@"; do
  if [[ "$arg" == "--" && "$sep_found" == "0" ]]; then
    sep_found=1
    continue
  fi
  if [[ "$sep_found" == "0" ]]; then
    mongo_args+=("$arg")
  else
    arango_args+=("$arg")
  fi
done
if [[ "$sep_found" == "0" ]]; then
  arango_args=("${mongo_args[@]}")
fi

echo "=== Benchmark MongoDB ==="
"$SCRIPT_DIR/run-target.sh" mongo "${mongo_args[@]}"

echo
echo "=== Benchmark ArangoDB ==="
if ! "$SCRIPT_DIR/run-target.sh" arango "${arango_args[@]}"; then
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
