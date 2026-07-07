# Wix API Coverage — which operations use APIs vs browser automation

This is the authoritative per-operation routing table for the Vespasian output layer: for every
operation the pipeline needs, which **channel** executes it (`api` · `cli` · `playwright` ·
`hybrid`), the concrete endpoint or surface, why that channel was chosen, and the fallback.
Architecture context: [ARCHITECTURE.md](ARCHITECTURE.md). Editor-plane details:
[editor-automation.md](editor-automation.md). Token translation: [theming.md](theming.md).

**Reading the channels:**

- **api** — Wix REST (`www.wixapis.com`), authenticated with an account-level API key. Fully headless.
- **cli** — the Wix Git integration + `wix` CLI (code and custom CSS). Fully headless.
- **playwright** — a real, consent-gated browser session in the Wix editor (deterministic scripted flows).
- **hybrid** — split between channels (e.g. bytes via API, placement via editor).

## Operations matrix

| Operation | Channel | Endpoint / surface | Rationale | Fallback |
|---|---|---|---|---|
| Authenticate (API plane) | api | Account-level API key from manage.wix.com/account/api-keys; sent as `Authorization: <API_KEY>` plus exactly one of `wix-account-id` (account-level calls) or `wix-site-id` (site-level calls). | API keys are the documented auth model for CLIs, automation, and AI agents. Wix Headless OAuth clients are visitor/member-scoped only; third-party-app OAuth is for app distribution — both rejected for a site-owner tool. Note: site-level calls only work with a key from the **site owner's** account, not a co-owner's. | The official Wix MCP (`https://mcp.wix.com/mcp`) accepts the same API key + `wix-account-id` headers, or interactive OAuth, as an alternate transport. |
| Authenticate (editor plane) | playwright | One-time **headed** login at manage.wix.com in a persistent context; `context.storageState()` saved to a gitignored session file (`.vespasian/session/state.json`) and reused. Use a Wix-native email+password account (not Google SSO); optional TOTP re-auth. | API keys cannot log into the editor. Wix login has reCAPTCHA + device 2FA; the proven pattern is human-solved headed login once, then persisted storageState, run headed with a real Chrome UA. Never use CAPTCHA-solving services. | Human-in-the-loop re-login (`vespasian login --editor`) when the session is invalidated. There is no unattended alternative — a designed pause point. |
| Create site (blank / from template) / clone site | api | `POST /funnel/projects/v1/create` (Projects API: type=WIX, templateId?, name — returns metaSiteId + siteId). Clone: `POST /site-actions/v1/sites/duplicate` `{sourceSiteId, siteDisplayName}`. | Fully supported, account-level. Template selection at creation is the **only** official way to get a designed page structure programmatically — the templateId is the layout seed. Duplicate clones custom embeds but excludes business data; new sites start without Premium. | MCP `ManageWixSite`. |
| List sites / resolve site IDs | api | Account-level Sites API Query Sites / Count Sites (+ Site Folders API). | Needed to resolve the `wix-site-id` header for all site-level calls and map site name → GUID. Account-level, webhook support. | MCP `ListWixSites`. |
| Resolve editor URL + editor type | api | `GET /editor-urls/v2/editor-urls` → editorUrl, previewUrl, editorType {WIX_EDITOR, WIX_STUDIO, ODEDITOR, …}; sibling List Published Site URLs for the live URL. | Never template editor.wix.com URLs by hand. `editorType` is the branch point for the whole Playwright strategy — the provisioner asserts `WIX_STUDIO` here and fails fast otherwise. | None needed; this endpoint is the sanctioned source. |
| Create page | playwright | Editor Pages panel: `/` opens the panel, Alt+N adds a blank page (classic); Studio Pages panel. Git-sync then picks up the generated page code file. | Verified absent from the entire REST/SDK reference. Git integration is explicit: page code files "can't be created from your IDE" — the page must first exist in the browser editor. Keyboard entry points reduce selector dependence. | Avoidance (preferred): pick a templateId whose page set already matches the design IR so page creation is rarely needed. |
| Rename page | playwright | Pages panel list item context menu, driven via data-hook/aria selectors with retries. | No API. Mid-complexity, relatively stable flow — good candidate for deterministic scripting. | Agent-visual (screenshot-grounded) driving when selectors drift. |
| Navigate / reorder pages (site menu order) | playwright | Pages panel drag-reorder in the editor. No site-navigation-menu REST API exists (the only "Menus" API is restaurant food menus). | Verified absent from the API reference. Menu order derives from page order in the Pages panel; drag-and-drop is required. | Agent-visual driving; or accept template default ordering and only add/hide pages. |
| Add section to page | hybrid | Classic: Alt+B + Add Elements panel; Studio: Add Elements panel + section grid (fr/minmax/%). Canvas may be iframed — undocumented; runtime DOM probe required per editorType. | The defining boundary: no REST/SDK/Velo path can compose page structure (`$w` cannot create elements). Highest-brittleness flow → scripted Playwright as accelerator, screenshot-grounded agent as default executor, verification by re-reading the Layers/Pages tree — never by trusting the click. | Template-first avoidance: choose templates whose sections approximate the IR and only restyle/repopulate them. |
| Add text element | hybrid | Editor Add Elements panel (Playwright/agent-visual); content editing on the canvas; theme slot assignment (H1–H6/P1–P3) via the text settings panel. | No compositional API. Once an element exists, Velo `$w` can set `.text`/`.html` at runtime — content injection, not structure. Map every text node in the IR to one of the 9 theme text slots so styling stays token-driven. | Content-through-CMS: bind template repeaters/dynamic pages to CMS collections populated via the fully-supported Data API, avoiding canvas edits entirely. |
| Add image element | hybrid | Add Elements panel → image → Media Manager picker iframe (`#mediaGalleryFrame`; verified data-hooks: `add-media-button`, `gallery-file`, `select-items`). Asset pre-uploaded via REST. | Element creation is editor-only; asset upload is API-supported. Split the operation: bytes via API, placement via editor automation. | Velo runtime: `$w('#image').src = 'wix:image://v1/…'` on pre-existing elements; or CMS-bound image fields. |
| Add button / link | hybrid | Add Elements panel (Playwright/agent-visual); link target via the element's link dialog; styling from theme button role tokens (18 `--wst-button-color-*` slots), not per-element overrides. | No compositional API. Styling via theme roles keeps buttons consistent with the applied palette; per-element styling only as exception. | Velo `$w` `.style` + `.link` at runtime on pre-placed buttons; `global.css` `.button` rules via CLI (Studio). |
| Apply color palette (theme tokens) | playwright | Studio: Site Styles → Colors (6 role-bound defaults, max 25 site colors); Classic: Site Design → Color Theme. Type exact HEX values into the pickers. | **No write API exists for the theme** — a "Site Theme API" is an open, uncommitted feature request. The single biggest forced-Playwright surface. Set every shade explicitly (Wix auto-generates shade gradients that drift). Verify by scraping `--wst-color-*` CSS variables from the published page. | `global.css` var-based overrides via the Wix CLI (Studio only) — reinforces rendering but masks rather than updates the theme the owner sees; Custom Embeds HEAD `<style>` (15k char limit) as cosmetic last resort. |
| Apply typography (font families + type scale) | playwright | Studio: Site Styles → Typography; Classic: Site Design → Text Theme. Fixed 9 slots: H1–H6 + Paragraph 1–3 (`--wst-font-style-*`). Custom fonts: editor "Upload Fonts" dialog (WOFF2 preferred, < 4 MB). | No API for text themes or font registration (Media Manager upload does NOT register fonts). Strategy: match extracted families against Wix's ~200+ built-in list first; only drive the upload UI when unmatched. Compress the extracted ramp into the 9 slots. | Overflow ramp steps (display/caption/overline) become custom classes in `global.css` via CLI (Studio only). Letter-spacing/text-transform beyond panel options → `global.css`. |
| Apply spacing / layout tokens | hybrid | `global.css` `:root { --vsp-space-N: … }` custom properties + utility classes (`.vsp-p-3 { padding: var(--vsp-space-3) }`) via the Wix CLI; classes attached via the Studio CSS Classes panel (Playwright) or `$w` `customClassList`; structural gaps set per element per breakpoint in the Studio Inspector (Playwright). | Wix has **no spacing tokens anywhere** — per-element px values only. The CSS-custom-property emulation is the best available home; Studio-only. On classic Editor the spacing scale is unrepresentable. | Accept template spacing as-is and only adjust flagged deltas; on classic Editor, downgrade gracefully and record the loss in the FidelityReport. |
| Upload image to Media Manager | api | `POST /site-media/v1/files/generate-upload-url` → PUT bytes to signed URL; Import File (server-side import from public URL — recommended for pipeline assets); resumable upload for >10 MB. Organize with filePath/parentFolderId/labels. | Fully API-supported (scope Manage Media Manager). Files are **not** immediately usable — poll for file-ready before referencing. Watch `SITE_QUOTA_EXCEEDED` on free plans. | Media Manager iframe UI via Playwright (proven selectors) — only if the API is unavailable for a given asset type. |
| Place uploaded image into a page element | hybrid | Playwright: element image-change dialog → Media Manager picker iframe, select the already-uploaded asset. Velo: `$w` Image `.src` accepts `wix:image://v1/…` refs. CMS: image fields feed repeaters/dynamic pages via the Data API. | Upload and placement are different problems; placement into static editor elements has no API. Prefer CMS-bound placement wherever the template supports it — zero editor automation. | Velo runtime `.src` assignment (non-persistent in editor, but renders correctly for visitors). |
| Set page SEO / meta (static pages) | playwright | Editor per-page SEO panel. REST covers only robots.txt / ads.txt / llms.txt — no static-page meta API (verified absent). | Genuine API gap. Deterministic, panel-based flow — scriptable with data-hook/aria selectors. | Dynamic pages: Velo `wix-seo-frontend` sets tags at render time; robots.txt/llms.txt via REST for crawl directives. |
| Inject custom CSS (Studio `global.css`) | cli | `src/styles/global.css` in the site's Git-integration repo; sync with `wix dev`, deploy with `wix publish`. Targets ~50 semantic global class sets (`.button`, `.section`, …), custom utility classes, media queries, `--wst-*` theme vars. | The **only** fully headless, no-Playwright styling channel — Vespasian's strongest code-driven design surface. Studio-only. Constraint: while Git-connected, the online editor's code panel is read-only; publish from the repo default branch to avoid desync. | Studio Code panel via Playwright (if Git integration is not connected); Custom Embeds HEAD `<style>` via REST (15k chars, published-site only) as last resort. |
| Inject scripts / head embeds | api | `POST/PATCH/DELETE /embeds/v1/custom-embeds` (HEAD \| BODY_START \| BODY_END; html ≤ 15,000 chars; consent category; pageFilter.pageIds; revision-based updates). | Works with plain site-owner API keys. Do **not** use the app-management Embedded Scripts API — it requires authenticating as a Wix app (wrong tool for a site-owner CLI). | The editor's "custom code" head/body snippet UI via Playwright. |
| Create CMS collections + populate items | api | `POST /wix-data/v2/collections` (id, fields, permissions); `POST /wix-data/v2/items` (+ bulk, save/upsert, query). | Fully supported; the backbone of the template-first strategy — layout once (template), content forever via API. Caveat: **binding** a collection to a dynamic page/repeater is an editor operation unless the template already carries the binding — pick templates accordingly. | MCP `CallWixSiteAPI` as transport; Playwright for new bindings when the template lacks them. |
| Set site properties (name, business profile, contact) | api | `GET /site-properties/v4/properties`; `POST /site-properties/v4/properties/business-profile` (fields/paths mask — omitted-but-listed fields are **cleared**; handle the mask carefully). | Fully supported with a site-owner API key. Locale is readable but has no documented update endpoint. | Dashboard UI via Playwright for the rare non-API fields (e.g. locale change). |
| Deploy Velo site code (page JS, backend, masterpage.js) | cli | Push to the site's Git-integration repo (`src/pages`, `src/backend`, `src/public`, `src/styles/global.css`) → auto-sync; `wix dev`; `wix publish`; `wix install <pkg>` for npm deps. | Fully headless for **code**. Hard limit: cannot create page code files from the IDE (the page must exist in the editor first; filenames embed internal page IDs — never rename). | Wix IDE (browser) via Playwright — avoid; sequence editor page-creation before code push instead. |
| Save | playwright | Classic editor: Ctrl/Cmd+S, await the save-confirmation toast (handle the first-save free-domain dialog on brand-new sites). Studio and Harmony: autosave — save is a no-op. | Editor-plane concern only; the keyboard shortcut avoids selectors entirely on classic. | None needed on Studio (autosave). |
| Publish | api | `POST /site-publisher/v1/site/publish` (empty body, `wix-site-id` header; 428 if the site has no structure). | REST publish ships the current editor state without a browser. Conflict resolution: for Git-connected sites with code changes, `wix publish` (CLI) is the path that includes repo code — use CLI when code was part of the change set, REST otherwise. | `wix publish` (CLI); Playwright Publish button (observed `[data-hook="topbar-publish"]`) with Studio code-validation dialog handling. Verify by fetching the published URL, not by trusting the success modal. |
| Screenshot live site for QA (visual diff vs design IR) | playwright | Plain headless Playwright against the published URL (List Published Site URLs) or previewUrl; scrape `--wst-*` CSS variables to assert theme-token application; `scripts/visual-diff.js` / `scripts/check-responsive.sh` at the Studio breakpoints (1001+/751–1000/320–750). | Published sites are public — no auth, no anti-bot friction, fully deterministic. Token verification via computed CSS variables is the objective acceptance gate for the Playwright theming steps. | previewUrl (authenticated) for pre-publish QA using the stored editor session. |

