#!/usr/bin/env node
// @ts-nocheck — script Node, hors du code de l’application ; parseEcbCsv est testé par Vitest.
/**
 * Télécharge les taux EUR/USD quotidiens de la BCE et écrit
 * src/lib/prices/ecb-eurusd.json (D-004).
 *
 * Lancé par le mainteneur (`npm run update:ecb`) et par le déploiement, jamais
 * par l'application : aucun appel réseau à l'exécution.
 *
 * Source : Banque centrale européenne, Data Portal, série EXR.D.USD.EUR.SP00.A
 * (taux de référence, dollars US pour 1 euro). Réutilisation libre avec
 * mention de la source : https://www.ecb.europa.eu/home/disclaimer/html/index.en.html
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const ECB_URL = 'https://data-api.ecb.europa.eu/service/data/EXR/D.USD.EUR.SP00.A?format=csvdata&startPeriod=2017-01-01';
const OUTPUT = fileURLToPath(new URL('../src/lib/prices/ecb-eurusd.json', import.meta.url));

/**
 * Lit le CSV du Data Portal de la BCE (colonnes TIME_PERIOD et OBS_VALUE).
 * @param {string} text
 * @returns {[string, string][]}
 */
export function parseEcbCsv(text) {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim() !== '');
  if (lines.length === 0) throw new Error('Réponse vide');
  const split = (line) => line.split(',').map((c) => c.trim().replace(/^"|"$/g, ''));
  const headers = split(lines[0]);
  const dateCol = headers.indexOf('TIME_PERIOD');
  const valueCol = headers.indexOf('OBS_VALUE');
  if (dateCol < 0 || valueCol < 0) throw new Error(`Colonnes TIME_PERIOD / OBS_VALUE introuvables : ${headers.join(', ')}`);
  /** @type {[string, string][]} */
  const rates = [];
  for (const line of lines.slice(1)) {
    const cells = split(line);
    const date = cells[dateCol];
    const value = cells[valueCol];
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d+(\.\d+)?$/.test(value ?? '')) continue;
    rates.push([date, value]);
  }
  rates.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  return rates;
}

async function main() {
  const res = await fetch(ECB_URL, { headers: { Accept: 'text/csv' } });
  if (!res.ok) throw new Error(`BCE : HTTP ${res.status}`);
  const rates = parseEcbCsv(await res.text());
  if (rates.length < 1000) throw new Error(`BCE : seulement ${rates.length} taux reçus`);
  const data = {
    source: 'Banque centrale européenne — taux de référence EUR/USD (EXR.D.USD.EUR.SP00.A)',
    url: 'https://data.ecb.europa.eu/data/datasets/EXR/EXR.D.USD.EUR.SP00.A',
    updated: new Date().toISOString().slice(0, 10),
    rates,
  };
  writeFileSync(OUTPUT, JSON.stringify(data) + '\n');
  console.log(`${rates.length} taux écrits (${rates[0][0]} → ${rates[rates.length - 1][0]}) dans ${OUTPUT}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
