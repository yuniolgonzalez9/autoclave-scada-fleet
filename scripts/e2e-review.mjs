// Revisión E2E multi-dispositivo contra el dev server local.
// Uso: node scripts/e2e-review.mjs
// Lee credenciales de .env (nunca imprime secretos).
import { chromium } from 'playwright';
import fs from 'node:fs';

const env = {};
fs.readFileSync('.env', 'utf8').split('\n').forEach((l) => {
  const i = l.indexOf('=');
  if (i > 0) env[l.slice(0, i).trim()] = l.slice(i + 1).trim();
});

const BASE = process.env.E2E_URL || 'http://localhost:3000';
const OUT = 'e2e-shots';
fs.mkdirSync(OUT, { recursive: true });

const DEVICES = [
  { name: 'movil-360', viewport: { width: 360, height: 740 }, mobile: true, touch: true },
  { name: 'iphone-390', viewport: { width: 390, height: 844 }, mobile: true, touch: true },
  { name: 'tablet-768', viewport: { width: 768, height: 1024 }, mobile: true, touch: true },
  { name: 'desktop-1366', viewport: { width: 1366, height: 768 }, mobile: false, touch: false }
];

const browser = await chromium.launch();

for (const d of DEVICES) {
  const ctx = await browser.newContext({
    viewport: d.viewport,
    isMobile: d.mobile,
    hasTouch: d.touch,
    userAgent: d.mobile
      ? 'Mozilla/5.0 (Linux; Android 13; Pixel 6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36'
      : undefined
  });
  const page = await ctx.newPage();
  const errors = [];
  const warnings = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
    if (m.type() === 'warning') warnings.push(m.text());
  });
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));

  try {
    await page.goto(BASE, { waitUntil: 'networkidle', timeout: 45000 });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${OUT}/${d.name}-01-login.png` });

    // Login
    await page.fill('input[type="text"]', 'superadmin');
    await page.fill('input[type="password"]', env.SUPERADMIN_PASSWORD || '');
    await page.click('button[type="submit"]');
    await page.waitForTimeout(5000);
    await page.screenshot({ path: `${OUT}/${d.name}-02-app.png` });

    // Estado de la app
    const state = await page.evaluate(() => ({
      laserPaths: document.querySelectorAll('.header-laser-orbit path').length,
      laserAnimated: [...document.querySelectorAll('.header-laser-orbit path')].some(
        (el) => (el.getAnimations?.() || []).length > 0 || el.classList.contains('laser-orbit-animating')
      ),
      swRegistered: 'serviceWorker' in navigator,
      manifest: !!document.querySelector('link[rel="manifest"]'),
      mobileNav: !!document.querySelector('.mobile-nav-shell'),
      horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 2
    }));
    console.log(`\n=== ${d.name} (${d.viewport.width}x${d.viewport.height}) ===`);
    console.log('estado:', JSON.stringify(state));
    console.log('errores:', errors.length ? errors.slice(0, 6) : 'ninguno');

    // Navegar secciones por la bottom-nav o nav lateral
    const navTargets = d.mobile
      ? ['flota', 'gestion', 'usuarios']
      : ['flota', 'gestion', 'servicio', 'usuarios', 'auditoria'];
    let shotIdx = 3;
    for (const t of navTargets) {
      const btn = page.locator(`button:has-text("${t}")`).first();
      // fallback: nav buttons use aria-label or icons; try section text buttons
      try {
        await page.evaluate((sec) => {
          const btns = [...document.querySelectorAll('button')];
          const b = btns.find((x) => (x.textContent || '').toLowerCase().includes(sec));
          if (b) b.click();
        }, t);
        await page.waitForTimeout(1800);
        await page.screenshot({ path: `${OUT}/${d.name}-0${shotIdx}-${t}.png` });
        shotIdx++;
      } catch (_) {}
    }
  } catch (e) {
    console.log(`\n=== ${d.name} FALLO ===`, e.message);
    await page.screenshot({ path: `${OUT}/${d.name}-error.png` }).catch(() => {});
    console.log('errores:', errors.slice(0, 6));
  }
  await ctx.close();
}

await browser.close();
console.log('\nScreenshots en ./' + OUT);
