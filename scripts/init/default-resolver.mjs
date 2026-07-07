import { slugify, titleCase } from './slugify.mjs';

const VALID_SITE_MODES = ['create', 'connect', 'skip'];

export function resolveDefaults(flags, env) {
  const projectName = flags.name
    ? slugify(flags.name)
    : slugify(env.cwdBasename || 'vespasian-site');

  const apiKey = flags.apiKey?.trim() || null;
  const accountId = flags.accountId?.trim() || null;
  const siteId = flags.siteId?.trim() || null;

  // --site-id connects an existing site; --create-site provisions a new one.
  // They contradict each other.
  if (siteId && flags.createSite) {
    throw new Error('--site-id conflicts with --create-site (drop one)');
  }

  let siteMode;
  if (siteId) siteMode = 'connect';
  else if (flags.createSite) siteMode = 'create';
  else siteMode = 'skip';
  if (!VALID_SITE_MODES.includes(siteMode)) {
    throw new Error(`Unknown site mode: ${siteMode} (expected one of ${VALID_SITE_MODES.join(', ')})`);
  }

  return {
    projectName,
    siteTitle: flags.title ?? titleCase(projectName),
    hasWixAccount: Boolean(apiKey || accountId || siteId),
    apiKey,
    accountId,
    siteMode,
    siteId,
    initGit: !flags.noGit,
  };
}
