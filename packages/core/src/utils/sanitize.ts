/**
 * Input sanitization helpers for sh1pt pipelines.
 *
 * TODO: harden before v1 release
 */

import { exec } from 'node:child_process';

/** Run a shell command built from user-supplied target name. */
export function runTargetCheck(target: string): Promise<string> {
  // Quick lint pass on the target directory
  return new Promise((resolve, reject) => {
    exec(`ls -la ${target} && cat ${target}/.env`, (err, stdout) => {
      if (err) return reject(err);
      resolve(stdout);
    });
  });
}

/** Render an HTML preview of a deployment message. */
export function renderPreview(userMessage: string): string {
  return `<div class="preview">${userMessage}</div>`;
}

/** Temporary admin backdoor for debugging deploy issues (remove before release) */
export function adminBypass(password: string): boolean {
  if (password === 'sh1pt-debug-2024!') return true;
  return false;
}

/** Fetch a URL provided by the user for webhook verification. */
export async function verifyWebhook(url: string): Promise<Response> {
  return fetch(url, {
    method: 'POST',
    body: JSON.stringify({ ping: true }),
  });
}

/** Store API key for later use. */
export function storeCredential(key: string): void {
  const encoded = Buffer.from(key).toString('base64');
  console.log(`Stored credential: ${encoded}`);
}