## Where Wix doesn't map

Honest limitations — these are platform gaps, recorded per-run in the FidelityReport rather than
papered over:

- **No API for page structure or layout composition, period.** Creating pages, adding
  sections/text/images/buttons, positioning, and reordering are editor-UI-only (verified absent
  from the ~550-entry REST reference by two independent reports; Velo `$w` cannot create or remove
  elements; Git integration cannot create page files). The core of a design-to-site pipeline —
  "build this layout" — has no programmatic home on Wix and must go through template pre-selection
  plus Playwright.
- **No theme write API.** The color palette, role colors, button state colors, and the 9-slot text
  theme are readable as `--wst-*` CSS variables but writable only through the editor's Site
  Styles / Site Design panels. A "Site Theme API" has been an open community feature request since
  ~2020 with no staff commitment. Design tokens — the pipeline's primary artifact — cannot be
  applied as data.
- **Spacing tokens have no first-class home.** Wix has no spacing scale anywhere; margins/padding
  are per-element, per-breakpoint values. The extracted spacing scale survives only as emulated CSS
  custom properties in Studio `global.css`; the site owner never sees an editable spacing system.
- **Fixed 9-slot type ramp** (H1–H6 + 3 paragraph styles). Design systems with more steps (display,
  caption, overline, eyebrow) spill into custom CSS classes — Studio only — invisible in the
  editor's typography panel.
