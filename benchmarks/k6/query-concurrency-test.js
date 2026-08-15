// Teste de velocidade de consulta em concorrência: mantém um número fixo e
// alto de VUs disparando SOMENTE a query real de "notas recentes" (mesmo
// filtro/projeção usados em produção) contra uma base já semeada
// (ver benchmarks/seed), alternando entre as 3 empresas do dataset.
//
// Uso:
//   BASE_URL=http://localhost:3000 k6 run benchmarks/k6/query-concurrency-test.js
//
// Variáveis opcionais:
//   VUS (default 100), DURATION (default 1m)
//   QUERY_DATA_INICIO / QUERY_DATA_FIM -> janela de data (default cobre todo o dataset padrão)

import http from "k6/http";
import { check } from "k6";
import { EMPRESAS } from "../shared/constants.js";

const BASE_URL = __ENV.BASE_URL || "http://localhost:3000";
const DATA_INICIO = __ENV.QUERY_DATA_INICIO || "2022-01-01T00:00:00.000Z";
const DATA_FIM = __ENV.QUERY_DATA_FIM || "2030-01-01T00:00:00.000Z";
// Default conservador (pensado p/ hosts compartilhados de poucos recursos).
// Em uma máquina dedicada, suba via env: VUS=200 DURATION=2m
const VUS = Number(__ENV.VUS || 50);
const DURATION = __ENV.DURATION || "30s";

export const options = {
  scenarios: {
    concurrent_reads: {
      executor: "constant-vus",
      vus: VUS,
      duration: DURATION,
    },
  },
  thresholds: {
    http_req_failed: ["rate<0.01"],
    http_req_duration: ["p(95)<300", "p(99)<800"],
  },
  summaryTrendStats: ["avg", "min", "med", "p(90)", "p(95)", "p(99)", "max"],
};

export default function () {
  const empresa = EMPRESAS[Math.floor(Math.random() * EMPRESAS.length)];
  const qs = `_id_empresa=${empresa._id_empresa}&data_inicio=${DATA_INICIO}&data_fim=${DATA_FIM}&limit=10`;

  const res = http.get(`${BASE_URL}/notas/recentes?${qs}`);
  check(res, {
    "status is 200": (r) => r.status === 200,
    "retornou lista": (r) => Array.isArray(r.json()),
  });
}
