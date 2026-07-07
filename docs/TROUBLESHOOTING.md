# Troubleshooting

General troubleshooting for Vespasian. Pipeline-specific failure modes (extraction, planning,
apply) have their own catalog: [COMMON-FAILURES-FIXES.md](COMMON-FAILURES-FIXES.md). MCP problems:
[MCP-TROUBLESHOOTING.md](MCP-TROUBLESHOOTING.md).

## Quick reference

| Symptom | Likely cause | Fix |
|---|---|---|
| `401`/`403` from `www.wixapis.com` | Missing/wrong API key, or key lacks a permission set | [API authentication](#api-authentication) |
| `428` on publish | Site has no structure yet | Apply a plan before publishing |
| `429` responses | Rate limited (limits unpublished) | Wait — the client backs off 60s automatically |
| Editor run stops at a Wix login page | Session expired/invalidated | Re-run `vespasian login --editor` — a designed pause |
| `editorType is not WIX_STUDIO` | Template produced a classic/Harmony site | [Editor type](#editor-type) |
| Media referenced before it renders | File-ready poll skipped/failed | Re-apply; media steps must poll before placement |
| `SITE_QUOTA_EXCEEDED` | Free-plan media/data quota | Trim assets (`scripts/assets/optimize-images.sh`) or upgrade the plan |
| Editor flow can't find a panel | Selector drift (Wix ships daily) | The driver re-probes; persistent failures escalate to agent-visual — check the run log screenshot in `.vespasian/` |
| Everything fails instantly with no network | `VESPASIAN_DRY_RUN=1` left set | `unset VESPASIAN_DRY_RUN` |

Diagnose the environment in one shot:

```bash
./scripts/check-prerequisites.sh
./scripts/wix-environment-manager/check-environment.sh   # env vars, API reachability, session freshness
```

## API authentication

Symptoms: `401 UNAUTHENTICATED`, `403 PERMISSION_DENIED`.

1. **Key present?** `WIX_API_KEY` and `WIX_ACCOUNT_ID` must be set in `.env` (the wizard writes
   them: `pnpm run init`).
2. **Right header pairing?** Every call sends `Authorization: <key>` plus **exactly one** of
   `wix-account-id` (account-level: create/list/duplicate) or `wix-site-id` (site-level: media,
   data, embeds, publish). Sending both, or the wrong one, fails.
3. **Permission sets.** The key needs the sets listed in
   [PREREQUISITES.md](PREREQUISITES.md#6-an-account-level-wix-api-key). Recreate the key with more
   sets if a specific API family 403s.
4. **Ownership.** Site-level calls only work with a key from the **site owner's** account — a
   co-owner's key will 403 on someone else's site.
5. **Key revoked/rotated?** Check [manage.wix.com/account/api-keys](https://manage.wix.com/account/api-keys).

## Rate limits (429)

Wix does not publish rate limits. The REST client waits ~60 seconds on any `429` and retries;
`vespasian apply` checkpoints mean a rate-limited run can always be resumed
(`--resume-from <phase>`). Do not wrap Vespasian in tight external retry loops, and stagger
parallel runs against the same account.

## Editor session expiry

The editor plane authenticates with a persisted browser session
(`.vespasian/session/state.json`). Wix invalidates sessions periodically — **this is expected**:

```bash
node bin/vespasian.mjs login --editor
```

opens a headed browser; you log in (and solve any CAPTCHA/2FA) once, and the refreshed session is
persisted. Vespasian never attempts to bypass CAPTCHA or 2FA. If re-login is prompted very
frequently: make sure runs reuse the same `WIX_EDITOR_STORAGE_STATE` path and keep
`WIX_EDITOR_HEADLESS=false` (headless raises challenge risk). There is no unattended re-auth in
v0.1 (`WIX_EDITOR_TOTP_SECRET` is reserved) — expiry always pauses for a human login.

## Editor type

Vespasian requires **Wix Studio** sites — classic Editor and Harmony lack custom CSS, breakpoints,
and section grids ([why](wix/ARCHITECTURE.md#product-decision-wix-studio-first)). Because it is
unverified whether every API-created template yields a Studio site, the provisioner asserts
`editorType == WIX_STUDIO` right after creation and fails fast.

- Create sites through `vespasian site create` (which uses the curated confirmed-Studio template
  allowlist), not by hand-picking arbitrary template IDs.
- For an existing site: check its editor at [manage.wix.com](https://manage.wix.com) — if it isn't
  Studio, target a different site. There is no supported conversion.

## Dry-run mode

`VESPASIAN_DRY_RUN=1` (or `vespasian apply --dry-run`) swaps both auth planes for recording
transports: REST calls are logged against fixtures, the CLI channel writes `global.css`/Velo output
to a local staging dir, and the editor driver emits its step list without a browser.

- Use it to rehearse a plan before touching a real site, and to develop with **no Wix account**.
- Recordings land under `.vespasian/` — inspect them to see exactly what a live run would do.
- Gotcha: an exported `VESPASIAN_DRY_RUN=1` in your shell profile makes every "live" run silently
  do nothing. Check with `./scripts/wix-environment-manager/check-environment.sh`.

## Publish issues

- **REST publish** (`vespasian publish`) ships the current editor state. If Git-connected code
  (`global.css`, Velo) was part of the change set, publish through the Wix CLI path instead so the
  repo code is included — the executor picks the right path automatically.
- **Verify by fetching the published URL** (`vespasian qa` does) — never trust a success modal.
- `428 FAILED_PRECONDITION`: the site has no template/structure yet — run `vespasian apply` first.

## Wix CLI / Git integration issues

- Page code files **cannot be created from the IDE** — the page must exist in the editor first.
  The executor sequences editor page-creation before any code push; if you drove things manually
  and hit this, create the page in the editor, then re-push.
- Page code filenames embed internal page IDs — **never rename them**.
- While a site is Git-connected, the online editor's code panel is read-only; publish from the
  repo's default branch to avoid live/repo desync.

## Visual QA issues

- **Blank/ad-laden screenshots on a free plan** — free sites carry Wix ads and a Wix domain;
  diffs against the design will flag them. Use a scratch premium site for fidelity work, or accept
  the recorded deltas.
- **Token assertions fail but the site looks right** — Wix may have regenerated shades; re-apply
  the theme step (`--resume-from editor`) so every slot is set explicitly.
- Breakpoints: QA captures at Studio's 1001+ / 751–1000 / 320–750. Custom breakpoints in your
  design beyond those are compared at the nearest Studio width and noted in the FidelityReport.

## Still stuck?

- Pipeline failure catalog with recovery procedures: [COMMON-FAILURES-FIXES.md](COMMON-FAILURES-FIXES.md)
- End-to-end validation checklist: [E2E-VALIDATION.md](E2E-VALIDATION.md)
- MCP servers (Figma, Playwright): [MCP-TROUBLESHOOTING.md](MCP-TROUBLESHOOTING.md)
- File an issue: [github.com/PMDevSolutions/Vespasian/issues](https://github.com/PMDevSolutions/Vespasian/issues)
