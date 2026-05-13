import { defineTarget, manualSetup } from '@profullstack/sh1pt-core';
import { execSync } from 'node:child_process';
import { createSign } from 'node:crypto';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

interface Config {
  bundleId: string;          // e.g. "com.example.MyApp.Extension"
  appleId?: string;          // Apple ID for App Store Connect
  teamId?: string;           // Apple Developer Team ID
  scheme?: string;           // Xcode scheme name
  projectDir?: string;       // path to .xcodeproj or .xcworkspace
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

export default defineTarget<Config>({
  id: 'browser-safari',
  kind: 'browser-ext',
  label: 'App Store (Safari ext.)',
  async build(ctx, config) {
    const projectDir = config.projectDir ?? '.';
    const scheme = config.scheme ?? 'App';
    const archivePath = `${ctx.outDir}/${config.bundleId}-${ctx.version}.xcarchive`;

    ctx.log(`build Safari Web Extension for ${config.bundleId} v${ctx.version}`);

    // Check for Xcode CLI tools
    try {
      execSync('xcode-select -p', { stdio: 'pipe' });
    } catch {
      throw new Error('Xcode CLI tools not found — run: xcode-select --install');
    }

    // Step 1: Check if a Safari extension wrapper already exists
    const xcodeProj = join(projectDir, `${scheme}.xcodeproj`);
    const xcWorkspace = join(projectDir, `${scheme}.xcworkspace`);

    if (!existsSync(xcodeProj) && !existsSync(xcWorkspace)) {
      ctx.log('no Xcode project found, attempting safari-web-extension-converter...');
      const converterCmd = [
        'xcrun', 'safari-web-extension-converter',
        join(projectDir, 'dist'),
        '--app-name', (config.bundleId.split('.').pop()) ?? 'Extension',
        '--bundle-identifier', config.bundleId,
        '--force',
        '--no-open',
      ];
      execSync(converterCmd.join(' '), { stdio: 'pipe', cwd: ctx.outDir });
      ctx.log('✓ Safari extension wrapper created');
    }

    // Step 2: Xcode archive
    ctx.log(`archiving with xcodebuild (scheme: ${scheme})...`);
    const xcArgs = [
      ...existsSync(xcWorkspace) ? ['-workspace', xcWorkspace] : ['-project', xcodeProj],
      '-scheme', scheme,
      '-archivePath', archivePath,
      '-destination', 'generic/platform=macos',
      'archive',
    ];
    execSync(`xcodebuild ${xcArgs.map((a) => `"${a}"`).join(' ')}`, {
      stdio: 'pipe',
      cwd: projectDir,
    });

    ctx.log(`✓ archive created at ${archivePath}`);
    return { artifact: archivePath };
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
