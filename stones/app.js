// 世界の石 図鑑
// data/stones.json（tools/build-data.mjs が Wikidata から生成）を読み込み、ブラウザ内で検索・絞り込みを行う。
// 詳細画面では Wikipedia・Wikimedia Commons・Mastodon の公開 API から解説・写真・投稿を取りに行く。

const $ = (id) => document.getElementById(id);
const PAGE = 60;
const TYPES = { m: '鉱物', r: '岩石', x: '隕石', n: '名のある石' };
const TYPE_COLOR = { m: '#14866d', r: '#9a6a3c', x: '#5a56c9', n: '#c2752a' };

// ---------- 用語の説明 ----------
const EXPLAIN = {
  // 岩石の成因
  '火成岩': 'マグマが冷えて固まってできた岩石。',
  '火山岩': 'マグマが地表や地表近くで急に冷えて固まった岩石。結晶が細かく、ガラス質になることもあります。',
  '深成岩': 'マグマが地下深くでゆっくり冷えて固まった岩石。粒の大きな結晶が見えます。',
  '貫入岩': 'マグマがまわりの地層に入り込み、地下で固まった岩石。',
  '火山砕屑岩': '噴火で飛び散った火山灰や軽石などが積もって固まった岩石。',
  '堆積岩': '砂や泥、生き物の殻などが水底や地表に積もり、長い時間をかけて押し固められた岩石。',
  '砕屑岩': '岩石がくだけてできた礫・砂・泥の粒が積もって固まった堆積岩。',
  '変成岩': 'もとの岩石が地下の高い温度や圧力を受け、溶けないまま中の鉱物や組織が作り変えられた岩石。',
  '交代岩': '熱水などの流体によって、もとの岩石の成分が別の成分に入れ替わってできた岩石。',
  '衝突岩（インパクタイト）': '隕石の衝突による高温・高圧で、地表の岩石が砕けたり溶けたりしてできた岩石。',
  'テクタイト': '隕石衝突で溶けて飛び散った地表の岩石が、空中で冷えて固まった天然ガラス。',
  '超苦鉄質岩': '鉄やマグネシウムにとても富む岩石。マントルに由来するものが多くあります。',
  '隕石': '宇宙から地球に落ちてきた岩石や鉄のかたまり。',
  // 鉱物の産状
  '熱水': 'マグマで熱せられた地下の熱い水に溶けていた成分が、岩の割れ目などで冷えて沈殿し、結晶になります。金属の鉱脈の多くがこのタイプです。',
  'ペグマタイト': 'マグマが固まる最後に残った、水や珍しい元素に富む液からできる、粒のとても粗い岩石。大きな結晶や珍しい鉱物が育ちます。',
  '火山': '火山の溶岩や噴出物の中、あるいはその空洞で結晶します。',
  '火成岩（マグマ）': 'マグマが冷えていく途中で結晶として現れます。',
  '変成': '岩石が地下の高い温度や圧力を受けたとき、もとの鉱物が別の鉱物に作り変えられてできます。',
  'スカルン（接触変成）': '石灰岩などがマグマに触れ、熱と成分のやりとりで変化した場所（スカルン）にできます。',
  '堆積': '水底に積もった堆積物の中や、堆積岩ができる過程でできます。',
  '蒸発岩（塩湖・海水の蒸発）': '塩湖や閉じた海の水が蒸発し、溶けていた成分が濃くなって結晶として残ります。',
  '酸化帯（二次鉱物）': '地表近くで、もとの鉱石が水や空気と反応してできる二次的な鉱物。色あざやかなものが多くあります。',
  '風化': '岩石や鉱物が地表で雨や空気にさらされ、分解・変質する過程でできます。',
  '噴気孔（火山ガス）': '火山ガスの噴き出し口で、ガスから直接結晶が付着してできます。',
  'マントル・キンバーライト': '地下深くのマントルに由来し、キンバーライトなどのマグマによって地表へ運ばれます。',
  '砂鉱（川や浜の砂）': '風化に強く重い鉱物が、川や海岸の砂の中に集まったもの。砂金が代表例です。',
  '洞窟・グアノ': '洞窟の中や、鳥・コウモリのふんが積もった場所（グアノ）でできます。',
};
const CLASS_EXPLAIN = {
  '元素鉱物': '金・銀・銅・硫黄・ダイヤモンドのように、ほぼ 1 種類の元素だけでできた鉱物。',
  '硫化鉱物': '金属と硫黄（またはヒ素・セレン・テルル）が結びついた鉱物。多くの金属の鉱石になります。',
  'ハロゲン化鉱物': '塩素やフッ素などのハロゲンと金属が結びついた鉱物。岩塩や蛍石が代表例。',
  '酸化鉱物': '金属と酸素（または水酸基）が結びついた鉱物。',
  '炭酸塩・硝酸塩鉱物': '炭酸イオン（CO₃）や硝酸イオン（NO₃）を含む鉱物。方解石が代表例。',
  'ホウ酸塩鉱物': 'ホウ酸イオンを含む鉱物。',
  '硫酸塩鉱物': '硫酸イオン（SO₄）を含む鉱物。石膏や重晶石が代表例。',
  'リン酸塩・ヒ酸塩鉱物': 'リン酸・ヒ酸・バナジン酸イオンを含む鉱物。燐灰石やトルコ石が代表例。',
  'ケイ酸塩鉱物': 'ケイ素と酸素の骨組みをもつ鉱物。地殻の大部分をつくっています。',
  '有機鉱物': '有機化合物が結晶した鉱物。',
};
const IMA = { A: 'IMA 承認', G: '古くから知られる鉱物', Rd: '再定義された鉱物', Rn: '改名された鉱物', Q: '疑問あり', D: '鉱物種から抹消', N: '未承認で公表', H: '仮説上の鉱物' };
const ELEMENTS = new Set('H He Li Be B C N O F Ne Na Mg Al Si P S Cl Ar K Ca Sc Ti V Cr Mn Fe Co Ni Cu Zn Ga Ge As Se Br Kr Rb Sr Y Zr Nb Mo Tc Ru Rh Pd Ag Cd In Sn Sb Te I Xe Cs Ba La Ce Pr Nd Pm Sm Eu Gd Tb Dy Ho Er Tm Yb Lu Hf Ta W Re Os Ir Pt Au Hg Tl Pb Bi Po At Rn Fr Ra Ac Th Pa U'.split(' '));
const ELEMENT_JA = { H: '水素', Li: 'リチウム', Be: 'ベリリウム', B: 'ホウ素', C: '炭素', N: '窒素', O: '酸素', F: 'フッ素', Na: 'ナトリウム', Mg: 'マグネシウム', Al: 'アルミニウム', Si: 'ケイ素', P: 'リン', S: '硫黄', Cl: '塩素', K: 'カリウム', Ca: 'カルシウム', Ti: 'チタン', V: 'バナジウム', Cr: 'クロム', Mn: 'マンガン', Fe: '鉄', Co: 'コバルト', Ni: 'ニッケル', Cu: '銅', Zn: '亜鉛', As: 'ヒ素', Se: 'セレン', Sr: 'ストロンチウム', Y: 'イットリウム', Zr: 'ジルコニウム', Nb: 'ニオブ', Mo: 'モリブデン', Ag: '銀', Sn: 'スズ', Sb: 'アンチモン', Te: 'テルル', Ba: 'バリウム', Ce: 'セリウム', La: 'ランタン', Nd: 'ネオジム', Ta: 'タンタル', W: 'タングステン', Pt: '白金', Au: '金', Hg: '水銀', Tl: 'タリウム', Pb: '鉛', Bi: 'ビスマス', Th: 'トリウム', U: 'ウラン', Cs: 'セシウム', Pd: 'パラジウム', Ge: 'ゲルマニウム', Cd: 'カドミウム', Sc: 'スカンジウム', Br: '臭素', I: 'ヨウ素', Rb: 'ルビジウム', In: 'インジウム', Ga: 'ガリウム' };
const ELEMENT_CHIPS = ['Si', 'O', 'Al', 'Fe', 'Ca', 'Mg', 'Na', 'K', 'Cu', 'S', 'C', 'P', 'Pb', 'Zn', 'Mn', 'Ti', 'Ag', 'Au', 'As', 'F', 'Cl', 'B', 'Li', 'U'];
const SNS_TAGS = ['鉱物', '鉱物標本', '水晶', '石', '隕石', 'mineralogy', 'minerals', 'crystals', 'rockhounding', 'geology', 'meteorite', 'fossils'];
const SNS_SERVER = 'mastodon.social';

