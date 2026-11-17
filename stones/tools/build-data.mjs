#!/usr/bin/env node
// 世界の石 図鑑 — データ生成
// Wikidata（CC0）と Wikipedia の検索 API から石のデータを集めて stones/data/stones.json を作る。
//   node stones/tools/build-data.mjs
// 大きなクエリ 1 本だと Wikidata 側でタイムアウトするので、プロパティごとの小さなクエリに分けて JS 側で結合する。
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const here = dirname(fileURLToPath(import.meta.url));
const OUT = join(here, '..', 'data', 'stones.json');
const UA = 'weight-log-stones/2.0 (https://github.com/NobusatoKomatsu/weight-log)';
const WDQS = 'https://query.wikidata.org/sparql';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const qid = (uri) => uri.slice(uri.lastIndexOf('/') + 1);

// ---------- SPARQL ----------
const CACHE = process.env.STONES_CACHE; // 開発用: 応答をこのフォルダに保存して再利用
async function sparql(query, label = '') {
  if (!CACHE) return sparqlLive(query, label);
  const file = join(CACHE, createHash('sha1').update(query).digest('hex') + '.json');
  try { return JSON.parse(await readFile(file, 'utf8')); } catch { /* 未取得 */ }
  const rows = await sparqlLive(query, label);
  await mkdir(CACHE, { recursive: true });
  await writeFile(file, JSON.stringify(rows));
  return rows;
}
async function sparqlLive(query, label = '') {
  for (let attempt = 1; ; attempt++) {
    let res, text;
    try {
      res = await fetch(WDQS, {
        method: 'POST',
        headers: { Accept: 'application/sparql-results+json', 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': UA },
        body: 'query=' + encodeURIComponent(query),
      });
      text = await res.text();
    } catch (e) {
      if (attempt >= 4) throw new Error(`[${label}] 通信エラー: ${e.message}`);
      await sleep(5000 * attempt);
      continue;
    }
    if (res.ok) {
      const rows = JSON.parse(text).results.bindings;
      return rows.map((b) => {
        const o = {};
        for (const k in b) o[k] = b[k].value;
        return o;
      });
    }
    if (attempt >= 4 || ![429, 500, 502, 503, 504].includes(res.status)) {
      throw new Error(`[${label}] HTTP ${res.status}: ${text.replace(/\s+/g, ' ').slice(0, 300)}`);
    }
    const wait = Number(res.headers.get('retry-after')) * 1000 || 8000 * attempt;
    console.warn(`  [${label}] HTTP ${res.status} → ${Math.round(wait / 1000)} 秒待って再試行`);
    await sleep(wait);
  }
}

// 同時 2 本まで（Wikidata の利用制限に配慮）
async function pool(tasks, n = 2) {
  const out = new Array(tasks.length);
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => {
    while (i < tasks.length) {
      const k = i++;
      out[k] = await tasks[k]();
    }
  }));
  return out;
}

/** グループ（WHERE 句の断片）に属する項目 ?i の、あるプロパティの値を {qid: [値…]} で返す */
async function prop(group, path, label) {
  const rows = await sparql(`SELECT ?i ?v WHERE { ${group} ?i ${path} ?v }`, label);
  const m = new Map();
  for (const r of rows) {
    const id = qid(r.i);
    if (!m.has(id)) m.set(id, []);
    m.get(id).push(r.v);
  }
  return m;
}
const one = (m, id) => (m.get(id) || [])[0];
const nums = (m, id) => (m.get(id) || []).map(Number).filter((x) => Number.isFinite(x));
const range = (arr) => (arr.length ? [Math.min(...arr), Math.max(...arr)] : undefined);
const max = (arr) => (arr.length ? Math.max(...arr) : undefined);

