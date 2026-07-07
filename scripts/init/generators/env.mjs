import { readFile, writeFile, access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { join } from 'node:path';

/**
 * Write .env from the .env.example template, substituting any Wix credentials
 * the wizard collected. Lines are preserved verbatim except for overridden
 * keys, so every comment in the template survives into the user's .env.
 */
export async function writeEnv(targetDir, config) {
  const examplePath = join(targetDir, '.env.example');
  try {
    await access(examplePath, constants.R_OK);
  } catch {
    throw new Error(`.env.example not found in ${targetDir}`);
  }

  const lines = (await readFile(examplePath, 'utf8')).split(/\r?\n/);
  const overrides = {};
  if (config.apiKey) overrides.WIX_API_KEY = config.apiKey;
  if (config.accountId) overrides.WIX_ACCOUNT_ID = config.accountId;
  if (config.siteId) overrides.WIX_SITE_ID = config.siteId;

  const seen = new Set();
  const out = lines.map(line => {
    const m = /^([A-Z_]+)=/.exec(line);
    if (!m) return line;
    seen.add(m[1]);
    return overrides[m[1]] != null ? `${m[1]}=${overrides[m[1]]}` : line;
  });

  for (const [key, value] of Object.entries(overrides)) {
    if (!seen.has(key)) out.push(`${key}=${value}`);
  }

  await writeFile(join(targetDir, '.env'), out.join('\n') + '\n');
}