// ---------- 状態 ----------
const DEFAULTS = { q: '', t: '', el: '', cls: '', env: '', cs: '', c: '', hmin: '', hmax: '', dmin: '', dmax: '', mass: '', hgt: '', img: '', ja: '', loc: '', sort: 'pop', view: 'list' };
const state = { ...DEFAULTS, near: null, radius: 500, bbox: false, bounds: null };
let stones = [];
let byId = new Map();
let meta = null;
let filtered = [];
let shown = 0;
let map = null;
let markerLayer = null;
let nearMarker = null;
let nameIndex = null;

// ---------- 小道具 ----------
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const enc = encodeURIComponent;
const fmt = (v, d = 2) => Number(v).toLocaleString('ja-JP', { maximumFractionDigits: d });
const SUB = '₀₁₂₃₄₅₆₇₈₉';
const SUP = { '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9', '⁺': '+', '⁻': '-' };
const asciiFormula = (f) => f.replace(/[₀-₉]/g, (c) => SUB.indexOf(c)).replace(/[⁰-⁹⁺⁻]/g, (c) => SUP[c] ?? '').replace(/\s+/g, '');
// 検索用の正規化: 全角→半角、ひらがな→カタカナ、小文字化
const norm = (s) => String(s).normalize('NFKC').toLowerCase().replace(/[ぁ-ゖ]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0x60));
const thumb = (file, w) => `https://commons.wikimedia.org/wiki/Special:FilePath/${enc(file)}?width=${w}`;
const filePage = (file) => `https://commons.wikimedia.org/wiki/File:${enc(file.replace(/ /g, '_'))}`;
const safeUrl = (u) => (typeof u === 'string' && /^https:\/\//.test(u) ? u : '');

function elementsOf(formula) {
  const out = new Set();
  // 電荷（Fe²⁺ など）や水和数を外してから元素記号を拾う
  const f = formula.replace(/[₀-₉⁰-⁹⁺⁻\d.]/g, ' ');
  for (const m of f.matchAll(/[A-Z][a-z]?/g)) {
    if (ELEMENTS.has(m[0])) out.add(m[0]);
    else if (ELEMENTS.has(m[0][0])) out.add(m[0][0]);
  }
  return out;
}
function fmtRange(r, unit = '') {
  if (!r) return '';
  return r[0] === r[1] ? `${fmt(r[0])}${unit}` : `${fmt(r[0])}〜${fmt(r[1])}${unit}`;
}
function fmtMass(kg) {
  if (kg >= 1000) return `${fmt(kg / 1000, kg >= 100000 ? 0 : 1)} t`;
  if (kg >= 1) return `${fmt(kg, kg >= 100 ? 0 : 1)} kg`;
  if (kg >= 0.001) return `${fmt(kg * 1000, 1)} g`;
  return `${fmt(kg * 1e6, 1)} mg`;
}
const fmtCarat = (kg) => `${fmt(kg * 5000, 2)} カラット`;
function fmtLen(m) {
  if (m >= 1) return `${fmt(m, 1)} m`;
  if (m >= 0.01) return `${fmt(m * 100, 1)} cm`;
  return `${fmt(m * 1000, 1)} mm`;
}
function distanceKm(a, b, c, d) {
  const R = 6371, k = Math.PI / 180;
  const x = Math.sin(((c - a) * k) / 2) ** 2 + Math.cos(a * k) * Math.cos(c * k) * Math.sin(((d - b) * k) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}
function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast.h);
  toast.h = setTimeout(() => t.classList.remove('show'), 2400);
}
function hardnessHint(h) {
  const v = (h[0] + h[1]) / 2;
  if (v <= 2.5) return '爪で傷がつくやわらかさ';
  if (v <= 3.5) return '銅の硬貨で傷がつく';
  if (v <= 5.5) return 'ナイフで傷がつく';
  if (v < 7) return 'ガラスに傷をつけられる';
  if (v < 9) return '鋼鉄より硬い';
  return 'きわめて硬い';
}

// ---------- 読み込み ----------
async function load() {
  try {
    const res = await fetch('data/stones.json');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    meta = json;
    stones = json.stones;
    prepare();
    buildFacets();
    readUrl();
    syncControls();
    $('status').hidden = true;
    $('headCount').textContent = `${fmt(stones.length)} 件 ・ ${json.generated} 更新`;
    apply();
    showView(state.view, true);
    openFromHash();
  } catch (e) {
    console.error(e);
    $('status').className = 'status error';
    $('status').innerHTML = `<p><b>データを読み込めませんでした。</b></p><p class="muted">通信環境を確認して、もう一度お試しください。（${esc(e.message)}）</p><button class="btn" onclick="location.reload()">再読み込み</button>`;
    $('headCount').textContent = '読み込み失敗';
  }
}

function prepare() {
  byId = new Map(stones.map((s) => [s.id, s]));
  for (const s of stones) {
    s.name = s.ja || s.en;
    s.sub = s.ja && s.en && s.ja !== s.en ? s.en : '';
    s.fa = s.f ? asciiFormula(s.f) : '';
    s.els = s.f ? elementsOf(s.f) : null;
    s.pts = (s.loc || []).filter((l) => l.lat !== undefined);
    // 分類・できかたのキー
    s.clsKeys = [];
    if (s.sc) s.clsKeys.push('sc:' + s.sc);
    if (s.t === 'm' && s.k && s.k !== '鉱物種') s.clsKeys.push('k:' + s.k);
    if (s.t === 'x') for (const c of s.cls || []) s.clsKeys.push('x:' + c);
    if (s.t === 'n' && s.k) s.clsKeys.push('n:' + s.k);
    s.envKeys = [];
    if (s.t === 'r') for (const c of s.cls || []) s.envKeys.push('r:' + c);
    if (s.env) for (const e of s.env) s.envKeys.push('e:' + e);
    s.nName = norm(s.name);
    s.nEn = s.en ? norm(s.en) : '';
    const parts = [s.ja, s.en, s.f, s.fa, s.d, s.k, s.sc, s.cs, s.na, TYPES[s.t], ...(s.cls || []), ...(s.env || []), ...(s.mat || []), ...(s.parn || []),
      ...(s.par || []).map((p) => (byId.get(p) || {}).ja), ...(s.loc || []).flatMap((l) => [l.n, l.ne, l.c])];
    s.hay = norm(parts.filter(Boolean).join(' '));
  }
}