/** Q 番号の集合 → 日本語・英語ラベル */
async function labelsOf(ids, label) {
  const list = [...new Set(ids)].filter((x) => /^Q\d+$/.test(x));
  const out = new Map();
  const tasks = [];
  for (let k = 0; k < list.length; k += 400) {
    const chunk = list.slice(k, k + 400);
    tasks.push(async () => {
      const rows = await sparql(
        `SELECT ?i ?ja ?en WHERE { VALUES ?i { ${chunk.map((x) => 'wd:' + x).join(' ')} }
           OPTIONAL { ?i rdfs:label ?ja FILTER(LANG(?ja) = "ja") }
           OPTIONAL { ?i rdfs:label ?en FILTER(LANG(?en) = "en") } }`, `${label} labels`);
      for (const r of rows) out.set(qid(r.i), { ja: r.ja, en: r.en });
    });
  }
  await pool(tasks);
  return out;
}
const lab = (m, id) => { const l = m.get(id); return l ? l.ja || l.en : undefined; };

/** グループの名前・説明・Wikipedia 記事など共通項目 */
async function common(group, label, { anyLabel = false } = {}) {
  const q = (body, l) => sparql(`SELECT ?i ?v WHERE { ${group} ${body} }`, `${label} ${l}`);
  const toMap = (rows) => new Map(rows.map((r) => [qid(r.i), r.v]));
  const res = await pool([
    () => q('?i rdfs:label ?v FILTER(LANG(?v) = "ja")', 'ja'),
    () => q('?i rdfs:label ?v FILTER(LANG(?v) = "en")', 'en'),
    () => q('?i schema:description ?v FILTER(LANG(?v) = "ja")', 'desc ja'),
    () => q('?i schema:description ?v FILTER(LANG(?v) = "en")', 'desc en'),
    () => q('?a schema:about ?i ; schema:isPartOf <https://ja.wikipedia.org/> ; schema:name ?v', 'jawiki'),
    () => q('?a schema:about ?i ; schema:isPartOf <https://en.wikipedia.org/> ; schema:name ?v', 'enwiki'),
    () => q('?i wdt:P18 ?v', 'image'),
    () => q('?i wdt:P373 ?v', 'commons'),
    () => q('?i wikibase:sitelinks ?v FILTER(?v > 0)', 'sitelinks'),
    () => (anyLabel
      ? sparql(`SELECT ?i ?v WHERE { ${group} SERVICE wikibase:label { bd:serviceParam wikibase:language "en,mul,de,fr,nl,sv,da,nb,fi,et,pl,cs,es,it,pt,ru,zh,ko". ?i rdfs:label ?v } }`, `${label} any label`)
      : []),
  ]);
  const [mja, men, mdja, mden, mwj, mwe, mimg, mcc, msl, many] = res.map(toMap);
  return (id) => {
    let name = men.get(id);
    if (!name && many.has(id) && !/^Q\d+$/.test(many.get(id))) name = many.get(id);
    const file = mimg.get(id);
    return {
      id,
      ja: mja.get(id),
      en: name,
      d: mdja.get(id) || (BORING.test(mden.get(id) || '') ? undefined : mden.get(id)),
      sl: Number(msl.get(id)) || undefined,
      wj: mwj.get(id),
      we: mwe.get(id),
      img: file ? decodeURIComponent(file.slice(file.indexOf('Special:FilePath/') + 17)) : undefined,
      cc: mcc.get(id),
    };
  };
}

const BORING = /^(an? )?([\w-]+ ){0,2}(mineral|mineral species|rock|meteorite|chemical compound)$/i;
const uniq = (arr) => [...new Set(arr)];
const point = (wkt) => {
  const m = /Point\(([-\d.eE+]+) ([-\d.eE+]+)\)/.exec(wkt || '');
  if (!m) return undefined;
  const lon = Number(m[1]), lat = Number(m[2]);
  return Number.isFinite(lat) && Number.isFinite(lon) ? [Math.round(lat * 1e4) / 1e4, Math.round(lon * 1e4) / 1e4] : undefined;
};
const yearOf = (iso) => { const m = /^(-?\d{1,4})-/.exec(iso || ''); return m ? Number(m[1]) : undefined; };
const round = (x, d) => (x === undefined ? undefined : Number(x.toPrecision(d)));
function clean(o) {
  for (const k of Object.keys(o)) {
    const v = o[k];
    if (v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length)) delete o[k];
  }
  return o;
}