- **Color palette truncation:** 9 theme slots (classic) / max 25 site colors (Studio). Larger
  extracted palettes get compressed; Wix auto-generates shade gradients that drift from extracted
  shades unless every slot is set explicitly; role semantics must be inferred by the pipeline.
- **Font handling:** no API to upload or register fonts (Media Manager upload does not register
  them); upload is an editor dialog (TTF/OTF/WOFF/WOFF2, keep < 4 MB); variable-font axes are
  unsupported; exact font versions/subsets are lost.
- **Editor-flavor divergence is severe:** classic Wix Editor has no custom CSS and no breakpoints,
  so the `global.css` channel, spacing emulation, and overflow type styles all vanish; the Harmony
  editor (ODEDITOR) supports no site code or custom CSS at all. Only **Wix Studio** supports the
  full Vespasian styling strategy — hence Studio-only in v1.
- **Absolute-positioned design IR does not map onto Wix's section/grid model.** Vespasian cannot
  emit layout as text — it translates the IR into section/grid intents and has an agent execute
  them visually, or accepts the nearest template's structure. **Pixel-perfect fidelity is not a
  realistic contract on Wix.**
- **Static-page SEO (title/meta description) has no REST API** — only robots.txt/ads.txt/llms.txt
  are API-writable; per-page meta requires the editor panel or Velo runtime tags on dynamic pages.