function buildFacets() {
  const count = (keysOf) => {
    const m = new Map();
    for (const s of stones) for (const k of keysOf(s)) m.set(k, (m.get(k) || 0) + 1);
    return m;
  };
  const options = (entries) => entries.map(([v, n, label]) => `<option value="${esc(v)}">${esc(label ?? v)}（${fmt(n)}）</option>`).join('');
  const group = (title, entries) => (entries.length ? `<optgroup label="${esc(title)}">${options(entries)}</optgroup>` : '');
  const sorted = (m, prefix, min = 1) => [...m].filter(([k, n]) => k.startsWith(prefix) && n >= min).sort((a, b) => b[1] - a[1]).map(([k, n]) => [k, n, k.slice(prefix.length)]);

  const cls = count((s) => s.clsKeys);
  $('fClass').innerHTML = '<option value="">すべて</option>' + group('鉱物の化学分類', sorted(cls, 'sc:')) + group('鉱物の種別', sorted(cls, 'k:')) + group('隕石の種類', sorted(cls, 'x:', 3)) + group('名のある石の種類', sorted(cls, 'n:'));
  const env = count((s) => s.envKeys);
  $('fEnv').innerHTML = '<option value="">すべて</option>' + group('岩石の成因', sorted(env, 'r:')) + group('鉱物の産状', sorted(env, 'e:'));
  const cs = count((s) => (s.cs ? s.cs.split(' / ') : []));
  $('fCrystal').innerHTML = '<option value="">すべて</option>' + options([...cs].sort((a, b) => b[1] - a[1]).map(([k, n]) => [k, n]));
  const country = count((s) => [...new Set((s.loc || []).map((l) => l.c).filter(Boolean))]);
  const top = [...country].sort((a, b) => b[1] - a[1]);
  const japan = top.filter(([k]) => k === '日本');
  $('fCountry').innerHTML = '<option value="">すべて</option>' + options(japan.map(([k, n]) => [k, n])) + options(top.filter(([k]) => k !== '日本').sort((a, b) => a[0].localeCompare(b[0], 'ja')).map(([k, n]) => [k, n]));
  $('elements').innerHTML = ELEMENT_CHIPS.map((e) => `<button type="button" data-el="${e}" title="${ELEMENT_JA[e] || e}" aria-pressed="false">${e}</button>`).join('');

  const n = { '': stones.length };
  for (const s of stones) n[s.t] = (n[s.t] || 0) + 1;
  $('types').innerHTML = [['', 'すべて'], ...Object.entries(TYPES)].map(([k, label]) => `<button type="button" data-type="${k}" aria-pressed="false">${label}<small>${fmt(n[k] || 0)}</small></button>`).join('');
}

// ---------- URL と入力欄 ----------
function readUrl() {
  const p = new URLSearchParams(location.search);
  for (const k of Object.keys(DEFAULTS)) if (p.has(k)) state[k] = p.get(k);
  if (!TYPES[state.t]) state.t = '';
  if (!['list', 'map', 'sns'].includes(state.view)) state.view = 'list';
  const near = (p.get('near') || '').split(',').map(Number);
  if (near.length >= 2 && near.every(Number.isFinite)) {
    state.near = { lat: near[0], lon: near[1], label: '指定した地点' };
    if (near[2] > 0) state.radius = near[2];
  }
}
function writeUrl() {
  const p = new URLSearchParams();
  for (const k of Object.keys(DEFAULTS)) if (state[k] && state[k] !== DEFAULTS[k]) p.set(k, state[k]);
  if (state.near) p.set('near', [state.near.lat.toFixed(3), state.near.lon.toFixed(3), state.radius].join(','));
  const qs = p.toString();
  history.replaceState(null, '', location.pathname + (qs ? '?' + qs : '') + location.hash);
}
const FIELD = { q: 'q', el: 'fElements', cls: 'fClass', env: 'fEnv', cs: 'fCrystal', c: 'fCountry', hmin: 'fHmin', hmax: 'fHmax', dmin: 'fDmin', dmax: 'fDmax', mass: 'fMass', hgt: 'fHeight', sort: 'sort' };
const CHECK = { img: 'fImg', ja: 'fJa', loc: 'fLoc' };
function syncControls() {
  for (const [k, id] of Object.entries(FIELD)) $(id).value = state[k];
  for (const [k, id] of Object.entries(CHECK)) $(id).checked = !!state[k];
  $('fRadius').value = String(state.radius);
  if (!$('fRadius').value) $('fRadius').value = '500';
  $('fBbox').checked = state.bbox;
}
function readControls() {
  for (const [k, id] of Object.entries(FIELD)) state[k] = $(id).value.trim();
  for (const [k, id] of Object.entries(CHECK)) state[k] = $(id).checked ? '1' : '';
  state.radius = Number($('fRadius').value) || 500;
  state.bbox = $('fBbox').checked;
}
const selectedElements = () => state.el.split(/[\s,、]+/).filter(Boolean).map((e) => e[0].toUpperCase() + e.slice(1).toLowerCase()).filter((e) => ELEMENTS.has(e));

// ---------- 絞り込み ----------
function apply() {
  const els = selectedElements();
  const tokens = state.q ? norm(state.q).split(/\s+/).filter(Boolean) : [];
  const num = (v) => (v === '' ? null : Number(v));
  const hmin = num(state.hmin), hmax = num(state.hmax), dmin = num(state.dmin), dmax = num(state.dmax);
  const pair = (v) => (v ? v.split(',').map((x) => (x === '' ? Infinity : Number(x))) : null);
  const mass = pair(state.mass), hgt = pair(state.hgt);
  const near = state.near, bounds = state.bbox ? state.bounds : null;
  const qAll = norm(state.q).trim();
  const out = [];
  for (const s of stones) {
    if (state.t && s.t !== state.t) continue;
    if (tokens.length && !tokens.every((t) => s.hay.includes(t))) continue;
    if (els.length && !(s.els && els.every((e) => s.els.has(e)))) continue;
    if (state.cls && !s.clsKeys.includes(state.cls)) continue;
    if (state.env && !s.envKeys.includes(state.env)) continue;
    if (state.cs && !(s.cs && s.cs.split(' / ').includes(state.cs))) continue;
    if (state.c && !(s.loc && s.loc.some((l) => l.c === state.c))) continue;
    if (hmin !== null && !(s.h && s.h[1] >= hmin)) continue;
    if (hmax !== null && !(s.h && s.h[0] <= hmax)) continue;
    if (dmin !== null && !(s.dn && s.dn[1] >= dmin)) continue;
    if (dmax !== null && !(s.dn && s.dn[0] <= dmax)) continue;
    if (mass && !(s.m !== undefined && s.m >= mass[0] && s.m < mass[1])) continue;
    if (hgt && !(s.hgt !== undefined && s.hgt >= hgt[0] && s.hgt < hgt[1])) continue;
    if (state.img && !s.img) continue;
    if (state.ja && !s.ja) continue;
    if (state.loc && !s.pts.length) continue;
    s.dist = undefined;
    if (near) {
      for (const p of s.pts) {
        const d = distanceKm(near.lat, near.lon, p.lat, p.lon);
        if (s.dist === undefined || d < s.dist) s.dist = d;
      }
      if (!(s.dist !== undefined && s.dist <= state.radius)) continue;
    }
    if (bounds && !s.pts.some((p) => bounds.contains([p.lat, p.lon]))) continue;
    // 検索語との一致度（名前が一致するものを上に）
    s.score = 0;
    if (qAll) {
      if (s.nName === qAll || s.nEn === qAll || norm(s.fa) === qAll) s.score = 3;
      else if (s.nName.startsWith(qAll) || s.nEn.startsWith(qAll)) s.score = 2;
      else if (s.nName.includes(qAll) || s.nEn.includes(qAll)) s.score = 1;
    }
    out.push(s);
  }
  const pop = (a, b) => (b.sl || 0) - (a.sl || 0) || (b.img ? 1 : 0) - (a.img ? 1 : 0) || a.name.localeCompare(b.name, 'ja');
  const last = (v) => (v === undefined ? -Infinity : v);
  const sorters = {
    pop: (a, b) => b.score - a.score || pop(a, b),
    name: (a, b) => (a.ja ? 0 : 1) - (b.ja ? 0 : 1) || a.name.localeCompare(b.name, 'ja'),
    hard: (a, b) => last(b.h && b.h[1]) - last(a.h && a.h[1]) || pop(a, b),
    dense: (a, b) => last(b.dn && b.dn[1]) - last(a.dn && a.dn[1]) || pop(a, b),
    mass: (a, b) => last(b.m) - last(a.m) || pop(a, b),
    tall: (a, b) => last(b.hgt) - last(a.hgt) || pop(a, b),
    new: (a, b) => last(b.y) - last(a.y) || pop(a, b),
    near: (a, b) => (a.dist ?? Infinity) - (b.dist ?? Infinity) || pop(a, b),
  };
  out.sort(sorters[state.sort] || sorters.pop);
  filtered = out;

  // 表示
  shown = 0;
  $('grid').innerHTML = '';
  $('resultCount').innerHTML = `<b>${fmt(out.length)}</b> 件`;
  $('empty').hidden = out.length > 0;
  renderMore();
  renderChips();
  updateControls();
  writeUrl();
  if (map && state.view === 'map') renderMarkers(true);
}

