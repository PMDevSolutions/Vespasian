import { writeEnv } from './generators/env.mjs';
import { setupSite } from './generators/site.mjs';
import { initGit } from './generators/git.mjs';
import { verify } from './verifier.mjs';

export async function apply(targetDir, config, logger = console.log) {
  const steps = [
    { name: '.env', run: () => writeEnv(targetDir, config) },
    { name: 'site', run: () => setupSite(targetDir, config) },
    { name: 'git',  run: () => initGit(targetDir, config) },
  ];

  let siteResult = null;
  for (const step of steps) {
    const result = await step.run();
    if (step.name === 'site') siteResult = result;
    logger(`✓ ${step.name}${step.name === 'site' && result?.mode ? ` (${result.mode})` : ''}`);
  }

  const result = await verify(targetDir, config);
  if (!result.ok) {
    for (const f of result.failures) logger(`✗ ${f.check}: ${f.reason}`);
    throw new Error('Verification failed');
  }
  logger('✓ verify');

  return { site: siteResult };
}