// ---------- 1. 鉱物（鉱物種・変種・グループ・宝石） ----------
const G_MIN = `{ VALUES ?cls { wd:Q12089225 wd:Q429795 wd:Q1936581 } ?i wdt:P31 ?cls } UNION { ?i wdt:P279 wd:Q83437 } .`;
const STRUNZ = { 1: '元素鉱物', 2: '硫化鉱物', 3: 'ハロゲン化鉱物', 4: '酸化鉱物', 5: '炭酸塩・硝酸塩鉱物', 6: 'ホウ酸塩鉱物', 7: '硫酸塩鉱物', 8: 'リン酸塩・ヒ酸塩鉱物', 9: 'ケイ酸塩鉱物', 10: '有機鉱物' };

async function buildMinerals() {
  console.log('鉱物…');
  const base = await common(G_MIN, 'mineral');
  const [kind, formula, cs, strunz, ima, mohs, dens, mindat, status, parent, named, tloc] = await pool([
    () => prop(G_MIN, 'wdt:P31', 'mineral kind'),
    () => prop(G_MIN, 'wdt:P274', 'formula'),
    () => prop(G_MIN, 'wdt:P556', 'crystal'),
    () => prop(G_MIN, 'wdt:P713', 'strunz'),
    () => prop(G_MIN, 'wdt:P484', 'ima no'),
    () => prop(G_MIN, 'wdt:P1088', 'mohs'),
    () => prop(G_MIN, 'p:P2054/psn:P2054/wikibase:quantityAmount', 'density'),
    () => prop(G_MIN, 'wdt:P6263', 'mindat'),
    () => prop(G_MIN, 'wdt:P579', 'status'),
    () => prop(G_MIN, 'wdt:P279', 'parent'),
    () => prop(G_MIN, 'wdt:P138', 'named after'),
    () => prop(G_MIN, 'wdt:P2695', 'type locality'),
  ]);
  const ids = [...kind.keys()];
  // 模式産地の座標と国
  const G_LOC = `${G_MIN} ?i wdt:P2695 ?l .`;
  const [locCoord, locCountry] = await pool([
    () => sparql(`SELECT DISTINCT ?l ?v WHERE { ${G_LOC} ?l wdt:P625 ?v }`, 'locality coord'),
    () => sparql(`SELECT DISTINCT ?l ?v WHERE { ${G_LOC} ?l wdt:P17 ?v }`, 'locality country'),
  ]);
  const coordOf = new Map(locCoord.map((r) => [qid(r.l), point(r.v)]));
  const countryOf = new Map(locCountry.map((r) => [qid(r.l), qid(r.v)]));
  const refIds = [];
  for (const m of [cs, status, named, tloc]) for (const arr of m.values()) for (const v of arr) refIds.push(qid(v));
  for (const c of countryOf.values()) refIds.push(c);
  const L = await labelsOf(refIds, 'mineral refs');

  const out = [];
  for (const id of ids) {
    const b = base(id);
    if (!b.ja && !b.en) continue;
    const kinds = (kind.get(id) || []).map(qid);
    const k = kinds.includes('Q12089225') ? '鉱物種' : kinds.includes('Q429795') ? '変種' : kinds.includes('Q1936581') ? '鉱物グループ' : '宝石';
    const st = one(strunz, id);
    const stClass = st && /^(\d{1,2})\./.test(st) ? Number(RegExp.$1) : undefined;
    const imaNo = one(ima, id);
    const yIma = imaNo && /IMA\s?(\d{4})-\d/.exec(imaNo); // 通常の承認番号だけ（特別手続き s.p. は承認年ではない）
    const parents = uniq((parent.get(id) || []).map(qid)).filter((p) => p !== id && kind.has(p)); // 図鑑に載っている親（グループ・もとの鉱物）だけ
    const stLabel = (L.get(qid(one(status, id) || '')) || {}).en || '';
    const crystal = uniq((cs.get(id) || []).map((v) => lab(L, qid(v)))).filter((x) => /晶系$|アモルファス/.test(x || ''));
    const locs = (tloc.get(id) || []).map(qid).map((l) => {
      const c = coordOf.get(l);
      const ct = countryOf.get(l);
      const lb = L.get(l) || {};
      return clean({ n: lb.ja || lb.en, ne: lb.ja ? lb.en : undefined, c: ct ? lab(L, ct) : undefined, lat: c && c[0], lon: c && c[1] });
    }).filter((l) => l.n || l.lat !== undefined);
    out.push(clean({
      ...b,
      t: 'm',
      k,
      f: one(formula, id),
      cs: crystal.slice(0, 2).join(' / '),
      st,
      sc: STRUNZ[stClass],
      y: yIma ? Number(yIma[1]) : undefined,
      h: range(nums(mohs, id).filter((x) => x > 0 && x <= 10)),
      dn: range(nums(dens, id).map((x) => round(x / 1000, 4)).filter((x) => x > 0.5 && x < 25)),
      mi: one(mindat, id),
      ima: (/\((\w+)\)\s*$/.exec(stLabel) || [])[1],
      par: parents.slice(0, 3),
      na: uniq((named.get(id) || []).map((v) => lab(L, qid(v))).filter(Boolean)).slice(0, 2).join('、'),
      loc: locs,
    }));
  }
  console.log(`  鉱物 ${out.length} 件`);
  return out;
}

