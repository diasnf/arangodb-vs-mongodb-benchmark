// Gera um payload de nota "novo" (não-determinístico) para o teste de carga
// de escrita, usando as mesmas 3 empresas do dataset semeado.

import { buildNota } from "../../shared/buildNota.js";
import { EMPRESAS } from "../../shared/constants.js";

export function generateNota(vu, iter) {
  const empresaIndex = Math.floor(Math.random() * EMPRESAS.length);
  const empresa = EMPRESAS[empresaIndex];
  // combinação VU+iteração garante `numero`/`codigo` únicos entre VUs concorrentes
  const numero = vu * 1_000_000 + iter;
  const dataEmissaoISO = new Date().toISOString();

  return buildNota(Math.random, { empresa, empresaIndex, numero, dataEmissaoISO });
}
