import { defineTarget, manualSetup } from '@profullstack/sh1pt-core';
import { execFileSync, execSync } from 'node:child_process';
import { createSign } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, posix, resolve } from 'node:path';

interface Config {
  bundleId: string;          // e.g. "com.example.MyApp.Extension"
  appleId?: string;          // Apple ID for App Store Connect
  teamId?: string;           // Apple Developer Team ID
  scheme?: string;           // Xcode scheme name
  projectDir?: string;       // path to .xcodeproj or .xcworkspace
}

interface SafariPackagePlan {
  bundleId: string;
  version: string;
  projectDir: string;
  scheme: string;
  archivePath: string;
  converter: {
    command: 'xcrun';
    args: string[];
    cwd: string;
  };
  archive: {
    command: 'xcodebuild';
    args: string[];
    cwd: string;
  };
}

/**
 * Generate a JWT for App Store Connect API authentication.
 * Uses ES256 (ECDSA P-256) signing with the private key from secrets.
 */
function generateAscJwt(keyId: string, issuerId: string, privateKeyPem: string): string {
  const header = { alg: 'ES256', kid: keyId, typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: issuerId,
    iat: now,
    exp: now + 1199,
    aud: 'appstoreconnect-v1',
  };
  const headerB64 = b64url(JSON.stringify(header));
  const payloadB64 = b64url(JSON.stringify(payload));
  const signer = createSign('SHA256');
  signer.update(`${headerB64}.${payloadB64}`);
  const sig = signer.sign(privateKeyPem);
  return `${headerB64}.${payloadB64}.${b64url(sig)}`;
}

function b64url(buf: Buffer | string): string {
  const b = Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
  return b.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function safeFileStem(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-|-$/g, '') || 'safari-extension';
}

function planPath(outDir: string, bundleId: string, version: string): string {
  return joinLike(outDir, `${safeFileStem(bundleId)}-${safeFileStem(version)}.safari-plan.json`);
}

function isWindowsPath(path: string): boolean {
  return path.includes('\\') || /^[A-Za-z]:\//.test(path.replace(/\\/g, '/'));
}

function joinLike(base: string, ...parts: string[]): string {
  return isWindowsPath(base) ? join(base, ...parts) : posix.join(base, ...parts);
}

function resolveLike(base: string, path: string): string {
  return isWindowsPath(base) ? resolve(base, path) : posix.resolve(base, path);
}

function buildPlan(
  ctx: { projectDir: string; outDir: string; version: string },
  config: Config,
): SafariPackagePlan {
  const projectDir = resolveLike(ctx.projectDir, config.projectDir ?? '.');
  const scheme = config.scheme ?? 'App';
  const archivePath = joinLike(ctx.outDir, `${safeFileStem(config.bundleId)}-${safeFileStem(ctx.version)}.xcarchive`);
  const xcodeProj = joinLike(projectDir, `${scheme}.xcodeproj`);
  const xcWorkspace = joinLike(projectDir, `${scheme}.xcworkspace`);
  const appName = config.bundleId.split('.').pop() ?? 'Extension';
  const archiveArgs = [
    existsSync(xcWorkspace) ? '-workspace' : '-project',
    existsSync(xcWorkspace) ? xcWorkspace : xcodeProj,
    '-scheme',
    scheme,
    '-archivePath',
    archivePath,
    '-destination',
    'generic/platform=macos',
    'archive',
  ];

  return {
    bundleId: config.bundleId,
    version: ctx.version,
    projectDir,
    scheme,
    archivePath,
    converter: {
      command: 'xcrun',
      args: [
        'safari-web-extension-converter',
        joinLike(projectDir, 'dist'),
        '--app-name',
        appName,
        '--bundle-identifier',
        config.bundleId,
        '--force',
        '--no-open',
      ],
      cwd: ctx.outDir,
    },
    archive: {
      command: 'xcodebuild',
      args: archiveArgs,
      cwd: projectDir,
    },
  };
}

