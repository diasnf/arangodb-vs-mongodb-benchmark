# ArangoDB vs MongoDB — benchmark com a coleção `Notas`

Este projeto compara MongoDB e ArangoDB na prática: duas APIs Fastify (Node.js +
TypeScript) idênticas em contrato, cada uma falando com um banco diferente, servindo o
mesmo documento — uma nota fiscal de PDV, com itens, impostos, pagamento, tudo. A ideia é
simples: gerar um dataset realista, bater as mesmas queries e a mesma carga de escrita nos
dois, e comparar números de verdade em vez de achismo.

A query que mais importa aqui é a listagem de notas recentes por empresa/período — é o tipo
de consulta que qualquer sistema de PDV roda o tempo todo, e é nela que a diferença entre os
dois bancos deve aparecer com mais clareza.

## Como está organizado

```
api-mongo/         API Fastify + driver do MongoDB
api-arango/         API Fastify + arangojs
shared/contracts/   Interface TypeScript canônica do documento Nota
benchmarks/
  shared/            constantes do dataset (3 empresas fixas, produtos, vendedores...) e o gerador de notas
  seed/              gera o dataset determinístico e carrega em cada banco
  k6/                os dois testes: carga e consulta em concorrência
results/             saída dos testes (relatório e summaries do k6)
```

## O documento `Nota`

É uma nota fiscal de venda de PDV: cabeçalho da empresa, itens com ICMS/IPI/PIS/COFINS,
totais, dados de pagamento. O modelo completo está em `shared/contracts/nota.ts` — as duas
APIs compartilham a mesma cópia do contrato.

O dataset de teste usa **3 empresas fixas** e gera notas com **datas de emissão sempre
crescentes** (intervalos de 30s a 10min entre uma nota e a próxima), pra simular o padrão
real de um sistema de vendas ao vivo em vez de dados espalhados aleatoriamente no tempo.

### Índices

Os dois bancos criam os mesmos dois índices, pensados pra cobrir a query principal:

- `_id_empresa + data_emissao` — a listagem por período usa exatamente esse par
- `_id_empresa + codigo` (único) — lookup direto e proteção contra duplicidade

### Rotas (mesmo contrato nas duas APIs)

- `POST /notas` — cria uma nota
- `GET /notas/:id` — busca por id
- `GET /notas?_id_empresa=&data_inicio=&data_fim=&operacao=&page=&pageSize=` — listagem paginada
- `GET /notas/recentes?_id_empresa=&data_inicio=&data_fim=&limit=10` — **a query principal do
  benchmark**, espelhando a consulta real de produção: filtra notas não deletadas dentro do
  período, ordena por data decrescente, projeção enxuta
- `GET /notas/resumo?_id_empresa=&data_inicio=&data_fim=&agrupar=dia|vendedor` — agregação, de bônus

### Isolamento de rede

Cada stack sobe numa rede docker própria (`bench-mongo-net` / `bench-arango-net`) e o
banco **não publica porta nenhuma no host** — só é alcançável de dentro dessa rede, pelo
nome de serviço (`mongo` ou `arangodb`). Isso evita o problema mais comum de rodar isso numa
máquina que já tem uso: `docker compose` reclamando que a porta 27017 (ou 8529) já está em
uso por outro Mongo/Arango instalado por fora. Só a API fica exposta no host (porta 3000 por
padrão, ajustável via `API_PORT`), que é o que o k6 realmente precisa alcançar.

Uma consequência prática: como o banco não tem porta no host, o `seed` não roda mais direto
do seu terminal contra `localhost` — ele roda de dentro do container da própria API (via
`docker compose exec`), que já está na rede certa. Isso é feito automaticamente pelo
`run-target.sh`; se você chamar os scripts de seed manualmente, lembre que eles vão precisar
alcançar o banco de algum lugar dentro da rede docker, não do host.

### Limites de CPU e RAM

Banco e API têm limites iguais nas duas stacks, pra manter a comparação justa:

| Container | CPU | RAM |
|---|---|---|
| `mongo` / `arangodb` | 2.0 | 1G |
| `api-mongo` / `api-arango` | 1.0 | 512M |

Estão em `deploy.resources.limits` nos dois `docker-compose.yml`, com o cache interno de
cada engine (WiredTiger no Mongo, RocksDB no Arango) ajustado pra caber dentro desse limite
de memória. Se for mexer, mude os dois arquivos juntos — o ponto é comparar sob a mesma
restrição de recursos, não descobrir qual banco aguenta mais RAM.

