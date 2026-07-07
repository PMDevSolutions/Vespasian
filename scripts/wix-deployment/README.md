# Wix Deployment Scripts

Publish the target Wix site from this repository. The scripts here are invoked
by the `deployment-agent` (see `.claude/agents/deployment-agent.md`) but are
also safe to call directly. `scripts/deploy.sh` at the scripts root is a thin
wrapper around `publish.sh`.

Publishing on Wix ships the **current saved editor state** of the site over
the Site Publisher REST API — there is no artifact upload. The actual site
mutation happens earlier, when `vespasian apply <plan>` executes the BuildPlan.

## Layout

| Script | Purpose |
|---|---|
| `publish.sh` | Orchestrator. Pre-checks → publish (CLI or REST) → verify → notifications. |
| `pre-publish-checks.sh` | Credentials, plan-lint, dry-run apply, QA freshness, CVE scan, secret hygiene. |
| `rollback.sh` | Documents the manual Site History restore — **Wix has no revert API**. |
| `notify.sh` | Slack / Discord / generic webhook / email notifications. |
| `lib/common.sh` | Shared logging, release-id, run-id helpers. |
| `lib/config-loader.sh` | YAML config parser (PyYAML preferred, awk fallback). |

## Quick start

1. Make sure `.env` carries your credentials (never commit it):

   ```
   WIX_API_KEY=...        # account-level API key
   WIX_ACCOUNT_ID=...     # account GUID
   WIX_SITE_ID=...        # target site GUID
   WIX_SITE_URL=...       # published URL (optional; enables post-publish verify)
   ```

2. Plan the publish:

   ```bash
   ./scripts/wix-deployment/publish.sh --dry-run
   ```

3. Ship it:

   ```bash
   ./scripts/wix-deployment/publish.sh
   ```

4. If something looks wrong: **there is no automatic rollback on Wix.**

   ```bash
   ./scripts/wix-deployment/rollback.sh          # prints the manual restore path, exits 1
   ```

   Restore the previous version via *manage.wix.com → Site History → View &
   Restore*, review in the editor, and publish again. Alternatively re-apply a
   previous BuildPlan from `.vespasian/plans/` and publish.

## Environment configs (optional)

Named environments (`--env staging`) load `.claude/config/deployment/<env>.yml`
(gitignored; copy from the `*.example.yml` templates). Configs can pin a
`wix_site_id` and define notification channels (`notify_slack_webhook`,
`notify_discord_webhook`, `notify_webhook_url`, `notify_email_to`). Real
`WIX_*` environment variables always win over config values.

## Logs

Every run writes a structured log to
`.claude/logs/deployment/<run-id>.log`. The path is printed at the end of each
publish so it can be attached to PR comments or incident notes.

## Exit codes

All top-level scripts use the same convention:

| Code | Meaning |
|---|---|
| 0 | Success |
| 1 | Operational failure (check log) — for `rollback.sh`: manual action required |
| 2 | Invocation/usage error |
