// Editor plane — Playwright driver for the operations no API covers.
//
// Everything here is import-safe without a browser: playwright is loaded
// lazily inside EditorSession.launch(). Deterministic flows cover the stable
// core (open, pages, theme panels, SEO, save, publish fallback, media picker);
// canvas composition is agent territory and always escalates.

export { EditorSession, resolveSessionOptions, DEFAULT_STORAGE_STATE } from './session.js';
export {
	requireConsent,
	recordConsent,
	hasConsent,
	consentPath,
	ConsentRequiredError,
	CONSENT_STATEMENT,
	CONSENT_VERSION,
} from './consent.js';
export { probePage, probeAndCache, loadSelectorMap, saveSelectorMap, selectorMapPath } from './probe.js';
export { escalate, isEscalation, tryStep } from './escalation.js';

export { openEditor } from './flows/openEditor.js';
export { openPagesPanel, addPage, renamePage, reorderPages } from './flows/pages.js';
export { applyThemeColors } from './flows/themeColors.js';
export { applyThemeTypography } from './flows/themeTypography.js';
export { setPageSeo } from './flows/seoPanel.js';
export { save } from './flows/save.js';
export { publishFallback } from './flows/publishFallback.js';
export { pickMedia } from './flows/mediaPicker.js';
