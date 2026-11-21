// ストア用の画像と、公式サイトのロゴを作り直す
//   node render-graphics.js <ストア画像の出力先> <サイトの public> [太字フォント(woff2)のあるフォルダ]
// フォントは @fontsource/noto-sans-jp の files フォルダを渡す（なければ端末のゴシック体で描く）
const { chromium } = require('playwright');
const fs = require('fs');
const [store, site, fontDir] = process.argv.slice(2);

const RED = '#F5190F', BLACK = '#0B0B0B';
const face = (file) => fontDir && fs.existsSync(`${fontDir}/${file}`)
  ? `@font-face{font-family:Logo;font-weight:900;src:url(data:font/woff2;base64,${fs.readFileSync(`${fontDir}/${file}`).toString('base64')})}` : '';
const fonts = `<style>${face('noto-sans-jp-japanese-900-normal.woff2')}${face('noto-sans-jp-latin-900-normal.woff2')}
  body{margin:0;font-family:Logo,'Noto Sans JP','IPAPGothic',sans-serif;font-weight:900}</style>`;

// アプリのタイル 4 つに赤い斜線（通知パージのベル＋斜線と同じ考え方）。ink はタイルの色、gap は斜線のふちの色
const mark = (size, ink, gap, vb = '21 21 66 66') => `
<svg width="${size}" height="${size}" viewBox="${vb}" xmlns="http://www.w3.org/2000/svg">
  <g fill="${ink}">
    <rect x="35" y="39" width="16" height="16" rx="4"/><rect x="55" y="39" width="16" height="16" rx="4"/>
    <rect x="35" y="59" width="16" height="16" rx="4"/><rect x="55" y="59" width="16" height="16" rx="4"/>
  </g>
  <path d="M31,35 L75,79" stroke="${gap}" stroke-width="11" stroke-linecap="round"/>
  <path d="M31,35 L75,79" stroke="${RED}" stroke-width="6" stroke-linecap="round"/>
  <path d="M71,31 L72.500,26 M76,35 L80.500,31 M78,40.500 L83.500,39.500" stroke="${RED}" stroke-width="3.500" stroke-linecap="round" fill="none"/>
</svg>`;

const wordmark = (ink, px) => `
  <div style="line-height:1;white-space:nowrap">
    <div style="font-size:${px}px;transform:skewX(-8deg);transform-origin:left bottom;letter-spacing:${px * 0.02}px">
      <span style="color:${ink}">アプリ</span><span style="color:${RED}">一掃</span></div>
    <div style="font-size:${px * 0.2}px;letter-spacing:${px * 0.115}px;color:${ink};margin-top:${px * 0.14}px;padding-left:${px * 0.04}px">ANDROID APP SWEEP</div>
  </div>`;

const logo = (ink, gap) => `<html>${fonts}<body style="background:transparent">
  <div id="x" style="display:inline-flex;align-items:center;gap:6px;padding:8px 20px 8px 4px">${mark(300, ink, gap)}${wordmark(ink, 190)}</div></body></html>`;
const icon = `<html><body style="margin:0"><div id="x" style="width:512px;height:512px;background:#fff;display:flex;align-items:center;justify-content:center">
  ${mark(512, BLACK, '#fff', '19 21 70 70')}</div></body></html>`;
const feature = `<html>${fonts}<body><div id="x" style="width:1024px;height:500px;background:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:26px">
  <div style="display:flex;align-items:center;gap:4px">${mark(220, BLACK, '#fff')}${wordmark(BLACK, 128)}<div style="width:30px"></div></div>
  <div style="font-size:34px;color:${BLACK};letter-spacing:2px">いらないアプリだけ選んで、<span style="color:${RED}">まとめて削除</span></div>
</div></body></html>`;

(async () => {
  const b = await chromium.launch();
  const shot = async (html, path, scale = 1, transparent = false) => {
    const p = await b.newPage({ viewport: { width: 1400, height: 700 }, deviceScaleFactor: scale });
    await p.setContent(html);
    await p.evaluate(() => document.fonts.ready);
    await p.locator('#x').screenshot({ path, omitBackground: transparent });
    await p.close();
  };
  await shot(icon, `${store}/icon-512.png`);
  await shot(feature, `${store}/feature-graphic-1024x500.png`);
  if (site) {
    await shot(icon, `${site}/icon.png`, 0.5);
    await shot(logo(BLACK, '#fff'), `${site}/logo.png`, 1, true);
    await shot(logo('#fff', '#0B0B0B'), `${site}/logo-white.png`, 1, true);
  }
  await b.close();
})();
