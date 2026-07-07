# Vespasian

**Claude Code-integrated Wix site builder — design in (Figma · Canva · InDesign), live Wix site out.**

Vespasian converts a design — a Figma URL, a Canva HTML/CSS export, or an InDesign document — into a live **Wix Studio** site. It extracts design tokens with full provenance, compiles a serializable **BuildPlan**, and applies it to a real Wix site: official Wix REST APIs first, the Wix CLI/Git integration for custom CSS and code, and Playwright-driven editor automation only where no API exists. Vespasian is a fork of [Flavian](https://github.com/PMDevSolutions/Flavian) (the same pipeline targeting WordPress), sharing its design-ingestion front end unchanged.

```
design in (Figma / Canva / InDesign)
   → parse → IR + content model            (inherited from Flavian, unchanged)
   → map   → design tokens + provenance    (inherited from Flavian, unchanged)
   → translate → ThemePlan + global.css    (packages/wix-driver)
   → plan  → BuildPlan (ordered steps)     (packages/wix-driver)
   → execute → live Wix site               (REST API | Wix CLI | Playwright editor)
   → QA    → screenshots + FidelityReport
```

## How It Works

1. **You provide a design.** A Figma URL (Dev Mode enabled), a Canva HTML export directory, or an InDesign `.idml`/PDF.
2. **Vespasian compiles a BuildPlan.** Design tokens (colors, typography, spacing) and content are extracted and translated into an ordered, resumable list of steps — each tagged `api`, `cli`, `playwright`, or `agent`.
3. **The executor applies it to a real Wix site.** Site provisioning, media upload, CMS data, embeds, and publish go through official APIs. Pages, theme panels, and canvas composition go through the browser editor (with your explicit consent). The result is a published Wix site plus a **FidelityReport** that records every translation loss honestly.

The "output" is not a directory of theme files — it is a **live Wix site**. Local artifacts (build plans, checkpoints, the editor session) live under the gitignored `.vespasian/` state directory.

## Desktop GUI (experimental)

Prefer not to use a terminal? A cross-platform **desktop GUI** wraps the workflow behind five screens: **Prerequisites**, **Setup wizard**, **Wix site**, **Convert design** (Figma/Canva/InDesign), and **Visual QA**. It's a thin orchestration layer over the existing scripts and pipelines. Run it from source with `pnpm gui:dev` (or build an installer with `pnpm gui:package`). See **[docs/GUI.md](docs/GUI.md)**.

## Prerequisites

| Requirement | What for | Install |
|---|---|---|
| **[Claude Code](https://claude.ai/code)** | The conversion engine | `npm install -g @anthropic-ai/claude-code` |
| **[Node.js](https://nodejs.org/) 20+** | CLI, pipelines, Playwright, GUI | [nodejs.org](https://nodejs.org/) |
| **[pnpm](https://pnpm.io/) 9.x** | Package manager (workspace) | `corepack enable` (bundled with Node) |
| **[Git](https://git-scm.com/)** | Version control | [git-scm.com](https://git-scm.com/) |
| **Wix account** (Studio workspace) | The target platform — Vespasian builds Wix **Studio** sites | [wix.com/studio](https://www.wix.com/studio) |
| **Wix account-level API key** | The primary (API) auth plane | [manage.wix.com/account/api-keys](https://manage.wix.com/account/api-keys) |
| **[Wix CLI](https://dev.wix.com/docs/dev-center/build-your-own-apps/developer-tools/cli/get-started)** *(optional)* | `global.css` + Velo code via Git integration | `npm install -g @wix/cli` |
| **Dedicated Wix-native login** *(optional)* | Editor automation plane (`vespasian login --editor`) | Email+password account, not Google SSO |
| **[Figma Professional+](https://www.figma.com/pricing/)** *(Figma input only)* | Dev Mode — design token extraction | [figma.com](https://www.figma.com/) |

No Docker, no PHP, no database. **Auto-check:** `./scripts/check-prerequisites.sh` · **Full details:** [docs/PREREQUISITES.md](docs/PREREQUISITES.md)

## Quick Start

```bash
# 1. Clone and enter
git clone https://github.com/PMDevSolutions/Vespasian.git
cd Vespasian

# 2. Install deps and run the interactive setup wizard (writes .env)
pnpm install
pnpm run init

# 3. (once, optional) consent to and capture an editor session — headed login,
#    you solve the CAPTCHA/2FA yourself
node bin/vespasian.mjs login --editor

# 4. Create (or select) the target Wix Studio site
node bin/vespasian.mjs site create "My Site"

# 5. Hand Claude Code your design
claude
> Convert this Figma design to Wix: <your-figma-url>
```

For the InDesign path, the CLI drives the whole pipeline:

```bash
node bin/vespasian.mjs pipeline indesign brochure.idml --plan .vespasian/plans/brochure.json
node bin/vespasian.mjs apply .vespasian/plans/brochure.json    # add --dry-run to rehearse
node bin/vespasian.mjs publish
node bin/vespasian.mjs qa
```

**Supported inputs (pipelines):**
- **Figma URL** — requires Professional plan (Dev Mode). See [docs/figma-to-wix/README.md](docs/figma-to-wix/README.md).
- **Canva HTML/CSS export directory** — no account tier required. See [docs/canva-to-wix/README.md](docs/canva-to-wix/README.md).
- **InDesign document** — an exported `.idml` (preferred) or PDF. See [docs/pipelines/indesign.md](docs/pipelines/indesign.md).

**More docs:** [docs/QUICK-START.md](docs/QUICK-START.md) · [docs/wix/ARCHITECTURE.md](docs/wix/ARCHITECTURE.md) · [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md)

> **Versioning:** the source of truth is git tags + `.release-please-manifest.json`; release-please mirrors that version into `package.json` — don't bump it by hand. See [Versioning](CONTRIBUTING.md#versioning) in CONTRIBUTING.md and [docs/RELEASING.md](docs/RELEASING.md).

## Operation channels: API vs browser automation

Wix has no API for everything a design pipeline needs, so every operation is routed through the best available channel. The full per-operation matrix — endpoint, rationale, and fallback for each — is in **[docs/wix/API-COVERAGE.md](docs/wix/API-COVERAGE.md)**. Summary:

| Channel | Operations |
|---|---|
| **API** (REST, `www.wixapis.com`) | create/clone/list sites, resolve editor URLs + editor type, media upload (+ file-ready polling), CMS collections & items, custom embeds, site properties, robots/llms.txt, **publish** |
| **CLI** (Wix Git integration + `wix` CLI) | `src/styles/global.css` (custom CSS = spacing tokens, typography overflow), Velo page/backend code |
| **Playwright** (editor session) | create/rename/reorder pages, theme color palette, text theme, font upload, per-page SEO, save |
| **Agent-visual** (Playwright MCP, screenshot-grounded) | canvas composition: sections, text, images, buttons — driven by the `wix-site-builder` agent |
| **Hybrid** | image placement (API upload → editor picker), spacing (`global.css` vars + editor defaults) |

## Honest limitations

Read these before you commit to the tool — they are platform constraints, not bugs:

- **No API for page structure or layout composition.** Creating pages and adding sections/elements is editor-UI-only on Wix. Vespasian minimizes this via a template-first strategy, then drives the editor with Playwright.
- **No theme write API.** Color palettes and text themes are set through editor panels only. Spacing tokens have no home in Wix at all — they survive as `--vsp-*` CSS custom properties in Studio's `global.css`.
- **Editor automation is a Wix ToS gray area** (ToU §2.2; automating *your own* account is unaddressed). It is **off by default** and requires an explicit consent step (`vespasian login --editor`). It runs headed, at human pace, on your own credentials, and never uses CAPTCHA-solving services. Session expiry is a designed human-in-the-loop pause.
- **Editor automation is brittle by nature.** Wix ships dozens of releases a day; selectors are perishable. Vespasian probes the DOM at runtime and escalates canvas work to a screenshot-grounded agent.
- **Pixel-perfect is not the contract.** Wix cannot express everything a design system produces (9-slot type ramp, palette slot limits, no spacing scale). Every translation loss is recorded in the **FidelityReport** instead of being silently degraded.
- **Wix Studio only (v1).** Classic Editor and the Harmony editor lack custom CSS/breakpoints and are detected and refused.
- **Dry-run everywhere.** `VESPASIAN_DRY_RUN=1` (or `vespasian apply --dry-run`) turns both auth planes into no-op recorders — CI runs the whole pipeline with zero Wix credentials.

## Claude Code Integration

- **Lean plugin setup**: see [`.claude/PLUGINS-REFERENCE.md`](.claude/PLUGINS-REFERENCE.md)
- **Custom agents**: 54 specialized agents — full catalog in [`.claude/CUSTOM-AGENTS-GUIDE.md`](.claude/CUSTOM-AGENTS-GUIDE.md). Wix-specific highlights:

```
✅ figma-wix-converter      # Figma → Wix BuildPlan conversion
✅ canva-wix-converter      # Canva export → Wix BuildPlan conversion
✅ indesign-to-wix          # InDesign (.idml/PDF) → Wix BuildPlan conversion
✅ wix-site-builder         # Executes BuildPlans: API ops via wix-driver, editor ops via Playwright MCP
✅ wix-structure-validator  # Validates BuildPlan JSON structure
✅ wix-token-auditor        # Audits token usage in translate output
✅ wix-environment-manager  # Env vars, API reachability, session freshness
✅ visual-qa-agent          # Live Wix site vs source design comparison
✅ security-audit-agent     # Dependency/CVE scanning
```

- **Custom skills**: 10 Wix-focused workflows — catalog in [`.claude/skills/README.md`](.claude/skills/README.md):

```
✅ figma-to-wix-autonomous-workflow   # Orchestrator for Figma → Wix conversion
✅ canva-to-wix-autonomous-workflow   # Orchestrator for Canva → Wix conversion
✅ indesign-conversion                # InDesign (.idml/PDF) → Wix conversion
✅ wix-site-development               # BuildPlan, executor phases, site structure
✅ wix-media-first-architecture       # Upload media via API first, reference from editor
✅ wix-playwright-driver              # Driving the Wix editor via Playwright/Playwright MCP
✅ visual-qa-verification             # Post-publish screenshot + Lighthouse QA
✅ wix-cli-workflows                  # Wix CLI + REST recipes
✅ vespasian-testing-workflows        # node --test / bats test workflows
✅ vespasian-hook-integration         # Claude Code agent hooks for Vespasian
```

### Documentation

- **`CLAUDE.md`** — development guidance and quick reference for Claude Code
- **`docs/QUICK-START.md`** — 5-minute getting started guide
- **`docs/PREREQUISITES.md`** — complete requirements checklist
- **`docs/wix/`** — the Wix output layer: [ARCHITECTURE](docs/wix/ARCHITECTURE.md) · [API-COVERAGE](docs/wix/API-COVERAGE.md) · [editor-automation](docs/wix/editor-automation.md) · [theming](docs/wix/theming.md)
- **`docs/figma-to-wix/`** · **`docs/canva-to-wix/`** · **`docs/pipelines/indesign.md`** — the three input pipelines
- **`docs/CLI-WIZARD.md`** — the `vespasian` CLI and setup wizard
- **`docs/GUI.md`** — the desktop GUI
- **`docs/TROUBLESHOOTING.md`** · **`docs/COMMON-FAILURES-FIXES.md`** · **`docs/MCP-TROUBLESHOOTING.md`** · **`docs/E2E-VALIDATION.md`** — when things go wrong

## Resources

- [Wix REST API reference](https://dev.wix.com/docs/rest)
- [Wix Studio](https://www.wix.com/studio)
- [Wix CLI & Git integration](https://dev.wix.com/docs/dev-center/build-your-own-apps/developer-tools/cli/get-started)
- [dev.wix.com LLM-friendly docs index](https://dev.wix.com/docs/llms.txt)

## Related Projects

| Project | Description |
|---------|-------------|
| [AI SEO Copilot (Chrome)](https://github.com/die-Manufaktur/AISEOC-Chrome-Extension) | Free Chrome extension for SEO analysis. Works on any site including Wix. Use it to verify the SEO output of sites built with Vespasian. [Install from Chrome Web Store](https://chromewebstore.google.com/detail/ai-seo-copilot/anhpobnkbmgjhcgbohkddjjpcbbdllhl) |
| [AI SEO Copilot (Webflow)](https://github.com/die-Manufaktur/AI-SEO-Copilot-for-Webflow) | The original Webflow app with ~20,000 installs |
| [Aurelius](https://github.com/PMDevSolutions/Aurelius) | Claude Code-integrated React app framework, Figma-to-React |
| [Claudius](https://github.com/PMDevSolutions/Claudius) | Embeddable AI chat widget, Claude + React + Cloudflare Workers |
| [Flavian](https://github.com/PMDevSolutions/Flavian) | Claude Code-integrated WordPress development template — Vespasian's sibling and ancestor |
| [Nerva](https://github.com/PMDevSolutions/Nerva) | Claude Code-integrated API/backend framework: Hono, Cloudflare Workers, Drizzle |

## License

This project is licensed under the [MIT License](LICENSE).
