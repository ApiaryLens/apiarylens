import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { readFileSync, statSync, writeFileSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';
import { chromium } from 'playwright';

const require = createRequire(import.meta.url);
const args = process.argv.slice(2);
const valueAfter = (name) => args[args.indexOf(name) + 1];
const webDist = resolve(valueAfter('--web-dist'));
const output = resolve(valueAfter('--output'));
const axeSource = readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');

const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json',
};

const server = createServer((request, response) => {
  const pathname = new URL(request.url, 'http://127.0.0.1').pathname;
  const requested = normalize(pathname).replace(/^[/\\]+/, '');
  let path = resolve(webDist, requested || 'index.html');
  if (
    !path.startsWith(webDist) ||
    (() => {
      try {
        return statSync(path).isDirectory();
      } catch {
        return true;
      }
    })()
  ) {
    path = join(webDist, 'index.html');
  }
  try {
    const body = readFileSync(path);
    response.writeHead(200, {
      'content-type': contentTypes[extname(path)] ?? 'application/octet-stream',
    });
    response.end(body);
  } catch {
    response.writeHead(404);
    response.end('Not found');
  }
});
await new Promise((resolvePromise) => server.listen(0, '127.0.0.1', resolvePromise));
const address = server.address();
const url = `http://127.0.0.1:${address.port}`;

const profiles = [
  { name: 'desktop-100', width: 1280, height: 800 },
  { name: 'zoom-equivalent-200', width: 640, height: 800 },
  { name: 'zoom-equivalent-400', width: 320, height: 800 },
  // A classic Windows scrollbar can reserve four CSS pixels from an exact
  // 320-CSS-pixel Electron window at 400% zoom.
  { name: 'packaged-windows-400-usable-width', width: 316, height: 800 },
  { name: 'forced-colors', width: 1280, height: 800, forcedColors: 'active' },
  { name: 'reduced-motion', width: 1280, height: 800, reducedMotion: 'reduce' },
];

const browser = await chromium.launch({ headless: true });
const results = [];
try {
  for (const profile of profiles) {
    const context = await browser.newContext({
      viewport: { width: profile.width, height: profile.height },
    });
    const page = await context.newPage();
    await page.emulateMedia({
      forcedColors: profile.forcedColors ?? 'none',
      reducedMotion: profile.reducedMotion ?? 'no-preference',
    });
    await page.goto(url, { waitUntil: 'networkidle' });
    await page.addScriptTag({ content: axeSource });
    const axe = await page.evaluate(async () => {
      const report = await globalThis.axe.run(document, {
        runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] },
      });
      return report.violations.map((violation) => ({
        id: violation.id,
        impact: violation.impact,
        description: violation.description,
        targets: violation.nodes.map((node) => node.target.join(' ')),
      }));
    });
    const layout = await page.evaluate(() => {
      const interactive = [
        ...document.querySelectorAll('button, input, select, textarea, a[href], [tabindex]'),
      ]
        .filter((element) => !element.disabled && element.getAttribute('tabindex') !== '-1')
        .map((element) => {
          const rectangle = element.getBoundingClientRect();
          return {
            element: element.tagName.toLowerCase(),
            name:
              element.getAttribute('aria-label') ||
              element.textContent?.trim() ||
              element.getAttribute('name') ||
              '',
            width: Math.round(rectangle.width * 10) / 10,
            height: Math.round(rectangle.height * 10) / 10,
          };
        });
      return {
        title: document.title,
        mainCount: document.querySelectorAll('main').length,
        h1Count: document.querySelectorAll('h1').length,
        horizontalOverflow:
          document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
        interactiveCount: interactive.length,
        targetsBelow44: interactive.filter((item) => item.width < 44 || item.height < 44),
        forcedColorsMatches: matchMedia('(forced-colors: active)').matches,
        reducedMotionMatches: matchMedia('(prefers-reduced-motion: reduce)').matches,
      };
    });

    const keyboard = [];
    if (profile.name === 'desktop-100') {
      for (let index = 0; index < Math.min(layout.interactiveCount, 30); index += 1) {
        await page.keyboard.press('Tab');
        keyboard.push(
          await page.evaluate(() => {
            const element = document.activeElement;
            const style = getComputedStyle(element);
            return {
              element: element?.tagName?.toLowerCase() ?? 'none',
              name:
                element?.getAttribute?.('aria-label') ||
                element?.textContent?.trim() ||
                element?.getAttribute?.('name') ||
                '',
              focusVisible: style.outlineStyle !== 'none' || style.boxShadow !== 'none',
            };
          }),
        );
      }
    }
    results.push({ profile, axeViolations: axe, layout, keyboard });
    await context.close();
  }
} finally {
  await browser.close();
  await new Promise((resolvePromise) => server.close(resolvePromise));
}

const evidence = {
  measuredAtUtc: new Date().toISOString(),
  sourceCommit: process.env.GITHUB_SHA ?? null,
  sourceRunId: process.env.GITHUB_RUN_ID ?? null,
  nodeVersion: process.version,
  playwrightVersion: require('playwright/package.json').version,
  axeCoreVersion: require('axe-core/package.json').version,
  results,
  limitations: [
    '320- and 640-CSS-pixel viewports are standards-aligned zoom reflow equivalents, not native desktop host zoom controls',
    'Headless Chromium does not replace NVDA, Windows High Contrast on a retail desktop, or physical keyboard review',
    'This tests the shared React UI; Electron and WebView2 host chrome and native dialogs remain separate gates',
  ],
};

const severeViolations = results.flatMap((result) =>
  result.axeViolations.filter((violation) => ['critical', 'serious'].includes(violation.impact)),
);
const failedProfiles = results.filter(
  (result) =>
    result.layout.horizontalOverflow ||
    result.layout.mainCount !== 1 ||
    result.layout.h1Count !== 1 ||
    result.layout.targetsBelow44.length > 0,
);
const keyboardFailure = results[0].keyboard.some(
  (entry) => !entry.focusVisible || entry.element === 'body',
);
evidence.acceptance = {
  severeAxeViolations: severeViolations.length,
  failedLayoutProfiles: failedProfiles.map((result) => result.profile.name),
  keyboardFocusFailure: keyboardFailure,
  passed: severeViolations.length === 0 && failedProfiles.length === 0 && !keyboardFailure,
};
writeFileSync(output, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
process.stdout.write(`${JSON.stringify(evidence.acceptance, null, 2)}\n`);
if (!evidence.acceptance.passed) process.exitCode = 1;
