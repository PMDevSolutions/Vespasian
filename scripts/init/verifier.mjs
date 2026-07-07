import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';

async function pathExists(p) {
  try { await stat(p); return true; } catch { return false; }
}

function isDryRun(env = process.env) {
  return env.VESPASIAN_DRY_RUN === '1' || env.VESPASIAN_DRY_RUN === 'true';
}

/** Parse a .env body; throws on any malformed non-comment line. */
function assertEnvParseable(raw) {
  const lines = raw.split(/\r?\n/);
  for (const [i, line] of lines.entries()) {
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('#')) continue;
    if (!/^[A-Za-z_][A-Za-z0-9_]*=.*$/.test(trimmed)) {
      throw new Error(`.env line ${i + 1} is not KEY=value: "${trimmed}"`);
    }
  }
}

/**
 * Post-apply verification:
 *   1. .env exists, is non-empty, and every line parses as KEY=value
 *   2. vespasian.config.example.json is present and valid JSON
 *   3. optional: when API credentials were provided (and we are not in
 *      dry-run), ping the Wix API to prove they work — cleanly skipped
 *      otherwise.
 */
export async function verify(targetDir, config, deps = {}) {
  const failures = [];
  const fetchImpl = deps.fetch ?? globalThis.fetch;
  const env = deps.env ?? process.env;

  const checks = [
    {
      name: '.env present and parseable',
      run: async () => {
        const file = join(targetDir, '.env');
        if (!await pathExists(file)) {
          throw new Error('Run the wizard again — .env was not written');
        }
        const raw = await readFile(file, 'utf8');
        if (raw.trim() === '') throw new Error('.env is empty');
        assertEnvParseable(raw);
      },
    },
    {
      name: 'config example present',
      run: async () => {
        const file = join(targetDir, 'vespasian.config.example.json');
        if (!await pathExists(file)) {
          throw new Error('vespasian.config.example.json is missing');
        }
        JSON.parse(await readFile(file, 'utf8'));
      },
    },
  ];

  if (config.apiKey && config.accountId && !isDryRun(env)) {
    checks.push({
      name: 'Wix API reachable with the provided credentials',
      run: async () => {
        const res = await fetchImpl('https://www.wixapis.com/site-list/v2/sites/count', {
          method: 'POST',
          headers: {
            Authorization: config.apiKey,
            'wix-account-id': config.accountId,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ filter: {} }),
          signal: AbortSignal.timeout(10_000),
        });
        if (res.status === 401 || res.status === 403) {
          throw new Error(`Wix rejected the credentials (HTTP ${res.status}) — check WIX_API_KEY / WIX_ACCOUNT_ID`);
        }
        if (!res.ok) {
          throw new Error(`Wix API ping failed (HTTP ${res.status})`);
        }
      },
    });
  }

  for (const check of checks) {
    try { await check.run(); }
    catch (err) { failures.push({ check: check.name, reason: err.message }); }
  }

  return { ok: failures.length === 0, failures };
}
