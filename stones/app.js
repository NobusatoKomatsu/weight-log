// 世界の石 図鑑 — メインロジック
// データ: Wikidata (SPARQL) → data/stones.json（GitHub Actions が週次生成）/ ライブ取得 / 端末内キャッシュ
// 詳細: Wikipedia REST, Wikimedia Commons API, Mastodon 公開 API, Bluesky 公開 API
import { SPARQL_ENDPOINT, QUERIES, flattenBindings, mergeResults } from './queries.js';

const $ = (id) => document.getElementById(id);
const CACHE_KEY = 'stones.cache.v1';
const PREF_KEY = 'stones.prefs.v1';
const PAGE = 48;

// ---------- 元素・化学分類 ----------
const ELEMENTS = new Set('H He Li Be B C N O F Ne Na Mg Al Si P S Cl Ar K Ca Sc Ti V Cr Mn Fe Co Ni Cu Zn Ga Ge As Se Br Kr Rb Sr Y Zr Nb Mo Tc Ru Rh Pd Ag Cd In Sn Sb Te I Xe Cs Ba La Ce Pr Nd Pm Sm Eu Gd Tb Dy Ho Er Tm Yb Lu Hf Ta W Re Os Ir Pt Au Hg Tl Pb Bi Po At Rn Fr Ra Ac Th Pa U Np Pu'.split(' '));
const ELEMENT_JA = { H: '水素', C: '炭素', O: '酸素', F: 'フッ素', Na: 'ナトリウム', Mg: 'マグネシウム', Al: 'アルミニウム', Si: 'ケイ素', P: 'リン', S: '硫黄', Cl: '塩素', K: 'カリウム', Ca: 'カルシウム', Ti: 'チタン', Cr: 'クロム', Mn: 'マンガン', Fe: '鉄', Co: 'コバルト', Ni: 'ニッケル', Cu: '銅', Zn: '亜鉛', As: 'ヒ素', Ag: '銀', Sn: 'スズ', Sb: 'アンチモン', Ba: 'バリウム', W: 'タングステン', Pt: '白金', Au: '金', Hg: '水銀', Pb: '鉛', Bi: 'ビスマス', U: 'ウラン', B: 'ホウ素', Li: 'リチウム', Be: 'ベリリウム', Zr: 'ジルコニウム', Mo: 'モリブデン', V: 'バナジウム', Sr: 'ストロンチウム', Ce: 'セリウム', Y: 'イットリウム', Th: 'トリウム', Nb: 'ニオブ', Ta: 'タンタル', Te: 'テルル', Se: 'セレン', Cd: 'カドミウム', Tl: 'タリウム', Ge: 'ゲルマニウム', Ga: 'ガリウム', In: 'インジウム', Pd: 'パラジウム', Ir: 'イリジウム', Os: 'オスミウム', Rh: 'ロジウム', Ru: 'ルテニウム', Br: '臭素', I: 'ヨウ素', N: '窒素', Rb: 'ルビジウム', Cs: 'セシウム', La: 'ランタン', Nd: 'ネオジム', Sc: 'スカンジウム', Hf: 'ハフニウム', Re: 'レニウム' };
const POPULAR_ELEMENTS = ['Si', 'O', 'Al', 'Fe', 'Ca', 'Mg', 'Na', 'K', 'Cu', 'S', 'C', 'P', 'Pb', 'Zn', 'Mn', 'Ti', 'Ag', 'Au', 'U', 'Li', 'B', 'F', 'Cl', 'As'];

const SUB = { '₀': '0', '₁': '1', '₂': '2', '₃': '3', '₄': '4', '₅': '5', '₆': '6', '₇': '7', '₈': '8', '₉': '9' };
const SUP = { '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9', '⁺': '+', '⁻': '-' };
const normFormula = (f) => (f || '').replace(/[₀-₉]/g, (c) => SUB[c]).replace(/[⁰-⁹⁺⁻]/g, (c) => SUP[c]).replace(/\s+/g, '');

function elementsOf(normalized) {
  const found = new Set();
  for (const m of normalized.matchAll(/[A-Z][a-z]?/g)) {
    const sym = m[0];
    if (ELEMENTS.has(sym)) found.add(sym);
    else if (ELEMENTS.has(sym[0])) found.add(sym[0]);
  }
  return [...found];
}

const CHEM_CLASSES = {
  native: { ja: '元素鉱物', desc: '単一の元素（金・銀・銅・硫黄・炭素など）がそのまま結晶したもの。火成活動の熱水や、風化で取り残されて生じることが多い。' },
  sulfide: { ja: '硫化鉱物', desc: '金属と硫黄（またはヒ素・セレン・テルル）の化合物。マグマの熱水が岩の割れ目を通る際に沈殿して鉱脈をつくる、金属資源の代表格。' },
  halide: { ja: 'ハロゲン化鉱物', desc: 'フッ素・塩素などハロゲンと金属の化合物。海水や塩湖が蒸発して析出する（岩塩）ほか、熱水脈でも生じる（蛍石）。' },
  oxide: { ja: '酸化・水酸化鉱物', desc: '金属と酸素（水酸基）の化合物。マグマから直接晶出するもの、熱水で生じるもの、地表近くで風化してできるものがある。' },
  carbonate: { ja: '炭酸塩鉱物', desc: '炭酸イオン (CO₃) を含む。海の生物の殻や化学的沈殿で堆積岩としてできるほか、熱水や地表の風化・二次生成でも生じる。' },
  sulfate: { ja: '硫酸塩鉱物', desc: '硫酸イオン (SO₄) を含む。塩湖や内海の蒸発岩として析出したり、硫化鉱物が酸化されて二次的に生じる。' },
  phosphate: { ja: 'リン酸塩・ヒ酸塩・バナジン酸塩鉱物', desc: 'リン酸・ヒ酸・バナジン酸イオンを含む。ペグマタイト、熱水、生物起源の堆積、金属鉱床の酸化帯などでできる。' },
  silicate: { ja: 'ケイ酸塩鉱物', desc: 'ケイ素と酸素の四面体を骨格にもつ、地殻の 9 割を占めるグループ。マグマが冷え固まる、岩石が高温高圧で変成する、熱水が晶出するなど多くの過程でできる。' },
  borate: { ja: 'ホウ酸塩鉱物', desc: 'ホウ酸イオンを含む。火山活動の影響を受けた塩湖が蒸発してできる蒸発岩に多い。' },
  tungstate: { ja: 'タングステン酸塩・モリブデン酸塩・クロム酸塩鉱物', desc: '熱水脈や接触変成（スカルン）で生じるものが多い。' },
  nitrate: { ja: '硝酸塩鉱物', desc: '乾燥地帯の地表で、水に溶けやすい硝酸塩が蒸発して残ったもの。' },
  organic: { ja: '有機鉱物', desc: '生物由来の有機化合物が結晶したもの。グアノや石炭層などで見つかる。' },
  other: { ja: 'その他・未分類', desc: '' },
};

