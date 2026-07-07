# Custom Agents Reference Guide

**Last Updated:** 2026-07-06
**Total Custom Agents:** 54
**Location:** `.claude/agents/`

This guide categorizes all custom agents by relevance to Vespasian's design-to-Wix pipeline.

---

## Wix Site Building - Highly Relevant ✅

These agents directly support the design-in → live-Wix-site-out pipeline:

### **wix-site-builder** (NEW)
- **Purpose:** Executes BuildPlans against a real Wix site
- **Use for:** Applying compiled plans — API steps via `packages/wix-driver`, editor steps by driving the Wix Studio editor through the Playwright MCP (screenshot-grounded), phase checkpoints and resume, CAPTCHA/2FA escalation
- **Wix relevance:** Critical - the execution engine of the entire pipeline
- **Backed by:** `packages/wix-driver/` and `vespasian apply`

### **figma-wix-converter**
- **Purpose:** Autonomous Figma-to-Wix conversion
- **Use for:** Extracting design systems and page structure from Figma via the Figma MCP, translating tokens into a ThemePlan + `global.css`, compiling a BuildPlan
- **Wix relevance:** Critical - primary engine of the Figma pipeline
- **Backed by:** `scripts/figma-wix/` and the `figma-to-wix-autonomous-workflow` skill

### **canva-wix-converter**
- **Purpose:** Convert Canva HTML/CSS exports into Wix sites
- **Use for:** Parsing design tokens from Canva CSS, mapping exported HTML to Wix Studio composition, compiling a BuildPlan
- **Wix relevance:** Critical - alternate design-source entry point
- **Backed by:** `scripts/canva-wix/` and the `canva-to-wix-autonomous-workflow` skill

### **indesign-to-wix**
- **Purpose:** Convert an Adobe InDesign document (`.idml` or PDF) into a Wix site
- **Use for:** Orchestrating the `@vespasian/pipeline` InDesign stages (parse → map tokens → plan), reviewing the pipeline report, and proposing concrete follow-ups (unmapped frames, font fallbacks, alt text). Non-destructive — dry-runs first, targets dev sites
- **Wix relevance:** Critical - turns print/layout sources into live sites
- **Backed by:** `packages/pipeline/`, `bin/vespasian.mjs`, and `scripts/indesign-wix/`
- **Pairs with:** the `indesign-conversion` skill

### **wix-structure-validator**
- **Purpose:** BuildPlan and published-page structure validation
- **Use for:** Validating plan JSON shape, phase ordering, token references, heading hierarchy, and published-DOM structure vs the plan
- **Wix relevance:** Critical - the gate between compilation and execution
- **Backed by:** `scripts/wix-structure-validator/validate-structure.sh`

### **wix-token-auditor**
- **Purpose:** Design token compliance auditing
- **Use for:** Detecting stray hex/px values, validating `--vsp-*` references, palette-slot compression maps, ramp overflow (`.vsp-*`) tracking for the FidelityReport
- **Wix relevance:** High - enforces design system discipline across ThemePlan + global.css
- **Backed by:** `scripts/design-token-auditor/audit-tokens.sh`

### **wix-environment-manager**
- **Purpose:** Manages the Vespasian-to-Wix connection
- **Use for:** WIX_* env verification, API key/reachability checks, target-site selection (`vespasian site create|use|list`), editor-session freshness, consent state, dry-run mode
- **Wix relevance:** Critical - eliminates connection friction (no Docker, no local server)
- **Backed by:** `scripts/wix-environment-manager/check-environment.sh`

### **visual-qa-agent**
- **Purpose:** Visual regression testing, design comparison, and cross-browser verification
- **Use for:** Comparing the LIVE Wix site against Figma/Canva/InDesign source designs at the three Studio breakpoints across Chromium, Firefox, and WebKit; feeding the FidelityReport
- **Wix relevance:** Critical - the QA phase of every apply; its Playwright toolset doubles as the editor-automation verification loop
- **Requires:** Playwright MCP (`./scripts/setup-playwright.sh`) + Figma MCP

