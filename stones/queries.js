// Wikidata SPARQL クエリ定義（ブラウザと build-data.mjs の両方から使う）
// 石（鉱物・岩石・隕石）の基礎データを Wikidata から取り出す。
// Q番号に依存せず、英語ラベル（"mineral species" など）やプロパティ（IMAステータス P579 など）で
// 対象を絞っているので、Wikidata 側の項目構成が多少変わっても動く。

export const SPARQL_ENDPOINT = 'https://query.wikidata.org/sparql';

// 鉱物の基本情報（名前・化学式・画像・結晶系・硬度・密度・発見年・IMA・Wikipedia記事）
export const MINERAL_CORE = `
SELECT ?item
  (SAMPLE(?ja) AS ?ja) (SAMPLE(?en) AS ?en)
  (SAMPLE(?formula) AS ?formula)
  (SAMPLE(?img) AS ?img)
  (SAMPLE(?csJa) AS ?csJa) (SAMPLE(?csEn) AS ?csEn)
  (MIN(?mohs) AS ?mohsMin) (MAX(?mohs) AS ?mohsMax)
  (MIN(?density) AS ?densityMin) (MAX(?density) AS ?densityMax)
  (SAMPLE(?disc) AS ?disc)
  (SAMPLE(?imaEn) AS ?ima)
  (SAMPLE(?commons) AS ?commons)
  (SAMPLE(?jawiki) AS ?jawiki) (SAMPLE(?enwiki) AS ?enwiki)
  (SAMPLE(?namedJa) AS ?namedJa) (SAMPLE(?namedEn) AS ?namedEn)
WHERE {
  { ?item wdt:P579 [] . }
  UNION { ?item wdt:P31 ?c1 . ?c1 rdfs:label "mineral species"@en . }
  UNION { ?item wdt:P31 ?c2 . ?c2 rdfs:label "mineral"@en . ?item wdt:P274 [] . }
  UNION { ?item wdt:P31 ?c3 . ?c3 rdfs:label "mineral variety"@en . }
  OPTIONAL { ?item rdfs:label ?ja FILTER(LANG(?ja) = "ja") }
  OPTIONAL { ?item rdfs:label ?en FILTER(LANG(?en) = "en") }
  OPTIONAL { ?item wdt:P274 ?formula }
  OPTIONAL { ?item wdt:P18 ?img }
  OPTIONAL { ?item wdt:P556 ?cs .
    OPTIONAL { ?cs rdfs:label ?csJa FILTER(LANG(?csJa) = "ja") }
    OPTIONAL { ?cs rdfs:label ?csEn FILTER(LANG(?csEn) = "en") } }
  OPTIONAL { ?item wdt:P1088 ?mohs }
  OPTIONAL { ?item wdt:P2054 ?density }
  OPTIONAL { ?item wdt:P575 ?disc }
  OPTIONAL { ?item wdt:P579 ?imaS . ?imaS rdfs:label ?imaEn FILTER(LANG(?imaEn) = "en") }
  OPTIONAL { ?item wdt:P373 ?commons }
  OPTIONAL { ?jawiki schema:about ?item ; schema:isPartOf <https://ja.wikipedia.org/> }
  OPTIONAL { ?enwiki schema:about ?item ; schema:isPartOf <https://en.wikipedia.org/> }
  OPTIONAL { ?item wdt:P138 ?named .
    OPTIONAL { ?named rdfs:label ?namedJa FILTER(LANG(?namedJa) = "ja") }
    OPTIONAL { ?named rdfs:label ?namedEn FILTER(LANG(?namedEn) = "en") } }
}
GROUP BY ?item`;

// 模式産地（タイプ・ロカリティ）と座標・国
export const MINERAL_LOCALITY = `
SELECT ?item
  (SAMPLE(?locJa) AS ?locJa) (SAMPLE(?locEn) AS ?locEn)
  (SAMPLE(?coord) AS ?coord)
  (SAMPLE(?ctJa) AS ?ctJa) (SAMPLE(?ctEn) AS ?ctEn)
WHERE {
  ?item wdt:P2695 ?loc .
  OPTIONAL { ?loc rdfs:label ?locJa FILTER(LANG(?locJa) = "ja") }
  OPTIONAL { ?loc rdfs:label ?locEn FILTER(LANG(?locEn) = "en") }
  OPTIONAL { ?loc wdt:P625 ?coord }
  OPTIONAL { ?loc wdt:P17 ?ct .
    OPTIONAL { ?ct rdfs:label ?ctJa FILTER(LANG(?ctJa) = "ja") }
    OPTIONAL { ?ct rdfs:label ?ctEn FILTER(LANG(?ctEn) = "en") } }
}
GROUP BY ?item`;