function chemClassOf(n, elements) {
  if (!n) return undefined;
  if (elements.length === 1) return 'native';
  const hasO = /O(?![a-z])/.test(n);
  if (/Si\d*O/.test(n) || /\(Si/.test(n) || /Si\d*\(?O/.test(n)) return 'silicate';
  if (/CO3/.test(n)) return 'carbonate';
  if (/SO4/.test(n)) return 'sulfate';
  if (/PO4|AsO4|VO4|PO3|AsO3/.test(n)) return 'phosphate';
  if (/WO4|MoO4|CrO4/.test(n)) return 'tungstate';
  if (/NO3/.test(n)) return 'nitrate';
  if (/BO3|B\d*O|BO4/.test(n)) return 'borate';
  if (/C2O4|C\d*H\d+(?![a-z])|CH\d|COO/.test(n) && hasO) return 'organic';
  if (!hasO && /(S|Se|Te|As|Sb|Bi)(?![a-z])/.test(n) && elements.some((e) => !['S', 'Se', 'Te', 'As', 'Sb', 'Bi'].includes(e))) return 'sulfide';
  if (!hasO && /(F|Cl|Br|I)(?![a-z])/.test(n)) return 'halide';
  if (hasO) return 'oxide';
  return 'other';
}

const ROCK_KINDS = {
  'igneous rock': { ja: '火成岩', desc: 'マグマが冷えて固まった岩石。' },
  'volcanic rock': { ja: '火山岩', desc: '火山から噴出したマグマが地表で急に冷え固まった岩石。結晶は細かい。' },
  'plutonic rock': { ja: '深成岩', desc: 'マグマが地下深くでゆっくり冷えて固まった岩石。粗い結晶が見える。' },
  'sedimentary rock': { ja: '堆積岩', desc: '砂や泥、生物の殻などが水底や地表に積もり、長い時間をかけて押し固められた岩石。' },
  'metamorphic rock': { ja: '変成岩', desc: 'もとの岩石が地下の高温・高圧やマグマの熱で、溶けずに組織や鉱物が作り替えられた岩石。' },
};
const ORIGIN_KEYWORDS = [
  ['熱水', /熱水|hydrothermal/i], ['ペグマタイト', /ペグマタイト|pegmatit/i], ['火成・マグマ', /マグマ|火成|igneous|magma|volcan|火山/i],
  ['変成', /変成|metamorph|スカルン|skarn/i], ['堆積・蒸発', /堆積|蒸発|sediment|evaporit|塩湖|salt lake/i], ['風化・二次鉱物', /風化|酸化帯|二次鉱物|weather|oxidiz|oxidis|secondary mineral/i],
  ['隕石・宇宙', /隕石|meteorit|月|lunar|火星|martian/i], ['生物起源', /生物|organism|biogenic|shell|化石|fossil/i],
];

// ---------- 状態 ----------
const state = {
  stones: [],
  filtered: [],
  shown: 0,
  meta: null,
  view: 'list',
  prefs: loadPrefs(),
  f: {
    q: '', type: '', elements: [], chem: '', crystal: '', color: '', origin: '', country: '',
    mohsMin: null, mohsMax: null, denMin: null, denMax: null, massMin: null, massMax: null,
    image: false, coord: false, formula: false, ja: false, radius: null, bbox: false,
  },
  center: null,
  bounds: null,
  sort: 'name',
  map: null,
  markers: null,
};

function loadPrefs() {
  try { return Object.assign({ mastodon: 'mastodon.social', theme: 'dark' }, JSON.parse(localStorage.getItem(PREF_KEY) || '{}')); } catch { return { mastodon: 'mastodon.social', theme: 'dark' }; }
}
function savePrefs() { try { localStorage.setItem(PREF_KEY, JSON.stringify(state.prefs)); } catch {} }

// ---------- ユーティリティ ----------
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const commonsThumb = (name, w = 480) => `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(name)}?width=${w}`;
const commonsPage = (name) => `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(name)}`;
const fmtNum = (v, d = 2) => (v === undefined || v === null ? '—' : Number(v).toLocaleString('ja-JP', { maximumFractionDigits: d }));
function fmtRange(a, b, unit = '', d = 2) {
  if (a === undefined && b === undefined) return '—';
  if (a === undefined || b === undefined || a === b) return `${fmtNum(a ?? b, d)}${unit}`;
  return `${fmtNum(a, d)}〜${fmtNum(b, d)}${unit}`;
}
function fmtMass(kg) {
  if (kg === undefined) return '—';
  if (kg >= 1000) return `${fmtNum(kg / 1000, 2)} t`;
  if (kg >= 1) return `${fmtNum(kg, 2)} kg`;
  if (kg >= 0.001) return `${fmtNum(kg * 1000, 1)} g`;
  return `${fmtNum(kg * 1e6, 1)} mg`;
}
function fmtLen(m) {
  if (m === undefined) return undefined;
  if (m >= 1) return `${fmtNum(m, 2)} m`;
  if (m >= 0.01) return `${fmtNum(m * 100, 1)} cm`;
  return `${fmtNum(m * 1000, 1)} mm`;
}
function renderFormula(f) {
  if (!f) return '';
  // 既にユニコード下付きなら <sub> に、通常の数字は元素・括弧の直後だけ下付きに
  let s = esc(f).replace(/[₀-₉]+/g, (m) => `<sub>${[...m].map((c) => SUB[c]).join('')}</sub>`);
  s = s.replace(/([A-Za-z\)\]])(\d+(?:\.\d+)?)/g, '$1<sub>$2</sub>');
  return `<span class="formula">${s}</span>`;
}
function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371, toR = Math.PI / 180;
  const dLat = (lat2 - lat1) * toR, dLon = (lon2 - lon1) * toR;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * toR) * Math.cos(lat2 * toR) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
