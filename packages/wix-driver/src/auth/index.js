// Auth — both planes in one place.
//
// Plane 1 (API): account-level API key + exactly one id header (apiKeyAuth).
// Plane 2 (editor): consented persistent browser session (re-exported from
// ../editor/ so the architecture's "auth owns the consent gate" holds without
// duplicating the implementation).

export { resolveApiCredentials, assertCredentials, authHeaders } from './apiKeyAuth.js';
export {
	EditorSession,
	requireConsent,
	recordConsent,
	hasConsent,
	consentPath,
	ConsentRequiredError,
	CONSENT_STATEMENT,
} from '../editor/index.js';