// 色・条痕色（化学式を持つ項目＝ほぼ鉱物に限定）
export const MINERAL_COLORS = `
SELECT ?item
  (GROUP_CONCAT(DISTINCT ?cJa; separator="|") AS ?colorsJa)
  (GROUP_CONCAT(DISTINCT ?cEn; separator="|") AS ?colorsEn)
  (GROUP_CONCAT(DISTINCT ?sJa; separator="|") AS ?streakJa)
  (GROUP_CONCAT(DISTINCT ?sEn; separator="|") AS ?streakEn)
WHERE {
  ?item wdt:P274 [] .
  { ?item wdt:P462 ?col .
    OPTIONAL { ?col rdfs:label ?cJa FILTER(LANG(?cJa) = "ja") }
    OPTIONAL { ?col rdfs:label ?cEn FILTER(LANG(?cEn) = "en") } }
  UNION
  { ?item wdt:P534 ?st .
    OPTIONAL { ?st rdfs:label ?sJa FILTER(LANG(?sJa) = "ja") }
    OPTIONAL { ?st rdfs:label ?sEn FILTER(LANG(?sEn) = "en") } }
}
GROUP BY ?item`;

// 岩石（火成岩・堆積岩・変成岩の下位分類）
export const ROCKS = `
SELECT ?item
  (SAMPLE(?ja) AS ?ja) (SAMPLE(?en) AS ?en)
  (SAMPLE(?img) AS ?img)
  (GROUP_CONCAT(DISTINCT ?kindLabel; separator="|") AS ?kinds)
  (SAMPLE(?formula) AS ?formula)
  (MIN(?density) AS ?densityMin) (MAX(?density) AS ?densityMax)
  (SAMPLE(?commons) AS ?commons)
  (SAMPLE(?jawiki) AS ?jawiki) (SAMPLE(?enwiki) AS ?enwiki)
WHERE {
  VALUES ?kindLabel { "igneous rock"@en "sedimentary rock"@en "metamorphic rock"@en "volcanic rock"@en "plutonic rock"@en }
  ?kind rdfs:label ?kindLabel .
  ?item (wdt:P31|wdt:P279)/wdt:P279* ?kind .
  OPTIONAL { ?item rdfs:label ?ja FILTER(LANG(?ja) = "ja") }
  OPTIONAL { ?item rdfs:label ?en FILTER(LANG(?en) = "en") }
  OPTIONAL { ?item wdt:P18 ?img }
  OPTIONAL { ?item wdt:P274 ?formula }
  OPTIONAL { ?item wdt:P2054 ?density }
  OPTIONAL { ?item wdt:P373 ?commons }
  OPTIONAL { ?jawiki schema:about ?item ; schema:isPartOf <https://ja.wikipedia.org/> }
  OPTIONAL { ?enwiki schema:about ?item ; schema:isPartOf <https://en.wikipedia.org/> }
}
GROUP BY ?item`;