### **asset-cataloger**
- **Purpose:** Image/asset semantic mapping and validation
- **Use for:** Viewing hash-named staged images, creating semantic mappings, recording Wix Media Manager IDs after upload, validating correct image usage in plan steps
- **Wix relevance:** Critical - prevents wrong-image-assignment errors; anchors media-first architecture

### **accessibility-auditor**
- **Purpose:** WCAG 2.1 AA compliance auditing
- **Use for:** Color contrast (from ThemePlan slots), heading hierarchy, ARIA labels, alt text, keyboard navigation, Lighthouse audits against the published site
- **Wix relevance:** Critical - published sites must be accessible

### **content-seeder**
- **Purpose:** Wix CMS content generation
- **Use for:** Creating CMS collections and items via the Data API (dry-run aware), populating Repeater/dynamic-page bindings, post-seed verification
- **Wix relevance:** High - fully populated sites for testing and demos

### **security-audit-agent**
- **Purpose:** Dependency vulnerability scanning and security auditing
- **Use for:** pnpm/npm audits across the workspace, Wix credential-hygiene review (API keys, session state), Velo/HTTP-function code review, report generation, auto-creating issues for critical CVEs
- **Wix relevance:** Critical - account-level API keys and editor sessions are high-value targets

### **seo-schema-agent**
- **Purpose:** SEO and structured data auditing
- **Use for:** Heading hierarchy, meta/OG tags (per-page SEO editor steps), Schema.org via custom embeds, robots/llms.txt via the seoFiles API, image SEO
- **Wix relevance:** High - routes every fix through the channel Wix actually offers

### **deployment-agent**
- **Purpose:** Safe publishing of Wix sites
- **Use for:** Pre-publish validation gate, `vespasian publish` orchestration, structured logs, notifications, honest rollback handling (re-apply last-known-good plan; Wix has no revert API)
- **Wix relevance:** Critical - production-grade release discipline
- **Backed by:** `scripts/wix-deployment/` and `.claude/config/deployment/`

### **wix-stores-agent**
- **Purpose:** Wix Stores e-commerce setup and catalog work
- **Use for:** Installing the Wix Stores app, importing products via the Stores/Catalog APIs, verifying shop/cart/checkout pages, shipping/tax/payment configuration, token-compliant store styling
- **Wix relevance:** Critical - turns a built site into a working store

### **wix-app-developer**
- **Purpose:** Custom code on Wix sites and reusable Wix apps
- **Use for:** Velo page/backend code, wix-data hooks, HTTP functions, Secrets Manager discipline, Wix CLI apps / Blocks widgets for cross-site reuse
- **Wix relevance:** High - everything beyond stock elements and installed apps

### **wix-headless-developer**
- **Purpose:** Wix Headless setup and decoupled-frontend integration
- **Use for:** OAuth client setup, Wix SDK wiring in Next.js/Astro frontends, CMS/commerce data fetching, debugging the frontend↔Wix seams
- **Wix relevance:** High - the decoupled alternative to Wix-rendered sites

### **frontend-developer**
- **Purpose:** Wix frontend implementation
- **Use for:** Composing sections/elements as BuildPlan steps, Studio grid layouts across the three breakpoints, `global.css` extensions, Velo frontend code
- **Wix relevance:** High - turns designs into executable composition

### **ui-designer**
- **Purpose:** Design systems and section composition for Wix
- **Use for:** Shaping the token registry → ThemePlan (palette slots, 9-slot ramp, `--vsp-space-*` scale), section recipes, Figma-to-Wix translation decisions
- **Wix relevance:** High - designs within what Wix can actually express

### **test-writer-fixer**
- **Purpose:** Write tests, run them, fix failures
- **Use for:** `node --test` suites for `packages/pipeline` and `packages/wix-driver`, bats for shell scripts, Playwright checks — all dry-run, no real network calls
- **Wix relevance:** High - pipeline quality depends on test coverage

