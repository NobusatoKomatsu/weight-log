#!/usr/bin/env node
// Wikidata から石のデータを取得して stones/data/stones.json を生成する。
// GitHub Actions（.github/workflows/stones-data.yml）が定期実行する。手元でも `node stones/build-data.mjs` で実行できる。
import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SPARQL_ENDPOINT, QUERIES, flattenBindings, mergeResults } from './queries.js';

const here = dirname(fileURLToPath(import.meta.url));
const outFile = join(here, 'data', 'stones.json');
const UA = 'weight-log-stones/1.0 (https://github.com/NobusatoKomatsu/weight-log; data build script)';

async function runQuery(name, query, attempt = 1) {
  const url = `${SPARQL_ENDPOINT}?format=json&query=${encodeURIComponent(query)}`;
  const t0 = Date.now();
  const res = await fetch(url, { headers: { Accept: 'application/sparql-results+json', 'User-Agent': UA } });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    if (attempt < 3 && (res.status === 429 || res.status >= 500)) {
      const wait = 15000 * attempt;
      console.warn(`[${name}] HTTP ${res.status} → ${wait / 1000}s 待って再試行`);
      await new Promise((r) => setTimeout(r, wait));
      return runQuery(name, query, attempt + 1);
    }
    throw new Error(`[${name}] HTTP ${res.status}: ${body.slice(0, 500)}`);
  }
  const rows = flattenBindings(await res.json());
  console.log(`[${name}] ${rows.length} 行 (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
  return rows;
}

const results = {};
// Wikidata の同時接続制限を避けるため直列に実行
for (const [name, query] of Object.entries(QUERIES)) {
  results[name] = await runQuery(name, query);
}
const stones = mergeResults(results);
const summary = {
  minerals: stones.filter((s) => s.type === 'mineral').length,
  rocks: stones.filter((s) => s.type === 'rock').length,
  meteorites: stones.filter((s) => s.type === 'meteorite').length,
  withImage: stones.filter((s) => s.img).length,
  withCoord: stones.filter((s) => s.loc && s.loc.lat !== undefined).length,
};
console.log('まとめ:', summary);
if (stones.length < 100) throw new Error(`取得件数が少なすぎます (${stones.length} 件)。クエリ結果を確認してください。`);

await mkdir(dirname(outFile), { recursive: true });
await writeFile(
  outFile,
  JSON.stringify({ generated: new Date().toISOString(), source: 'Wikidata (CC0)', summary, stones }),
);
console.log(`書き出し: ${outFile} (${stones.length} 件)`);
