# Agent Naming Guide

This guide helps you choose the right agent when more than one agent shares the same name. Name collisions happen when an installed Claude Code plugin ships an agent whose name matches another plugin's agent — or a local agent in `.claude/agents/`.

> **The `plugin/agent` references below are illustrative, not a claim about what is installed.** This template's own agents live in `.claude/agents/`; any additional agents come from whatever plugins you have installed (see `.claude/PLUGINS-REFERENCE.md` for the plugins this project documents). There is **no** local `code-reviewer` agent in this template. Verify what is actually available with `/plugin list` before assuming a specific `plugin/agent` exists.

## Resolving "code-reviewer" (and similar) collisions

If you have multiple plugins installed that each provide a similarly-named agent (for example, a `code-reviewer`), prefer the one most specific to your task. The common review situations are:

### General development review
For bug detection, security smells, code smells, and best-practice checks during active development. Favor a fast, read-only reviewer.

### Pull-request / merge review
For PR-specific analysis: cross-file impact, integration concerns, and merge readiness before shipping. Favor a comprehensive reviewer that can run tests and check dependencies.

### Plan-alignment review
For verifying that an implementation matches an agreed plan or architecture: requirement traceability and completeness. Favor a reviewer that can read both the plan and the diff.

**Quick rule:** match the agent to the moment — general coding vs. PR/merge vs. plan verification — and pick the most specific reviewer your installed plugins provide.

## Quick Decision Tree

```
Need to review code?
│
├─ Is there an implementation plan? ────> plan-alignment reviewer
│
├─ Is this for a PR/merge? ────────────> PR / merge reviewer
│
└─ General development review ─────────> general-purpose reviewer
```

## Other Name Collisions

The same "prefer the most specific" principle applies whenever agents overlap:

### Code simplifiers / refactorers
If more than one refactoring agent is available, use the one intended to run **after** a review — it refactors the flagged code while preserving behavior.

### Test agents
This template ships a local **test-writer-fixer** (writes tests, runs them, fixes failures). If a plugin also provides a test-coverage analyzer, treat them as complementary: active fixing vs. passive analysis.

### Frontend agents
This template ships a local **frontend-developer** (Wix section composition, `global.css`, Velo frontend code). If a plugin also provides a UI/UX design agent, design first, then implement.

## Overlapping Local Agents (not collisions — role boundaries)

Several of this template's own Wix agents sound interchangeable but have deliberate boundaries. Match the agent to the pipeline stage:

### wix-site-builder vs figma-wix-converter (and the other converters)
- **figma-wix-converter / canva-wix-converter / indesign-to-wix** decide *what* the site should be: they extract tokens and structure from the design source and **compile a BuildPlan**. They never touch the Wix editor.
- **wix-site-builder** decides nothing: it **executes** the BuildPlan against a real site (API first, Playwright-driven editor automation as fallback).
- Rule of thumb: "convert this design" → a converter; "apply/build/resume" → wix-site-builder.

### wix-site-builder vs visual-qa-agent
- **wix-site-builder** verifies each step as it executes (Layers tree + screenshots) — build-time evidence.
- **visual-qa-agent** compares the finished, **published** site against the source design — release-time evidence and FidelityReport input.
- If the site is live and the question is "does it match the design?", it's visual-qa-agent.

### wix-structure-validator vs wix-token-auditor
- **wix-structure-validator** checks plan/page *structure*: step shape, phase ordering, headings, dangling references.
- **wix-token-auditor** checks *token compliance*: stray hex/px, `--vsp-*` resolution, palette compression, ramp overflow.
- They are complementary gates; converters run both.

### frontend-developer vs ui-designer vs wix-app-developer
- **ui-designer** shapes the design system (token registry → ThemePlan) and section recipes.
- **frontend-developer** turns those into concrete BuildPlan steps and `global.css`/Velo frontend code.
- **wix-app-developer** owns backend/custom code: web modules, HTTP functions, data hooks, and reusable Wix CLI apps/Blocks.

### wix-headless-developer vs everything else
- Headless is a different architecture: Wix as API backend, frontend owned elsewhere. If the deliverable is a Wix-rendered site, stay with the pipeline agents; if it's a Next.js/Astro app reading Wix data, it's wix-headless-developer.

## When in Doubt

1. Run `/plugin list` to see which plugins — and therefore which plugin agents — are actually installed.
2. Check the decision tree above.
3. Prefer the more specific agent for your task (e.g., a PR reviewer for PRs).
4. Ask Claude Code: "Which agent should I use for [task]?"

---

**Last Updated:** 2026-07-06
