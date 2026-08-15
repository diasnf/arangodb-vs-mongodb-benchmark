# Benchmark ArangoDB vs MongoDB — coleção `Notas`

Comparação de carga e velocidade de consulta entre duas APIs Fastify (Node.js + TypeScript)
com o mesmo contrato de rotas, uma conectada a MongoDB e outra a ArangoDB, usando o modelo
de documento `Nota` (nota fiscal de venda).

## ⚠️ ArangoDB não roda em kernels com páginas de 16KB (ex: Raspberry Pi 5)

A imagem oficial do ArangoDB (testado 3.11 e 3.12) trava com `Segmentation fault` no jemalloc
em hosts cujo kernel usa páginas de memória de 16KB — caso do kernel padrão do Raspberry Pi 5
(`getconf PAGESIZE` = 16384). É um problema conhecido, não específico de versão do ArangoDB.
Rode a stack `api-arango` em outra máquina (x86_64 ou ARM64 com páginas de 4KB) e aponte
`BASE_URL` dos scripts k6 para lá. A stack `api-mongo` roda normalmente no Pi.

## ⚠️ Limite de RAM dos containers exige memory cgroup habilitado no host

Os `docker-compose.yml` das duas stacks já definem `deploy.resources.limits` (CPU **e**
RAM) para o banco e para a API — funciona corretamente em qualquer host Linux padrão
(servidores, VMs, a maioria das distros cloud). Neste Raspberry Pi especificamente, o
limite de **CPU** é aplicado normalmente, mas o de **RAM** é descartado silenciosamente pelo
Docker porque o kernel roda com `cgroup_disable=memory` no boot (`/proc/cmdline`) — padrão
do Raspberry Pi OS. Confirmar com:

```bash
docker inspect <container> --format '{{.HostConfig.Memory}} {{.HostConfig.NanoCpus}}'
# Memory=0 mesmo com "memory: 1G" no compose ⇒ cgroup de memória desabilitado no host
```

Para habilitar (não feito aqui por exigir reboot de uma máquina em produção): adicionar
`cgroup_enable=memory cgroup_memory=1` em `/boot/firmware/cmdline.txt` e reiniciar. Como os
testes deste projeto não vão rodar neste Pi, isso não foi alterado — a configuração do
compose está correta e pronta para a(s) máquina(s) onde os testes de fato vão rodar.

## Estrutura

```
api-mongo/       # API Fastify + MongoDB driver
api-arango/      # API Fastify + arangojs (rodar fora do Pi 5, ver aviso acima)
shared/contracts/  # Interface TS canônica do documento Nota
benchmarks/
  shared/        # constants.js (3 empresas fixas, produtos, vendedores...) + buildNota.js
  seed/          # generate.js (dataset determinístico) + seed.mongo.js / seed.arango.js
  k6/            # load-test.js e query-concurrency-test.js
results/         # saídas dos testes k6 (JSON) para comparação
```

## Modelo de dado

Documento `Nota` (nota fiscal de PDV): empresa, itens com impostos (ICMS/IPI/PIS/COFINS),
totais, dados de venda/pagamento. Ver `shared/contracts/nota.ts`.

Dataset de teste: **3 empresas fixas** (`benchmarks/shared/constants.js#EMPRESAS`) e
**datas de emissão estritamente crescentes** (gerador usa incremento de 30s–10min por nota).

### Limites de recursos (iguais nas duas stacks, para comparação justa)

| Container | CPU | RAM | Observação |
|---|---|---|---|
| `mongo` / `arangodb` | 2.0 | 1G | Cache do engine (WiredTiger / RocksDB) tunado abaixo do limite de RAM |
| `api-mongo` / `api-arango` | 1.0 | 512M | Fastify + driver do banco |

Definidos em `deploy.resources.limits` nos `docker-compose.yml` (ver aviso acima sobre RAM
exigir memory cgroup no host). Para ajustar, edite os valores de `cpus`/`memory` direto nos
dois arquivos — mantenha os dois iguais para a comparação continuar justa.

### Índices criados em ambos os bancos

- `_id_empresa + data_emissao` (composto) — suporta a query principal de listagem por período
- `_id_empresa + codigo` (único) — idempotência/lookup por código

### Rotas (contrato idêntico nas duas APIs)

- `POST /notas` — cria uma nota
- `GET /notas/:id` — busca por id
- `GET /notas?_id_empresa=&data_inicio=&data_fim=&operacao=&page=&pageSize=` — listagem paginada
- `GET /notas/recentes?_id_empresa=&data_inicio=&data_fim=&limit=10` — **query principal do benchmark**:
  mesma consulta usada em produção (filtra `_deleted != true`, ordena por `data_emissao DESC`, projeção reduzida)
