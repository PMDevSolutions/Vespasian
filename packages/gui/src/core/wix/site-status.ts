import { promises as fs } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import type { WixSiteStatus } from '../../shared/types/site';

/**
 * Wix connection status, derived entirely from local files — no network calls.
 * Vespasian has no local runtime to supervise (the output is a live Wix site),
 * so "status" means: which credentials are configured in `.env`, which site is
 * targeted, and whether a consented editor session has been captured. The API
 * key is reduced to a boolean before it ever leaves core.
 */

/** Default editor-session path (mirrors the CLI's convention). */
const DEFAULT_SESSION_PATH = '.vespasian/session/state.json';

/**
 * Parse a `.env` body into KEY → value (trimmed, surrounding quotes stripped;
 * comments/blank/malformed lines skipped; empty values dropped).
 */
export function parseEnv(text: string): Record<string, string> {
  const env: Record<string, string> = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === '' || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    let value = line.slice(eq + 1).trim();
    if (
      value.length >= 2 &&
      ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'")))
    ) {
      value = value.slice(1, -1);
    }
    if (value !== '') env[key] = value;
  }
  return env;
}

/** Derive the status shape from parsed env vars (pure; session existence injected). */
export function siteStatusFromEnv(
  env: Record<string, string>,
  hasEnvFile: boolean,
  editorSessionCaptured: boolean,
): WixSiteStatus {
  const dry = env['VESPASIAN_DRY_RUN'];
  return {
    hasEnvFile,
    hasApiKey: Boolean(env['WIX_API_KEY']),
    hasAccountId: Boolean(env['WIX_ACCOUNT_ID']),
    siteId: env['WIX_SITE_ID'] ?? null,
    metasiteId: env['WIX_METASITE_ID'] ?? null,
    editorSessionCaptured,
    dryRun: dry === '1' || dry === 'true',
  };
}

async function exists(path: string): Promise<boolean> {
  try {
    await fs.access(path);
    return true;
  } catch {
    return false;
  }
}

/** Read the project's Wix connection status from `.env` + the editor-session file. */
export async function readSiteStatus(repoRoot: string): Promise<WixSiteStatus> {
  let env: Record<string, string> = {};
  let hasEnvFile = false;
  try {
    env = parseEnv(await fs.readFile(join(repoRoot, '.env'), 'utf8'));
    hasEnvFile = true;
  } catch {
    /* no .env yet — every field reads as unset */
  }
  const sessionRel = env['WIX_EDITOR_STORAGE_STATE'] ?? DEFAULT_SESSION_PATH;
  const sessionPath = isAbsolute(sessionRel) ? sessionRel : resolve(repoRoot, sessionRel);
  const sessionCaptured = await exists(sessionPath);
  return siteStatusFromEnv(env, hasEnvFile, sessionCaptured);
}
