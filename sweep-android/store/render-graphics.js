const { chromium } = require('playwright');
const out = process.argv[2];
const bin = (size, vb = '0 0 108 108') => `
<svg width="${size}" height="${size}" viewBox="${vb}" xmlns="http://www.w3.org/2000/svg">
  <path d="M37,44 H71 M48,44 V38 H60 V44 M41,44 L43.5,73 H64.5 L67,44 M50,52 V65 M58,52 V65"
    fill="none" stroke="#FFFFFF" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;
const bg = 'linear-gradient(135deg, #0F766E, #10B981)';
const icon = `<html><body style="margin:0"><div style="width:512px;height:512px;background:${bg};display:flex;align-items:center;justify-content:center">
  ${bin(512, '21 22 66 66')}</div></body></html>`;
const feature = `<html><body style="margin:0;font-family:'IPAPGothic','IPAGothic',sans-serif">
<div style="width:1024px;height:500px;background:${bg};display:flex;align-items:center;gap:8px;padding:0 40px;box-sizing:border-box;color:#fff">
  <div style="flex:none">${bin(280)}</div>
  <div>
    <div style="font-size:56px;font-weight:bold;letter-spacing:1px;white-space:nowrap;text-shadow:0 2px 8px rgba(0,0,0,.2)">Androidアプリ一掃アプリ</div>
    <div style="font-size:34px;margin-top:20px;line-height:1.5">いらないアプリだけ選んで、<br>まとめて削除</div>
    <div style="font-size:24px;margin-top:22px;opacity:.95">最後に使った日・容量がひと目でわかる</div>
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