### **performance-benchmarker**
- **Purpose:** Performance testing and profiling
- **Use for:** Lighthouse against the published site, image optimization before Media upload, embed/Velo/global.css cost analysis
- **Wix relevance:** Critical - performance of the published site is a key concern

### **migration-specialist**
- **Purpose:** Safe incremental migrations onto and within Wix
- **Use for:** WordPress/other-CMS → Wix migrations, Classic Editor → Studio rebuilds, content imports into Wix CMS, Velo/Wix API updates
- **Wix relevance:** High - migrations are a primary adoption path

### **backend-architect**
- **Purpose:** Backend architecture and APIs
- **Use for:** Velo backend design, HTTP functions, CMS collection modeling, external integrations
- **Wix relevance:** Moderate-High - adapted with Wix code surfaces

### **ux-researcher**
- **Purpose:** User experience research and testing
- **Use for:** Site usability testing, conversion-flow optimization
- **Wix relevance:** High - built sites must be user-friendly

---

## Wix Development - Moderately Relevant ⚠️

These agents can be useful but aren't Wix-specific:

### **api-tester**
- **Purpose:** API testing and validation
- **Use for:** Testing Wix REST API integrations, HTTP functions, and webhook endpoints
- **Wix relevance:** Moderate - useful for custom integrations and headless builds

### **test-results-analyzer**
- **Purpose:** Analyze test data and trends
- **Use for:** CI/CD test result analysis for pipeline releases
- **Wix relevance:** Moderate - complements test-writer-fixer

### **docusaurus-expert**
- **Purpose:** Documentation site creation
- **Use for:** Pipeline documentation, developer guides
- **Wix relevance:** Moderate - if documenting complex setups

### **workflow-optimizer**
- **Purpose:** Development process improvement
- **Use for:** Optimizing design-to-site workflows
- **Wix relevance:** Moderate - applicable to any development

### **analytics-reporter**
- **Purpose:** Metrics and reporting
- **Use for:** Site performance metrics, usage analytics
- **Wix relevance:** Moderate - useful for site analytics

---

## Generic/Cross-Domain Agents (27 total)

These agents are domain-agnostic and useful across all project types.

### Meta/Ops (7)
| Agent | Purpose |
|-------|---------|
| agent-expert | Creating and designing specialized Claude Code agents |
| command-expert | Creating Claude Code slash commands |
| studio-coach | Development coaching and mentoring |
| studio-producer | Project production and coordination |
| project-shipper | Getting projects to release |
| sprint-prioritizer | Sprint planning and prioritization |
| experiment-tracker | Tracking A/B tests and experiments |

### Business (5)
| Agent | Purpose |
|-------|---------|
| brand-guardian | Brand consistency and guidelines |
| finance-tracker | Financial tracking and budgeting |
| legal-compliance-checker | Legal and compliance review |
| support-responder | Customer support responses |
| feedback-synthesizer | Synthesizing user feedback |

### Marketing/Social (8)
| Agent | Purpose |
|-------|---------|
| content-creator | Content creation and copywriting |
| growth-hacker | Growth strategies and experiments |
| instagram-curator | Instagram content strategy |
| reddit-community-builder | Reddit community engagement |
| tiktok-strategist | TikTok content strategy |
| twitter-engager | Twitter/X engagement |
| visual-storyteller | Visual content and storytelling |
| trend-researcher | Trend research and analysis |

### Engineering (4)
| Agent | Purpose |
|-------|---------|
| devops-automator | CI/CD, infrastructure automation |
| infrastructure-maintainer | Server and infrastructure maintenance |
| tool-evaluator | Evaluating development tools |
| joker | Tech humor and team morale |

### Adapted for Wix (3)
| Agent | Purpose | Adaptation |
|-------|---------|------------|
| ai-engineer | AI/ML feature integration | Generic (no changes needed) |
| backend-architect | Backend architecture and APIs | Added Velo, HTTP functions, wix-data, Secrets Manager |
| migration-specialist | Platform migrations | Rewritten for CMS→Wix and Classic→Studio migrations |

