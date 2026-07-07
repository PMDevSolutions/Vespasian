// @vespasian/wix-driver — the Wix output layer.
//
// design tokens ─→ translateTokens ─→ ThemePlan + global.css
// pipeline artifacts ─→ compilePlan ─→ BuildPlan
// BuildPlan ─→ executePlan ─→ live Wix site (rest | cli | editor transports)
// published site ─→ qa helpers ─→ screenshots + FidelityReport
//
// Everything is import-safe without a browser or credentials; playwright is
// loaded lazily and VESPASIAN_DRY_RUN=1 swaps in recording transports.

// REST plane
export {
	createRestClient,
	createTransport,
	revisionAwareUpdate,
	isDryRunEnv,
	WixApiError,
	isWixApiError,
	kindForStatus,
	assertEditorType,
	editorTypeOf,
	EDITOR_TYPES,
	isFileReady,
	EMBED_HTML_MAX_CHARS,
	WIX_API_BASE_URL,
} from './rest/index.js';

// Dry-run recording transport
export { createDryRunTransport, defaultDryRunLogPath } from './dryrun/index.js';

// Auth (both planes)
export { resolveApiCredentials, assertCredentials, authHeaders } from './auth/apiKeyAuth.js';

// Translate: tokens → ThemePlan + global.css
export {
	translateTokens,
	normalizeTokens,
	TokensSchema,
	FidelityNoteSchema,
	translatePalette,
	translateTypography,
	translateFonts,
	translateSpacing,
	assembleGlobalCss,
	loadBuiltinFonts,
	normalizeHex,
	sizeToPx,
	MAX_SITE_COLORS,
	TEXT_SLOTS,
	FONT_UPLOAD_MAX_BYTES,
} from './translate/index.js';

// Plan: artifacts → BuildPlan
export {
	compilePlan,
	BuildPlanSchema,
	BuildStepSchema,
	PHASES,
	IrInputSchema,
	ContentInputSchema,
	AssetsManifestSchema,
	stableStringify,
	hashValue,
	idempotencyKey,
} from './plan/index.js';

// Executor
export { executePlan, API_OPS, CLI_OPS, loadCheckpoint, saveCheckpoint, DEFAULT_CHECKPOINT_DIR } from './executor/index.js';

// CLI channel (Git integration + wix CLI)
export { createCliChannel, hasBinary, GLOBAL_CSS_PATH } from './cli/index.js';

// Editor plane (lazy playwright; consent-gated)
export {
	EditorSession,
	resolveSessionOptions,
	DEFAULT_STORAGE_STATE,
	requireConsent,
	recordConsent,
	hasConsent,
	consentPath,
	ConsentRequiredError,
	CONSENT_STATEMENT,
	probePage,
	probeAndCache,
	loadSelectorMap,
	saveSelectorMap,
	escalate,
	isEscalation,
	openEditor,
	addPage,
	renamePage,
	reorderPages,
	applyThemeColors,
	applyThemeTypography,
	setPageSeo,
	save,
	publishFallback,
	pickMedia,
} from './editor/index.js';

// QA
export {
	captureScreenshots,
	DEFAULT_WIDTHS,
	readCssVars,
	assertThemeVars,
	compareVars,
	buildFidelityReport,
	renderFidelityMarkdown,
	writeFidelityReport,
} from './qa/index.js';

import { createRestClient } from './rest/index.js';
import { createDryRunTransport } from './dryrun/index.js';

/** A full REST client wired to a recording (dry-run) transport. */
export function createDryRunClient(options = {}) {
	return createRestClient({ transport: createDryRunTransport(options) });
}
