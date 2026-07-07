// Consent gate for the editor-automation plane.
//
// Editor automation is a Wix ToU §2.2 gray area (automated access to Wix
// surfaces without written permission; automation of one's OWN account is
// unaddressed — account-flag risk). The Playwright plane therefore stays OFF
// until the user has run `vespasian login --editor` and acknowledged an
// explicit consent prompt. The acknowledgment is recorded once at
// .vespasian/consent.json; every editor operation refuses to run without it.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

export const CONSENT_VERSION = 1;

export const CONSENT_STATEMENT =
	'I understand that automating the Wix editor is a Wix Terms-of-Use gray area with ' +
	'account-flag risk; that it runs visibly (headed) at human pace on my own account and ' +
	'credentials; and that every operation with an official API uses the API instead.';

export class ConsentRequiredError extends Error {
	constructor(consentPath) {
		super(
			`Editor automation requires one-time consent. Run \`vespasian login --editor\` and ` +
				`acknowledge the prompt (records ${consentPath}).`,
		);
		this.name = 'ConsentRequiredError';
		this.consentPath = consentPath;
	}
}

/** Resolve the consent file path. */
export function consentPath({ baseDir = '.vespasian' } = {}) {
	return join(baseDir, 'consent.json');
}

/** Has the user recorded consent (matching the current statement version)? */
export function hasConsent({ baseDir } = {}) {
	const path = consentPath({ baseDir });
	if (!existsSync(path)) return false;
	try {
		const record = JSON.parse(readFileSync(path, 'utf8'));
		return record?.version === CONSENT_VERSION && record?.acknowledged === true;
	} catch {
		return false;
	}
}

/**
 * Record consent (called by `vespasian login --editor` AFTER the user has
 * interactively acknowledged the statement — never call this silently).
 */
export function recordConsent({ baseDir, acknowledgedBy } = {}) {
	const path = consentPath({ baseDir });
	mkdirSync(dirname(path), { recursive: true });
	const record = {
		version: CONSENT_VERSION,
		acknowledged: true,
		statement: CONSENT_STATEMENT,
		acknowledgedBy: acknowledgedBy ?? null,
		acknowledgedAt: new Date().toISOString(),
	};
	writeFileSync(path, `${JSON.stringify(record, null, '\t')}\n`);
	return record;
}

/** Throw unless consent is on record. Every editor entry point calls this. */
export function requireConsent({ baseDir } = {}) {
	if (!hasConsent({ baseDir })) {
		throw new ConsentRequiredError(consentPath({ baseDir }));
	}
}