- **No site-navigation-menu API** (the only "Menus" API is restaurant food menus); page/menu
  ordering is a Pages-panel drag operation.
- **Page-code chicken-and-egg:** Git integration cannot create page code files, so code deployment
  must be sequenced *after* editor-driven page creation; page code filenames embed internal IDs and
  must not be renamed.
- **CMS binding is editor-only** unless the chosen template already ships the binding — template
  selection quality directly gates how much content can flow through the (excellent) Data APIs.
- **The Playwright layer is legally gray and operationally fragile:** Wix ToU §2.2 restricts
  automated access (own-account automation unaddressed — account-flag risk); login has reCAPTCHA +
  device 2FA requiring a one-time human-in-the-loop; Wix ships ~60 releases/day with 3+ coexisting
  editor UIs, so selectors are perishable; no OSS selector corpus exists for the site editor; and
  whether the editor canvas is an iframe is undocumented and must be probed at runtime.
- **Velo runtime styling is not persistence:** only ~16 element types expose `.style`, no font
  control, and nothing set at runtime appears in the editor theme — it cannot substitute for real
  theming.
- **Rate limits are unpublished** (429 → wait ~60s and retry); Wix Data and media quotas are
  plan-dependent (`SITE_QUOTA_EXCEEDED`, `WDE0014`); free-plan sites carry Wix ads and no custom
  domain.