---

## Using Custom Agents

Custom agents are invoked through Claude Code's Task tool:

```
User: "Can you help optimize the site's performance?"
Claude: [Uses Task tool with subagent_type="performance-benchmarker"]
```

Agents are automatically selected based on task context, or you can explicitly request:

```
User: "Use the wix-site-builder agent to apply this plan"
```

---

## How Agents Work with Vespasian Skills

This template includes 10 custom skills that complement the agents.

### Skills vs Agents

| Type | Purpose | When Triggered | Example |
|------|---------|----------------|---------|
| **Skills** | Systematic workflows and best practices | Keyword detection in conversation | "convert this Figma design" triggers `figma-to-wix-autonomous-workflow` |
| **Agents** | Specialized task execution | Task tool invocation | wix-site-builder executes a BuildPlan |

### Agent-Skill Integration

**wix-site-builder agent** + skills:
- Works with `wix-playwright-driver` for editor-automation patterns (session, consent, probe, recovery)
- Works with `wix-media-first-architecture` for asset handling (upload via API first, reference from the editor)
- Works with `wix-cli-workflows` for Wix CLI + REST recipes

**Converter agents** (figma/canva/indesign) + skills:
- Execute their paired pipeline skills' autonomous phases
- Work with `wix-site-development` for composition reference
- Work with `visual-qa-verification` for post-apply checks

**test-writer-fixer agent** + skills:
- Works with `vespasian-testing-workflows` for `node --test`/bats/dry-run setup
- Works with `vespasian-hook-integration` for agent-hook wiring

### Complete Vespasian Development Stack

```
Vespasian Skills (10)
    ↓ Provide workflows and best practices
Agents (54)
    ↓ Execute specialized tasks
Plugins (6)
    ↓ Provide tooling and memory
Automation Scripts
    ↓ Run structure/token/security checks
```

**Skills Documentation:** See `.claude/skills/README.md` for complete catalog

---

## Current Architecture Status

**Plugins:** ✅ Already optimized (5 user + 1 local)
**Custom Agents:** 54 total (27 Wix-focused + 27 generic cross-domain)

---

## Quick Reference: When to Use Which Agent

| Task | Agent | Alternative |
|------|-------|-------------|
| **Apply a BuildPlan to Wix** | **wix-site-builder** | - |
| **Convert a Figma design** | **figma-wix-converter** | ui-designer (design decisions first) |
| **Convert a Canva export** | **canva-wix-converter** | - |
| **Convert an InDesign doc** | **indesign-to-wix** | - |
| **Validate a plan / structure** | **wix-structure-validator** | wix-token-auditor |
| **Token compliance** | **wix-token-auditor** | wix-structure-validator |
| **Check env / auth / session** | **wix-environment-manager** | - |
| **Compare live site vs design** | **visual-qa-agent** | - |
| **Identify/map images** | **asset-cataloger** | - |
| **Seed CMS content** | **content-seeder** | wix-site-builder (Data phase) |
| **Accessibility audit** | **accessibility-auditor** | - |
| **SEO audit** | **seo-schema-agent** | - |
| **Publish / release** | **deployment-agent** | - |
| **Set up a store** | **wix-stores-agent** | - |
| **Custom code (Velo/apps)** | **wix-app-developer** | frontend-developer (page composition) |
| **Headless frontend** | **wix-headless-developer** | backend-architect (integration design) |
| Build a section/composition | frontend-developer | ui-designer (design first) |
| Site performance | performance-benchmarker | analytics-reporter (metrics) |
| Write pipeline tests | test-writer-fixer | - |
| Design the token system | ui-designer | ux-researcher (research first) |
| Test APIs/webhooks | api-tester | - |
| Security/dependency audit | security-audit-agent | legal-compliance-checker |
| Migrate a site to Wix | migration-specialist | - |
| Create an agent | agent-expert | command-expert (for commands) |
| Backend API design | backend-architect | wix-app-developer (Wix-specific) |
| CI/CD automation | devops-automator | infrastructure-maintainer |
| Brand consistency | brand-guardian | content-creator |
| Social media content | content-creator | platform-specific agents |
| AI/ML features | ai-engineer | - |
| Sprint planning | sprint-prioritizer | project-shipper |