- `GET /notas/resumo?_id_empresa=&data_inicio=&data_fim=&agrupar=dia|vendedor` — agregação (bônus)

## Pré-requisitos

- Docker + Docker Compose
- Node.js 20+ (para gerar/semear o dataset)
- [k6](https://k6.io/) (binário em `/usr/local/bin/k6` ou `docker run grafana/k6`)

## Automação (recomendado)

Três scripts em `benchmarks/` automatizam tudo — gerar dataset, subir docker, semear, rodar
os dois testes k6 e derrubar docker — e produzem um relatório final comparando os bancos.

```bash
cd benchmarks
npm install
./run-all.sh
```

O que acontece:
1. Gera `seed/dataset.jsonl` (se ainda não existir) — 3 empresas fixas, datas crescentes.
2. Roda `run-target.sh mongo`: sobe `api-mongo` via docker compose, semeia, roda
   `k6/load-test.js` e `k6/query-concurrency-test.js`, derruba os containers.
3. Roda `run-target.sh arango` **só se o kernel deste host usar páginas de 4KB**
   (`getconf PAGESIZE`). Se não (caso deste Raspberry Pi 5, ver aviso acima), pula com
   instruções de como rodar na outra máquina.
4. Gera `results/REPORT.md` comparando os dois bancos (ou só o que tiver dados).

Resultados individuais ficam em `results/<mongo|arango>-<load|query>-summary.json` (summary
do k6) e `results/<mongo|arango>-<load|query>.log` (saída completa do k6).

### Rodando só um alvo

```bash
./run-target.sh mongo
./run-target.sh arango                 # só funciona em host com páginas de 4KB
BASE_URL=http://<ip-remoto>:3000 SKIP_DOCKER=1 ./run-target.sh arango   # API já rodando em outro host
```

### Fechando o comparativo com o ArangoDB (rodado em outra máquina)

```bash
# nesta máquina: gerar o dataset e copiar pra outra máquina
cd benchmarks && node seed/generate.js
scp -r . usuario@outra-maquina:~/projeto-teste/benchmarks

# na outra máquina
cd ~/projeto-teste/benchmarks && npm install
FORCE_REGEN=0 ./run-target.sh arango

# de volta aqui: copiar os resultados e regerar o relatório
scp usuario@outra-maquina:~/projeto-teste/results/arango-*-summary.json results/
node report.js
```

### Variáveis de ambiente úteis (todas opcionais, com defaults conservadores para hosts
### compartilhados/pouco recursos — suba os valores numa máquina dedicada)

| Variável | Default | Efeito |
|---|---|---|
| `COUNT` | 20000 | Nº de notas no dataset gerado |
| `SEED` | 42 | Seed do gerador determinístico |
| `LOAD_MAX_VUS` / `LOAD_RAMP_UP` / `LOAD_PLATEAU` | 50 / 20s / 40s | Rampa do teste de carga |
| `VUS` / `DURATION` | 50 / 30s | Concorrência do teste de consulta |
| `QUERY_DATA_INICIO` / `QUERY_DATA_FIM` | cobre 2022–2030 | Janela de data usada nas leituras |

## Testes k6

- **`load-test.js`**: carga mista (POST /notas + GET /notas/recentes), rampa de VUs.
- **`query-concurrency-test.js`**: VUs constantes, só GET /notas/recentes (a query real),
  alternando entre as 3 empresas semeadas.

## Status validado

- ✅ `api-mongo` + `run-all.sh`: pipeline completo rodado de ponta a ponta neste Pi (build,
  seed de 20k notas, load-test e query-concurrency-test via k6, relatório gerado em
  `results/REPORT.md`). Resultado real do MongoDB neste host: p95 de 31ms na query real sob
  50 VUs constantes, 0% de falhas — ver `results/REPORT.md` para os números completos.
- ✅ TypeScript compila sem erros nas duas APIs (`npx tsc --noEmit`).
- ⚠️ `api-arango`: código revisado contra a API real do `arangojs@10` (aql, ensureIndex,
  document/graceful, saveAll) e o script `run-target.sh arango` está pronto, mas a execução
  ponta-a-ponta ainda não foi validada — bloqueada pelo problema de kernel descrito acima.
  Rodar `./run-target.sh arango` na outra máquina e trazer os `*-summary.json` de volta para
  fechar o comparativo em `results/REPORT.md`.
