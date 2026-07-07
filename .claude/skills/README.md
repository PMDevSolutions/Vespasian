# Vespasian Skills Catalog

This directory contains the custom skills for Claude Code, optimized for the design-to-Wix pipeline: design in (Figma · Canva · InDesign), live Wix Studio site out.

## Skill Index

### Pipeline Orchestrators (Priority 1)

1. **figma-to-wix-autonomous-workflow**
   - Orchestrator for the Figma → Wix conversion pipeline
   - Triggers: "convert Figma", "Figma to Wix", "build a Wix site from Figma"
   - Role: main workflow skill; also home of the shared fallback tokens, checkpointing, and TESTING-GUIDE.md (dry-run + live smoke)

2. **canva-to-wix-autonomous-workflow**
   - Orchestrator for Canva HTML/CSS exports → Wix (parallel entry point to Figma)
   - Triggers: "convert Canva", "Canva to Wix", "Canva export"
   - Role: Canva-specific ingestion; shares everything downstream with the Figma skill

3. **indesign-conversion**
   - Convert an InDesign document (`.idml` or PDF) into a Wix site via the CLI pipeline
   - Triggers: "InDesign to Wix", "IDML", "print to web"
   - Role: drives `vespasian pipeline indesign`; pairs with the `indesign-to-wix` agent

### Wix Authoring Knowledge (Priority 2)

4. **wix-site-development**
   - Studio concepts: pages/sections/grids, breakpoints, site styles, global.css, operation channels
   - Triggers: "add a section", "site styles", "breakpoints", "Wix site structure"

5. **wix-media-first-architecture**
   - Iron law: media staged via API + file-ready poll BEFORE placement; never hand-place unstaged assets
   - Triggers: auto-applies whenever a plan or editor step touches media

6. **wix-playwright-driver**
   - Driving the Wix editor via Playwright/Playwright MCP: two auth planes, storageState sessions, consent gate, probe-before-flows, deterministic panel flows vs agent-visual canvas work, recovery/escalation, ToS honesty
   - Triggers: "editor automation", "storageState", "data-hook", "editor session"

### Quality & Verification

7. **visual-qa-verification**
   - Post-conversion QA: live-site screenshots at Studio breakpoints vs the source design, responsive checks, Lighthouse, accessibility, FidelityReport
   - Triggers: "verify the site", "visual QA", "compare to Figma"

### Operations

8. **wix-cli-workflows**
   - The `wix` CLI + raw REST recipes with curl (auth headers, sites, editor URLs, media, CMS data, publish) + the `vespasian` CLI surface
   - Triggers: "curl the Wix API", "wix CLI", "upload media", "publish"

9. **vespasian-hook-integration**
   - Creating and managing Claude Code agent hooks in this template
   - Triggers: "create hook", "PreToolUse", "PostToolUse"
   - Documents the 3 script hooks + 6 inline settings.json hooks

10. **vespasian-testing-workflows**
    - node --test + bats + dry-run e2e testing, fixtures/record-replay, coverage, CI
    - Triggers: "write tests", "run the tests", "test coverage"

## Pipeline Flow

```
Design source (Figma / Canva / InDesign)
    |
    v
Orchestrator skill (figma- / canva-to-wix-autonomous-workflow, indesign-conversion)
    |
    +-- tokens.json first (wholesale extraction, fallback tables)
    +-- asset semantic mapping (mandatory)
    +-- ir.json / content.json per page
    |       +-- figma-wix-post-page.sh (warn-only, per artifact)
    |
    v
vespasian plan  →  BuildPlan (.vespasian/plans/<slug>/plan.json)
    |       +-- figma-wix-completion.sh (summary + token audit + report)
    |
    v
vespasian apply (--dry-run first)
    +-- API phases (provision, media, data, properties, publish)   [wix-cli-workflows]
    +-- Editor phase                                               [wix-playwright-driver]
    |       +-- deterministic flows: pages, theme panels, SEO, save
    |       +-- agent-visual canvas composition: wix-site-builder agent
    +-- Code phase: global.css + Velo (after pages exist)          [wix-site-development]
    |
    v
vespasian publish → vespasian qa
    |
    v
Live Wix Studio site + FidelityReport                              [visual-qa-verification]
```

## Skill ↔ Agent Pairings

- **figma-wix-converter** + figma-to-wix-autonomous-workflow + wix-media-first-architecture
- **canva-wix-converter** + canva-to-wix-autonomous-workflow
- **indesign-to-wix** + indesign-conversion
- **wix-site-builder** + wix-playwright-driver + wix-site-development
- **visual-qa-agent** / **accessibility-auditor** + visual-qa-verification
- **wix-structure-validator** / **wix-token-auditor** + the post-page/completion hooks
- **wix-environment-manager** / **deployment-agent** + wix-cli-workflows
- **test-writer-fixer** + vespasian-testing-workflows
- **frontend-developer** / **ui-designer** + wix-site-development
- All agents + vespasian-hook-integration (shared enforcement layer)

## Skill Structure

```yaml
---
name: skill-name-with-hyphens
description: Use when [specific triggers]. Keywords: relevant, search, terms
---

# Skill Name
## Overview
## When to Use
## Quick Reference / Workflow
## Implementation
## Common Mistakes
```

## Maintenance

Skills are version-controlled and updated when:
- Wix ships changes that move editor surfaces or API families (expect churn — dozens of releases a day)
- The pipeline workflow or BuildPlan schema changes
- New hooks or agents are added
- Better patterns emerge from conversion results

---

**Last Updated:** 2026-07-06
**Total Skills:** 10
