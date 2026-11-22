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

// アプリのアイコン 4 つ（動画・ゲーム・チャット・買い物）をひし形に並べ、あいだを赤い ✖ が通る。
// ink はタイルの色、gap は絵柄と ✖ のふちの色（白地なら白）
const TILE = 'M5,0h10a5,5 0 0 1 5,5v10a5,5 0 0 1 -5,5h-10a5,5 0 0 1 -5,-5v-10a5,5 0 0 1 5,-5z';
const GLYPHS = {
  video: 'M3.500,5.500h13v9h-13z M8.300,7.500v5l4.500,-2.500z',
  game: 'M5.500,6.500h9a3.500,3.500 0 0 1 0,7h-9a3.500,3.500 0 0 1 0,-7z M6,9.300v1.400h1.300v1.300h1.400v-1.300h1.300v-1.400h-1.300v-1.300h-1.400v1.300z M13.500,9a1,1 0 1 0 0.001,0z',
  chat: 'M5.500,5h9a1.500,1.500 0 0 1 1.500,1.500v5a1.500,1.500 0 0 1 -1.500,1.500h-4.500l-3,2.700v-2.700h-1.500a1.500,1.500 0 0 1 -1.500,-1.500v-5a1.500,1.500 0 0 1 1.500,-1.500z',
  cart: 'M3.500,5h2.200l0.600,2h10.200l-1.700,5.500h-7.300l-1.900,-6.300h-2.100z M8.300,14a1.300,1.300 0 1 0 0.001,0z M13.700,14a1.300,1.300 0 1 0 0.001,0z',
};
const tile = (x, y, glyph, ink, gap) => `<g transform="translate(${x} ${y}) scale(0.8)"><path d="${TILE}" fill="${ink}"/><path d="${GLYPHS[glyph]}" fill="${gap}" fill-rule="evenodd"/></g>`;
const mark = (size, ink, gap, vb = '21 25 66 66') => `
<svg width="${size}" height="${size}" viewBox="${vb}" xmlns="http://www.w3.org/2000/svg">
  ${tile(46, 34, 'video', ink, gap)}${tile(30, 50, 'game', ink, gap)}${tile(62, 50, 'chat', ink, gap)}${tile(46, 66, 'cart', ink, gap)}
  <path d="M33,37 L75,79 M75,37 L33,79" stroke="${gap}" stroke-width="9" stroke-linecap="round" fill="none"/>
  <path d="M33,37 L75,79 M75,37 L33,79" stroke="${RED}" stroke-width="5" stroke-linecap="round" fill="none"/>
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
  ${mark(512, BLACK, '#fff', '18 22 72 72')}</div></body></html>`;
const feature = `<html>${fonts}<body><div id="x" style="width:1024px;height:500px;background:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:26px">
  <div style="display:flex;align-items:center;gap:4px">${mark(220, BLACK, '#fff')}${wordmark(BLACK, 128)}<div style="width:30px"></div></div>
  <div style="font-size:44px;color:${BLACK};letter-spacing:3px">要らんアプリ<span style="color:${RED}">まとめて一掃</span></div>
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
