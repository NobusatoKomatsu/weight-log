const { chromium } = require('playwright');
const out = process.argv[2];
const note = (size, vb = '0 0 108 108') => `
<svg width="${size}" height="${size}" viewBox="${vb}" xmlns="http://www.w3.org/2000/svg">
  <path d="M34,32 L74,32 L74,62 L60,76 L34,76 Z" fill="#FFFFFF"/>
  <path d="M74,62 L60,76 L60,62 Z" fill="#FDE68A"/>
  <path d="M41,44 L67,44 M41,52 L67,52 M41,60 L53,60" stroke="#B45309" stroke-width="3" stroke-linecap="round"/>
</svg>`;
const bg = 'linear-gradient(135deg, #F59E0B, #EA580C)';
const icon = `<html><body style="margin:0"><div style="width:512px;height:512px;background:${bg};display:flex;align-items:center;justify-content:center">
  ${note(512, '18 18 72 72')}</div></body></html>`;
const feature = `<html><body style="margin:0;font-family:'IPAPGothic','IPAGothic',sans-serif">
<div style="width:1024px;height:500px;background:${bg};display:flex;align-items:center;gap:24px;padding:0 64px;box-sizing:border-box;color:#fff">
  <div style="flex:none">${note(330)}</div>
  <div>
    <div style="font-size:84px;font-weight:bold;letter-spacing:4px;text-shadow:0 2px 8px rgba(0,0,0,.2)">画面メモ</div>
    <div style="font-size:34px;margin-top:20px;line-height:1.5">買い物メモを、<br>スマホの画面にずっと表示</div>
    <div style="font-size:24px;margin-top:22px;opacity:.95">🎤 音声入力　📅 カレンダー連携</div>
  </div>
</div></body></html>`;
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  await p.setViewportSize({ width: 512, height: 512 });
  await p.setContent(icon);
  await p.screenshot({ path: `${out}/icon-512.png`, clip: { x: 0, y: 0, width: 512, height: 512 } });
  await p.setViewportSize({ width: 1024, height: 500 });
  await p.setContent(feature);
  await p.screenshot({ path: `${out}/feature-graphic-1024x500.png`, clip: { x: 0, y: 0, width: 1024, height: 500 } });
  await b.close();
})();