// 隕石（Wikipedia 記事があるもの）: 質量・寸法・落下/発見地点・分類
export const METEORITES = `
SELECT ?item
  (SAMPLE(?ja) AS ?ja) (SAMPLE(?en) AS ?en)
  (SAMPLE(?img) AS ?img)
  (SAMPLE(?coord) AS ?coord)
  (SAMPLE(?ctJa) AS ?ctJa) (SAMPLE(?ctEn) AS ?ctEn)
  (MAX(?massKg) AS ?massKg)
  (MAX(?lenM) AS ?lengthM) (MAX(?widM) AS ?widthM) (MAX(?heiM) AS ?heightM)
  (SAMPLE(?found) AS ?found) (SAMPLE(?fell) AS ?fell)
  (GROUP_CONCAT(DISTINCT ?clsJa; separator="|") AS ?classesJa)
  (GROUP_CONCAT(DISTINCT ?clsEn; separator="|") AS ?classesEn)
  (SAMPLE(?commons) AS ?commons)
  (SAMPLE(?jawiki) AS ?jawiki) (SAMPLE(?enwiki) AS ?enwiki)
WHERE {
  ?mcls rdfs:label "meteorite"@en .
  ?item wdt:P31/wdt:P279* ?mcls .
  ?item wikibase:sitelinks ?sl . FILTER(?sl > 0)
  OPTIONAL { ?item rdfs:label ?ja FILTER(LANG(?ja) = "ja") }
  OPTIONAL { ?item rdfs:label ?en FILTER(LANG(?en) = "en") }
  OPTIONAL { ?item wdt:P18 ?img }
  OPTIONAL { ?item wdt:P625 ?coord }
  OPTIONAL { ?item wdt:P17 ?ct .
    OPTIONAL { ?ct rdfs:label ?ctJa FILTER(LANG(?ctJa) = "ja") }
    OPTIONAL { ?ct rdfs:label ?ctEn FILTER(LANG(?ctEn) = "en") } }
  OPTIONAL { ?item p:P2067/psn:P2067/wikibase:quantityAmount ?massKg }
  OPTIONAL { ?item p:P2043/psn:P2043/wikibase:quantityAmount ?lenM }
  OPTIONAL { ?item p:P2049/psn:P2049/wikibase:quantityAmount ?widM }
  OPTIONAL { ?item p:P2048/psn:P2048/wikibase:quantityAmount ?heiM }
  OPTIONAL { ?item wdt:P575 ?found }
  OPTIONAL { ?item wdt:P585 ?fell }
  OPTIONAL { ?item wdt:P31 ?cls .
    OPTIONAL { ?cls rdfs:label ?clsJa FILTER(LANG(?clsJa) = "ja") }
    OPTIONAL { ?cls rdfs:label ?clsEn FILTER(LANG(?clsEn) = "en") } }
  OPTIONAL { ?item wdt:P373 ?commons }
  OPTIONAL { ?jawiki schema:about ?item ; schema:isPartOf <https://ja.wikipedia.org/> }
  OPTIONAL { ?enwiki schema:about ?item ; schema:isPartOf <https://en.wikipedia.org/> }
}
GROUP BY ?item`;

// 鉱物・岩石のうち寸法（長さ・幅・高さ）や質量が登録されている有名標本
export const SPECIMEN_SIZES = `
SELECT ?item
  (MAX(?massKg) AS ?massKg)
  (MAX(?lenM) AS ?lengthM) (MAX(?widM) AS ?widthM) (MAX(?heiM) AS ?heightM)
WHERE {
  { ?item wdt:P579 [] } UNION { ?item wdt:P31 ?c . ?c rdfs:label "mineral species"@en }
  { ?item p:P2067/psn:P2067/wikibase:quantityAmount ?massKg }
  UNION { ?item p:P2043/psn:P2043/wikibase:quantityAmount ?lenM }
  UNION { ?item p:P2049/psn:P2049/wikibase:quantityAmount ?widM }
  UNION { ?item p:P2048/psn:P2048/wikibase:quantityAmount ?heiM }
}
GROUP BY ?item`;

export const QUERIES = {
  mineralCore: MINERAL_CORE,
  mineralLocality: MINERAL_LOCALITY,
  mineralColors: MINERAL_COLORS,
  rocks: ROCKS,
  meteorites: METEORITES,
  specimenSizes: SPECIMEN_SIZES,
};

/** SPARQL JSON 結果を {変数名: 値} の配列に平坦化 */
export function flattenBindings(json) {
  const rows = (json && json.results && json.results.bindings) || [];
  return rows.map((b) => {
    const o = {};
    for (const k of Object.keys(b)) o[k] = b[k].value;
    return o;
  });
}