function toast(msg) {
  const t = $('toast');
  t.textContent = msg; t.style.opacity = '1';
  clearTimeout(t._h); t._h = setTimeout(() => (t.style.opacity = '0'), 2200);
}
const icons = () => window.lucide && window.lucide.createIcons();
const typeJa = { mineral: '鉱物', rock: '岩石', meteorite: '隕石' };
const typeColor = { mineral: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-300', rock: 'bg-stone-500/15 text-stone-600 dark:text-stone-300', meteorite: 'bg-amber-500/15 text-amber-700 dark:text-amber-300' };

// ---------- データ読み込み ----------
function enrich(stones, meta) {
  for (const s of stones) {
    s.name = s.ja || s.en;
    s.nameEn = s.en || s.ja;
    s.formulaNorm = normFormula(s.formula);
    s.elements = s.formulaNorm ? elementsOf(s.formulaNorm) : [];
    s.chem = s.type === 'mineral' ? chemClassOf(s.formulaNorm, s.elements) : undefined;
    s.crystal = s.crystalJa || s.crystalEn;
    s.originKeys = s.type === 'rock' ? (s.kinds || []).map((k) => ROCK_KINDS[k] ? ROCK_KINDS[k].ja : k) : s.type === 'meteorite' ? (s.classes || []).filter((c) => !/^meteorite$|^隕石$/.test(c)) : [];
    s.hasCoord = !!(s.loc && s.loc.lat !== undefined && s.loc.lon !== undefined);
    s.size = s.massKg ?? (s.lengthM !== undefined || s.heightM !== undefined || s.widthM !== undefined ? -1 : undefined);
    s.search = [s.ja, s.en, s.formula, s.formulaNorm, s.loc && s.loc.name, s.loc && s.loc.nameEn, s.loc && s.loc.country, s.loc && s.loc.countryEn, s.id, s.crystal, ...(s.colors || []), ...(s.originKeys || []), s.chem && CHEM_CLASSES[s.chem].ja, s.namedAfter]
      .filter(Boolean).join(' ').toLowerCase();
  }
  state.stones = stones;
  state.meta = meta;
  buildFacets();
  $('headCount').textContent = `${stones.length.toLocaleString()} 件の石（鉱物 ${stones.filter((s) => s.type === 'mineral').length.toLocaleString()} / 岩石 ${stones.filter((s) => s.type === 'rock').length} / 隕石 ${stones.filter((s) => s.type === 'meteorite').length}）`;
}

async function loadData({ forceLive = false } = {}) {
  $('loading').classList.remove('hidden'); $('error').classList.add('hidden'); $('viewList').classList.add('hidden');
  const setMsg = (t, sub = '') => { $('loadingText').textContent = t; $('loadingSub').textContent = sub; };
  try {
    if (!forceLive) {
      setMsg('石のデータを読み込んでいます…', 'data/stones.json');
      try {
        const res = await fetch('data/stones.json', { cache: 'no-cache' });
        if (res.ok) {
          const json = await res.json();
          if (json && Array.isArray(json.stones) && json.stones.length) {
            enrich(json.stones, { generated: json.generated, source: 'ファイル（GitHub Actions 生成）' });
            return finishLoad();
          }
        }
      } catch (e) { console.warn('data file', e); }
      try {
        const raw = localStorage.getItem(CACHE_KEY);
        if (raw) {
          const json = JSON.parse(raw);
          if (json && json.stones && json.stones.length) {
            enrich(json.stones, { generated: json.generated, source: '端末内キャッシュ' });
            return finishLoad();
          }
        }
      } catch (e) { console.warn('cache', e); }
    }
    // ライブ取得
    const names = Object.keys(QUERIES);
    const results = {};
    let done = 0;
    setMsg('Wikidata から取得しています…（初回は 1〜2 分かかります）', `0 / ${names.length} クエリ完了`);
    await Promise.all(names.map(async (n) => {
      results[n] = await sparql(QUERIES[n]);
      done++;
      setMsg('Wikidata から取得しています…（初回は 1〜2 分かかります）', `${done} / ${names.length} クエリ完了（${n}: ${results[n].length} 行）`);
    }));
    const stones = mergeResults(results);
    if (!stones.length) throw new Error('Wikidata から石が 1 件も取得できませんでした。');
    const generated = new Date().toISOString();
    try { localStorage.setItem(CACHE_KEY, JSON.stringify({ generated, stones })); } catch (e) { console.warn('cache save', e); }
    enrich(stones, { generated, source: 'Wikidata ライブ取得' });
    finishLoad();
  } catch (e) {
    console.error(e);
    $('loading').classList.add('hidden');
    $('error').classList.remove('hidden');
    $('errorText').textContent = String(e && e.message || e);
    $('headCount').textContent = '読み込み失敗';
  }
}
async function sparql(query) {
  const url = `${SPARQL_ENDPOINT}?format=json&query=${encodeURIComponent(query)}`;
  const res = await fetch(url, { headers: { Accept: 'application/sparql-results+json' } });
  if (!res.ok) throw new Error(`Wikidata SPARQL HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return flattenBindings(await res.json());
}
function finishLoad() {
  $('loading').classList.add('hidden');
  applyFilters();
  showView(state.view);
  openFromHash();
}

// ---------- ファセット ----------
function buildFacets() {
  const count = (arr) => { const m = new Map(); for (const v of arr) if (v) m.set(v, (m.get(v) || 0) + 1); return [...m.entries()].sort((a, b) => b[1] - a[1]); };
  const fill = (sel, entries, label = (k) => k) => {
    const el = $(sel); const cur = el.value;
    el.innerHTML = '<option value="">すべて</option>' + entries.map(([k, n]) => `<option value="${esc(k)}">${esc(label(k))} (${n})</option>`).join('');
    el.value = cur;
  };
  fill('fClass', count(state.stones.map((s) => s.chem)), (k) => CHEM_CLASSES[k].ja);
  fill('fCrystal', count(state.stones.map((s) => s.crystal)));
  fill('fColor', count(state.stones.flatMap((s) => s.colors || [])).slice(0, 40));
  fill('fOrigin', count(state.stones.flatMap((s) => s.originKeys)).slice(0, 60));
  $('countryList').innerHTML = count(state.stones.map((s) => s.loc && s.loc.country)).map(([k]) => `<option value="${esc(k)}">`).join('');
  $('elementChips').innerHTML = POPULAR_ELEMENTS.map((e) => `<button class="chip bg-slate-200/70 dark:bg-white/10 hover:bg-emerald-500/20" data-el="${e}" title="${ELEMENT_JA[e] || e}">${e}<span class="opacity-60 text-[10px]">${ELEMENT_JA[e] || ''}</span></button>`).join('');
}

// ---------- 絞り込み ----------
function readFilters() {
  const f = state.f;
  const num = (id) => { const v = $(id).value; return v === '' ? null : Number(v); };
  f.q = $('q').value.trim().toLowerCase();
  f.elements = $('elementInput').value.split(/[\s,、]+/).map((s) => s.trim()).filter(Boolean).map((s) => s[0].toUpperCase() + s.slice(1).toLowerCase()).filter((s) => ELEMENTS.has(s));
  f.chem = $('fClass').value; f.crystal = $('fCrystal').value; f.color = $('fColor').value; f.origin = $('fOrigin').value;
  f.country = $('fCountry').value.trim().toLowerCase();
  f.mohsMin = num('fMohsMin'); f.mohsMax = num('fMohsMax'); f.denMin = num('fDenMin'); f.denMax = num('fDenMax'); f.massMin = num('fMassMin'); f.massMax = num('fMassMax');
  f.image = $('fImage').checked; f.coord = $('fCoord').checked; f.formula = $('fFormula').checked; f.ja = $('fJa').checked;
  f.radius = num('fRadius'); f.bbox = $('fBbox').checked;
  state.sort = $('sort').value;
  const active = [f.elements.length, f.chem, f.crystal, f.color, f.origin, f.country, f.mohsMin !== null || f.mohsMax !== null, f.denMin !== null || f.denMax !== null, f.massMin !== null || f.massMax !== null, f.image, f.coord, f.formula, f.ja, f.radius !== null && state.center, f.bbox].filter(Boolean).length;
  $('filterBadge').textContent = active; $('filterBadge').classList.toggle('hidden', !active);
  document.querySelectorAll('.chip[data-el]').forEach((b) => b.classList.toggle('!bg-emerald-500', f.elements.includes(b.dataset.el)));
  document.querySelectorAll('.chip[data-el]').forEach((b) => b.classList.toggle('!text-white', f.elements.includes(b.dataset.el)));
}

function applyFilters() {
  readFilters();
  const f = state.f, c = state.center, b = state.bounds;
  const qTokens = f.q ? f.q.split(/\s+/).filter(Boolean) : [];
  const qElem = qTokens.length === 1 && /^[A-Za-z]{1,2}$/.test(qTokens[0]) ? qTokens[0][0].toUpperCase() + qTokens[0].slice(1).toLowerCase() : null;
  const out = [];
  for (const s of state.stones) {
    if (f.type && s.type !== f.type) continue;
    if (qTokens.length) {
      const hit = qTokens.every((t) => s.search.includes(t)) || (qElem && ELEMENTS.has(qElem) && s.elements.includes(qElem));
      if (!hit) continue;
    }
    if (f.elements.length && !f.elements.every((e) => s.elements.includes(e))) continue;
    if (f.chem && s.chem !== f.chem) continue;
    if (f.crystal && s.crystal !== f.crystal) continue;
    if (f.color && !(s.colors || []).includes(f.color)) continue;
    if (f.origin && !s.originKeys.includes(f.origin)) continue;
    if (f.country && !((s.loc && (s.loc.country || '').toLowerCase().includes(f.country)) || (s.loc && (s.loc.countryEn || '').toLowerCase().includes(f.country)))) continue;
    if (f.mohsMin !== null && !(s.mohsMax !== undefined && s.mohsMax >= f.mohsMin)) continue;
    if (f.mohsMax !== null && !(s.mohsMin !== undefined && s.mohsMin <= f.mohsMax)) continue;
    if (f.denMin !== null && !(s.densityMax !== undefined && s.densityMax >= f.denMin)) continue;
    if (f.denMax !== null && !(s.densityMin !== undefined && s.densityMin <= f.denMax)) continue;
    if (f.massMin !== null && !(s.massKg !== undefined && s.massKg >= f.massMin)) continue;
    if (f.massMax !== null && !(s.massKg !== undefined && s.massKg <= f.massMax)) continue;
    if (f.image && !s.img) continue;
    if (f.coord && !s.hasCoord) continue;
    if (f.formula && !s.formula) continue;
    if (f.ja && !s.ja) continue;
    if (c && f.radius !== null) {
      if (!s.hasCoord) continue;
      if (haversine(c.lat, c.lon, s.loc.lat, s.loc.lon) > f.radius) continue;
    }
    if (f.bbox && b) {
      if (!s.hasCoord) continue;
      if (!b.contains([s.loc.lat, s.loc.lon])) continue;
    }
    if (c) s.dist = s.hasCoord ? haversine(c.lat, c.lon, s.loc.lat, s.loc.lon) : undefined;
    out.push(s);
  }
  const cmp = {
    name: (a, b) => a.name.localeCompare(b.name, 'ja'),
    mohs: (a, b) => (b.mohsMax ?? -1) - (a.mohsMax ?? -1),
    density: (a, b) => (b.densityMax ?? -1) - (a.densityMax ?? -1),
    mass: (a, b) => (b.massKg ?? -1) - (a.massKg ?? -1),
    year: (a, b) => (b.year ?? -9999) - (a.year ?? -9999),
    distance: (a, b) => (a.dist ?? 1e9) - (b.dist ?? 1e9),
    image: (a, b) => (b.img ? 1 : 0) - (a.img ? 1 : 0) || a.name.localeCompare(b.name, 'ja'),
  }[state.sort] || ((a, b) => 0);
  out.sort(cmp);
  state.filtered = out;
  state.shown = 0;
  $('grid').innerHTML = '';
  renderMore();
  $('resultCount').textContent = `${out.length.toLocaleString()} 件`;
  $('activeCenter').textContent = c ? `距離の中心: ${c.label}` : '';
  $('empty').classList.toggle('hidden', out.length > 0);
  if (state.map && state.view === 'map') renderMarkers();
}

function cardHtml(s) {
  const img = s.img ? `<img loading="lazy" src="${commonsThumb(s.img, 400)}" alt="${esc(s.name)}" class="h-full w-full object-cover" onerror="this.parentElement.innerHTML='<div class=\\'grid h-full place-items-center text-3xl\\'>🪨</div>'" />` : `<div class="grid h-full place-items-center text-3xl opacity-60">${s.type === 'meteorite' ? '☄️' : s.type === 'rock' ? '🪨' : '💎'}</div>`;
  const meta = [];
  if (s.mohsMax !== undefined) meta.push(`硬度 ${fmtRange(s.mohsMin, s.mohsMax, '', 1)}`);
  if (s.massKg !== undefined) meta.push(fmtMass(s.massKg));
  if (s.loc && (s.loc.country || s.loc.name)) meta.push(s.loc.country || s.loc.name);
  if (s.dist !== undefined) meta.push(`${fmtNum(s.dist, 0)} km`);
  return `<button class="card group text-left rounded-2xl overflow-hidden border border-slate-200/70 bg-white/80 shadow-sm hover:shadow-md transition dark:border-white/10 dark:bg-white/5" data-id="${s.id}">
    <div class="aspect-[4/3] overflow-hidden bg-slate-200/60 dark:bg-white/5">${img}</div>
    <div class="p-2.5">
      <div class="flex items-start justify-between gap-1"><p class="font-semibold leading-tight line-clamp-2">${esc(s.name)}</p><span class="chip shrink-0 ${typeColor[s.type]} !px-1.5 !py-0.5 !text-[10px]">${typeJa[s.type]}</span></div>
      ${s.ja && s.en && s.ja !== s.en ? `<p class="text-[11px] text-slate-500 truncate">${esc(s.en)}</p>` : ''}
      ${s.formula ? `<p class="mt-0.5 text-xs text-slate-600 dark:text-slate-300 truncate">${renderFormula(s.formula)}</p>` : ''}
      ${meta.length ? `<p class="mt-1 text-[11px] text-slate-500 truncate">${esc(meta.join(' · '))}</p>` : ''}
    </div></button>`;
}
function renderMore() {
  const next = state.filtered.slice(state.shown, state.shown + PAGE);
  $('grid').insertAdjacentHTML('beforeend', next.map(cardHtml).join(''));
  state.shown += next.length;
  $('btnMore').classList.toggle('hidden', state.shown >= state.filtered.length);
  $('btnMore').textContent = `もっと見る（残り ${(state.filtered.length - state.shown).toLocaleString()} 件）`;
}

// ---------- 表示切替 ----------
function showView(v) {
  state.view = v;
  document.querySelectorAll('[role=tab]').forEach((t) => t.setAttribute('aria-selected', String(t.dataset.view === v)));
  $('viewList').classList.toggle('hidden', v !== 'list' || !state.stones.length);
  $('viewMap').classList.toggle('hidden', v !== 'map');
  $('viewSns').classList.toggle('hidden', v !== 'sns');
  if (v === 'map') { initMap(); setTimeout(() => { state.map.invalidateSize(); renderMarkers(); }, 50); }
  if (v === 'sns' && !$('snsQ').value) { $('snsQ').value = $('q').value || 'mineral'; renderSnsLinks($('snsQ').value); }
}

// ---------- 地図 ----------
function initMap() {
  if (state.map) return;
  const map = L.map('map', { preferCanvas: true, worldCopyJump: true }).setView([30, 20], 2);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' }).addTo(map);
  state.markers = L.layerGroup().addTo(map);
  state.centerMarker = null;
  map.on('moveend', () => { state.bounds = map.getBounds(); if (state.f.bbox) applyFilters(); });
  map.on('contextmenu', (e) => setCenter(e.latlng.lat, e.latlng.lng, `地図上の地点 (${e.latlng.lat.toFixed(2)}, ${e.latlng.lng.toFixed(2)})`));
  state.map = map;
  state.bounds = map.getBounds();
}
function renderMarkers() {
  if (!state.map) return;
  state.markers.clearLayers();
  let n = 0;
  for (const s of state.filtered) {
    if (!s.hasCoord) continue;
    n++;
    const m = L.circleMarker([s.loc.lat, s.loc.lon], { radius: s.type === 'meteorite' ? 6 : 5, color: s.type === 'meteorite' ? '#f59e0b' : '#34d399', weight: 1, fillOpacity: 0.75 });
    m.bindPopup(`<div class="text-sm"><b>${esc(s.name)}</b>${s.en && s.en !== s.name ? `<br><span style="opacity:.7">${esc(s.en)}</span>` : ''}${s.loc.name ? `<br>${esc(s.loc.name)}` : ''}${s.loc.country ? ` / ${esc(s.loc.country)}` : ''}<br><button class="mt-1 underline" data-open="${s.id}">詳細を見る</button></div>`);
    state.markers.addLayer(m);
  }
  $('mapCount').textContent = `地図上 ${n.toLocaleString()} 点`;
  if (state.center) {
    if (state.centerMarker) state.centerMarker.remove();
    state.centerMarker = L.marker([state.center.lat, state.center.lon]).addTo(state.map).bindTooltip('距離の中心');
  }
}
function setCenter(lat, lon, label) {
  state.center = { lat, lon, label };
  $('centerLabel').textContent = `中心: ${label}`;
  if (!$('fRadius').value) $('fRadius').value = 500;
  if ($('sort').value === 'name') $('sort').value = 'distance';
  applyFilters();
  if (state.map) renderMarkers();
  toast('距離の中心を設定しました');
}

// ---------- 詳細 ----------
async function openDetail(id) {
  const s = state.stones.find((x) => x.id === id);
  if (!s) return;
  location.hash = s.id;
  $('detail').classList.remove('hidden');
  $('detailPanel').scrollTop = 0;
  $('dTitle').textContent = s.name;
  $('dSub').textContent = [s.en && s.en !== s.name ? s.en : null, typeJa[s.type], s.ima].filter(Boolean).join(' · ');
  const row = (k, v) => v === undefined || v === null || v === '' || v === '—' ? '' : `<div class="rounded-xl bg-white/70 p-3 dark:bg-white/5"><p class="text-[11px] text-slate-500">${k}</p><p class="mt-0.5 text-sm font-semibold">${v}</p></div>`;
  const dims = [s.lengthM && `長さ ${fmtLen(s.lengthM)}`, s.widthM && `幅 ${fmtLen(s.widthM)}`, s.heightM && `高さ ${fmtLen(s.heightM)}`].filter(Boolean).join(' × ');
  const chips = [
    s.chem && `<span class="chip bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">${esc(CHEM_CLASSES[s.chem].ja)}</span>`,
    ...(s.originKeys || []).map((k) => `<span class="chip bg-amber-500/15 text-amber-700 dark:text-amber-300">${esc(k)}</span>`),
    s.crystal && `<span class="chip bg-sky-500/15 text-sky-700 dark:text-sky-300">${esc(s.crystal)}</span>`,
    ...(s.colors || []).slice(0, 8).map((c) => `<span class="chip bg-slate-200/70 dark:bg-white/10">${esc(c)}</span>`),
    ...(s.elements || []).map((e) => `<button class="chip bg-slate-200/70 dark:bg-white/10 hover:bg-emerald-500/20" data-filter-el="${e}" title="${esc(ELEMENT_JA[e] || e)}を含む石を探す">${e}</button>`),
  ].filter(Boolean).join('');
  const locText = s.loc ? [s.loc.name, s.loc.country].filter(Boolean).join('、') : '';
  const origin = s.type === 'rock'
    ? (s.kinds || []).map((k) => ROCK_KINDS[k]).filter(Boolean).map((k) => `<p><b>${k.ja}</b>: ${k.desc}</p>`).join('')
    : s.type === 'meteorite' ? `<p>宇宙空間から地球に落下した天体の破片。${(s.classes || []).filter((c) => !/^meteorite$|^隕石$/.test(c)).length ? `分類: ${esc((s.classes || []).filter((c) => !/^meteorite$|^隕石$/.test(c)).join('、'))}。` : ''}${s.fellYear ? `${s.fellYear} 年に落下。` : ''}${s.foundYear ? `${s.foundYear} 年に発見。` : ''}</p>`
    : s.chem ? `<p><b>${CHEM_CLASSES[s.chem].ja}</b>: ${CHEM_CLASSES[s.chem].desc}</p>` : '';
  const q = encodeURIComponent(s.nameEn);
  const links = [
    s.jawiki && ['Wikipedia (日本語)', `https://ja.wikipedia.org/wiki/${encodeURIComponent(s.jawiki)}`],
    s.enwiki && ['Wikipedia (English)', `https://en.wikipedia.org/wiki/${encodeURIComponent(s.enwiki)}`],
    ['Wikidata', `https://www.wikidata.org/wiki/${s.id}`],
    s.type !== 'rock' && ['mindat.org', `https://www.mindat.org/search.php?search=${q}`],
    s.type === 'meteorite' && ['Meteoritical Bulletin', `https://www.lpi.usra.edu/meteor/metbull.php?sea=${q}&sfor=names`],
    s.type === 'mineral' && ['RRUFF', `https://rruff.info/${q}`],
    ['Google 画像', `https://www.google.com/search?tbm=isch&q=${q}+${encodeURIComponent(typeJa[s.type])}`],
    ['X (Twitter)', `https://x.com/search?q=${q}&f=media`],
    ['Instagram', `https://www.instagram.com/explore/tags/${encodeURIComponent(s.nameEn.replace(/[^\p{L}\p{N}]/gu, '').toLowerCase())}/`],
    ['Reddit', `https://www.reddit.com/search/?q=${q}`],
    ['Flickr', `https://www.flickr.com/search/?text=${q}`],
  ].filter(Boolean).map(([t, u]) => `<a class="btn btn-ghost !py-1 !text-xs" href="${u}" target="_blank" rel="noopener">${esc(t)}<i data-lucide="external-link" class="h-3 w-3"></i></a>`).join('');

  $('dBody').innerHTML = `
    <div class="grid gap-4 sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
      <div class="rounded-2xl overflow-hidden bg-slate-200/60 dark:bg-white/5 aspect-square sm:aspect-[4/3]">
        ${s.img ? `<a href="${commonsPage(s.img)}" target="_blank" rel="noopener"><img src="${commonsThumb(s.img, 800)}" alt="${esc(s.name)}" class="h-full w-full object-cover" /></a>` : `<div class="grid h-full place-items-center text-6xl opacity-60">${s.type === 'meteorite' ? '☄️' : s.type === 'rock' ? '🪨' : '💎'}</div>`}
      </div>
      <div class="space-y-3">
        ${s.formula ? `<p class="text-xl">${renderFormula(s.formula)}</p>` : ''}
        <div class="flex flex-wrap gap-1.5">${chips}</div>
        <div class="grid grid-cols-2 gap-2 sm:grid-cols-3">
          ${row('モース硬度', s.mohsMax !== undefined ? fmtRange(s.mohsMin, s.mohsMax, '', 1) : undefined)}
          ${row('密度', s.densityMax !== undefined ? fmtRange(s.densityMin, s.densityMax, ' g/cm³') : undefined)}
          ${row('結晶系', s.crystal)}
          ${row('質量', s.massKg !== undefined ? fmtMass(s.massKg) : undefined)}
          ${row('大きさ', dims || undefined)}
          ${row(s.type === 'meteorite' ? '落下・発見年' : '発見年', s.year)}
          ${row('条痕色', (s.streak || []).join('、') || undefined)}
          ${row('IMA', s.ima)}
          ${row('名前の由来', s.namedAfter)}
        </div>
        ${locText || s.hasCoord ? `<div class="rounded-xl bg-white/70 p-3 dark:bg-white/5"><p class="text-[11px] text-slate-500">${s.type === 'meteorite' ? '落下・発見地' : '模式産地（最初に記載された産地）'}</p><p class="mt-0.5 text-sm font-semibold">${esc(locText || '座標のみ')}</p>${s.hasCoord ? `<p class="text-xs text-slate-500 num">${s.loc.lat.toFixed(4)}, ${s.loc.lon.toFixed(4)}</p><div class="mt-2 flex flex-wrap gap-1.5"><button class="btn btn-ghost !py-1 !text-xs" data-map="${s.id}"><i data-lucide="map" class="h-3 w-3"></i>地図で見る</button><button class="btn btn-ghost !py-1 !text-xs" data-center="${s.id}"><i data-lucide="locate" class="h-3 w-3"></i>ここを中心に近くの石を探す</button><a class="btn btn-ghost !py-1 !text-xs" target="_blank" rel="noopener" href="https://www.google.com/maps?q=${s.loc.lat},${s.loc.lon}">Google マップ<i data-lucide="external-link" class="h-3 w-3"></i></a></div>` : ''}</div>` : ''}
      </div>
    </div>
    ${origin ? `<section><h3 class="font-bold mb-1 flex items-center gap-1.5"><i data-lucide="flame" class="h-4 w-4 text-amber-500"></i>できかた（成因）</h3><div class="text-sm leading-relaxed text-slate-700 dark:text-slate-300 space-y-1">${origin}</div><div id="dOriginTags" class="mt-2 flex flex-wrap gap-1.5"></div></section>` : ''}
    <section><h3 class="font-bold mb-1 flex items-center gap-1.5"><i data-lucide="book-open" class="h-4 w-4 text-sky-500"></i>解説（Wikipedia）</h3><div id="dWiki" class="text-sm leading-relaxed text-slate-700 dark:text-slate-300"><div class="skeleton h-16 rounded-xl"></div></div></section>
    <section><h3 class="font-bold mb-1 flex items-center gap-1.5"><i data-lucide="images" class="h-4 w-4 text-emerald-500"></i>写真（Wikimedia Commons）</h3><div id="dGallery" class="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6"><div class="skeleton aspect-square rounded-xl"></div><div class="skeleton aspect-square rounded-xl"></div><div class="skeleton aspect-square rounded-xl"></div></div></section>
    <section><h3 class="font-bold mb-1 flex items-center gap-1.5"><i data-lucide="message-circle" class="h-4 w-4 text-fuchsia-500"></i>SNS の投稿（Mastodon / Bluesky）</h3><div id="dSns" class="grid grid-cols-1 gap-2 sm:grid-cols-2"><div class="skeleton h-24 rounded-xl"></div><div class="skeleton h-24 rounded-xl"></div></div></section>
    <section><h3 class="font-bold mb-1 flex items-center gap-1.5"><i data-lucide="link" class="h-4 w-4 text-slate-400"></i>ほかのサイトで調べる</h3><div class="flex flex-wrap gap-1.5">${links}</div></section>`;
  icons();
  // 非同期で各サービスから補足情報を取得
  loadWiki(s); loadGallery(s); loadSnsFor(s);
}
function closeDetail() { $('detail').classList.add('hidden'); if (location.hash) history.replaceState(null, '', location.pathname + location.search); }
function openFromHash() { const id = location.hash.replace('#', ''); if (/^Q\d+$/.test(id)) openDetail(id); }

async function loadWiki(s) {
  const el = $('dWiki');
  const tries = [s.jawiki && ['ja', s.jawiki], s.enwiki && ['en', s.enwiki]].filter(Boolean);
  if (!tries.length) { el.innerHTML = '<p class="text-slate-500">Wikipedia の記事は登録されていません。</p>'; return; }
  for (const [lang, title] of tries) {
    try {
      const res = await fetch(`https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`);
      if (!res.ok) continue;
      const j = await res.json();
      if (!j.extract) continue;
      el.innerHTML = `<p>${esc(j.extract)}</p><a class="mt-1 inline-flex items-center gap-1 text-xs text-sky-600 underline dark:text-sky-300" href="${esc(j.content_urls?.desktop?.page || `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(title)}`)}" target="_blank" rel="noopener">Wikipedia (${lang}) で続きを読む</a>`;
      if (!s.img && j.thumbnail?.source) { /* 画像が無い石は Wikipedia のサムネイルを使う */ const box = $('dBody').querySelector('.aspect-square'); if (box) box.innerHTML = `<img src="${esc(j.thumbnail.source)}" class="h-full w-full object-cover" alt="" />`; }
      const tags = ORIGIN_KEYWORDS.filter(([, re]) => re.test(j.extract)).map(([t]) => `<span class="chip bg-amber-500/15 text-amber-700 dark:text-amber-300">${t}</span>`);
      const tagBox = $('dOriginTags');
      if (tagBox && tags.length) tagBox.innerHTML = `<span class="text-[11px] text-slate-500 self-center">本文から推定:</span>${tags.join('')}`;
      return;
    } catch (e) { console.warn('wiki', e); }
  }
  el.innerHTML = '<p class="text-slate-500">Wikipedia の要約を取得できませんでした。</p>';
}

