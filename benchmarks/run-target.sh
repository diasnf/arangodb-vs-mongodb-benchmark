#!/usr/bin/env bash
# Automatiza o benchmark completo de UM alvo (mongo ou arango):
# gera dataset (se preciso) -> sobe docker -> semeia -> roda k6 (carga + consulta) -> derruba docker.
#
# O banco (mongo/arangodb) não expõe porta no host — fica só na rede docker isolada
# da própria stack (bench-mongo-net / bench-arango-net), então não conflita com um
# Mongo/Arango que já esteja rodando na máquina. O seed roda de dentro do container
# da API (via "docker compose exec"), que enxerga o banco pelo nome de serviço interno.
# Só a API fica publicada no host (porta --api-port, default 3000), pra o k6 alcançar.
#
# Uso:
#   ./run-target.sh mongo [opções]
#   ./run-target.sh arango [opções]
#   ./run-target.sh --help

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

print_usage() {
  cat <<'EOF'
Uso: run-target.sh <mongo|arango> [opções]

Dataset
  --count N             Nº de notas no dataset gerado, se ainda não existir (default: 20000)
  --seed N              Seed do gerador determinístico (default: 42)
  --force-regen         Regera o dataset mesmo se seed/dataset.jsonl já existir

Rede / execução
  --api-port N          Porta do host publicada para a API (default: 3000) — mude se já estiver em uso
  --base-url URL        URL da API a testar (default: http://localhost:<api-port>)
  --skip-docker         Não gerencia docker compose localmente (assume API já acessível
                         em --base-url, e banco acessível via --mongo-url/--arango-url)
  --skip-page-check     Pula a checagem de page size de 4KB (necessária pro ArangoDB rodar)

Teste de carga (load-test.js)
  --load-vus N          VUs no pico da rampa (default do script: 50)
  --load-ramp-up DUR    Duração da subida até o pico, ex: 30s, 1m (default: 20s)
  --load-plateau DUR    Duração no pico antes de descer (default: 40s)

Teste de consulta em concorrência (query-concurrency-test.js)
  --query-vus N         VUs constantes (default do script: 50)
  --query-duration DUR  Duração do teste, ex: 1m, 2m (default: 30s)

Janela de data usada nas leituras (default cobre 2022–2030, qualquer dataset cabe nisso)
  --data-inicio DATA    ISO 8601, ex: 2022-01-01T00:00:00.000Z
  --data-fim DATA       ISO 8601

Conexão manual com o banco (só relevante com --skip-docker)
  --mongo-url URL, --mongo-db NOME
  --arango-url URL, --arango-db NOME, --arango-user NOME, --arango-password SENHA

  -h, --help            Mostra esta ajuda

Exemplos:
  ./run-target.sh mongo --count 200000 --load-vus 150 --query-vus 150 --query-duration 2m
  ./run-target.sh arango --api-port 3001
  BASE_URL=http://10.0.0.5:3000 ./run-target.sh arango --skip-docker   # env vars também funcionam
EOF
}

TARGET="${1:-}"
if [[ "$TARGET" == "-h" || "$TARGET" == "--help" ]]; then
  print_usage
  exit 0
fi
if [[ "$TARGET" != "mongo" && "$TARGET" != "arango" ]]; then
  echo "Uso: $0 <mongo|arango> [opções]  (--help pra ver todas as opções)" >&2
  exit 1
fi
shift

# Defaults (env var, se setada, vira o default — uma flag na linha de comando
# tem sempre a palavra final).
COUNT="${COUNT:-20000}"
SEED="${SEED:-42}"
FORCE_REGEN="${FORCE_REGEN:-0}"
API_PORT="${API_PORT:-3000}"
BASE_URL="${BASE_URL:-}"
SKIP_DOCKER="${SKIP_DOCKER:-0}"
SKIP_PAGE_CHECK="${SKIP_PAGE_CHECK:-0}"
LOAD_MAX_VUS="${LOAD_MAX_VUS:-}"
LOAD_RAMP_UP="${LOAD_RAMP_UP:-}"
LOAD_PLATEAU="${LOAD_PLATEAU:-}"
VUS="${VUS:-}"
DURATION="${DURATION:-}"
QUERY_DATA_INICIO="${QUERY_DATA_INICIO:-2022-01-01T00:00:00.000Z}"
QUERY_DATA_FIM="${QUERY_DATA_FIM:-2030-01-01T00:00:00.000Z}"
MONGO_URL="${MONGO_URL:-}"
MONGO_DB="${MONGO_DB:-}"
ARANGO_URL="${ARANGO_URL:-}"
ARANGO_DB="${ARANGO_DB:-}"
ARANGO_USER="${ARANGO_USER:-}"
ARANGO_PASSWORD="${ARANGO_PASSWORD:-}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --count) COUNT="$2"; shift 2 ;;
    --seed) SEED="$2"; shift 2 ;;
    --force-regen) FORCE_REGEN=1; shift ;;
    --api-port) API_PORT="$2"; shift 2 ;;
    --base-url) BASE_URL="$2"; shift 2 ;;
    --skip-docker) SKIP_DOCKER=1; shift ;;
    --skip-page-check) SKIP_PAGE_CHECK=1; shift ;;
    --load-vus) LOAD_MAX_VUS="$2"; shift 2 ;;
    --load-ramp-up) LOAD_RAMP_UP="$2"; shift 2 ;;
    --load-plateau) LOAD_PLATEAU="$2"; shift 2 ;;
    --query-vus) VUS="$2"; shift 2 ;;
    --query-duration) DURATION="$2"; shift 2 ;;
    --data-inicio) QUERY_DATA_INICIO="$2"; shift 2 ;;
    --data-fim) QUERY_DATA_FIM="$2"; shift 2 ;;
    --mongo-url) MONGO_URL="$2"; shift 2 ;;
    --mongo-db) MONGO_DB="$2"; shift 2 ;;
    --arango-url) ARANGO_URL="$2"; shift 2 ;;
    --arango-db) ARANGO_DB="$2"; shift 2 ;;
    --arango-user) ARANGO_USER="$2"; shift 2 ;;
    --arango-password) ARANGO_PASSWORD="$2"; shift 2 ;;
    -h|--help) print_usage; exit 0 ;;
    *) echo "Opção desconhecida: $1 (--help pra ver as opções)" >&2; exit 1 ;;
  esac
