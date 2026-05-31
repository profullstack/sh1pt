import { defineTarget, manualSetup } from '@profullstack/sh1pt-core';
import { copyFile, cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, isAbsolute, join, resolve } from 'node:path';

interface Config {
  manifestPath: string;
  serviceWorkerPath?: string;
  startUrl?: string;
  scope?: string;
  display?: 'fullscreen' | 'standalone' | 'minimal-ui' | 'browser';
  iconsDir?: string;
  publicUrl?: string;
}

function fromProject(projectDir: string, path: string) {
  return isAbsolute(path) ? path : resolve(projectDir, path);
}

function absoluteUrl(publicUrl: string | undefined, path: string) {
  if (/^https?:\/\//.test(path)) return path;
  if (!publicUrl) return undefined;
  return new URL(path, publicUrl.endsWith('/') ? publicUrl : `${publicUrl}/`).toString();
}

function normalizeWebPath(path: string | undefined, fallback: string) {
  const value = path ?? fallback;
  return value.startsWith('/') || /^https?:\/\//.test(value) ? value : `/${value}`;
}

export default defineTarget<Config>({
  id: 'web-pwa',
  kind: 'web',
  label: 'Progressive Web App',
  async build(ctx, config) {
    const startUrl = normalizeWebPath(config.startUrl, '/');
    const scope = normalizeWebPath(config.scope, startUrl);
    const artifactDir = join(ctx.outDir, 'web-pwa');
    const manifestOut = join(artifactDir, 'manifest.webmanifest');
    const serviceWorkerOut = join(artifactDir, 'service-worker.js');
    const htmlOut = join(artifactDir, 'index.html');
    const summaryOut = join(artifactDir, 'pwa-package.json');

    ctx.log(`package PWA manifest ${config.manifestPath} with start_url ${startUrl} and scope ${scope}`);
    await mkdir(artifactDir, { recursive: true });

    let manifest: Record<string, unknown>;
    try {
      manifest = JSON.parse(await readFile(fromProject(ctx.projectDir, config.manifestPath), 'utf-8'));
    } catch (error) {
      if (!ctx.dryRun) throw error;
      manifest = { name: 'Dry Run PWA' };
    }
    manifest.start_url = manifest.start_url ?? startUrl;
    manifest.scope = manifest.scope ?? scope;
    manifest.display = manifest.display ?? config.display ?? 'standalone';
    await writeFile(manifestOut, `${JSON.stringify(manifest, null, 2)}\n`, 'utf-8');

    if (config.serviceWorkerPath) {
      ctx.log(`include service worker ${config.serviceWorkerPath}`);
      await copyFile(fromProject(ctx.projectDir, config.serviceWorkerPath), serviceWorkerOut);
    } else {
      await writeFile(serviceWorkerOut, `const CACHE_NAME = 'sh1pt-web-pwa-${ctx.version}';
const OFFLINE_URL = './index.html';
const PRECACHE_URLS = [OFFLINE_URL, './manifest.webmanifest'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))),
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return response;
      })
      .catch(async () => (await caches.match(event.request)) ?? caches.match(OFFLINE_URL)),
  );
});
`, 'utf-8');
    }

    await writeFile(htmlOut, `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <link rel="manifest" href="./manifest.webmanifest">
    <title>${manifest.name ?? manifest.short_name ?? 'PWA'}</title>
  </head>
  <body>
    <script>
      if ('serviceWorker' in navigator) navigator.serviceWorker.register('./service-worker.js');
    </script>
  </body>
</html>
`, 'utf-8');

    const files = ['index.html', 'manifest.webmanifest', 'service-worker.js'];
    if (config.iconsDir) {
      const iconsSrc = fromProject(ctx.projectDir, config.iconsDir);
      const iconsDestName = basename(config.iconsDir.replace(/[\\/]$/, '')) || 'icons';
      const iconsDest = join(artifactDir, iconsDestName);
      ctx.log(`copy PWA icons from ${config.iconsDir} to ${iconsDestName}/`);
      await cp(iconsSrc, iconsDest, { recursive: true });
      files.push(iconsDestName);
    }

    await writeFile(summaryOut, `${JSON.stringify({
      version: ctx.version,
      channel: ctx.channel,
      startUrl,
      scope,
      display: manifest.display,
      files,
    }, null, 2)}\n`, 'utf-8');

    return { artifact: artifactDir };
  },
  async ship(ctx, config) {
    const startUrl = normalizeWebPath(config.startUrl, '/');
    const url = absoluteUrl(config.publicUrl, startUrl);
    ctx.log(`prepare PWA release metadata for ${url ?? startUrl}`);
    if (ctx.dryRun) return { id: 'dry-run', url };
    return {
      id: url ?? `web-pwa@${ctx.version}`,
      url,
    };
  },
  async status(id) {
    return { state: 'live', url: /^https?:\/\//.test(id) ? id : undefined };
  },
  setup: manualSetup({
    label: 'Progressive Web App',
    vendorDocUrl: 'https://web.dev/explore/progressive-web-apps',
    steps: [
      'Create a web app manifest with name, icons, start_url, scope, and display mode',
      'Register a service worker for offline/navigation fallback behavior',
      'Serve the app over HTTPS with correct manifest and service-worker headers',
      'Run Lighthouse or browser installability checks before production publish',
    ],
  }),
});