// ---------- 2. 岩石 ----------
const G_ROCK = '?i wdt:P279+ wd:Q8063 .';
const ROCK_KINDS = [
  ['Q42045', '火成岩'], ['Q108689', '火山岩'], ['Q4054760', '深成岩'], ['Q354025', '貫入岩'], ['Q512121', '火山砕屑岩'],
  ['Q82480', '堆積岩'], ['Q141265866', '砕屑岩'], ['Q47069', '変成岩'], ['Q12122900', '交代岩'], ['Q976105', '衝突岩（インパクタイト）'],
  ['Q468438', 'テクタイト'], ['Q1143398', '超苦鉄質岩'], ['Q60186', '隕石'],
];
const NOT_STONE = /concrete|cement|asphalt|\bore$|^ore\b|^meteorite$|brick|mortar|aggregate$/i;
async function buildRocks(skip) {
  console.log('岩石…');
  const base = await common(G_ROCK, 'rock');
  const [members, parent, mindat, dens, ...kindRows] = await pool([
    () => sparql(`SELECT DISTINCT ?i WHERE { ${G_ROCK} }`, 'rock members'),
    () => prop(G_ROCK, 'wdt:P279', 'rock parent'),
    () => prop(G_ROCK, 'wdt:P6263', 'rock mindat'),
    () => prop(G_ROCK, 'p:P2054/psn:P2054/wikibase:quantityAmount', 'rock density'),
    ...ROCK_KINDS.map(([k]) => () => sparql(`SELECT DISTINCT ?i WHERE { ?i wdt:P279* wd:${k} . ${G_ROCK} }`, 'rock kind ' + k)),
  ]);
  const kindSets = kindRows.map((rows) => new Set(rows.map((r) => qid(r.i))));
  const L = await labelsOf([...parent.values()].flat().map(qid), 'rock refs');
  const cls0 = (id) => kindSets.some((set) => set.has(id));
  const out = [];
  for (const r of members) {
    const id = qid(r.i);
    if (skip.has(id)) continue;
    const b = base(id);
    if (!b.ja && !b.en) continue;
    if (NOT_STONE.test(b.en || '')) continue; // コンクリートや鉱石など、岩石の下位に登録されているが石そのものではない項目
    if (!b.wj && !b.we && !(b.img && cls0(id))) continue; // Wikipedia 記事が無い細目は、分類と写真がそろうものだけ
    const cls = ROCK_KINDS.filter((_, k) => kindSets[k].has(id)).map(([, ja]) => ja);
    out.push(clean({
      ...b,
      t: 'r',
      cls,
      parn: uniq((parent.get(id) || []).map((v) => lab(L, qid(v))).filter(Boolean)).slice(0, 3),
      mi: one(mindat, id),
      dn: range(nums(dens, id).map((x) => round(x / 1000, 4)).filter((x) => x > 0.2 && x < 25)),
    }));
  }
  console.log(`  岩石 ${out.length} 件`);
  return out;
}

