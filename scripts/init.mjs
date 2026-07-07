import { parseArgs } from 'node:util';
import { basename } from 'node:path';
import { resolveDefaults } from './init/default-resolver.mjs';
import { apply } from './init/apply.mjs';

function usage() {
  console.log(`Usage: node scripts/init.mjs [options]

Options:
  --yes                 Non-interactive mode (uses defaults / flag values)
  --name <slug>         Project slug
  --title <str>         Site title (default: derived from the slug)
  --api-key <key>       WIX_API_KEY (account-level, from manage.wix.com/account/api-keys)
  --account-id <guid>   WIX_ACCOUNT_ID
  --site-id <guid>      Connect an existing Wix site (records WIX_SITE_ID in .env)
  --create-site         Create a new Wix Studio site (needs --api-key + --account-id)
  --no-git              Skip git init
  --help                Show this message

Credentials are optional — everything can be added to .env later, and the
recorded next steps land in docs/NEXT-STEPS.md.
`);
}

async function main() {
  let parsed;
  try {
    // pnpm forwards the `--` separator literally on some platforms (notably
    // Windows), e.g. `node scripts/init.mjs "--" "--yes"`. The wizard takes no
    // positionals, so drop any bare `--` token — this makes both
    // `pnpm run init -- --yes …` and `pnpm run init --yes …` work identically.
    const argv = process.argv.slice(2).filter(a => a !== '--');
    parsed = parseArgs({
      args: argv,
      options: {
        yes:    { type: 'boolean' },
        name:   { type: 'string' },
        title:  { type: 'string' },
        'api-key':    { type: 'string' },
        'account-id': { type: 'string' },
        'site-id':    { type: 'string' },
        'create-site': { type: 'boolean' },
        'no-git': { type: 'boolean' },
        help:   { type: 'boolean' },
      },
      strict: true,
    });
  } catch (err) {
    console.error(`Error: ${err.message}`);
    usage();
    process.exit(2);
  }

  if (parsed.values.help) { usage(); process.exit(0); }

  const targetDir = process.cwd();
  const env = { cwdBasename: basename(targetDir) };

  let config;
  if (parsed.values.yes) {
    try {
      config = resolveDefaults({
        name: parsed.values.name,
        title: parsed.values.title,
        apiKey: parsed.values['api-key'],
        accountId: parsed.values['account-id'],
        siteId: parsed.values['site-id'],
        createSite: parsed.values['create-site'],
        noGit: parsed.values['no-git'],
      }, env);
    } catch (err) {
      console.error(`Error: ${err.message}`);
      process.exit(2);
    }
  } else {
    const { runPrompts } = await import('./init/prompts.mjs');
    config = await runPrompts(env);
    if (parsed.values['no-git']) config.initGit = false;
  }

  let applied;
  try {
    applied = await apply(targetDir, config);
  } catch (err) {
    console.error(`\n✗ Setup failed: ${err.message}`);
    process.exit(1);
  }

  const siteMode = applied?.site?.mode ?? 'next-steps';
  const siteSteps = siteMode === 'created' ? `
Your Wix site was created — WIX_SITE_ID is recorded in .env.
` : siteMode === 'connected' ? `
Connected to your existing Wix site (WIX_SITE_ID=${config.siteId} in .env).
` : `
No Wix site yet — see docs/NEXT-STEPS.md, then:
  pnpm vespasian site create "${config.siteTitle}"    # or: pnpm vespasian site use <site-id>
`;

  console.log(`
✓ Project ready at ${targetDir}

Next steps:
  cd ${basename(targetDir)}
  # review .env (WIX_API_KEY, WIX_ACCOUNT_ID — see .env.example for docs)
${siteSteps}
Build pipeline:
  pnpm vespasian pipeline indesign <file.idml>          # design → BuildPlan
  pnpm vespasian plan .vespasian/plans/<slug>            # recompile a plan
  pnpm vespasian apply .vespasian/plans/<slug>/plan.json --dry-run
  pnpm vespasian login --editor                          # opt in to editor automation
  pnpm vespasian publish                                 # publish the live site

Resources:
  - Docs:    CLAUDE.md, docs/QUICK-START.md, docs/wix/ARCHITECTURE.md
  - Skills:  .claude/skills/README.md
`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
