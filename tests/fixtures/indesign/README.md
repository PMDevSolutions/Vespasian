# InDesign fixtures — the Spring Brochure

The canonical sample document for the [InDesign → Wix pipeline](../../../docs/pipelines/indesign.md),
generated **as code** (no committed binaries) in both supported input formats.

| File | Purpose |
|------|---------|
| `brochure.mjs` | Builds the two-spread Spring Brochure as an `.idml` buffer and as an exported `.pdf` buffer. |
| `emit.mjs` | Low-level IDML/PDF byte emitters used by `brochure.mjs`. |
| `fixtures.test.mjs` | End-to-end test: both formats → valid IR + populated neutral token set (run in CI). |

The brochure exercises the pipeline's interesting paths: RGB + CMYK colors,
styled text (heading/body scales), an image-dominant spread, and master-spread
chrome.

## Try it yourself

```bash
node -e "
import('./tests/fixtures/indesign/brochure.mjs').then(async (m) => {
  const fs = await import('node:fs');
  fs.mkdirSync('/tmp/fix', { recursive: true });
  fs.writeFileSync('/tmp/fix/brochure.idml', m.buildBrochureIdml());
  fs.writeFileSync('/tmp/fix/brochure.pdf', m.buildBrochurePdf());
});"

vespasian pipeline indesign /tmp/fix/brochure.idml --plan /tmp/fix/brochure.plan.json
vespasian pipeline indesign /tmp/fix/brochure.pdf  --plan /tmp/fix/brochure-pdf.plan.json
```

Either command parses the document into the design IR, maps the neutral
design tokens (palette, type scale, spacing — with full provenance), and
compiles the **BuildPlan** the executor applies to a live Wix site
(`vespasian apply`). The PDF path is lossy by design and records fidelity
warnings that surface in the FidelityReport.

The same builders feed `scripts/indesign-wix/smoke-test.mjs` and the
`@vespasian/pipeline` unit tests.
