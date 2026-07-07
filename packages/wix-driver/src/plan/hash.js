// Deterministic hashing for BuildPlans: stable stringify (sorted object keys,
// arrays in order) + sha256. Same inputs → same sourceHash and idempotency
// keys, byte for byte, run after run.

import { createHash } from 'node:crypto';

/** JSON.stringify with recursively sorted object keys. */
export function stableStringify(value) {
	return JSON.stringify(sortValue(value));
}

function sortValue(value) {
	if (Array.isArray(value)) return value.map(sortValue);
	if (value && typeof value === 'object' && value.constructor === Object) {
		const sorted = {};
		for (const key of Object.keys(value).sort()) {
			const entry = value[key];
			if (entry !== undefined) sorted[key] = sortValue(entry);
		}
		return sorted;
	}
	return value;
}

export function sha256(text) {
	return createHash('sha256').update(text).digest('hex');
}

export function hashValue(value) {
	return sha256(stableStringify(value));
}

/** Short idempotency key for a step: op + canonical input. */
export function idempotencyKey(op, input) {
	return hashValue({ op, input }).slice(0, 16);
}
