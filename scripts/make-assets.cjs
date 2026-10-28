// Logodan Android ikonları, açılış ekranı ve PDF logosunu üretir (playwright gerekir).
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const svg = fs.readFileSync(path.join(root, 'assets/logo.svg'), 'utf8');
const logoUrl = 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64');
const res = path.join(root, 'android/app/src/main/res');
const NAVY = '#0a2540';

const pngSize = (f) => { const b = fs.readFileSync(f); return [b.readUInt32BE(16), b.readUInt32BE(20)]; };

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  async function render(file, w, h, html, transparent) {
    await p.setViewportSize({ width: w, height: h });
    await p.setContent(`<style>*{margin:0}body{width:${w}px;height:${h}px;overflow:hidden;${transparent ? '' : 'background:' + NAVY}}</style>${html}`);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    await p.screenshot({ path: file, omitBackground: !!transparent });
  }
  const dens = { mdpi: [48, 108], hdpi: [72, 162], xhdpi: [96, 216], xxhdpi: [144, 324], xxxhdpi: [192, 432] };
  for (const [d, [legacy, fg]] of Object.entries(dens)) {
    const dir = path.join(res, 'mipmap-' + d);
    // klasik ikonlar: lacivert yuvarlak kare + logo
    const sq = `<div style="width:${legacy}px;height:${legacy}px;background:${NAVY};border-radius:${legacy * 0.22}px;display:flex;align-items:center;justify-content:center"><img src="${logoUrl}" width="${legacy * 0.86}"></div>`;
    await render(path.join(dir, 'ic_launcher.png'), legacy, legacy, sq, true);
    await render(path.join(dir, 'ic_launcher_round.png'), legacy, legacy, `<img src="${logoUrl}" width="${legacy}" style="display:block">`, true);
    // uyarlanabilir ikon: şeffaf zemin, güvenli alanda logo (arka plan lacivert renk)
    await render(path.join(dir, 'ic_launcher_foreground.png'), fg, fg, `<div style="width:${fg}px;height:${fg}px;display:flex;align-items:center;justify-content:center"><img src="${logoUrl}" width="${fg * 0.64}"></div>`, true);
  }
  // açılış ekranları (mevcut dosyaların boyutlarında)
  const splashes = [];
  (function walk(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const f = path.join(d, e.name); e.isDirectory() ? walk(f) : e.name === 'splash.png' && splashes.push(f); } })(res);
  for (const f of splashes) {
    const [w, h] = pngSize(f);
    const m = Math.min(w, h);
    await render(f, w, h, `<div style="width:${w}px;height:${h}px;display:flex;flex-direction:column;align-items:center;justify-content:center;font-family:'DejaVu Sans',sans-serif">
      <img src="${logoUrl}" width="${m * 0.36}">
      <div style="color:#fff;font-weight:800;font-size:${m * 0.085}px;letter-spacing:${m * 0.01}px;margin-top:${m * 0.04}px">OR-ÇA</div>
      <div style="color:#36c2f0;font-weight:700;font-size:${m * 0.03}px;letter-spacing:${m * 0.012}px;margin-top:${m * 0.01}px">SU TESİSATI</div></div>`);
  }
  // PDF / uygulama içi logo
  await render(path.join(root, 'src/logo.png'), 256, 256, `<img src="${logoUrl}" width="256" style="display:block">`, true);
  const b64 = fs.readFileSync(path.join(root, 'src/logo.png')).toString('base64');
  fs.writeFileSync(path.join(root, 'src/logo.js'), `// scripts/make-assets.cjs tarafından üretilir\nexport const LOGO_PNG = 'data:image/png;base64,${b64}';\n`);
  await b.close();
})();
