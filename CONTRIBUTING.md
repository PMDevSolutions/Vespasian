# Contributing to Vespasian

Thank you for your interest in contributing! 🎉
We welcome contributions of all kinds — bug fixes, features, and documentation improvements.

---

## Getting Started

Before you begin, please review the following resources:

- [PREREQUISITES.md](docs/PREREQUISITES.md) — Required tools and setup
- [QUICK-START.md](docs/QUICK-START.md) — Quick setup guide
- [docs/wix/ARCHITECTURE.md](docs/wix/ARCHITECTURE.md) — The pinned Wix output-layer architecture
- [.env.example](.env.example) — Environment configuration template
- [CLAUDE.md](CLAUDE.md) — Project-specific development guidelines

### Clone the repository

```
git clone https://github.com/PMDevSolutions/Vespasian.git
cd Vespasian
pnpm install                       # pnpm 9.x, Node ≥ 20
git submodule update --init        # bats shell-test libraries
```

## Development Workflow

1. **Fork** the repository
2. **Create a branch** for your feature or fix
    - feat/my-feature
    - fix/bug-description
    - docs/update-docs
3. **Make your changes** following the coding standards below
4. **Test** your changes — run the affected suites and a dry-run apply (see [Testing](#testing))
5. **Commit** with a [Conventional Commits](#commit-message-format) message (e.g., `feat:`, `fix:`, `docs:`)
6. **Push** your branch and open a Pull Request against `main`

## Commit Message Format

This repository uses [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/)
to drive automated versioning and changelog generation. Every commit that lands
on `main` (including squash-merge subjects) must follow:

```
<type>(<optional scope>): <short summary>

<optional body>

<optional footer(s)>
```

### Allowed types

| Type       | Use for                                              | Triggers release? |
| ---------- | ---------------------------------------------------- | ----------------- |
| `feat`     | A new feature                                        | Minor bump        |
| `fix`      | A bug fix                                            | Patch bump        |
| `perf`     | Performance improvement                              | Patch bump        |
| `docs`     | Documentation only changes                           | No                |
| `refactor` | Code change that isn't a feature or fix              | No                |
| `test`     | Adding or fixing tests                               | No                |
| `build`    | Build system / external dependency changes           | No                |
| `ci`       | CI configuration changes                             | No                |
| `chore`    | Other changes that don't modify src or test files    | No                |
| `style`    | Formatting, whitespace, etc.                         | No                |
| `revert`   | Reverts a previous commit                            | No                |

### Breaking changes

Add `!` after the type/scope **or** include a `BREAKING CHANGE:` footer to
trigger a major version bump:

```
feat(plan)!: change the BuildPlan step schema

BREAKING CHANGE: BuildPlans compiled before this version must be regenerated with `vespasian plan`.
```

### Examples

```
feat(figma-pipeline): add multi-page export support
fix(wix-driver): back off on 429 before retrying media upload
docs: link RELEASING.md from README
chore(deps): bump dev dependencies
```

PR commits are linted in CI by
[commitlint](https://commitlint.js.org/) using the `config-conventional` ruleset.
PRs with invalid commit messages will fail the `commitlint` check.

See [docs/RELEASING.md](docs/RELEASING.md) for how these commits become tagged
releases.

## Versioning

Do not hand-edit the `version` field in `package.json` — release-please keeps
it in sync automatically. The source of truth for the released version is
[`.release-please-manifest.json`](.release-please-manifest.json) together with the
latest `vX.Y.Z` git tag.

Versioning is automated by [release-please](https://github.com/googleapis/release-please).
The [Conventional Commit](#commit-message-format) types above drive the semver
bump; release-please opens a **Release PR** that updates the manifest and
`CHANGELOG.md`, and merging that PR creates the `vX.Y.Z` tag and GitHub Release.
The project uses release-please's `simple` release type, so the bump is recorded
in `.release-please-manifest.json` and then mirrored into the `version` field of
both `package.json` and `packages/gui/package.json` via the `extra-files` entry
in [`release-please-config.json`](release-please-config.json).

See [docs/RELEASING.md](docs/RELEASING.md) for the full flow, the version-bump
rules, and overrides (e.g. the `Release-As:` footer).

## Coding Standards

- **Node ≥ 20, ESM** (`"type": "module"`), pnpm 9.x workspace
- **No new runtime dependencies** — the Wix REST client is plain `fetch`; prefer the existing deps (zod, playwright, pixelmatch, pngjs, fflate, fast-xml-parser)
- **Validate at the boundaries** — external input (IR, BuildPlans, API responses) goes through zod schemas
- **Every operation honors `VESPASIAN_DRY_RUN=1`** — new transports and scripts must support the dry-run recorders; no test may make a real network call
- **Never log or commit credentials** — `.env`, `.vespasian/` (session state, checkpoints) are gitignored by design
- **API before editor automation** — if an official Wix API covers an operation, use it; editor automation is the consent-gated fallback (see [docs/wix/API-COVERAGE.md](docs/wix/API-COVERAGE.md))
- Tests: `node --test` (`*.test.mjs`) for JS, [bats](https://github.com/bats-core/bats-core) for shell

> **Windows users:** the repo pins LF line endings via
> [`.gitattributes`](.gitattributes) so shell scripts and Node tooling behave the
> same on all platforms. Make sure your editor and Git (`core.autocrlf`) don't
> reintroduce CRLF.

## Testing

### Without a Wix account (the default — CI works this way too)

You do **not** need a Wix account, API key, or browser session to develop most
of Vespasian. Dry-run mode swaps both auth planes for recording transports:

```bash
pnpm test:pipeline                 # design-ingestion pipeline suite
pnpm test:init                     # setup-wizard suite
git submodule update --init        # once: fetch the vendored bats libraries
./tests/libs/bats-core/bin/bats tests/unit/   # shell tests

# End-to-end rehearsal against bundled fixtures — zero credentials
# (this is what the `site-validation` CI gate runs):
pnpm test:canva-e2e

# Rehearse or validate a plan you compiled yourself:
VESPASIAN_DRY_RUN=1 node bin/vespasian.mjs apply .vespasian/plans/<slug>/plan.json --dry-run
./scripts/validate-site-e2e.sh .vespasian/plans/<slug>/plan.json   # lint + dry-run an existing
                                   # plan, plus optional live checks (needs WIX_SITE_URL or --url;
                                   # --skip-live stays offline)
```

The `site-validation` CI workflow runs `pnpm test:canva-e2e` — a fixture
compile + dry-run apply — on every PR. That is the merge gate, and it runs
with no secrets.

### With a Wix account (live testing etiquette)

If you are working on the REST client, the Wix CLI channel, or editor flows,
you'll eventually need a live run. Please:

- **Use a dedicated development account and scratch sites** — never test
  against a production site (yours or anyone else's). New sites are free.
- **Use a Wix-native email+password login** (not Google SSO) for the editor
  plane, and capture the session once with `vespasian login --editor`. The
  consent prompt is there for a reason: editor automation is a Wix ToU gray
  area — keep it headed, at human pace (`WIX_EDITOR_SLOWMO_MS`), on your own
  account only.
- **Expect session expiry** — it is a designed human-in-the-loop pause;
  re-run `vespasian login --editor`, don't engineer around it.
- **Be gentle with the APIs** — rate limits are unpublished; the client backs
  off 60s on 429. Don't loop tight retries in test scripts.
- **Never commit anything from `.vespasian/`** or screenshots that contain
  account details.

### Visual regression & Lighthouse

The visual regression suite screenshots a published site at the Studio
breakpoints and diffs against committed baselines in `tests/visual/baselines/`.
It targets the published Wix URL configured via env/secrets and **skips
gracefully when unset** — as does the Lighthouse CI workflow. If you
intentionally changed the output, regenerate baselines and commit them with
your change:

```bash
bash scripts/visual-update-baselines.sh
git add tests/visual/baselines
git commit -m "test(visual): update baselines for <feature>"
```

## Pull Requests

To help your PR get reviewed and merged quickly:

- Keep PRs small and focused
- Clearly explain what you changed and why
- Reference related issues (e.g., `Closes #47`)
- Ensure your branch is up to date with `main`

### Review Process

- Maintainers will review your PR
- Feedback may be provided — please address it promptly

## Good First Issues

If you're new to the project, check out issues labeled:

- `good first issue`

These are great starting points to get familiar with the codebase.

## Reporting Issues

- Use GitHub Issues for bugs and feature requests
- For security vulnerabilities, see [SECURITY.md](SECURITY.md)
