#!/usr/bin/env bash
# Derruba containers/volumes/redes das duas stacks de benchmark (api-mongo e
# api-arango), mesmo que não estejam rodando agora. Útil pra garantir um
# estado limpo antes de uma rodada nova, liberar espaço em disco, ou recuperar
# de uma execução que travou/foi morta à força (kill -9, queda de energia).
#
# Uso:
#   ./clean.sh          # só docker: containers, volumes e redes das duas stacks
#   ./clean.sh --all    # docker + dataset gerado + resultados + k6 baixado
#   ./clean.sh --help

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  cat <<'EOF'
Uso: clean.sh [--all]

Sem opção: derruba containers, volumes e redes docker das duas stacks
(bench-mongo-net / bench-arango-net), mesmo que já não estejam rodando.
Idempotente — pode rodar quantas vezes quiser, não dá erro se já estiver limpo.

--all: além do docker, também apaga:
  - benchmarks/seed/dataset.jsonl e dataset-info.json (dataset gerado)
  - results/*.json e results/*.log (summaries e logs brutos do k6)
  - benchmarks/.bin/ (binário do k6 baixado automaticamente)
  results/REPORT.md NÃO é apagado — é o relatório final, versionado no repo.
EOF
  exit 0
fi

# Detecta se precisa de sudo pra falar com o docker daemon (mesma lógica do run-target.sh).
DOCKER_CMD=(docker)
if ! docker info > /dev/null 2>&1; then
  if sudo -n docker info > /dev/null 2>&1; then
    DOCKER_CMD=(sudo -n docker)
  fi
fi

for target in mongo arango; do
  api_dir="$ROOT_DIR/api-$target"
  echo "[$target] derrubando containers/volumes/rede..."
  (cd "$api_dir" && "${DOCKER_CMD[@]}" compose down -v --remove-orphans) || true
done

if [[ "${1:-}" == "--all" ]]; then
  echo "Limpando dataset gerado, resultados e k6 baixado..."
  rm -f "$ROOT_DIR/benchmarks/seed/dataset.jsonl" "$ROOT_DIR/benchmarks/seed/dataset-info.json"
  rm -f "$ROOT_DIR/results/"*.json "$ROOT_DIR/results/"*.log 2>/dev/null || true
  rm -rf "$ROOT_DIR/benchmarks/.bin"
fi

echo "OK: ambiente limpo."
