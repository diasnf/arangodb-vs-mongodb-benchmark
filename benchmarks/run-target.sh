#!/usr/bin/env bash
# Automatiza o benchmark completo de UM alvo (mongo ou arango):
# gera dataset (se preciso) -> sobe docker -> semeia -> roda k6 (carga + consulta) -> derruba docker.
#
# Uso:
#   ./run-target.sh mongo
#   ./run-target.sh arango
#
# Variáveis de ambiente (todas opcionais):
#   COUNT              Tamanho do dataset a gerar se benchmarks/seed/dataset.jsonl não existir (default 20000)
#   SEED               Seed do gerador determinístico (default 42)
#   FORCE_REGEN=1      Força regerar o dataset mesmo se já existir
#   SKIP_DOCKER=1      Não gerencia docker compose localmente (assume API já rodando em BASE_URL)
#   BASE_URL           URL da API (default http://localhost:3000)
#   SKIP_PAGE_CHECK=1  Pula a checagem de page size de 4KB (necessária pro ArangoDB rodar)
#   LOAD_MAX_VUS, LOAD_RAMP_UP, LOAD_PLATEAU   Repassados ao load-test.js
#   VUS, DURATION                              Repassados ao query-concurrency-test.js
#   QUERY_DATA_INICIO, QUERY_DATA_FIM          Janela de data usada nos testes de leitura

set -euo pipefail

TARGET="${1:-}"
if [[ "$TARGET" != "mongo" && "$TARGET" != "arango" ]]; then
  echo "Uso: $0 <mongo|arango>" >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
API_DIR="$ROOT_DIR/api-$TARGET"
RESULTS_DIR="$ROOT_DIR/results"
mkdir -p "$RESULTS_DIR"

COUNT="${COUNT:-20000}"
SEED="${SEED:-42}"
BASE_URL="${BASE_URL:-http://localhost:3000}"
QUERY_DATA_INICIO="${QUERY_DATA_INICIO:-2022-01-01T00:00:00.000Z}"
QUERY_DATA_FIM="${QUERY_DATA_FIM:-2030-01-01T00:00:00.000Z}"

log() { echo "[$TARGET] $*"; }

# Detecta se precisa de sudo pra falar com o docker daemon (ex: usuário fora do grupo docker).
DOCKER_CMD=(docker)
if [[ "${SKIP_DOCKER:-0}" != "1" ]] && ! docker info > /dev/null 2>&1; then
  if sudo -n docker info > /dev/null 2>&1; then
    DOCKER_CMD=(sudo -n docker)
  fi
fi

if [[ "$TARGET" == "arango" && "${SKIP_DOCKER:-0}" != "1" && "${SKIP_PAGE_CHECK:-0}" != "1" ]]; then
  PAGESIZE="$(getconf PAGESIZE)"
  if [[ "$PAGESIZE" != "4096" ]]; then
    echo "[$TARGET] ERRO: este host usa páginas de ${PAGESIZE} bytes; a imagem oficial do ArangoDB" >&2
    echo "[$TARGET] trava (jemalloc segfault) em kernels sem páginas de 4096 bytes (ex: Raspberry Pi 5)." >&2
    echo "[$TARGET] Rode este script em outra máquina, ou use SKIP_DOCKER=1 + BASE_URL apontando pra lá." >&2
    exit 1
  fi
fi

cd "$ROOT_DIR/benchmarks"

if [[ ! -f seed/dataset.jsonl || "${FORCE_REGEN:-0}" == "1" ]]; then
  log "gerando dataset (COUNT=$COUNT SEED=$SEED)..."
  COUNT="$COUNT" SEED="$SEED" node seed/generate.js
else
  log "dataset já existe (seed/dataset.jsonl), pulando geração. Use FORCE_REGEN=1 para regerar."
fi

if [[ "${SKIP_DOCKER:-0}" != "1" ]]; then
  log "subindo docker compose ($API_DIR)..."
  (cd "$API_DIR" && "${DOCKER_CMD[@]}" compose up --build -d)

  log "aguardando /health em $BASE_URL..."
  for i in $(seq 1 60); do
    if curl -sf "$BASE_URL/health" > /dev/null 2>&1; then
      log "API respondendo."
      break
    fi
    if [[ "$i" == "60" ]]; then
      echo "[$TARGET] ERRO: API não respondeu em $BASE_URL/health após 60s" >&2
      (cd "$API_DIR" && "${DOCKER_CMD[@]}" compose logs --tail 50)
      exit 1
    fi
    sleep 1
  done
fi

log "semeando banco..."
if [[ "$TARGET" == "mongo" ]]; then
  MONGO_URL="${MONGO_URL:-mongodb://localhost:27017}" MONGO_DB="${MONGO_DB:-benchmark}" node seed/seed.mongo.js
else
  ARANGO_URL="${ARANGO_URL:-http://localhost:8529}" ARANGO_DB="${ARANGO_DB:-benchmark}" \
    ARANGO_USER="${ARANGO_USER:-root}" ARANGO_PASSWORD="${ARANGO_PASSWORD:-benchmark}" node seed/seed.arango.js
fi

log "rodando teste de carga (load-test.js)..."
k6 run k6/load-test.js \
  -e BASE_URL="$BASE_URL" \
  -e QUERY_DATA_INICIO="$QUERY_DATA_INICIO" \
  -e QUERY_DATA_FIM="$QUERY_DATA_FIM" \
  ${LOAD_MAX_VUS:+-e LOAD_MAX_VUS="$LOAD_MAX_VUS"} \
  ${LOAD_RAMP_UP:+-e LOAD_RAMP_UP="$LOAD_RAMP_UP"} \
  ${LOAD_PLATEAU:+-e LOAD_PLATEAU="$LOAD_PLATEAU"} \
  --summary-export="$RESULTS_DIR/$TARGET-load-summary.json" \
  2>&1 | tee "$RESULTS_DIR/$TARGET-load.log"

log "rodando teste de consulta em concorrência (query-concurrency-test.js)..."
k6 run k6/query-concurrency-test.js \
  -e BASE_URL="$BASE_URL" \
  -e QUERY_DATA_INICIO="$QUERY_DATA_INICIO" \
  -e QUERY_DATA_FIM="$QUERY_DATA_FIM" \
  ${VUS:+-e VUS="$VUS"} \
  ${DURATION:+-e DURATION="$DURATION"} \
  --summary-export="$RESULTS_DIR/$TARGET-query-summary.json" \
  2>&1 | tee "$RESULTS_DIR/$TARGET-query.log"

if [[ "${SKIP_DOCKER:-0}" != "1" ]]; then
  log "derrubando docker compose..."
  (cd "$API_DIR" && "${DOCKER_CMD[@]}" compose down -v)
fi

log "concluído. Resultados em $RESULTS_DIR/$TARGET-{load,query}-summary.json"
