# Relatório de Benchmark — MongoDB vs ArangoDB (coleção Notas)

Gerado em 2026-08-15T12:40:41.022Z

- Dataset: **20000** notas, **3** empresas, período **2022-01-01T09:00:00.000Z** a **2022-03-15T11:29:09.998Z** (seed=42)
- Query principal testada: `GET /notas/recentes` — mesmo filtro/projeção usados em produção
  (`_id_empresa` + `_deleted != true` + range de `data_emissao`, `SORT DESC`, `LIMIT`)

### Teste de carga (escrita + leitura mista, VUs em rampa)

| Banco | Requisições | Vazão (req/s) | Latência média (ms) | p90 (ms) | p95 (ms) | p99 (ms) | máx (ms) | Falhas |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| MongoDB | 31570 | 420.4 | 10.6 | 23.8 | 31.1 | 51.8 | 173.6 | 0.00% |
| ArangoDB | — | — | — | — | — | — | — | sem dados |

_Faltam resultados de ArangoDB para comparar este teste._


### Teste de consulta em concorrência (/notas/recentes, VUs constantes)

| Banco | Requisições | Vazão (req/s) | Latência média (ms) | p90 (ms) | p95 (ms) | p99 (ms) | máx (ms) | Falhas |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| MongoDB | 24232 | 806.8 | 61.5 | 87.8 | 102.8 | 135.4 | 665.3 | 0.00% |
| ArangoDB | — | — | — | — | — | — | — | sem dados |

_Faltam resultados de ArangoDB para comparar este teste._


---
_Métricas extraídas dos summaries do k6 (`results/*-summary.json`). "Falhas" é a % de requisições
que não passaram nos checks/status esperado. Bancos sem arquivo de summary aparecem como "sem dados"._
