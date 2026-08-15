// Teste de carga (write-heavy): dispara escrita de notas novas + leitura da
// listagem "recentes" (mesma query real de produção) contra a API alvo, para
// medir throughput, latência (p95/p99) e taxa de erro sob volume crescente.
//
// Uso:
//   BASE_URL=http://localhost:3000 k6 run benchmarks/k6/load-test.js
//
// Variáveis opcionais:
//   QUERY_DATA_INICIO / QUERY_DATA_FIM  -> janela usada na leitura mista (default cobre todo o dataset padrão)

import http from "k6/http";
import { check, sleep } from "k6";
import { Trend } from "k6/metrics";
import { generateNota } from "./lib/generateNota.js";
import { EMPRESAS } from "../shared/constants.js";

const BASE_URL = __ENV.BASE_URL || "http://localhost:3000";
const DATA_INICIO = __ENV.QUERY_DATA_INICIO || "2022-01-01T00:00:00.000Z";
const DATA_FIM = __ENV.QUERY_DATA_FIM || "2030-01-01T00:00:00.000Z";
// Default conservador (pensado p/ hosts compartilhados de poucos recursos).
// Em uma máquina dedicada, suba via env: LOAD_MAX_VUS=100 LOAD_RAMP_UP=1m LOAD_PLATEAU=1m
const MAX_VUS = Number(__ENV.LOAD_MAX_VUS || 50);
const RAMP_UP = __ENV.LOAD_RAMP_UP || "20s";
const PLATEAU = __ENV.LOAD_PLATEAU || "40s";

const writeLatency = new Trend("write_latency");
const readLatency = new Trend("read_latency");

export const options = {
  scenarios: {
    ramping_load: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: RAMP_UP, target: Math.ceil(MAX_VUS * 0.4) },
        { duration: PLATEAU, target: MAX_VUS },
        { duration: "15s", target: 0 },
      ],
      gracefulRampDown: "10s",
    },
  },
  thresholds: {
    http_req_failed: ["rate<0.01"],
    http_req_duration: ["p(95)<500"],
  },
  summaryTrendStats: ["avg", "min", "med", "p(90)", "p(95)", "p(99)", "max"],
};

export default function () {
  const nota = generateNota(__VU, __ITER);

  const writeRes = http.post(`${BASE_URL}/notas`, JSON.stringify(nota), {
    headers: { "Content-Type": "application/json" },
  });
  writeLatency.add(writeRes.timings.duration);
  check(writeRes, { "write status is 2xx": (r) => r.status >= 200 && r.status < 300 });

  const empresa = EMPRESAS[Math.floor(Math.random() * EMPRESAS.length)];
  const qs = `_id_empresa=${empresa._id_empresa}&data_inicio=${DATA_INICIO}&data_fim=${DATA_FIM}&limit=10`;
  const readRes = http.get(`${BASE_URL}/notas/recentes?${qs}`);
  readLatency.add(readRes.timings.duration);
  check(readRes, { "read status is 200": (r) => r.status === 200 });

  sleep(0.1);
}