---

## Design-to-Wix Conversion Pipeline

The core agents form an automated quality pipeline for design-to-Wix conversions:

```
Design source (Figma / Canva / InDesign)
    ↓
figma-wix-converter / canva-wix-converter / indesign-to-wix
    (extract tokens + structure → ThemePlan + global.css → BuildPlan)
    ↓
asset-cataloger (maps images semantically; tracks Media Manager IDs)
    ↓
wix-structure-validator (validates the BuildPlan)
    ↓
wix-token-auditor (ensures 100% token usage)
    ↓
wix-environment-manager (verifies API key, site, editor session)
    ↓
wix-site-builder (executes: provision → media → data → editor → code →
                  properties → publish)
    ↓ (content-seeder assists the Data phase)
visual-qa-agent (live site vs design at 3 Studio breakpoints → FidelityReport)
    ↓
accessibility-auditor (WCAG compliance on the published site)
    ↓
seo-schema-agent (SEO best practices)
    ↓
deployment-agent (gated production publish)
```

---

## Agent Hook Configurations

Agents with automated hooks:

### Shared Quality Hooks (shared scripts)
These scripts are shared across multiple agents:
- `scripts/wix-structure-validator/validate-structure.sh` — Used by: wix-structure-validator, figma-wix-converter, canva-wix-converter, indesign-to-wix, seo-schema-agent, frontend-developer
- `scripts/design-token-auditor/audit-tokens.sh` — Used by: wix-token-auditor, ui-designer, figma-wix-converter, canva-wix-converter, indesign-to-wix, frontend-developer, performance-benchmarker
- `scripts/wix-environment-manager/check-environment.sh` — Used by: wix-environment-manager, wix-site-builder (SubagentStart preflight)

### Output Protection Hooks
- `scripts/shared/validate-output-location.sh` — Keeps artifacts in `.vespasian/`, `.claude/`, and `packages/` (applied to the converter agents, validators, frontend-developer, ui-designer, asset-cataloger, seo-schema-agent, test-writer-fixer)

### Per-Agent Hooks
| Agent | Hook Type | Script | Purpose |
|-------|-----------|--------|---------|
| wix-structure-validator | PostToolUse | validate-structure.sh | Plan shape, ordering, token references |
| wix-token-auditor | PostToolUse | audit-tokens.sh | Hardcoded value detection |
| content-seeder | Stop | verify-pages.sh | Seeded-content verification |
| wix-environment-manager | SubagentStart | check-environment.sh | Env/API/session status check |
| wix-site-builder | SubagentStart | check-environment.sh | Preflight before any build work |
| figma-wix-converter | PostToolUse (mcp__figma.*) | log-figma-access.sh | Figma access audit trail |
| figma-wix-converter | Stop | generate-comparison-report.sh | Attribute comparison report |
| canva-wix-converter | Stop | generate-comparison-report.sh | Conversion comparison report |

### Research/Audit-Only Agents (no hooks needed)
These agents are research/audit-only and don't need automated hooks:
- accessibility-auditor (runs Lighthouse on demand)
- visual-qa-agent (captures screenshots on demand)
- ux-researcher (research only)

---

**Architecture Assessment:** 54 custom agents provide comprehensive development coverage — 27 Wix-focused agents for design-source conversion (Figma/Canva/InDesign), plan execution, visual QA, asset management, environment management, structure validation, accessibility, token compliance, content seeding, SEO, security, publishing, e-commerce, custom code, and headless integration, plus 27 generic cross-domain agents for business, marketing, engineering, and meta/ops tasks.
