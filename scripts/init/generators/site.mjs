// Wix site step — the wizard's provisioning stage.
//
// Vespasian's output is a live Wix site, not local theme files, so this step
// either provisions one now (`vespasian site create` via the API, when the
// wizard collected credentials and the user asked for it) or records exactly
// what to run later in docs/NEXT-STEPS.md. Under VESPASIAN_DRY_RUN=1 nothing
// touches the network — the create is downgraded to a recorded next-step.

import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

function isDryRun(env = process.env) {
  return env.VESPASIAN_DRY_RUN === '1' || env.VESPASIAN_DRY_RUN === 'true';
}

function nextStepsBody(config, reason) {
  const title = config.siteTitle ?? config.projectName;
  return `# Next Steps — Wix site

${reason}

1. Add your credentials to \`.env\` (see \`.env.example\`):
   - \`WIX_API_KEY\` — account-level key from https://manage.wix.com/account/api-keys
   - \`WIX_ACCOUNT_ID\` — your account GUID
2. Provision or connect the target site (either writes \`WIX_SITE_ID\` to \`.env\`):
   \`\`\`bash
   pnpm vespasian site create "${title}"    # create a new Wix Studio site
   pnpm vespasian site use <site-id>         # or connect an existing one
   \`\`\`
3. Optional — enable the consent-gated editor-automation plane:
   \`\`\`bash
   pnpm vespasian login --editor
   \`\`\`
4. Convert a design and apply it:
   \`\`\`bash
   pnpm vespasian pipeline indesign <file.idml>
   pnpm vespasian apply .vespasian/plans/<slug>/plan.json --dry-run
   \`\`\`
`;
}

async function writeNextSteps(targetDir, config, reason) {
  const docsDir = join(targetDir, 'docs');
  await mkdir(docsDir, { recursive: true });
  await writeFile(join(docsDir, 'NEXT-STEPS.md'), nextStepsBody(config, reason));
}

/**
 * @param {string} targetDir
 * @param {object} config  Wizard config (siteMode, apiKey, accountId, siteId, …).
 * @param {{ exec?: typeof execFileAsync, env?: NodeJS.ProcessEnv }} [deps]  Injectable for tests.
 * @returns {Promise<{ mode: 'created'|'connected'|'next-steps' }>}
 */
export async function setupSite(targetDir, config, deps = {}) {
  const exec = deps.exec ?? execFileAsync;
  const env = deps.env ?? process.env;

  if (config.siteMode === 'connect' && config.siteId) {
    // WIX_SITE_ID was already written into .env by the env step.
    return { mode: 'connected' };
  }

  const haveCreds = Boolean(config.apiKey && config.accountId);
  if (config.siteMode === 'create' && haveCreds && !isDryRun(env)) {
    const bin = join(targetDir, 'bin', 'vespasian.mjs');
    await exec(process.execPath, [bin, 'site', 'create', config.siteTitle ?? config.projectName], {
      cwd: targetDir,
      env: {
        ...env,
        WIX_API_KEY: config.apiKey,
        WIX_ACCOUNT_ID: config.accountId,
      },
    });
    return { mode: 'created' };
  }

  const reason =
    config.siteMode === 'create'
      ? (isDryRun(env)
          ? 'Dry-run mode: site creation was recorded instead of executed.'
          : 'No API credentials were provided yet, so no site was created.')
      : 'No Wix site is connected yet.';
  await writeNextSteps(targetDir, config, reason);
  return { mode: 'next-steps' };
}