/** 取得した各クエリ結果を 1 つの石レコード配列にまとめる */
export function mergeResults(r) {
  const byId = new Map();
  const qid = (uri) => (uri || '').replace(/^.*\//, '');
  const get = (uri, type) => {
    const id = qid(uri);
    let rec = byId.get(id);
    if (!rec) {
      rec = { id, type };
      byId.set(id, rec);
    }
    return rec;
  };
  const num = (v) => (v === undefined || v === '' || isNaN(Number(v)) ? undefined : Number(v));
  const year = (v) => {
    if (!v) return undefined;
    const m = String(v).match(/^(-?\d{1,4})/);
    return m ? Number(m[1]) : undefined;
  };
  const split = (v) => (v ? String(v).split('|').filter(Boolean) : []);
  const coord = (v) => {
    const m = v && String(v).match(/Point\(([-\d.eE+]+)\s+([-\d.eE+]+)\)/);
    return m ? { lon: Number(m[1]), lat: Number(m[2]) } : undefined;
  };
  const wikiTitle = (url) => {
    if (!url) return undefined;
    try {
      return decodeURIComponent(new URL(url).pathname.replace(/^\/wiki\//, ''));
    } catch {
      return undefined;
    }
  };
  const imgName = (url) => {
    if (!url) return undefined;
    try {
      return decodeURIComponent(new URL(url).pathname.replace(/^.*\/Special:FilePath\//, ''));
    } catch {
      return undefined;
    }
  };

  for (const row of r.mineralCore || []) {
    const x = get(row.item, 'mineral');
    Object.assign(x, {
      ja: row.ja,
      en: row.en,
      formula: row.formula,
      img: imgName(row.img),
      crystalJa: row.csJa,
      crystalEn: row.csEn,
      mohsMin: num(row.mohsMin),
      mohsMax: num(row.mohsMax),
      densityMin: num(row.densityMin),
      densityMax: num(row.densityMax),
      year: year(row.disc),
      ima: row.ima,
      commons: row.commons,
      jawiki: wikiTitle(row.jawiki),
      enwiki: wikiTitle(row.enwiki),
      namedAfter: row.namedJa || row.namedEn,
    });
  }
  for (const row of r.mineralLocality || []) {
    const id = qid(row.item);
    const x = byId.get(id);
    if (!x) continue;
    const c = coord(row.coord);
    x.loc = {
      name: row.locJa || row.locEn,
      nameEn: row.locEn,
      country: row.ctJa || row.ctEn,
      countryEn: row.ctEn,
      lat: c && c.lat,
      lon: c && c.lon,
    };
  }
  for (const row of r.mineralColors || []) {
    const x = byId.get(qid(row.item));
    if (!x) continue;
    x.colors = split(row.colorsJa).length ? split(row.colorsJa) : split(row.colorsEn);
    x.colorsEn = split(row.colorsEn);
    x.streak = split(row.streakJa).length ? split(row.streakJa) : split(row.streakEn);
  }
  for (const row of r.specimenSizes || []) {
    const x = byId.get(qid(row.item));
    if (!x) continue;
    x.massKg = num(row.massKg);
    x.lengthM = num(row.lengthM);
    x.widthM = num(row.widthM);
    x.heightM = num(row.heightM);
  }
  for (const row of r.rocks || []) {
    const id = qid(row.item);
    if (byId.has(id)) continue; // 鉱物として登録済みなら鉱物を優先
    const x = get(row.item, 'rock');
    Object.assign(x, {
      ja: row.ja,
      en: row.en,
      img: imgName(row.img),
      kinds: split(row.kinds),
      formula: row.formula,
      densityMin: num(row.densityMin),
      densityMax: num(row.densityMax),
      commons: row.commons,
      jawiki: wikiTitle(row.jawiki),
      enwiki: wikiTitle(row.enwiki),
    });
  }
  for (const row of r.meteorites || []) {
    const id = qid(row.item);
    if (byId.has(id)) continue;
    const x = get(row.item, 'meteorite');
    const c = coord(row.coord);
    Object.assign(x, {
      ja: row.ja,
      en: row.en,
      img: imgName(row.img),
      massKg: num(row.massKg),
      lengthM: num(row.lengthM),
      widthM: num(row.widthM),
      heightM: num(row.heightM),
      year: year(row.fell) || year(row.found),
      fellYear: year(row.fell),
      foundYear: year(row.found),
      classes: split(row.classesJa).length ? split(row.classesJa) : split(row.classesEn),
      classesEn: split(row.classesEn),
      commons: row.commons,
      jawiki: wikiTitle(row.jawiki),
      enwiki: wikiTitle(row.enwiki),
      loc: c || row.ctJa || row.ctEn
        ? { name: undefined, country: row.ctJa || row.ctEn, countryEn: row.ctEn, lat: c && c.lat, lon: c && c.lon }
        : undefined,
    });
  }

  // 名前が無い項目（ラベル未登録）は除外
  const out = [];
  for (const x of byId.values()) {
    if (!x.ja && !x.en) continue;
    for (const k of Object.keys(x)) if (x[k] === undefined) delete x[k];
    out.push(x);
  }
  out.sort((a, b) => (a.ja || a.en).localeCompare(b.ja || b.en, 'ja'));
  return out;
}