async function loadGallery(s) {
  const el = $('dGallery');
  const api = 'https://commons.wikimedia.org/w/api.php';
  const common = '&prop=imageinfo&iiprop=url|extmetadata&iiurlwidth=320&format=json&origin=*';
  const urls = [];
  if (s.commons) urls.push(`${api}?action=query&generator=categorymembers&gcmtitle=${encodeURIComponent('Category:' + s.commons)}&gcmtype=file&gcmlimit=18${common}`);
  urls.push(`${api}?action=query&generator=search&gsrsearch=${encodeURIComponent(s.nameEn + (s.type === 'rock' ? ' rock' : s.type === 'meteorite' ? ' meteorite' : ' mineral'))}&gsrnamespace=6&gsrlimit=18${common}`);
  for (const u of urls) {
    try {
      const j = await (await fetch(u)).json();
      const pages = Object.values(j.query?.pages || {}).filter((p) => p.imageinfo && p.imageinfo[0].thumburl && /\.(jpe?g|png|webp|gif)$/i.test(p.title));
      if (!pages.length) continue;
      el.innerHTML = pages.map((p) => {
        const ii = p.imageinfo[0];
        const author = (ii.extmetadata?.Artist?.value || '').replace(/<[^>]+>/g, '');
        const lic = ii.extmetadata?.LicenseShortName?.value || '';
        return `<a href="${esc(ii.descriptionurl)}" target="_blank" rel="noopener" class="block aspect-square overflow-hidden rounded-xl bg-slate-200/60 dark:bg-white/5" title="${esc(p.title.replace(/^File:/, ''))}${author ? ' / ' + esc(author) : ''}${lic ? ' / ' + esc(lic) : ''}"><img loading="lazy" src="${esc(ii.thumburl)}" class="h-full w-full object-cover" alt="" /></a>`;
      }).join('');
      return;
    } catch (e) { console.warn('commons', e); }
  }
  el.innerHTML = '<p class="col-span-full text-sm text-slate-500">写真が見つかりませんでした。</p>';
}