done

if ! [[ "$COUNT" =~ ^[0-9]+$ && "$COUNT" -gt 0 ]]; then
  echo "ERRO: --count precisa ser um inteiro positivo (recebido: '$COUNT')" >&2
  exit 1
fi
if ! [[ "$SEED" =~ ^[0-9]+$ ]]; then
  echo "ERRO: --seed precisa ser um inteiro (recebido: '$SEED')" >&2
  exit 1
fi

export API_PORT
BASE_URL="${BASE_URL:-http://localhost:$API_PORT}"

ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
API_DIR="$ROOT_DIR/api-$TARGET"
RESULTS_DIR="$ROOT_DIR/results"
mkdir -p "$RESULTS_DIR"

log() { echo "[$TARGET] $*"; }

# Garante um binário do k6 utilizável, sem depender do gerenciador de pacotes do host:
# usa o k6 do PATH se existir, senão baixa o binário oficial (release do GitHub) pra
# benchmarks/.bin/k6 — não precisa de root e fica em cache pras próximas execuções.
ensure_k6() {
  if command -v k6 > /dev/null 2>&1; then
    K6_BIN="k6"
    return
  fi

  local bin_dir="$SCRIPT_DIR/.bin"
  if [[ -x "$bin_dir/k6" ]]; then
    K6_BIN="$bin_dir/k6"
    return
  fi

  echo "[$TARGET] k6 não encontrado no PATH; tentando baixar o binário oficial..." >&2

  local os arch
  os="$(uname -s)"
  case "$(uname -m)" in
    x86_64|amd64) arch="amd64" ;;
    aarch64|arm64) arch="arm64" ;;
    *) arch="" ;;
  esac

  if [[ "$os" != "Linux" || -z "$arch" ]]; then
    echo "[$TARGET] ERRO: não sei baixar o k6 automaticamente para $os/$(uname -m)." >&2
    echo "[$TARGET] Instale manualmente (https://k6.io/docs/get-started/installation/) e rode de novo." >&2
    exit 1
  fi

  local tag url tmp_dir
  tag="$(curl -sf https://api.github.com/repos/grafana/k6/releases/latest | grep -o '"tag_name": *"[^"]*"' | head -1 | cut -d'"' -f4)"
  if [[ -z "$tag" ]]; then
    echo "[$TARGET] ERRO: não consegui descobrir a versão mais recente do k6 (sem internet?)." >&2
    echo "[$TARGET] Instale manualmente (https://k6.io/docs/get-started/installation/) e rode de novo." >&2
    exit 1
  fi

  url="https://github.com/grafana/k6/releases/download/${tag}/k6-${tag}-linux-${arch}.tar.gz"
  tmp_dir="$(mktemp -d)"
  trap 'rm -rf "$tmp_dir"' RETURN

  if ! curl -sfL "$url" -o "$tmp_dir/k6.tar.gz"; then
    echo "[$TARGET] ERRO: falha ao baixar $url" >&2
    echo "[$TARGET] Instale manualmente (https://k6.io/docs/get-started/installation/) e rode de novo." >&2
    exit 1
  fi

  mkdir -p "$bin_dir"
  tar -xzf "$tmp_dir/k6.tar.gz" -C "$tmp_dir"
  find "$tmp_dir" -maxdepth 2 -type f -name k6 -exec mv {} "$bin_dir/k6" \;
  chmod +x "$bin_dir/k6"

  log "k6 $tag instalado em $bin_dir/k6"
  K6_BIN="$bin_dir/k6"
}