function updateControls() {
  document.querySelectorAll('#types button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.type === state.t)));
  const els = selectedElements();
  document.querySelectorAll('#elements button').forEach((b) => b.setAttribute('aria-pressed', String(els.includes(b.dataset.el))));
  document.querySelectorAll('#hardPresets button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.h === `${state.hmin},${state.hmax}`)));
  // 選んだ種類に関係のない絞り込み欄は隠す
  document.querySelectorAll('.fg[data-types]').forEach((sec) => { sec.hidden = !!state.t && !sec.dataset.types.split(' ').includes(state.t); });
  $('nearLabel').hidden = !state.near;
  if (state.near) $('nearLabel').textContent = `${state.near.label}から ${fmt(state.radius)} km 以内を表示中`;
  const n = activeFilters().length;
  $('filterCount').hidden = !n;
  $('filterCount').textContent = n;
  $('btnApply').textContent = `${fmt(filtered.length)} 件を見る`;
  const nearOpt = $('sort').querySelector('option[value="near"]');
  nearOpt.disabled = !state.near;
}

function activeFilters() {
  const a = [];
  const label = (v) => v.slice(v.indexOf(':') + 1);
  if (state.q) a.push([`「${state.q}」`, () => { state.q = ''; }]);
  if (state.c) a.push([state.c, () => { state.c = ''; }]);
  if (state.near) a.push([`${state.near.label}から ${fmt(state.radius)} km`, () => { state.near = null; if (state.sort === 'near') state.sort = 'pop'; }]);
  if (state.bbox) a.push(['地図の表示範囲', () => { state.bbox = false; }]);
  if (state.loc) a.push(['位置が分かる', () => { state.loc = ''; }]);
  for (const e of selectedElements()) a.push([`${e}（${ELEMENT_JA[e] || '元素'}）を含む`, () => { state.el = selectedElements().filter((x) => x !== e).join(' '); }]);
  if (state.cls) a.push([label(state.cls), () => { state.cls = ''; }]);
  if (state.env) a.push([label(state.env), () => { state.env = ''; }]);
  if (state.cs) a.push([state.cs, () => { state.cs = ''; }]);
  if (state.hmin || state.hmax) a.push([`硬度 ${state.hmin || '1'}〜${state.hmax || '10'}`, () => { state.hmin = state.hmax = ''; }]);
  if (state.dmin || state.dmax) a.push([`密度 ${state.dmin || '0'}〜${state.dmax || ''}`, () => { state.dmin = state.dmax = ''; }]);
  if (state.mass) a.push([`重さ ${$('fMass').selectedOptions[0]?.textContent || ''}`, () => { state.mass = ''; }]);
  if (state.hgt) a.push([`高さ ${$('fHeight').selectedOptions[0]?.textContent || ''}`, () => { state.hgt = ''; }]);
  if (state.img) a.push(['写真あり', () => { state.img = ''; }]);
  if (state.ja) a.push(['日本語名あり', () => { state.ja = ''; }]);
  return a;
}
function renderChips() {
  const filters = activeFilters();
  const html = filters.map(([t], i) => `<button class="chip" data-chip="${i}" title="この条件を外す">${esc(t)}<svg class="ic"><use href="#i-close"/></svg></button>`).join('');
  for (const id of ['activeChips', 'activeChipsMap']) {
    $(id).innerHTML = html;
    $(id).onclick = (e) => {
      const b = e.target.closest('[data-chip]');
      if (!b) return;
      filters[Number(b.dataset.chip)][1]();
      syncControls();
      apply();
    };
  }
}

// ---------- 一覧 ----------
function placeholder(s) {
  const text = s.t === 'm' && s.f && s.f.length <= 26 ? s.f : s.name;
  return `<div class="ph"><span>${esc(text)}</span></div>`;
}
function cardMeta(s) {
  const a = [];
  if (s.dist !== undefined) a.push(`${fmt(s.dist, 0)} km`);
  if (s.t === 'm') {
    if (s.h) a.push(`硬度 ${fmtRange(s.h)}`);
    if (s.sc) a.push(s.sc);
    else if (s.k !== '鉱物種') a.push(s.k);
  } else if (s.t === 'r') {
    a.push(...(s.cls || []).slice(0, 2));
  } else {
    if (s.t === 'n' && s.k) a.push(s.k);
    if (s.m !== undefined) a.push(s.t === 'n' && s.k === 'ダイヤモンド' ? fmtCarat(s.m) : fmtMass(s.m));
    else if (s.hgt !== undefined) a.push(`高さ ${fmtLen(s.hgt)}`);
    if (s.t === 'x' && s.cls) a.push(s.cls[0]);
    const c = s.loc && s.loc[0] && s.loc[0].c;
    if (c) a.push(c);
  }
  return a.filter(Boolean).join(' ・ ');
}
function cardHtml(s) {
  const img = placeholder(s) + (s.img ? `<img loading="lazy" decoding="async" src="${thumb(s.img, 330)}" alt="" />` : '');
  const m = cardMeta(s);
  return `<a class="card t-${s.t}" href="#${s.id}">
    <div class="thumb">${img}<span class="badge">${TYPES[s.t]}</span></div>
    <div class="card-body"><h3>${esc(s.name)}</h3>${s.sub ? `<p class="en">${esc(s.sub)}</p>` : ''}${s.f ? `<p class="f">${esc(s.f)}</p>` : ''}${m ? `<p class="meta">${esc(m)}</p>` : ''}</div>
  </a>`;
}
function renderMore() {
  if (shown >= filtered.length) return;
  const next = filtered.slice(shown, shown + PAGE);
  $('grid').insertAdjacentHTML('beforeend', next.map(cardHtml).join(''));
  shown += next.length;
}
// 読めなかった写真は取り除く（下に敷いてある名前入りの枠が見える）
document.addEventListener('error', (e) => {
  if (e.target instanceof HTMLImageElement && e.target.closest('.thumb, .mt, .hero-img, .gallery, .post-media')) {
    const link = e.target.closest('.gallery a, .post-media a');
    (link || e.target).remove();
  }
}, true);
new IntersectionObserver((entries) => { if (entries.some((e) => e.isIntersecting) && state.view === 'list') renderMore(); }, { rootMargin: '900px' }).observe($('sentinel'));

// ---------- 表示の切り替え ----------
function showView(v, initial = false) {
  state.view = v;
  document.querySelectorAll('.views button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.view === v)));
  $('viewList').hidden = v !== 'list';
  $('viewMap').hidden = v !== 'map';
  $('viewSns').hidden = v !== 'sns';
  $('layout').classList.toggle('no-filters', v === 'sns');
  $('filters').style.display = v === 'sns' ? 'none' : '';
  $('layout').style.gridTemplateColumns = v === 'sns' ? 'minmax(0, 1fr)' : '';
  if (v === 'map') openMap();
  if (v === 'sns') openSns();
  if (!initial) { writeUrl(); window.scrollTo({ top: 0 }); }
}

// ---------- 地図 ----------
let leafletLoading = null;
function loadLeaflet() {
  if (window.L) return Promise.resolve();
  leafletLoading ||= new Promise((resolve, reject) => {
    const css = document.createElement('link');
    css.rel = 'stylesheet';
    css.href = 'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.css';
    document.head.append(css);
    const js = document.createElement('script');
    js.src = 'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.js';
    js.onload = resolve;
    js.onerror = () => { leafletLoading = null; reject(new Error('地図の部品を読み込めませんでした')); };
    document.head.append(js);
  });
  return leafletLoading;
}
async function openMap() {
  try {
    await loadLeaflet();
  } catch (e) {
    $('mapCount').textContent = e.message;
    return;
  }
  if (!map) {
    map = L.map('map', { preferCanvas: true, worldCopyJump: true, minZoom: 1 }).setView([25, 15], 2);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>' }).addTo(map);
    markerLayer = L.layerGroup().addTo(map);
    map.on('moveend', () => {
      state.bounds = map.getBounds();
      if (state.bbox) apply();
    });
    state.bounds = map.getBounds();
  }
  setTimeout(() => { map.invalidateSize(); renderMarkers(true); }, 30);
}
function renderMarkers(fit = false) {
  markerLayer.clearLayers();
  const near = state.near;
  // 同じ場所の石は 1 つの点にまとめる
  const places = new Map();
  let n = 0;
  for (const s of filtered) {
    if (!s.pts.length) continue;
    n++;
    for (const p of s.pts) {
      if (state.c && p.c !== state.c) continue;
      if (near && distanceKm(near.lat, near.lon, p.lat, p.lon) > state.radius) continue;
      const key = p.lat.toFixed(3) + ',' + p.lon.toFixed(3);
      let g = places.get(key);
      if (!g) places.set(key, (g = { lat: p.lat, lon: p.lon, name: p.n, country: p.c, items: [] }));
      g.items.push(s);
    }
  }
  for (const g of places.values()) {
    const t = g.items[0].t;
    const marker = L.circleMarker([g.lat, g.lon], { radius: Math.min(4 + Math.sqrt(g.items.length) * 1.6, 16), color: '#fff', weight: 1, fillColor: TYPE_COLOR[t], fillOpacity: 0.85 });
    marker.bindPopup(() => {
      const title = g.items.length === 1 && g.items[0].t !== 'm' ? '' : [g.name, g.country].filter(Boolean).join('、');
      const list = g.items.slice(0, 40).map((s) => `<li><a class="t-${s.t}" href="#${s.id}"><span class="dot"></span><span>${esc(s.name)}${s.sub ? ` <small>${esc(s.sub)}</small>` : ''}</span></a></li>`).join('');
      return `<div class="pop">${title ? `<h4>${esc(title)}${g.items.length > 1 ? `（${g.items.length} 件）` : ''}</h4>` : ''}<ul>${list}</ul>${g.items.length > 40 ? `<small>ほか ${g.items.length - 40} 件</small>` : ''}</div>`;
    }, { maxWidth: 280 });
    markerLayer.addLayer(marker);
  }
  if (nearMarker) { nearMarker.remove(); nearMarker = null; }
  if (state.near) nearMarker = L.circle([state.near.lat, state.near.lon], { radius: state.radius * 1000, color: '#14866d', weight: 1.5, fillOpacity: 0.05, interactive: false }).addTo(map);
  if (fit && !state.bbox && places.size && places.size < 2500) {
    map.fitBounds(L.latLngBounds([...places.values()].map((g) => [g.lat, g.lon])).pad(0.15), { maxZoom: 9, animate: false });
  }
  $('mapCount').innerHTML = `<b>${fmt(n)}</b> 件を <b>${fmt(places.size)}</b> か所に表示（絞り込み結果 ${fmt(filtered.length)} 件のうち、位置が分かるもの）`;
}
function useNear() {
  if (!navigator.geolocation) return toast('この端末では現在地を取得できません');
  toast('現在地を確認しています…');
  navigator.geolocation.getCurrentPosition((pos) => {
    state.near = { lat: pos.coords.latitude, lon: pos.coords.longitude, label: '現在地' };
    state.sort = 'near';
    syncControls();
    apply();
    if (map) map.setView([state.near.lat, state.near.lon], state.radius <= 200 ? 7 : 5);
    toast(`現在地から ${fmt(state.radius)} km 以内: ${fmt(filtered.length)} 件`);
  }, () => toast('現在地を取得できませんでした。位置情報の許可を確認してください。'), { timeout: 12000, maximumAge: 600000 });
}

// ---------- 詳細 ----------
function miniHtml(s, note) {
  return `<a class="mini t-${s.t}" href="#${s.id}"><div class="mt">${placeholder(s)}${s.img ? `<img loading="lazy" src="${thumb(s.img, 120)}" alt="" />` : ''}</div><div><b>${esc(s.name)}</b><small>${esc(note || s.sub || TYPES[s.t])}</small></div></a>`;
}
const fact = (label, value, small) => (value ? `<div class="fact"><dt>${label}</dt><dd>${value}${small ? `<small>${small}</small>` : ''}</dd></div>` : '');

const explainHtml = ([t, d]) => `<div><b>${esc(t)}</b><span>${esc(d)}</span></div>`;

function openDetail(s) {
  $('dTitle').textContent = s.name;
  $('dSub').textContent = [s.sub, TYPES[s.t] + (s.k && s.k !== '鉱物種' ? `（${s.k}）` : '')].filter(Boolean).join(' ・ ');
  const facts = [];
  if (s.t === 'm') {
    facts.push(fact('化学分類', esc(s.sc), s.st ? `シュツルンツ分類 ${esc(s.st)}` : ''));
    facts.push(fact('結晶系', esc(s.cs)));
    if (s.h) facts.push(fact('モース硬度', fmtRange(s.h), `<span class="hardbar"><i style="left:${(Math.max(s.h[0] - 1, 0) / 9) * 100}%;width:${(Math.max(s.h[1] - s.h[0], 0) / 9) * 100}%"></i></span>${hardnessHint(s.h)}`));
    if (s.dn) facts.push(fact('密度', fmtRange(s.dn, ' g/cm³'), `水の ${fmt((s.dn[0] + s.dn[1]) / 2, 1)} 倍の重さ`));
    facts.push(fact('鉱物としての扱い', esc(IMA[s.ima] || ''), s.y ? `国際鉱物学連合の承認 ${s.y} 年` : ''));
    facts.push(fact('名前の由来', esc(s.na)));
  } else if (s.t === 'r') {
    if (s.dn) facts.push(fact('密度', fmtRange(s.dn, ' g/cm³')));
    facts.push(fact('上位の分類', esc((s.parn || []).join('、'))));
  } else {
    if (s.t === 'n') facts.push(fact('種類', esc(s.k)));
    if (s.t === 'x') facts.push(fact('隕石の種類', esc((s.cls || []).join('、'))));
    if (s.m !== undefined) facts.push(fact('重さ', s.k === 'ダイヤモンド' ? fmtCarat(s.m) : fmtMass(s.m), s.k === 'ダイヤモンド' ? fmtMass(s.m) : ''));
    const dims = [s.hgt && `高さ ${fmtLen(s.hgt)}`, s.len && `長さ ${fmtLen(s.len)}`, s.wid && `幅 ${fmtLen(s.wid)}`].filter(Boolean);
    facts.push(fact('大きさ', dims.join(' / ')));
    if (s.y) facts.push(fact(s.fell ? '落下した年' : '発見された年', `${s.y} 年`, s.fell ? '落下が目撃・記録された隕石' : ''));
    facts.push(fact('石の種類', esc((s.mat || []).join('、'))));
  }

  // できかた
  const explains = [];
  if (s.t === 'r') for (const c of s.cls || []) if (EXPLAIN[c]) explains.push([c, EXPLAIN[c]]);
  if (s.t === 'x') explains.push(['隕石', EXPLAIN['隕石']]);
  if (s.t === 'm') {
    for (const e of s.env || []) if (EXPLAIN[e]) explains.push([e, EXPLAIN[e]]);
  }
  const originNote = s.t === 'm' && s.env ? '英語版 Wikipedia の記事に出てくる言葉から自動で拾っています' : '';
  const origin = explains.length ? `<section class="sec"><h3>できかた${originNote ? `<small>${originNote}</small>` : ''}</h3><div class="explain">${explains.slice(0, 4).map(explainHtml).join('')}</div>${explains.length > 4 ? `<details class="more-explain"><summary>ほか ${explains.length - 4} 件のできかたを見る</summary><div class="explain">${explains.slice(4).map(explainHtml).join('')}</div></details>` : ''}</section>` : '';
  const chem = s.t === 'm' && s.sc && CLASS_EXPLAIN[s.sc] ? `<p class="desc"><b>${esc(s.sc)}</b>: ${esc(CLASS_EXPLAIN[s.sc])}</p>` : '';

  // 元素
  const els = s.els && s.els.size ? `<section class="sec"><h3>含まれる元素<small>押すと、同じ元素を含む鉱物を探せます</small></h3><div class="pills">${[...s.els].map((e) => `<button class="pill" data-el-filter="${e}">${e}<small class="muted">${ELEMENT_JA[e] || ''}</small></button>`).join('')}</div></section>` : '';

  // 場所
  const placeTitle = s.t === 'm' ? '模式産地<small>この鉱物が最初に見つかり、記載された場所</small>' : s.t === 'x' ? '落下・発見の場所' : '場所';
  const places = (s.loc || []).length ? `<section class="sec"><h3>${placeTitle}</h3><div class="places">${s.loc.map((l) => {
    const has = l.lat !== undefined;
    const title = [l.n, l.c].filter((x, i, a) => x && a.indexOf(x) === i).join('、') || '位置のみ登録';
    return `<div class="place"><div><b>${esc(title)}</b>${has ? `<small>北緯 ${l.lat.toFixed(3)}、東経 ${l.lon.toFixed(3)}</small>`.replace('北緯 -', '南緯 ').replace('東経 -', '西経 ') : ''}</div>${has ? `<div><button class="btn small" data-show-map="${l.lat},${l.lon}"><svg class="ic"><use href="#i-map"/></svg>地図で見る</button><button class="btn small" data-near="${l.lat},${l.lon}" data-near-label="${esc(l.n || s.name)}">近くの石</button></div>` : ''}</div>`;
  }).join('')}</div></section>` : '';

  // 仲間（もとの鉱物・グループ、変種、同じ場所の石）
  const parents = (s.par || []).map((id) => byId.get(id)).filter(Boolean);
  const children = s.t === 'm' ? stones.filter((x) => x.par && x.par.includes(s.id)).sort((a, b) => (b.sl || 0) - (a.sl || 0)).slice(0, 12) : [];
  let nearby = [];
  if (s.pts.length) {
    const p = s.pts[0];
    nearby = stones.filter((x) => x !== s && x.pts.length).map((x) => [x, Math.min(...x.pts.map((q) => distanceKm(p.lat, p.lon, q.lat, q.lon)))]).filter(([, d]) => d <= 100).sort((a, b) => a[1] - b[1] || (b[0].sl || 0) - (a[0].sl || 0)).slice(0, 8);
  }
  const family = (parents.length || children.length) ? `<section class="sec"><h3>${s.k === '鉱物グループ' ? 'このグループの鉱物' : '仲間の石'}</h3><div class="minis">${parents.map((x) => miniHtml(x, x.k === '鉱物グループ' ? 'グループ' : 'もとの鉱物')).join('')}${children.map((x) => miniHtml(x, x.k === '変種' ? '変種' : x.sub)).join('')}</div></section>` : '';
  const near = nearby.length ? `<section class="sec"><h3>近くで見つかった石<small>100 km 以内</small></h3><div class="minis">${nearby.map(([x, d]) => miniHtml(x, d < 1 ? '同じ場所' : `${fmt(d, 0)} km`)).join('')}</div></section>` : '';

  // 外部リンク
  const q = enc(s.en || s.name);
  const tag = enc((s.en || s.name).replace(/[^\p{L}\p{N}]/gu, ''));
  const links = [
    s.wj && ['Wikipedia', `https://ja.wikipedia.org/wiki/${enc(s.wj)}`],
    s.we && ['Wikipedia（英語）', `https://en.wikipedia.org/wiki/${enc(s.we)}`],
    s.mi && ['Mindat（産地・写真が豊富）', `https://www.mindat.org/min-${enc(s.mi)}.html`],
    !s.mi && s.t === 'm' && ['Mindat で検索', `https://www.mindat.org/search.php?search=${q}`],
    s.mb && ['隕石データベース（Meteoritical Bulletin）', `https://www.lpi.usra.edu/meteor/metbull.php?code=${enc(s.mb)}`],
    s.cc && ['Wikimedia Commons', `https://commons.wikimedia.org/wiki/Category:${enc(s.cc)}`],
    ['Wikidata', `https://www.wikidata.org/wiki/${s.id}`],
  ].filter(Boolean);
  const sns = [
    ['X', `https://x.com/search?q=${enc(s.name)}&f=media`],
    ['Instagram', `https://www.instagram.com/explore/tags/${enc(s.name.replace(/[^\p{L}\p{N}]/gu, ''))}/`],
    ['Bluesky', `https://bsky.app/search?q=${enc(s.name)}`],
    ['Reddit', `https://www.reddit.com/search/?q=${q}`],
    ['Pinterest', `https://www.pinterest.com/search/pins/?q=${q}`],
    ['YouTube', `https://www.youtube.com/results?search_query=${enc(s.name)}`],
  ];
  const linkHtml = (arr) => arr.map(([t, u]) => `<a class="pill" href="${u}" target="_blank" rel="noopener">${esc(t)}</a>`).join('');

  $('dBody').innerHTML = `
    <div class="hero">
      <figure class="hero-img t-${s.t}">${placeholder(s)}${s.img ? `<img src="${thumb(s.img, 960)}" alt="${esc(s.name)}の写真" /><figcaption><a href="${filePage(s.img)}" target="_blank" rel="noopener">写真の作者・ライセンス</a></figcaption>` : ''}</figure>
      <div class="hero-info">
        ${s.f ? `<p class="formula-big">${esc(s.f)}</p>` : ''}
        ${s.d ? `<p class="desc">${esc(s.d)}</p>` : ''}
        ${chem}
        <dl class="facts">${facts.join('')}</dl>
      </div>
    </div>
    ${origin}
    ${places}
    ${els}
    ${family}
    <section class="sec"><h3>解説<small>Wikipedia より</small></h3><div class="wiki" id="dWiki"><div class="skel"></div></div></section>
    <section class="sec"><h3>写真<small>Wikimedia Commons より</small></h3><div class="gallery" id="dGallery"><div class="skel"></div></div></section>
    <section class="sec"><h3>みんなの投稿<small>Mastodon より</small></h3><div class="posts" id="dSns"><div class="skel"></div></div><div class="linkrow" style="margin-top:8px">${sns.map(([t, u]) => `<a href="${u}" target="_blank" rel="noopener">${t} で探す</a>`).join('')}</div></section>
    ${near}
    <section class="sec"><h3>もっと詳しく</h3><div class="pills">${linkHtml(links)}</div></section>`;
  $('detail').hidden = false;
  document.body.style.overflow = 'hidden';
  $('dBody').scrollTop = 0;
  $('detailSheet').focus({ preventScroll: true });
  document.title = `${s.name} - 世界の石 図鑑`;
  const token = (openDetail.token = Symbol());
  const alive = () => openDetail.token === token && !$('detail').hidden;
  loadWiki(s, alive);
  loadGallery(s, alive);
  loadStonePosts(s, alive);
}
function closeDetail() {
  if ($('detail').hidden) return;
  $('detail').hidden = true;
  document.body.style.overflow = '';
  document.title = '世界の石 図鑑';
  if (/^#Q\d+$/.test(location.hash)) history.replaceState(null, '', location.pathname + location.search);
}
function openFromHash() {
  const s = byId.get(location.hash.slice(1));
  if (s) openDetail(s);
  else closeDetail();
}

async function getJson(url, ms = 12000) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), ms);
  try {
    const res = await fetch(url, { signal: ctl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

async function loadWiki(s, alive) {
  const tries = [s.wj && ['ja', s.wj], s.we && ['en', s.we]].filter(Boolean);
  for (const [lang, title] of tries) {
    try {
      const j = await getJson(`https://${lang}.wikipedia.org/w/api.php?action=query&prop=extracts&exintro=1&explaintext=1&redirects=1&titles=${enc(title)}&format=json&origin=*`);
      const page = Object.values(j.query?.pages || {})[0];
      const text = (page?.extract || '').trim();
      if (!text) continue;
      if (!alive()) return;
      const paras = text.split(/\n+/).filter(Boolean).slice(0, 4);
      $('dWiki').innerHTML = `${lang === 'en' ? `<p class="muted">${s.wj ? '日本語版を取得できなかったため' : '日本語版の記事が無いため'}、英語版を表示しています。</p>` : ''}${paras.map((p) => `<p>${esc(p)}</p>`).join('')}<p class="more"><a href="https://${lang}.wikipedia.org/wiki/${enc(title)}" target="_blank" rel="noopener">Wikipedia で続きを読む</a></p>`;
      return;
    } catch (e) {
      console.warn('wikipedia', e);
    }
  }
  if (alive()) $('dWiki').innerHTML = `<p class="muted">${tries.length ? 'Wikipedia の解説を取得できませんでした。' : 'Wikipedia にはまだ記事がありません。'}</p>`;
}

async function loadGallery(s, alive) {
  const api = 'https://commons.wikimedia.org/w/api.php?action=query&prop=imageinfo&iiprop=url%7Cextmetadata&iiextmetadatafilter=Artist%7CLicenseShortName&iiurlwidth=330&format=json&origin=*';
  const urls = [];
  if (s.cc) urls.push(`${api}&generator=categorymembers&gcmtitle=${enc('Category:' + s.cc)}&gcmtype=file&gcmlimit=30`);
  urls.push(`${api}&generator=search&gsrnamespace=6&gsrlimit=24&gsrsearch=${enc(`${s.en || s.name} ${{ m: 'mineral', r: 'rock', x: 'meteorite', n: '' }[s.t]}`.trim())}`);
  for (const u of urls) {
    try {
      const j = await getJson(u);
      const pages = Object.values(j.query?.pages || {}).filter((p) => p.imageinfo?.[0]?.thumburl && /\.(jpe?g|png|webp)$/i.test(p.title)).slice(0, 18);
      if (!pages.length) continue;
      if (!alive()) return;
      $('dGallery').innerHTML = pages.map((p) => {
        const ii = p.imageinfo[0];
        const author = String(ii.extmetadata?.Artist?.value || '').replace(/<[^>]*>/g, '').trim().slice(0, 60);
        const lic = String(ii.extmetadata?.LicenseShortName?.value || '');
        return `<a href="${esc(safeUrl(ii.descriptionurl))}" target="_blank" rel="noopener" title="${esc([author, lic].filter(Boolean).join(' / '))}"><img loading="lazy" src="${esc(safeUrl(ii.thumburl))}" alt="" /></a>`;
      }).join('');
      return;
    } catch (e) {
      console.warn('commons', e);
    }
  }
  if (alive()) $('dGallery').outerHTML = '<p class="muted" id="dGallery">写真は見つかりませんでした。</p>';
}

// ---------- Mastodon ----------
function plainText(html) {
  const doc = new DOMParser().parseFromString(String(html || '').replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>\s*<p>/gi, '\n\n'), 'text/html');
  return (doc.body.textContent || '').trim();
}
const cleanTag = (t) => String(t).replace(/^#/, '').replace(/[^\p{L}\p{N}_]/gu, '');
async function fetchPosts(tags, limit = 40) {
  const list = [...new Set(tags.map(cleanTag).filter(Boolean))].slice(0, 4);
  if (!list.length) return [];
  const any = list.slice(1).map((t) => `&any[]=${enc(t)}`).join('');
  const data = await getJson(`https://${SNS_SERVER}/api/v1/timelines/tag/${enc(list[0])}?only_media=true&limit=${limit}${any}`);
  return data.filter((p) => !p.sensitive).map((p) => ({
    url: safeUrl(p.url || p.uri),
    date: p.created_at,
    text: plainText(p.content),
    name: p.account?.display_name || p.account?.username || '',
    acct: '@' + (p.account?.acct || ''),
    avatar: safeUrl(p.account?.avatar_static),
    tags: (p.tags || []).map((t) => t.name),
    images: (p.media_attachments || []).filter((m) => m.type === 'image' && safeUrl(m.preview_url)).map((m) => ({ src: m.preview_url, full: safeUrl(m.url) || m.preview_url, alt: m.description || '' })),
  })).filter((p) => p.images.length && p.url);
}
function stonesInPost(p) {
  if (!nameIndex) {
    nameIndex = new Map();
    for (const s of stones) {
      if ((s.sl || 0) < 8 && !s.ja) continue;
      for (const n of [s.ja, s.en]) if (n && n.length >= 2) { const k = norm(n).replace(/[^\p{L}\p{N}]/gu, ''); if (!nameIndex.has(k) || (nameIndex.get(k).sl || 0) < (s.sl || 0)) nameIndex.set(k, s); }
    }
  }
  const out = new Set();
  for (const t of p.tags) { const s = nameIndex.get(norm(t)); if (s) out.add(s); }
  return [...out].slice(0, 4);
}
function postHtml(p) {
  const d = new Date(p.date);
  const found = stonesInPost(p);
  return `<article class="post">
    <div class="post-media${p.images.length > 1 ? ' multi' : ''}">${p.images.slice(0, 4).map((i) => `<a href="${esc(i.full)}" target="_blank" rel="noopener"><img loading="lazy" src="${esc(i.src)}" alt="${esc(i.alt)}" /></a>`).join('')}</div>
    <div class="post-body">
      <div class="post-who">${p.avatar ? `<img loading="lazy" src="${esc(p.avatar)}" alt="" />` : ''}<b>${esc(p.name)}</b><span>${esc(p.acct)}</span></div>
      <p class="post-text">${esc(p.text)}</p>
      ${found.length ? `<div class="post-stones">${found.map((s) => `<a href="#${s.id}">図鑑: ${esc(s.name)}</a>`).join('')}</div>` : ''}
      <div class="post-foot"><span>${isNaN(d) ? '' : d.toLocaleDateString('ja-JP')}</span><a href="${esc(p.url)}" target="_blank" rel="noopener">元の投稿を開く</a></div>
    </div></article>`;
}
const STONE_CONTEXT = /mineral|crystal|gemstone|geolog|rockhound|meteorit|fossil|lapidar|jewel|\b(rocks?|stones?|quartz)\b|鉱物|結晶|標本|宝石|原石|天然石|岩石|水晶|隕石|地質|鉱山/i;
const NOT_STONE = /rails|programming|coding|software|opensource|developer|webdev|python|javascript|golang|rustlang|linux|music|band\b|album/i; // 同じ名前の別の話題（言語の Ruby、音楽のロックなど）
async function loadStonePosts(s, alive) {
  const tags = [s.ja, s.en].filter(Boolean);
  let posts = [];
  let failed = false;
  try {
    posts = (await fetchPosts(tags, 40)).filter((p) => !NOT_STONE.test(p.tags.join(' ')) && STONE_CONTEXT.test(p.tags.join(' ') + ' ' + p.text.replace(/https?:\/\/\S+/g, '')));
  } catch (e) { failed = true; console.warn('mastodon', e); }
  if (!alive()) return;
  $('dSns').outerHTML = posts.length
    ? `<div class="posts" id="dSns">${posts.slice(0, 9).map(postHtml).join('')}</div>`
    : `<p class="muted" id="dSns">${failed ? '投稿を取得できませんでした。' : `「#${esc(cleanTag(tags[0] || ''))}」のタグがついた石の写真の投稿は、見つかりませんでした。`}</p>`;
}
let snsTags = ['鉱物'];
function openSns() {
  if (!$('snsTags').children.length) {
    $('snsTags').innerHTML = SNS_TAGS.map((t) => `<button type="button" data-tag="${esc(t)}" aria-pressed="false">#${esc(t)}</button>`).join('');
    searchSns();
  }
}
async function searchSns() {
  document.querySelectorAll('#snsTags button').forEach((b) => b.setAttribute('aria-pressed', String(snsTags.includes(b.dataset.tag))));
  const label = snsTags.map((t) => '#' + t).join(' ');
  $('snsStatus').textContent = `${label} を探しています…`;
  $('snsGrid').innerHTML = '<div class="skel"></div>';
  const q = enc(snsTags[0]);
  $('snsLinks').innerHTML = [['X', `https://x.com/search?q=${q}&f=media`], ['Instagram', `https://www.instagram.com/explore/tags/${q}/`], ['Bluesky', `https://bsky.app/search?q=${q}`], ['Reddit', `https://www.reddit.com/search/?q=${q}`], ['Pinterest', `https://www.pinterest.com/search/pins/?q=${q}`]].map(([t, u]) => `<a href="${u}" target="_blank" rel="noopener">${t} で「${esc(snsTags[0])}」を探す</a>`).join('');
  try {
    const posts = await fetchPosts(snsTags, 40);
    $('snsGrid').innerHTML = posts.map(postHtml).join('');
    $('snsStatus').textContent = posts.length ? `${label} の写真つき投稿 ${posts.length} 件（新しい順）` : `${label} の写真つき投稿は見つかりませんでした。`;
  } catch (e) {
    console.warn('mastodon', e);
    $('snsGrid').innerHTML = '';
    $('snsStatus').textContent = '投稿を取得できませんでした。時間をおいてもう一度お試しください。';
  }
}

// ---------- データについて ----------
function openAbout() {
  const c = meta.counts;
  $('aBody').innerHTML = `
    <table>
      <tr><td>鉱物（鉱物種・変種・グループ）</td><td>${fmt(c.mineral)}</td></tr>
      <tr><td>岩石</td><td>${fmt(c.rock)}</td></tr>
      <tr><td>隕石</td><td>${fmt(c.meteorite)}</td></tr>
      <tr><td>名のある石（巨石・迷子石・奇岩・有名なダイヤモンド）</td><td>${fmt(c.named)}</td></tr>
      <tr><td>写真つき</td><td>${fmt(c.image)}</td></tr>
      <tr><td>位置が分かるもの</td><td>${fmt(c.located)}</td></tr>
    </table>
    <p class="muted">データ更新日: ${esc(meta.generated)}</p>
    <h3>どこから集めているか</h3>
    <ul>
      <li>名前・化学式・結晶系・硬度・産地・大きさなどの基本データ: <a href="https://www.wikidata.org/" target="_blank" rel="noopener">Wikidata</a>（CC0）</li>
      <li>解説: <a href="https://ja.wikipedia.org/" target="_blank" rel="noopener">Wikipedia</a>（CC BY-SA）</li>
      <li>写真: <a href="https://commons.wikimedia.org/" target="_blank" rel="noopener">Wikimedia Commons</a>。写真ごとに作者とライセンスが異なります。各写真のリンク先で確認できます。</li>
      <li>投稿: Mastodon（${SNS_SERVER}）に公開されたハッシュタグつきの投稿</li>
      <li>地図: © OpenStreetMap contributors</li>
    </ul>
    <h3>知っておいてほしいこと</h3>
    <ul>
      <li>日本語名が登録されていない石は、英語名で表示しています。</li>
      <li>硬度や密度は、登録のある一部の鉱物だけに表示されます。</li>
      <li>鉱物の「できかた」は、英語版 Wikipedia の記事に出てくる言葉から自動で拾ったものです。目安としてご覧ください。</li>
      <li>X や Instagram は、外部から検索する公開の仕組みが無いため、各サービスの検索ページへのリンクを用意しています。</li>
      <li>内容に誤りを見つけたら、Wikidata や Wikipedia を直すと、次回の更新でこの図鑑にも反映されます。</li>
    </ul>`;
  $('about').hidden = false;
}

// ---------- 操作 ----------
const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
const refresh = () => { readControls(); apply(); };
const refreshSoon = debounce(refresh, 180);
['q', 'fElements', 'fHmin', 'fHmax', 'fDmin', 'fDmax'].forEach((id) => $(id).addEventListener('input', refreshSoon));
['fClass', 'fEnv', 'fCrystal', 'fCountry', 'fMass', 'fHeight', 'fImg', 'fJa', 'fLoc', 'fBbox', 'sort', 'fRadius'].forEach((id) => $(id).addEventListener('change', refresh));
$('q').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.target.blur(); if (state.view === 'sns') showView('list'); } });
$('types').addEventListener('click', (e) => {
  const b = e.target.closest('[data-type]');
  if (!b) return;
  state.t = b.dataset.type;
  if (state.view === 'sns') showView('list');
  apply();
});
$('elements').addEventListener('click', (e) => {
  const b = e.target.closest('[data-el]');
  if (!b) return;
  const cur = selectedElements();
  state.el = (cur.includes(b.dataset.el) ? cur.filter((x) => x !== b.dataset.el) : [...cur, b.dataset.el]).join(' ');
  syncControls();
  apply();
});
$('hardPresets').addEventListener('click', (e) => {
  const b = e.target.closest('[data-h]');
  if (!b) return;
  const on = b.getAttribute('aria-pressed') === 'true';
  [state.hmin, state.hmax] = on ? ['', ''] : b.dataset.h.split(',');
  syncControls();
  apply();
});
function resetAll() {
  Object.assign(state, DEFAULTS, { view: state.view, near: null, bbox: false });
  syncControls();
  apply();
}
$('btnReset').addEventListener('click', resetAll);
$('btnReset2').addEventListener('click', resetAll);
$('btnNear').addEventListener('click', useNear);
$('btnNearMap').addEventListener('click', useNear);
document.querySelectorAll('.views button').forEach((b) => b.addEventListener('click', () => showView(b.dataset.view)));

const toggleFilters = (open) => { $('filters').classList.toggle('open', open); $('scrim').hidden = !open; document.body.style.overflow = open ? 'hidden' : ''; };
$('btnFilters').addEventListener('click', () => toggleFilters(true));
document.querySelectorAll('[data-close-filters]').forEach((b) => b.addEventListener('click', () => toggleFilters(false)));

$('btnAbout').addEventListener('click', openAbout);
$('btnTheme').addEventListener('click', () => {
  const dark = document.documentElement.dataset.theme ? document.documentElement.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
  document.documentElement.dataset.theme = dark ? 'light' : 'dark';
  try { localStorage.setItem('stones.theme', document.documentElement.dataset.theme); } catch { /* 保存できなくても動作に支障なし */ }
});
try { const t = localStorage.getItem('stones.theme'); if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t; } catch { /* 既定のまま */ }

document.addEventListener('click', (e) => {
  if (e.target.closest('[data-close-detail]')) return closeDetail();
  if (e.target.closest('[data-close-about]')) { $('about').hidden = true; return; }
  const el = e.target.closest('[data-el-filter]');
  if (el) {
    closeDetail();
    Object.assign(state, DEFAULTS, { view: 'list', t: 'm', el: el.dataset.elFilter });
    state.near = null; state.bbox = false;
    syncControls(); apply(); showView('list');
    return;
  }
  const sm = e.target.closest('[data-show-map]');
  if (sm) {
    const [lat, lon] = sm.dataset.showMap.split(',').map(Number);
    closeDetail();
    showView('map');
    loadLeaflet().then(() => setTimeout(() => map && map.setView([lat, lon], 8), 80)).catch(() => {});
    return;
  }
  const nr = e.target.closest('[data-near]');
  if (nr) {
    const [lat, lon] = nr.dataset.near.split(',').map(Number);
    closeDetail();
    Object.assign(state, DEFAULTS, { view: 'list', sort: 'near' });
    state.near = { lat, lon, label: nr.dataset.nearLabel || '指定した地点' };
    state.radius = 200; state.bbox = false;
    syncControls(); apply(); showView('list');
    return;
  }
  const tag = e.target.closest('#snsTags [data-tag]');
  if (tag) { snsTags = [tag.dataset.tag]; $('snsQ').value = ''; searchSns(); }
});
$('snsForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const tags = $('snsQ').value.split(/[\s,、#]+/).map(cleanTag).filter(Boolean);
  if (!tags.length) return;
  snsTags = tags.slice(0, 4);
  searchSns();
});
$('dShare').addEventListener('click', async () => {
  const url = location.origin + location.pathname + location.hash;
  try {
    if (navigator.share) await navigator.share({ title: document.title, url });
    else { await navigator.clipboard.writeText(url); toast('リンクをコピーしました'); }
  } catch { /* 共有を取り消した場合など */ }
});
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (!$('about').hidden) $('about').hidden = true;
  else if (!$('detail').hidden) closeDetail();
  else toggleFilters(false);
});
window.addEventListener('hashchange', openFromHash);

load();
