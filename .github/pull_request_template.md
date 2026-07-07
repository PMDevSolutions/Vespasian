## Description

<!-- Describe your changes in detail -->

## Related Issue

<!-- Link to the issue this PR addresses, e.g. Closes #123 -->

## Type of Change

- [ ] Bug fix
- [ ] New feature
- [ ] Documentation update
- [ ] Chore
- [ ] Breaking change

## Checklist

- [ ] Tests pass (`pnpm test:pipeline`, `pnpm --filter @vespasian/wix-driver test`, `pnpm test:canva-e2e`)
- [ ] Dry-run apply passes for affected plans (`VESPASIAN_DRY_RUN=1 vespasian apply <plan> --dry-run`)
- [ ] Token audit clean — no new hardcoded colors/sizes in generated output (design tokens / `--vsp-*` only)
- [ ] No credentials or `.vespasian/` state committed (`.env`, editor sessions)
- [ ] `.claude/` hook wiring updated for any script rename/removal (`./scripts/validate-agent-configs.sh`)
- [ ] Documentation updated (if applicable)
- [ ] Commits follow Conventional Commits (release-please manages versions — do not hand-bump)
