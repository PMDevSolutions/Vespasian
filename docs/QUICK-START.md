# Quick Start — 5 minutes to your first conversion

From zero to a design applied to a live Wix Studio site.

## Prerequisite checklist

Full details and per-OS installs: [PREREQUISITES.md](PREREQUISITES.md). Auto-check everything with
`./scripts/check-prerequisites.sh`.

- [ ] **Node.js 20+** and **pnpm 9.x** (`corepack enable`)
- [ ] **Git**
- [ ] **Claude Code** (`npm install -g @anthropic-ai/claude-code`)
- [ ] **A Wix account** with a **Studio workspace** ([wix.com/studio](https://www.wix.com/studio))
- [ ] **An account-level Wix API key** ([manage.wix.com/account/api-keys](https://manage.wix.com/account/api-keys))
- [ ] *(optional)* the **Wix CLI**, and a **dedicated Wix-native login** for editor automation
- [ ] *(Figma input only)* **Figma Professional+** with Dev Mode

No Docker. No PHP. No database.

## Step 1 — Clone and install

```bash
git clone https://github.com/PMDevSolutions/Vespasian.git
cd Vespasian
pnpm install
```

## Step 2 — Run the setup wizard

```bash
pnpm run init
```

The wizard writes your `.env` (API key, account ID — see
[CLI-WIZARD.md](CLI-WIZARD.md) for all prompts and flags). `.env` is gitignored; never commit it.

## Step 3 — (optional, once) consent to editor automation

Operations without an official API (pages, theme panels, canvas composition) drive the real Wix
editor in a browser. That plane is **off** until you explicitly enable it:

```bash
node bin/vespasian.mjs login --editor
```

You'll see a consent prompt (editor automation is a Wix ToS gray area — read it), then a headed
browser opens and **you** log in and solve any CAPTCHA/2FA. The session is persisted to
`.vespasian/session/state.json` and reused. Skip this step if you only want API-plane operations
or dry runs.

## Step 4 — Create the target site

```bash
node bin/vespasian.mjs site create "My Site"
# or point at an existing Studio site:
node bin/vespasian.mjs site list
node bin/vespasian.mjs site use <site-id>
```

The provisioner asserts the site uses the **Wix Studio** editor and fails fast otherwise.

## Step 5 — Convert a design

**Figma or Canva (through Claude Code):**

```bash
claude
> Convert this Figma design to Wix: <your-figma-url>
# or
> Convert this Canva export to Wix: ./canva-export/
```

**InDesign (through the CLI):**

```bash
node bin/vespasian.mjs pipeline indesign brochure.idml --plan .vespasian/plans/brochure.json
node bin/vespasian.mjs apply .vespasian/plans/brochure.json
node bin/vespasian.mjs publish
```

Not ready to touch a real site? Rehearse everything without credentials:

```bash
node bin/vespasian.mjs apply .vespasian/plans/brochure.json --dry-run
```

## Verify it worked

```bash
node bin/vespasian.mjs qa
```

QA fetches the published URL and screenshots the site at representative Studio-breakpoint widths
(1280/900/375); pass `--expect <file>` to also assert the theme tokens via computed
`--wst-*`/`--vsp-*` CSS variables. The **FidelityReport** listing every translation loss is written
by `vespasian apply` — read it: honest degradation reporting is the contract, not pixel-perfection
([why](wix/API-COVERAGE.md#where-wix-doesnt-map)). For pixel-diffing the screenshots against the
design, use `node scripts/visual-diff.js` or the visual-qa agent.

## Troubleshooting

| Symptom | Fix |
|---|---|
| `401/403` from Wix APIs | Wrong or under-permissioned API key; check `.env` and the key's permission sets. [TROUBLESHOOTING.md](TROUBLESHOOTING.md) |
| `429` responses | Rate limited — the client backs off 60s automatically; don't tighten retry loops |
| Editor steps stall at a login page | Session expired — re-run `node bin/vespasian.mjs login --editor` (designed pause, not a bug) |
| "editorType is not WIX_STUDIO" | The site/template is classic or Harmony — create from a confirmed-Studio template. [TROUBLESHOOTING.md](TROUBLESHOOTING.md) |
| Figma tokens not extracting | Figma MCP not connected — [MCP-TROUBLESHOOTING.md](MCP-TROUBLESHOOTING.md) |
| Anything pipeline-specific | [COMMON-FAILURES-FIXES.md](COMMON-FAILURES-FIXES.md) |

## Next steps

- **Designers:** export guides — [Figma](figma-to-wix/README.md) · [Canva](canva-to-wix/EXPORT-GUIDE.md) · [InDesign](pipelines/indesign.md); or skip the terminal entirely with the [desktop GUI](GUI.md)
- **Developers:** [docs/wix/ARCHITECTURE.md](wix/ARCHITECTURE.md) (the output layer) · [API-COVERAGE.md](wix/API-COVERAGE.md) (channel routing) · [CONTRIBUTING.md](../CONTRIBUTING.md) (dry-run development)
- **Site owners:** [editor-automation.md](wix/editor-automation.md) — what drives your account, and the consent model, before you enable it