// ---------- SNS ----------
function stripHtml(html) { const d = document.createElement('div'); d.innerHTML = html || ''; return (d.textContent || '').trim(); }
async function fetchMastodon(tag, limit = 20) {
  const inst = (state.prefs.mastodon || 'mastodon.social').replace(/^https?:\/\//, '').replace(/\/$/, '');
  const t = tag.replace(/^#/, '').replace(/[\s#]+/g, '');
  if (!t) return [];
  const res = await fetch(`https://${inst}/api/v1/timelines/tag/${encodeURIComponent(t)}?limit=${limit}`);
  if (!res.ok) throw new Error(`Mastodon HTTP ${res.status}`);
  return (await res.json()).map((p) => ({
    source: 'Mastodon', url: p.url, date: p.created_at, text: stripHtml(p.content),
    author: p.account?.display_name || p.account?.username, handle: `@${p.account?.acct}`, avatar: p.account?.avatar_static,
    images: (p.media_attachments || []).filter((m) => m.type === 'image').map((m) => ({ thumb: m.preview_url, full: m.url, alt: m.description })),
  }));
}
async function fetchBluesky(q, limit = 25) {
  const res = await fetch(`https://public.api.bsky.app/xrpc/app.bsky.feed.searchPosts?q=${encodeURIComponent(q)}&limit=${limit}`);
  if (!res.ok) throw new Error(`Bluesky HTTP ${res.status}`);
  const j = await res.json();
  return (j.posts || []).map((p) => {
    const rkey = (p.uri || '').split('/').pop();
    const emb = p.embed || {};
    const imgs = emb.images || emb.media?.images || [];
    return {
      source: 'Bluesky', url: `https://bsky.app/profile/${p.author?.handle}/post/${rkey}`, date: p.indexedAt, text: p.record?.text || '',
      author: p.author?.displayName || p.author?.handle, handle: `@${p.author?.handle}`, avatar: p.author?.avatar,
      images: imgs.map((i) => ({ thumb: i.thumb, full: i.fullsize, alt: i.alt })),
    };
  });
}
function postHtml(p) {
  const d = p.date ? new Date(p.date) : null;
  return `<article class="rounded-2xl border border-slate-200/70 bg-white/80 p-3 dark:border-white/10 dark:bg-white/5 pop">
    <div class="flex items-center gap-2 text-xs">
      ${p.avatar ? `<img src="${esc(p.avatar)}" class="h-7 w-7 rounded-full object-cover" alt="" loading="lazy" />` : '<div class="h-7 w-7 rounded-full bg-slate-300/60"></div>'}
      <div class="min-w-0 flex-1"><p class="font-semibold truncate">${esc(p.author || '')}</p><p class="text-slate-500 truncate">${esc(p.handle || '')}</p></div>
      <span class="chip ${p.source === 'Mastodon' ? 'bg-indigo-500/15 text-indigo-600 dark:text-indigo-300' : 'bg-sky-500/15 text-sky-600 dark:text-sky-300'}">${p.source}</span>
    </div>
    ${p.images.length ? `<div class="mt-2 grid ${p.images.length > 1 ? 'grid-cols-2' : 'grid-cols-1'} gap-1">${p.images.slice(0, 4).map((i) => `<a href="${esc(i.full || i.thumb)}" target="_blank" rel="noopener" class="block aspect-[4/3] overflow-hidden rounded-xl bg-slate-200/60 dark:bg-white/5"><img loading="lazy" src="${esc(i.thumb)}" alt="${esc(i.alt || '')}" class="h-full w-full object-cover" /></a>`).join('')}</div>` : ''}
    <p class="mt-2 text-sm leading-relaxed line-clamp-5 whitespace-pre-line">${esc(p.text)}</p>
    <div class="mt-2 flex items-center justify-between text-[11px] text-slate-500"><span>${d ? d.toLocaleString('ja-JP') : ''}</span><a class="underline" href="${esc(p.url)}" target="_blank" rel="noopener">投稿を開く</a></div>
  </article>`;
}
async function loadSnsFor(s) {
  const el = $('dSns');
  const tags = [s.en && s.en.replace(/[^\p{L}\p{N}]/gu, ''), s.ja && s.ja !== s.en && s.ja.replace(/[^\p{L}\p{N}]/gu, '')].filter(Boolean);
  const tasks = [...tags.map((t) => fetchMastodon(t, 10)), fetchBluesky(`${s.nameEn} ${s.type === 'rock' ? 'rock' : s.type === 'meteorite' ? 'meteorite' : 'mineral'}`, 15)];
  const settled = await Promise.allSettled(tasks);
  const posts = settled.flatMap((r) => (r.status === 'fulfilled' ? r.value : [])).filter((p) => p.images.length);
  const errs = settled.filter((r) => r.status === 'rejected').map((r) => r.reason?.message);
  posts.sort((a, b) => new Date(b.date) - new Date(a.date));
  const seen = new Set();
  const uniq = posts.filter((p) => !seen.has(p.url) && seen.add(p.url)).slice(0, 12);
  el.innerHTML = uniq.length ? uniq.map(postHtml).join('') : `<p class="col-span-full text-sm text-slate-500">画像つきの投稿が見つかりませんでした。${errs.length ? `（${esc(errs.join(' / '))}）` : ''}<br>上の「ほかのサイトで調べる」から X・Instagram・Reddit を検索できます。</p>`;
}
function renderSnsLinks(q) {
  const e = encodeURIComponent(q);
  const tag = encodeURIComponent(q.replace(/[^\p{L}\p{N}]/gu, '').toLowerCase());
  $('snsLinks').innerHTML = [['X (Twitter)', `https://x.com/search?q=${e}&f=media`], ['Instagram', `https://www.instagram.com/explore/tags/${tag}/`], ['Reddit r/mineralcollectors', `https://www.reddit.com/r/mineralcollectors/search/?q=${e}`], ['Flickr', `https://www.flickr.com/search/?text=${e}`], ['Pinterest', `https://www.pinterest.com/search/pins/?q=${e}`], ['YouTube', `https://www.youtube.com/results?search_query=${e}`], ['mindat.org 写真', `https://www.mindat.org/search.php?search=${e}`]]
    .map(([t, u]) => `<a class="btn btn-ghost !py-1 !text-xs" href="${u}" target="_blank" rel="noopener">${t}<i data-lucide="external-link" class="h-3 w-3"></i></a>`).join('');
  icons();
}
async function searchSns() {
  const q = $('snsQ').value.trim();
  if (!q) return;
  renderSnsLinks(q);
  $('snsStatus').textContent = '検索中…';
  $('snsGrid').innerHTML = '<div class="skeleton h-40 rounded-2xl"></div><div class="skeleton h-40 rounded-2xl"></div><div class="skeleton h-40 rounded-2xl"></div>';
  const tasks = [];
  if ($('snsMastodon').checked) tasks.push(fetchMastodon(q, 40));
  if ($('snsBluesky').checked) tasks.push(fetchBluesky(q, 50));
  const settled = await Promise.allSettled(tasks);
  let posts = settled.flatMap((r) => (r.status === 'fulfilled' ? r.value : []));
  const errs = settled.filter((r) => r.status === 'rejected').map((r) => r.reason?.message);
  if ($('snsImagesOnly').checked) posts = posts.filter((p) => p.images.length);
  posts.sort((a, b) => new Date(b.date) - new Date(a.date));
  $('snsGrid').innerHTML = posts.length ? posts.map(postHtml).join('') : `<p class="col-span-full py-10 text-center text-sm text-slate-500">投稿が見つかりませんでした。</p>`;
  $('snsStatus').textContent = `${posts.length} 件${errs.length ? ` / エラー: ${errs.join(', ')}` : ''}`;
}

// ---------- 設定 ----------
function openSettings() {
  $('settings').classList.remove('hidden');
  const m = state.meta;
  $('sData').textContent = m ? `データ: ${m.source} / 生成 ${new Date(m.generated).toLocaleString('ja-JP')} / ${state.stones.length.toLocaleString()} 件` : 'データ未読み込み';
  $('sMastodon').value = state.prefs.mastodon || 'mastodon.social';
}
function applyTheme() {
  const dark = state.prefs.theme !== 'light';
  document.documentElement.classList.toggle('dark', dark);
  $('metaTheme').setAttribute('content', dark ? '#0b0f1a' : '#f8fafc');
}

// ---------- イベント ----------
function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }
const rerun = debounce(applyFilters, 150);
['q', 'elementInput', 'fCountry', 'fMohsMin', 'fMohsMax', 'fDenMin', 'fDenMax', 'fMassMin', 'fMassMax', 'fRadius'].forEach((id) => $(id).addEventListener('input', rerun));
['fClass', 'fCrystal', 'fColor', 'fOrigin', 'fImage', 'fCoord', 'fFormula', 'fJa', 'fBbox', 'sort'].forEach((id) => $(id).addEventListener('change', applyFilters));
$('btnFilters').addEventListener('click', () => $('filters').classList.toggle('hidden'));
$('btnMore').addEventListener('click', renderMore);
$('btnRetry').addEventListener('click', () => loadData({ forceLive: true }));
$('btnLive').addEventListener('click', () => { $('settings').classList.add('hidden'); loadData({ forceLive: true }); });
$('btnClearCache').addEventListener('click', () => { try { localStorage.removeItem(CACHE_KEY); } catch {} toast('キャッシュを削除しました'); });
$('btnSettings').addEventListener('click', openSettings);
$('sMastodon').addEventListener('change', (e) => { state.prefs.mastodon = e.target.value.trim() || 'mastodon.social'; savePrefs(); });
$('btnTheme').addEventListener('click', () => { state.prefs.theme = state.prefs.theme === 'light' ? 'dark' : 'light'; savePrefs(); applyTheme(); });
$('btnReset').addEventListener('click', () => {
  ['q', 'elementInput', 'fCountry', 'fMohsMin', 'fMohsMax', 'fDenMin', 'fDenMax', 'fMassMin', 'fMassMax', 'fRadius', 'fClass', 'fCrystal', 'fColor', 'fOrigin'].forEach((id) => ($(id).value = ''));
  ['fImage', 'fCoord', 'fFormula', 'fJa', 'fBbox'].forEach((id) => ($(id).checked = false));
  $('sort').value = 'name'; state.center = null; $('centerLabel').textContent = '中心: 未設定';
  if (state.centerMarker) { state.centerMarker.remove(); state.centerMarker = null; }
  document.querySelectorAll('.type-chip').forEach((b) => b.setAttribute('aria-pressed', String(!b.dataset.type)));
  state.f.type = '';
  applyFilters();
});
$('typeChips').addEventListener('click', (e) => {
  const b = e.target.closest('.type-chip'); if (!b) return;
  document.querySelectorAll('.type-chip').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
  state.f.type = b.dataset.type; applyFilters();
});
$('elementChips').addEventListener('click', (e) => {
  const b = e.target.closest('[data-el]'); if (!b) return;
  const cur = $('elementInput').value.split(/[\s,、]+/).filter(Boolean);
  const i = cur.indexOf(b.dataset.el);
  if (i >= 0) cur.splice(i, 1); else cur.push(b.dataset.el);
  $('elementInput').value = cur.join(' '); applyFilters();
});
document.querySelectorAll('[role=tab]').forEach((t) => t.addEventListener('click', () => showView(t.dataset.view)));
$('grid').addEventListener('click', (e) => { const c = e.target.closest('[data-id]'); if (c) openDetail(c.dataset.id); });
document.addEventListener('click', (e) => {
  const open = e.target.closest('[data-open]'); if (open) { openDetail(open.dataset.open); return; }
  if (e.target.closest('[data-close]')) { $('detail').classList.add('hidden'); $('settings').classList.add('hidden'); if (location.hash) history.replaceState(null, '', location.pathname + location.search); return; }
  const mapBtn = e.target.closest('[data-map]');
  if (mapBtn) { const s = state.stones.find((x) => x.id === mapBtn.dataset.map); closeDetail(); showView('map'); setTimeout(() => state.map.setView([s.loc.lat, s.loc.lon], 7), 80); return; }
  const cen = e.target.closest('[data-center]');
  if (cen) { const s = state.stones.find((x) => x.id === cen.dataset.center); closeDetail(); setCenter(s.loc.lat, s.loc.lon, s.loc.name || s.name); $('filters').classList.remove('hidden'); showView('list'); return; }
  const fe = e.target.closest('[data-filter-el]');
  if (fe) { closeDetail(); $('elementInput').value = fe.dataset.filterEl; $('filters').classList.remove('hidden'); showView('list'); applyFilters(); window.scrollTo({ top: 0, behavior: 'smooth' }); }
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { $('detail').classList.add('hidden'); $('settings').classList.add('hidden'); } });
$('dShare').addEventListener('click', async () => { try { await navigator.clipboard.writeText(location.href); toast('リンクをコピーしました'); } catch { toast(location.href); } });
$('btnGeo').addEventListener('click', () => {
  if (!navigator.geolocation) return toast('この端末では位置情報を取得できません');
  toast('現在地を取得中…');
  navigator.geolocation.getCurrentPosition((p) => setCenter(p.coords.latitude, p.coords.longitude, `現在地 (${p.coords.latitude.toFixed(2)}, ${p.coords.longitude.toFixed(2)})`), () => toast('現在地を取得できませんでした'), { timeout: 10000 });
});
$('btnMapCenter').addEventListener('click', () => { initMap(); const c = state.map.getCenter(); setCenter(c.lat, c.lng, `地図の中心 (${c.lat.toFixed(2)}, ${c.lng.toFixed(2)})`); });
$('snsForm').addEventListener('submit', (e) => { e.preventDefault(); searchSns(); });
window.addEventListener('hashchange', () => { if (!$('detail').classList.contains('hidden')) return; openFromHash(); });

applyTheme();
icons();
loadData();