- **Custom Embeds are capped:** 15,000 chars of HTML per embed and a per-site embed count limit
  (`SITE_EMBEDS_LIMIT_EXCEEDED`) — not a viable channel for large generated CSS.
- **No prompt-to-site generation API:** Wix Vibe and Harmony/Aria are product UIs only; Vibe
  projects opened via the unified CLI are Wix-managed headless React sites — a different product
  than what Vespasian targets.
- **Unverified (conservative flag):** whether Projects-API `templateId` creation can yield
  WIX_STUDIO-editor sites, or only classic-editor templates. The provisioner therefore checks
  `editorType` via Get Editor URLs immediately after provisioning and maintains a curated allowlist
  of confirmed-Studio template GUIDs; until verified, "API-provisioned Studio site" is treated as
  unproven.
- **Media files are not usable immediately after upload** (async "file ready") — every media step
  needs a poll-before-reference loop.
- **Locale/site language has no documented update API** (read-only via Site Properties).

## Auth model (summary)

Two independent planes; they never substitute for each other:

**Plane 1 — API/CLI (primary; covers all `api` and `cli` rows).** An **account-level API key**
created in the [API Keys Manager](https://manage.wix.com/account/api-keys), with permission sets
covering at least: Projects/Site creation, Site Actions (duplicate/publish), Read Site URLs, Manage
Media Manager, Manage Data Collections + Write Data Items, Manage Custom Embeds, Manage Business
Profile, Manage SEO Settings. Every REST call sends `Authorization: <API_KEY>` plus **exactly one**
of `wix-account-id` (account-level endpoints) or `wix-site-id` (site-level endpoints). Explicitly
rejected: Wix Headless OAuth clients (visitor/member tokens, not admin) and third-party-app OAuth
(only needed for app-distribution features Vespasian avoids). Two constraints to remember:
site-level calls only work with a key from the **site owner's** account, and API keys cannot be
used by third-party Wix apps. The official Wix MCP reuses the same key — no separate credential.
The Wix CLI supports API-key auth for CI per its docs, but that path is thinly verified — keep an
interactive `wix login` escape hatch.

**Plane 2 — editor (Playwright fallback only).** API keys cannot log into the editor; it needs a
real browser session: a dedicated Wix-native email+password account (never Google SSO), one-time
interactive **headed** login via `vespasian login --editor` (the human solves reCAPTCHA/2FA once),
`storageState` persisted to `.vespasian/session/state.json` (gitignored, `chmod 600`) and reused —
which suppresses most reCAPTCHA/2FA re-triggers. Headed by default. `WIX_EDITOR_TOTP_SECRET` is
reserved for TOTP re-auth but **not implemented in v0.1** — there is no unattended re-auth. Never
use CAPTCHA-solving services. Session expiry always pauses for a human login: a designed
human-in-the-loop pause, not an error.

**Consent gate:** the Playwright plane is **off** until the user runs `vespasian login --editor`
and acknowledges an explicit consent prompt (ToU §2.2 gray area, account-flag risk, runs visibly at
human pace on their own account, and every operation with an official API uses the API instead).

**Dry-run:** `VESPASIAN_DRY_RUN=1` makes both planes no-op recording transports — CI exercises the
entire IR → translate → plan → execute path with zero Wix credentials.

Environment variables for both planes are listed in [ARCHITECTURE.md](ARCHITECTURE.md#two-auth-planes)
and `.env.example`.