> Vale conferir se o host onde você for rodar aplica esse limite de verdade: alguns
> ambientes Linux (principalmente imagens voltadas a dispositivos embarcados) vêm com o
> cgroup de memória desabilitado por padrão, e nesse caso o Docker aceita o `memory:` do
> compose mas não aplica nada. Um jeito rápido de checar:
> ```bash
> docker inspect <container> --format '{{.HostConfig.Memory}} {{.HostConfig.NanoCpus}}'
> # Memory=0 mesmo com "memory: 1G" no compose ⇒ cgroup de memória desligado no host
> ```
> O limite de CPU costuma funcionar independente disso.

## Rodando tudo

Pré-requisitos: Docker + Docker Compose e Node.js 20+. O [k6](https://k6.io/) não precisa
estar instalado — se `run-target.sh` não encontrar `k6` no PATH, ele baixa o binário oficial
(Linux amd64/arm64) para `benchmarks/.bin/k6` sozinho, sem precisar de root. Em outro
SO/arquitetura, instale manualmente e garanta que `k6` esteja no PATH.

A forma mais simples é deixar o script cuidar de tudo:

```bash
cd benchmarks
npm install
./run-all.sh
```

Isso gera o dataset (se ainda não existir), sobe o MongoDB, roda os dois testes k6 contra
ele, derruba os containers, faz o mesmo para o ArangoDB, e termina gerando
`results/REPORT.md` com a comparação. Cada teste também deixa seu summary bruto em
`results/<mongo|arango>-<load|query>-summary.json`, caso você queira analisar os números
com mais calma.

O container e o volume do banco sempre são derrubados ao final — mesmo se o k6 falhar um
threshold ou o script for interrompido no meio — e toda execução começa com uma limpeza
defensiva do que sobrou de uma rodada anterior. Isso evita reaproveitar sem querer um banco
que já tem dados de um teste passado (o dataset é sempre determinístico, então inserir ele
duas vezes por cima bate no índice único de `_id_empresa + codigo`).

### Rodando só um banco

```bash
./run-target.sh mongo
./run-target.sh arango
```

### Parametrizando o teste

Tudo o que dá pra ajustar tem uma flag — `./run-target.sh --help` lista todas. As mesmas
flags funcionam em `run-all.sh`, que repassa pros dois alvos.

```bash
# dataset maior, mais VUs, teste de consulta mais longo — numa máquina dedicada, por exemplo
./run-target.sh mongo --count 200000 --load-vus 150 --query-vus 150 --query-duration 2m

# porta 3000 já em uso na máquina? redireciona a API pra outra
./run-target.sh arango --api-port 3001
```

Quando os dois bancos precisam de parâmetros diferentes no mesmo `run-all.sh`, separe as
listas com um `--` literal: tudo antes vale só pro mongo, tudo depois só pro arango. Sem
`--`, a mesma lista de flags vale pros dois (comportamento padrão).

```bash
# mongo local na porta 3000 com 100 VUs; arango numa outra máquina já rodando, 40 VUs
./run-all.sh --api-port 3000 --query-vus 100 -- --skip-docker --base-url http://outra-maquina:3000 --query-vus 40
```

Exceção: `--count`/`--seed` não fazem sentido diferentes por alvo — o dataset
(`seed/dataset.jsonl`) é um só, compartilhado de propósito pelos dois bancos, porque é isso
que garante que a comparação é justa (mesmos dados nos dois lados). Quem gera o arquivo é o
primeiro alvo a rodar (o mongo); um `--count` diferente depois do `--` só teria efeito com
`--force-regen` junto, e nesse caso o mongo já teria rodado contra o dataset anterior — ou
seja, normalmente não é o que você quer.

| Flag | Default | Efeito |
|---|---|---|
| `--count` | 20000 | Quantidade de notas no dataset gerado (só é usado se `seed/dataset.jsonl` ainda não existir — use `--force-regen` pra regenerar com um valor novo) |
| `--seed` | 42 | Seed do gerador determinístico |
| `--api-port` | 3000 | Porta do host publicada para a API — mude se já estiver em uso |
| `--load-vus` / `--load-ramp-up` / `--load-plateau` | 50 / 20s / 40s | Rampa do teste de carga |
| `--query-vus` / `--query-duration` | 50 / 30s | Concorrência do teste de consulta |
| `--data-inicio` / `--data-fim` | cobre 2022–2030 | Janela de data usada nas leituras |

Os defaults são conservadores de propósito, pra rodar em qualquer máquina sem sufocar —
suba esses valores numa máquina dedicada só pro benchmark. As variáveis de ambiente
equivalentes (`COUNT`, `SEED`, `API_PORT`, `LOAD_MAX_VUS`, `LOAD_RAMP_UP`, `LOAD_PLATEAU`,
`VUS`, `DURATION`, `QUERY_DATA_INICIO`, `QUERY_DATA_FIM`) também funcionam como default,
caso prefira; uma flag na linha de comando sempre tem a palavra final.

### Rodando os dois bancos em máquinas diferentes

Nada aqui obriga MongoDB e ArangoDB a rodarem na mesma máquina — na real, comparar em
hardware idêntico mas separado costuma ser mais limpo, já que os dois não competem por CPU
e RAM ao mesmo tempo. O fluxo:

```bash
# gera o dataset uma vez e leva pra outra máquina
cd benchmarks && node seed/generate.js
scp -r . usuario@outra-maquina:~/benchmark/benchmarks

# na outra máquina
cd ~/benchmark/benchmarks && npm install
./run-target.sh arango

# de volta aqui: traz os resultados e regera o relatório com os dois lados
scp usuario@outra-maquina:~/benchmark/results/arango-*-summary.json results/
node report.js
```

Se a API já estiver rodando em outro lugar e você só quer disparar o k6 contra ela, sem
gerenciar docker localmente, use `--skip-docker` — nesse modo o script não sobe/derruba
containers nem semeia via `docker compose exec`, então o banco precisa estar alcançável a
partir desta máquina por fora da rede docker isolada (porta publicada manualmente, VPN, etc.):

```bash
./run-target.sh arango --skip-docker --base-url http://<ip-remoto>:3000 --arango-url http://<ip-remoto>:8529
```

### Limpando tudo

O `run-target.sh` já derruba container/volume/rede sozinho ao final de cada rodada (e faz
uma limpeza defensiva no início, então mesmo uma execução morta à força — `kill -9`, queda
de energia — não deixa lixo pra próxima). Pra limpar manualmente sem rodar teste nenhum, ou
pra recuperar de um estado bagunçado:

```bash
./clean.sh          # containers, volumes e redes das duas stacks (idempotente)
./clean.sh --all    # + dataset gerado, summaries/logs de resultado, e o k6 baixado
```

`results/REPORT.md` nunca é apagado pelo `--all` — é o relatório final, não um artefato
descartável.

## Os dois testes k6

- **`load-test.js`** — carga mista de escrita e leitura (`POST /notas` + `GET
  /notas/recentes`), com rampa de VUs subindo aos poucos. Mede como cada banco se comporta
  quando escrita e leitura competem ao mesmo tempo.
- **`query-concurrency-test.js`** — só leitura, VUs constantes, batendo exclusivamente em
  `/notas/recentes` (a query real) alternando entre as 3 empresas do dataset. Mede
  latência pura de consulta sob concorrência, sem ruído de escrita.

## Problemas conhecidos

**ArangoDB e páginas de memória não-padrão.** A imagem oficial do ArangoDB usa jemalloc
compilado assumindo páginas de 4KB. Em hosts cujo kernel usa páginas maiores (16KB é o caso
mais comum, presente em alguns kernels ARM64 recentes) o `arangod` trava com
`Segmentation fault` já na inicialização — testamos isso em duas versões (3.11 e 3.12) e o
comportamento foi idêntico, então não é algo que uma troca de versão resolve. Se isso
acontecer com você, `getconf PAGESIZE` é o primeiro lugar pra confirmar, e a saída prática
é rodar a stack `api-arango` em outra máquina.

## Estado do projeto

O pipeline completo — gerar dataset, subir a stack, semear, rodar os dois testes k6,
derrubar tudo e montar o relatório — já foi validado de ponta a ponta para o MongoDB. A API
do ArangoDB foi escrita e revisada contra a API real do `arangojs@10` (aql, ensureIndex,
leitura com `graceful`, inserção em lote), mas por causa do problema de compatibilidade
acima, a execução completa dela ainda precisa rodar num host compatível antes do
comparativo final — o script (`run-target.sh arango`) já está pronto pra isso.