// ---------- 3. 隕石 ----------
const G_MET = '?i wdt:P31/wdt:P279* wd:Q60186 .';
const MET_NAMES = { shergottite: 'シャーゴッタイト', ureilite: 'ユレイライト', nakhlite: 'ナクライト', howardite: 'ホワルダイト', eucrite: 'ユークライト', diogenite: 'ダイオジェナイト', aubrite: 'オーブライト', angrite: 'アングライト', '試料': '', '結晶': '', 'ビトラス': '' };
const metClass = (x) => (x in MET_NAMES ? MET_NAMES[x] : x).replace(/\s*\(.*\)$/, '').replace(/ chondrite$/i, ' コンドライト').replace(/^(L|H|LL|E) コンドライト$/, '$1コンドライト').replace(/ achondrite$/i, ' エイコンドライト').replace(/ meteorite$/i, ' 隕石');
async function buildMeteorites(skip) {
  console.log('隕石…');
  const base = await common(G_MET, 'meteorite', { anyLabel: true });
  const [cls, mass, coord, country, place, found, fell, metbull] = await pool([
    () => prop(G_MET, 'wdt:P31', 'met class'),
    () => prop(G_MET, 'p:P2067/psn:P2067/wikibase:quantityAmount', 'met mass'),
    () => prop(G_MET, 'wdt:P625', 'met coord'),
    () => prop(G_MET, 'wdt:P17', 'met country'),
    () => prop(G_MET, 'wdt:P189', 'met place'),
    () => prop(G_MET, 'wdt:P575', 'met found'),
    () => prop(G_MET, 'wdt:P585', 'met fell'),
    () => prop(G_MET, 'wdt:P824', 'metbull'),
  ]);
  const refs = [];
  for (const m of [cls, country, place]) for (const arr of m.values()) for (const v of arr) refs.push(qid(v));
  const L = await labelsOf(refs, 'met refs');
  const out = [];
  for (const id of cls.keys()) {
    if (skip.has(id)) continue;
    const b = base(id);
    if (!b.ja && !b.en) continue;
    const c = point(one(coord, id));
    const pl = L.get(qid(one(place, id) || '')) || {};
    const ct = lab(L, qid(one(country, id) || ''));
    const loc = clean({ n: pl.ja || pl.en, ne: pl.ja ? pl.en : undefined, c: ct, lat: c && c[0], lon: c && c[1] });
    out.push(clean({
      ...b,
      t: 'x',
      cls: uniq((cls.get(id) || []).map(qid).filter((x) => x !== 'Q60186').map((x) => lab(L, x)).filter(Boolean).map(metClass).filter(Boolean)),
      m: round(max(nums(mass, id).filter((x) => x > 0)), 6),
      y: yearOf(one(fell, id)) || yearOf(one(found, id)),
      fell: yearOf(one(fell, id)) ? 1 : undefined,
      mb: /^\d+$/.test(one(metbull, id) || '') ? one(metbull, id) : undefined,
      loc: Object.keys(loc).length ? [loc] : undefined,
    }));
  }
  console.log(`  隕石 ${out.length} 件`);
  return out;
}

