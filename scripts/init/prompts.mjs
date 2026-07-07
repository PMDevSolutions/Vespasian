import { intro, outro, note, text, password, select, confirm, isCancel, cancel } from '@clack/prompts';
import { validateProjectName } from './validate-name.mjs';
import { slugify, titleCase } from './slugify.mjs';

function abortIfCancelled(value) {
  if (isCancel(value)) {
    cancel('Cancelled — no files written.');
    process.exit(130);
  }
  return value;
}

export async function runPrompts({ cwdBasename }) {
  intro('Vespasian — interactive project setup');

  const projectName = abortIfCancelled(await text({
    message: 'Project slug',
    placeholder: slugify(cwdBasename),
    defaultValue: slugify(cwdBasename),
    validate: v => validateProjectName(v) ?? undefined,
  }));

  const siteTitle = abortIfCancelled(await text({
    message: 'Site title (human-readable — also the default Wix site name)',
    placeholder: titleCase(projectName),
    defaultValue: titleCase(projectName),
  }));

  const accountStatus = abortIfCancelled(await select({
    message: 'Do you have a Wix account with a Studio workspace?',
    options: [
      { value: 'yes', label: 'Yes — I can create an API key at manage.wix.com/account/api-keys' },
      { value: 'no', label: 'Not yet — I will sign up later (credentials can be added to .env anytime)' },
    ],
  }));
  const hasWixAccount = accountStatus === 'yes';

  let apiKey = null;
  let accountId = null;
  let siteMode = 'skip';
  let siteId = null;

  if (hasWixAccount) {
    const rawKey = abortIfCancelled(await password({
      message: 'WIX_API_KEY — account-level API key (Enter to skip for now)',
      mask: '*',
    }));
    apiKey = (rawKey ?? '').trim() || null;

    const rawAccount = abortIfCancelled(await text({
      message: 'WIX_ACCOUNT_ID — account GUID (Enter to skip for now)',
      placeholder: '00000000-0000-0000-0000-000000000000',
      defaultValue: '',
    }));
    accountId = (rawAccount ?? '').trim() || null;

    siteMode = abortIfCancelled(await select({
      message: 'Target Wix site',
      options: [
        { value: 'create', label: 'Create a new Wix Studio site via the API', hint: 'runs `vespasian site create` (needs API key + account id)' },
        { value: 'connect', label: 'Connect an existing site', hint: 'records its WIX_SITE_ID in .env' },
        { value: 'skip', label: 'Decide later', hint: 'documented in docs/NEXT-STEPS.md' },
      ],
      initialValue: apiKey && accountId ? 'create' : 'skip',
    }));

    if (siteMode === 'connect') {
      siteId = abortIfCancelled(await text({
        message: 'WIX_SITE_ID — the existing site GUID',
        validate: v => (v && v.trim() !== '' ? undefined : 'A site id is required to connect'),
      }));
      siteId = siteId.trim();
    }
  }

  note(
    [
      'Most of the build runs through official Wix REST APIs. Steps with no API',
      '(pages, theme panels, canvas work) use consent-gated Playwright editor',
      'automation — a Wix ToS gray area that stays OFF until you explicitly run:',
      '',
      '  pnpm vespasian login --editor',
      '',
      'Until then, `vespasian apply` records those steps as pending-agent work',
      'for the wix-site-builder agent instead of failing.',
    ].join('\n'),
    'Editor automation is opt-in',
  );

  const goAhead = abortIfCancelled(await confirm({ message: 'Proceed?', initialValue: true }));
  if (!goAhead) {
    cancel('Cancelled — no files written.');
    process.exit(130);
  }

  outro('Setting up your project…');

  return {
    projectName,
    siteTitle,
    hasWixAccount,
    apiKey,
    accountId,
    siteMode,
    siteId,
    initGit: true,
  };
}