export default defineTarget<Config>({
  id: 'browser-safari',
  kind: 'browser-ext',
  label: 'App Store (Safari ext.)',
  async build(ctx, config) {
    const plan = buildPlan(ctx, config);
    const artifact = planPath(ctx.outDir, config.bundleId, ctx.version);

    ctx.log(`build Safari Web Extension for ${config.bundleId} v${ctx.version}`);
    await mkdir(ctx.outDir, { recursive: true });

    if (ctx.dryRun) {
      await writeFile(artifact, `${JSON.stringify(plan, null, 2)}\n`, 'utf8');
      ctx.log(`safari: dry-run package plan written to ${artifact}`);
      return { artifact, meta: { archivePath: plan.archivePath, commands: [plan.converter, plan.archive] } };
    }

    // Check for Xcode CLI tools
    try {
      execFileSync('xcode-select', ['-p'], { stdio: 'pipe' });
    } catch {
      throw new Error('Xcode CLI tools not found — run: xcode-select --install');
    }

    // Step 1: Check if a Safari extension wrapper already exists
    const xcodeProj = join(plan.projectDir, `${plan.scheme}.xcodeproj`);
    const xcWorkspace = join(plan.projectDir, `${plan.scheme}.xcworkspace`);

    if (!existsSync(xcodeProj) && !existsSync(xcWorkspace)) {
      ctx.log('no Xcode project found, attempting safari-web-extension-converter...');
      execFileSync(plan.converter.command, plan.converter.args, { stdio: 'pipe', cwd: plan.converter.cwd });
      ctx.log('Safari extension wrapper created');
    }

    // Step 2: Xcode archive
    ctx.log(`archiving with xcodebuild (scheme: ${plan.scheme})...`);
    execFileSync(plan.archive.command, plan.archive.args, {
      stdio: 'pipe',
      cwd: plan.archive.cwd,
    });

    ctx.log(`archive created at ${plan.archivePath}`);
    return { artifact: plan.archivePath };
  },
  async ship(ctx, config) {
    ctx.log(`upload ${config.bundleId} to App Store Connect v${ctx.version}`);
    if (ctx.dryRun) {
      return { id: `${config.bundleId}@${ctx.version}`, url: `https://apps.apple.com/app/${config.bundleId}` };
    }

    // Fetch App Store Connect API credentials from secrets
    const keyId = ctx.secret('APP_STORE_CONNECT_KEY_ID');
    const issuerId = ctx.secret('APP_STORE_CONNECT_ISSUER_ID');
    const privateKey = ctx.secret('APP_STORE_CONNECT_PRIVATE_KEY');
    const appleId = config.appleId ?? ctx.secret('APPLE_ID');

    if (!keyId || !issuerId || !privateKey) {
      throw new Error('Missing secrets: APP_STORE_CONNECT_KEY_ID, APP_STORE_CONNECT_ISSUER_ID, APP_STORE_CONNECT_PRIVATE_KEY');
    }
    if (!appleId) {
      throw new Error('Missing appleId in config or APPLE_ID secret');
    }

    // Generate JWT for API auth
    const jwt = generateAscJwt(keyId, issuerId, privateKey);
    const apiBase = 'https://api.appstoreconnect.apple.com/v1';
    const authHeaders: Record<string, string> = { authorization: `Bearer ${jwt}`, accept: 'application/json' };

    // Step 1: Find the app in App Store Connect
    ctx.log('looking up app in App Store Connect...');
    const searchUrl = `${apiBase}/apps?filter[bundleId]=${encodeURIComponent(config.bundleId)}`;
    const searchRes = await fetch(searchUrl, { headers: authHeaders });

    if (!searchRes.ok) {
      throw new Error(`Failed to search apps (${searchRes.status}): ensure the app record exists in App Store Connect`);
    }
    const searchData = (await searchRes.json()) as { data?: Array<{ id: string; attributes: { name: string } }> };
    const app = searchData.data?.[0];
    if (!app) {
      throw new Error(`No app found for bundle ID ${config.bundleId} — create the app record in App Store Connect first`);
    }
    ctx.log(`✓ found app: ${app.attributes.name} (${app.id})`);

    // Step 2: Create a new app store version for this build
    ctx.log(`creating app store version ${ctx.version}...`);
    const versionRes = await fetch(`${apiBase}/appStoreVersions`, {
      method: 'POST',
      headers: { ...authHeaders, 'content-type': 'application/json' },
      body: JSON.stringify({
        data: {
          type: 'appStoreVersions',
          attributes: { platform: 'MACOS', versionString: ctx.version },
          relationships: { app: { data: { type: 'apps', id: app.id } } },
        },
      }),
    });

    if (!versionRes.ok) {
      const errBody = await versionRes.text().catch(() => '');
      if (versionRes.status === 409) {
        ctx.log('app store version already exists, proceeding...');
      } else {
        throw new Error(`Failed to create app store version (${versionRes.status}): ${errBody.slice(0, 200)}`);
      }
    } else {
      ctx.log('✓ app store version created');
    }

    // Step 3: Upload the build archive using xcrun altool
    ctx.log('uploading archive with xcrun altool...');
    try {
      execSync(
        `xcrun altool --upload-app -f "${ctx.artifact}" ` +
        `-u "${appleId}" -p "@env:APP_STORE_CONNECT_PRIVATE_KEY" ` +
        `--type macos --output-format json`,
        { stdio: 'pipe', timeout: 600_000 },
      );
    } catch {
      ctx.log('altool upload failed, trying notarytool...', 'warn');
      execSync(
        `xcrun notarytool submit "${ctx.artifact}" ` +
        `--key-id "${keyId}" --issuer "${issuerId}" ` +
        `--private-key <(echo "${privateKey}") ` +
        `--wait --output-format json`,
        { stdio: 'pipe', timeout: 600_000 },
      );
    }

    ctx.log('✓ build uploaded to App Store Connect');

    return {
      id: `${config.bundleId}@${ctx.version}`,
      url: `https://apps.apple.com/app/${config.bundleId}`,
    };
  },
  async status(id) {
    const [bundleId] = id.split('@');
    return { state: 'live', url: `https://apps.apple.com/search?term=${bundleId}` };
  },
  setup: manualSetup({
    label: 'App Store (Safari ext.)',
    vendorDocUrl: 'https://developer.apple.com/documentation/safariservices/safari-web-extensions',
    steps: [
      'Enroll in Apple Developer Program (https://developer.apple.com/programs/)',
      'Generate an App Store Connect API Key at https://appstoreconnect.apple.com/access/api',
      'Run: sh1pt secret set APP_STORE_CONNECT_KEY_ID <key-id>',
      'Run: sh1pt secret set APP_STORE_CONNECT_ISSUER_ID <issuer-id>',
      'Run: sh1pt secret set APP_STORE_CONNECT_PRIVATE_KEY "$(cat AuthKey_<key-id>.p8)"',
      'Ensure Xcode project is configured with correct bundle ID and team',
    ],
  }),
});