// ---------- 4. 名のある石（巨石・迷子石・奇岩・有名なダイヤモンド） ----------
const NAMED = [['Q372934', '迷子石'], ['Q581776', '巨石'], ['Q4850014', 'バランス岩'], ['Q653208', '一枚岩'], ['Q631305', '奇岩・岩の造形'], ['Q5283', 'ダイヤモンド']];
const G_NAMED = `VALUES ?cls { ${NAMED.map(([q]) => 'wd:' + q).join(' ')} } ?i wdt:P31 ?cls .`;
async function buildNamed(skip) {
  console.log('名のある石…');
  const base = await common(G_NAMED, 'named', { anyLabel: true });
  const [cls, coord, country, admin, mass, height, length, width, material] = await pool([
    () => prop(G_NAMED, 'wdt:P31', 'named class'),
    () => prop(G_NAMED, 'wdt:P625', 'named coord'),
    () => prop(G_NAMED, 'wdt:P17', 'named country'),
    () => prop(G_NAMED, 'wdt:P131', 'named admin'),
    () => prop(G_NAMED, 'p:P2067/psn:P2067/wikibase:quantityAmount', 'named mass'),
    () => prop(G_NAMED, 'p:P2048/psn:P2048/wikibase:quantityAmount', 'named height'),
    () => prop(G_NAMED, 'p:P2043/psn:P2043/wikibase:quantityAmount', 'named length'),
    () => prop(G_NAMED, 'p:P2049/psn:P2049/wikibase:quantityAmount', 'named width'),
    () => prop(G_NAMED, 'wdt:P186', 'named material'),
  ]);
  const refs = [];
  for (const m of [country, admin, material]) for (const arr of m.values()) for (const v of arr) refs.push(qid(v));
  const L = await labelsOf(refs, 'named refs');
  const kindOf = new Map(NAMED);
  const out = [];
  for (const id of cls.keys()) {
    if (skip.has(id)) continue;
    const b = base(id);
    if (!b.ja && !b.en) continue;
    const kinds = (cls.get(id) || []).map(qid).filter((x) => kindOf.has(x));
    const c = point(one(coord, id));
    const size = { m: round(max(nums(mass, id).filter((x) => x > 0)), 6), hgt: round(max(nums(height, id).filter((x) => x > 0)), 4), len: round(max(nums(length, id).filter((x) => x > 0)), 4), wid: round(max(nums(width, id).filter((x) => x > 0)), 4) };
    const hasSize = Object.values(size).some((x) => x !== undefined);
    // 奇岩・一枚岩は件数が多いので、写真か大きさ、記事のあるものに絞る
    if ((kinds[0] === 'Q631305' || kinds[0] === 'Q653208') && !b.img && !hasSize && !b.wj) continue;
    if (!c && !b.img && !hasSize) continue;
    const ad = L.get(qid(one(admin, id) || '')) || {};
    const loc = clean({ n: ad.ja || ad.en, ne: ad.ja ? ad.en : undefined, c: lab(L, qid(one(country, id) || '')), lat: c && c[0], lon: c && c[1] });
    out.push(clean({
      ...b,
      t: 'n',
      k: kindOf.get(kinds[0]),
      ...size,
      mat: uniq((material.get(id) || []).map((v) => lab(L, qid(v))).filter(Boolean)).slice(0, 3),
      loc: Object.keys(loc).length ? [loc] : undefined,
    }));
  }
  console.log(`  名のある石 ${out.length} 件`);
  return out;
}

