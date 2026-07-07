// Deterministic asset staging plan.
//
// The pipeline works from the IR, which carries image references (hrefs), not
// bytes. planAssets computes a stable staged filename for every image frame so
// the asset stage (assets/stage.js) can write real bytes to exactly those
// paths and downstream drivers (e.g. @vespasian/wix-driver's media-upload
// phase) can reference them via assets.manifest.json. Reruns map the same
// frame to the same filename, so nothing churns.

/** File extension for an asset href, defaulting to png. */
function assetExt(href) {
	const m = /\.([a-z0-9]{2,5})(?:[?#]|$)/i.exec(String(href ?? ''));
	return m ? m[1].toLowerCase() : 'png';
}

/**
 * Deterministic asset filename for an image frame. Index-based so a missing or
 * duplicated href never collides or reorders: "spread-N-image-K.ext".
 *
 * @param {number} spreadIndex 0-based spread index.
 * @param {number} frameIndex  0-based image-frame index within the spread.
 * @param {string} [href]      Original IR href (used only for the extension).
 * @returns {string}
 */
export function assetFileName(spreadIndex, frameIndex, href) {
	return `spread-${spreadIndex + 1}-image-${frameIndex + 1}.${assetExt(href)}`;
}

/**
 * @typedef {Object} PlannedAsset
 * @property {string} frameId
 * @property {string} name      Filename, e.g. "spread-1-image-1.jpg".
 * @property {string} relPath   Bundle-relative path, e.g. "assets/spread-1-image-1.jpg".
 * @property {string} [href]    Original IR href.
 * @property {boolean} embedded Whether the bytes live inside the source IDML.
 *
 * Plan staged assets for every image frame across the spreads.
 * @param {import('../ir.js').DocumentIR} ir
 * @returns {{ assets: Array<PlannedAsset>, assetPathById: Map<string, string> }}
 */
export function planAssets(ir) {
	/** @type {Array<PlannedAsset>} */
	const assets = [];
	const assetPathById = new Map();

	(ir.spreads ?? []).forEach((spread, spreadIndex) => {
		let imageIndex = 0;
		for (const frame of spread.frames ?? []) {
			if (frame.kind !== 'image') continue;
			const name = assetFileName(spreadIndex, imageIndex, frame.href);
			imageIndex += 1;
			const relPath = `assets/${name}`;
			assets.push({
				frameId: frame.id,
				name,
				relPath,
				href: frame.href,
				embedded: Boolean(frame.embedded),
			});
			assetPathById.set(frame.id, relPath);
		}
	});

	return { assets, assetPathById };
}