ensure_k6

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
    echo "[$TARGET] trava (jemalloc segfault) em kernels sem páginas de 4096 bytes (comum em alguns kernels ARM64)." >&2
    echo "[$TARGET] Rode este script em outra máquina, ou use SKIP_DOCKER=1 + BASE_URL apontando pra lá." >&2
    exit 1
  fi
fi

cd "$ROOT_DIR/benchmarks"

if [[ ! -d node_modules ]]; then
  log "instalando dependências do benchmarks/ (mongodb/arangojs, usadas no seed)..."
  npm install --no-audit --no-fund --silent
fi

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
if [[ "${SKIP_DOCKER:-0}" != "1" ]]; then
  # O banco não é publicado no host (evita conflito com um Mongo/Arango já instalado
  # na máquina) — o seed roda de dentro do container da API, na mesma rede docker
  # isolada, falando com o banco pelo nome de serviço interno (mongo/arangodb).
  if [[ "$TARGET" == "mongo" ]]; then
    (cd "$API_DIR" && "${DOCKER_CMD[@]}" compose exec -T \
      -e MONGO_URL="mongodb://mongo:27017" -e MONGO_DB="${MONGO_DB:-benchmark}" \
      api-mongo node /benchmarks/seed/seed.mongo.js)
  else
    (cd "$API_DIR" && "${DOCKER_CMD[@]}" compose exec -T \
      -e ARANGO_URL="http://arangodb:8529" -e ARANGO_DB="${ARANGO_DB:-benchmark}" \
      -e ARANGO_USER="${ARANGO_USER:-root}" -e ARANGO_PASSWORD="${ARANGO_PASSWORD:-benchmark}" \
      api-arango node /benchmarks/seed/seed.arango.js)
  fi
else
  # SKIP_DOCKER=1: você gerencia a conectividade — aponte MONGO_URL/ARANGO_URL para
  # onde o banco estiver de fato alcançável a partir desta máquina.
  if [[ "$TARGET" == "mongo" ]]; then
    MONGO_URL="${MONGO_URL:-mongodb://localhost:27017}" MONGO_DB="${MONGO_DB:-benchmark}" node seed/seed.mongo.js
  else
    ARANGO_URL="${ARANGO_URL:-http://localhost:8529}" ARANGO_DB="${ARANGO_DB:-benchmark}" \
      ARANGO_USER="${ARANGO_USER:-root}" ARANGO_PASSWORD="${ARANGO_PASSWORD:-benchmark}" node seed/seed.arango.js
  fi
fi

log "rodando teste de carga (load-test.js)..."
"$K6_BIN" run k6/load-test.js \
  -e BASE_URL="$BASE_URL" \
  -e QUERY_DATA_INICIO="$QUERY_DATA_INICIO" \
  -e QUERY_DATA_FIM="$QUERY_DATA_FIM" \
  ${LOAD_MAX_VUS:+-e LOAD_MAX_VUS="$LOAD_MAX_VUS"} \
  ${LOAD_RAMP_UP:+-e LOAD_RAMP_UP="$LOAD_RAMP_UP"} \
  ${LOAD_PLATEAU:+-e LOAD_PLATEAU="$LOAD_PLATEAU"} \
  --summary-export="$RESULTS_DIR/$TARGET-load-summary.json" \
  2>&1 | tee "$RESULTS_DIR/$TARGET-load.log"

log "rodando teste de consulta em concorrência (query-concurrency-test.js)..."
"$K6_BIN" run k6/query-concurrency-test.js \
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