// ---------- 5. 産状（できかた）キーワード: 英語版 Wikipedia の鉱物記事を全文検索 ----------
const ENV = [
  ['熱水', 'hydrothermal'], ['ペグマタイト', 'pegmatite'], ['火山', 'volcanic'], ['火成岩（マグマ）', 'igneous OR magmatic'],
  ['変成', 'metamorphic OR metamorphism'], ['スカルン（接触変成）', 'skarn'], ['堆積', 'sedimentary'], ['蒸発岩（塩湖・海水の蒸発）', 'evaporite'],
  ['酸化帯（二次鉱物）', '"oxidized zone" OR "oxidation zone" OR "secondary mineral"'], ['風化', 'weathering'], ['噴気孔（火山ガス）', 'fumarole OR fumarolic'],
  ['隕石', 'meteorite'], ['マントル・キンバーライト', 'kimberlite OR "upper mantle"'], ['砂鉱（川や浜の砂）', 'placer'], ['洞窟・グアノ', 'guano'],
];
async function wikiSearch(srsearch) {
  const file = CACHE && join(CACHE, 'wp-' + createHash('sha1').update(srsearch).digest('hex') + '.json');
  if (file) try { return JSON.parse(await readFile(file, 'utf8')); } catch { /* 未取得 */ }
  const titles = [];
  let offset = 0;
  for (;;) {
    const url = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(srsearch)}&srlimit=500&sroffset=${offset}&srprop=&format=json&maxlag=5`;
    let json;
    for (let attempt = 1; ; attempt++) {
      const res = await fetch(url, { headers: { 'User-Agent': UA } });
      const text = await res.text();
      if (res.ok && text.startsWith('{')) { json = JSON.parse(text); if (!json.error) break; }
      if (attempt >= 5) throw new Error(`Wikipedia 検索 HTTP ${res.status}: ${text.slice(0, 120)}`);
      await sleep(4000 * attempt);
    }
    for (const s of json.query.search) titles.push(s.title);
    if (!json.continue) break;
    offset = json.continue.sroffset;
    await sleep(600);
  }
  if (file) { await mkdir(CACHE, { recursive: true }); await writeFile(file, JSON.stringify(titles)); }
  return titles;
}
async function addEnvironments(minerals, previous) {
  console.log('産状キーワード（Wikipedia 検索）…');
  const byTitle = new Map(minerals.filter((s) => s.we).map((s) => [s.we, s]));
  try {
    for (const [ja, kw] of ENV) {
      const titles = await wikiSearch(`hastemplate:"Infobox mineral" ${kw}`);
      let n = 0;
      for (const t of titles) {
        const s = byTitle.get(t);
        if (!s) continue;
        (s.env ||= []).push(ja);
        n++;
      }
      console.log(`  ${ja}: ${n} 件`);
      await sleep(800);
    }
  } catch (e) {
    console.warn(`  取得に失敗（${e.message}）。前回のデータの産状キーワードを引き継ぎます。`);
    const prev = new Map((previous || []).filter((s) => s.env).map((s) => [s.id, s.env]));
    for (const s of minerals) { delete s.env; if (prev.has(s.id)) s.env = prev.get(s.id); }
  }
}

// ---------- 実行 ----------
const t0 = Date.now();
let previous = null;
try { previous = JSON.parse(await readFile(OUT, 'utf8')); } catch { /* 初回 */ }

const minerals = await buildMinerals();
const seen = new Set(minerals.map((s) => s.id));
const rocks = await buildRocks(seen);
rocks.forEach((s) => seen.add(s.id));
const meteorites = await buildMeteorites(seen);
meteorites.forEach((s) => seen.add(s.id));
const named = await buildNamed(seen);
await addEnvironments(minerals, previous && previous.stones);

// 変種・宝石は、化学式や硬度が無ければ親の鉱物から補う
const byId = new Map(minerals.map((s) => [s.id, s]));
for (const s of minerals) {
  const p = s.par && byId.get(s.par[0]);
  if (!p || s.k === '鉱物種' || s.k === '鉱物グループ') continue;
  for (const k of ['f', 'cs', 'h', 'dn', 'sc', 'env']) if (s[k] === undefined && p[k] !== undefined) s[k] = p[k];
}

const stones = [...minerals, ...rocks, ...meteorites, ...named];
const counts = { mineral: minerals.length, rock: rocks.length, meteorite: meteorites.length, named: named.length, total: stones.length, image: stones.filter((s) => s.img).length, located: stones.filter((s) => s.loc && s.loc.some((l) => l.lat !== undefined)).length };
console.log('件数:', counts);

// 取得漏れで件数が大きく減ったときは上書きしない
if (minerals.length < 4000 || rocks.length < 200 || meteorites.length < 500) throw new Error('件数が少なすぎます。Wikidata 側の変更かクエリの失敗の可能性があるため、書き出しを中止しました。');
if (previous && previous.counts && counts.total < previous.counts.total * 0.8) throw new Error(`件数が前回 (${previous.counts.total}) の 8 割未満です。書き出しを中止しました。`);

await mkdir(dirname(OUT), { recursive: true });
await writeFile(OUT, JSON.stringify({ generated: new Date().toISOString().slice(0, 10), source: 'Wikidata (CC0) / Wikipedia 検索', counts, stones }));
console.log(`書き出し完了: ${OUT}（${((Date.now() - t0) / 1000).toFixed(0)} 秒）`);
