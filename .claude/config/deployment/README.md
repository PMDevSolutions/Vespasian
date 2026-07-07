# Deployment Configuration

Per-environment configuration for the Wix deployment scripts in
`scripts/wix-deployment/`. The files in this directory are loaded by
`scripts/wix-deployment/lib/config-loader.sh`.

An "environment" here is a target Wix site (e.g. a staging site and the real
production site under the same Wix account), not a server — there is no
filesystem to deploy to. Publishing flips the site's saved revision live via
the Site Actions API.

## Conventions

- `*.example.yml` — committed templates, safe to share publicly.
- `*.yml` — real environment configs, **gitignored** (see project root
  `.gitignore`). Never commit secrets or real site GUIDs you consider private.
- File name (minus the extension) is the environment name passed via
  `--env`. So `staging.yml` is selected by `--env staging`.
- Credentials are **never** written into these files — they are referenced by
  environment-variable name and resolved from `.env` / the shell at runtime.

## Setting up an environment

```bash
cp .claude/config/deployment/staging.example.yml \
   .claude/config/deployment/staging.yml
$EDITOR .claude/config/deployment/staging.yml
```

Then verify the file parses and the target site is reachable with a dry run:

```bash
./scripts/wix-deployment/publish.sh --env staging --dry-run
```

## Schema reference

| Key | Required | Notes |
|---|---|---|
| `site_id` | yes | Target Wix site GUID (overrides `WIX_SITE_ID` for this env) |
| `metasite_id` | optional | Cached metaSiteId for dashboard/editor URLs |
| `account.api_key_env` | yes | Name of the env var holding the API key (e.g. `WIX_API_KEY`) — the key itself never lives here |
| `account.account_id_env` | yes | Name of the env var holding the account GUID (e.g. `WIX_ACCOUNT_ID`) |
| `channels` | yes | Which operation channels this env may use: `api`, `editor`, or both. Editor requires a consented session from `vespasian login --editor` |
| `publish.require_checks` | recommended | Run `pre-publish-checks.sh` and refuse to publish on failure (default true on production) |
| `publish.require_qa_pass` | optional | Refuse to publish unless the latest `vespasian qa` FidelityReport passed |
| `publish.allow_editor_fallback` | optional | Permit Playwright publish if the API publish fails (default false) |
| `rollback` | informational | Wix has **no revision-revert API**; `rollback.sh --acknowledge-manual` prints the manual Site History revert path — reverting is a documented manual step in the Wix dashboard |
| `notify.slack_webhook` | optional | Incoming webhook URL |
| `notify.discord_webhook` | optional | Webhook URL |
| `notify.webhook_url` | optional | Generic JSON POST endpoint |
| `notify.email_to` / `notify.email_from` | optional | Requires `mail` |

## Secrets

Real environment files may contain webhook URLs and site GUIDs that should not
enter version control. The repository's `.gitignore` excludes any `*.yml` file
in this directory other than `*.example.yml`. If you fork the project,
double-check the ignore rule before adding a new config.

API keys are account-scoped and live only in `.env` (gitignored) or your
secrets manager (1Password, Vault, AWS Secrets Manager) — these YAML files
only name the environment variables to read.
