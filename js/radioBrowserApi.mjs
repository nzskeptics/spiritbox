export const RADIO_BROWSER_API_BASE = 'https://all.api.radio-browser.info/json';
export const RADIO_BROWSER_DEFAULT_LIMIT = 200;
export const RADIO_BROWSER_CODEC_ALLOWLIST = Object.freeze(['mp3', 'aac', 'aac+']);
export const RADIO_BROWSER_DEFAULT_TIMEOUT_MS = 10000;
export const RADIO_BROWSER_DEFAULT_RETRIES = 2;
export const RADIO_BROWSER_DEFAULT_RETRY_DELAY_MS = 350;

export function createRadioBrowserSearchUrl(base = RADIO_BROWSER_API_BASE, options = {}) {
	const {
		tag = 'talk',
		order = 'votes',
		reverse = true,
		hidebroken = true,
		hasExtendedInfo = true,
		limit = RADIO_BROWSER_DEFAULT_LIMIT,
		offset = 0,
	} = options;

	const params = new URLSearchParams({
		tag,
		order,
		reverse: String(reverse),
		hidebroken: String(hidebroken),
		has_extended_info: String(hasExtendedInfo),
		limit: String(limit),
		offset: String(offset),
	});

	return `${base}/stations/search?${params.toString()}`;
}

export function normalizeRemoteStations(items, options = {}) {
	const allowedCodecs = new Set((options.allowedCodecs || RADIO_BROWSER_CODEC_ALLOWLIST).map((codec) => codec.toLowerCase()));
	if (!Array.isArray(items)) return [];
	const seen = new Set();
	const out = [];
	for (const station of items) {
		const url = station?.url_resolved;
		if (!url || seen.has(url)) continue;
		const codec = (station.codec || '').toLowerCase();
		if (!allowedCodecs.has(codec)) continue;
		seen.add(url);
		out.push({
			name: station.name,
			website: station.homepage || station.url || station.url_resolved,
			url: station.url_resolved,
		});
	}
	return out;
}

function delay(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function fetchWithTimeout(url, options = {}, timeoutMs = RADIO_BROWSER_DEFAULT_TIMEOUT_MS) {
	const controller = new AbortController();
	const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
	try {
		return await fetch(url, {...options, signal: controller.signal});
	} finally {
		clearTimeout(timeoutId);
	}
}

export async function fetchRadioBrowserStations(options = {}) {
	const {
		base = RADIO_BROWSER_API_BASE,
		limit = RADIO_BROWSER_DEFAULT_LIMIT,
		offset = 0,
		timeoutMs = RADIO_BROWSER_DEFAULT_TIMEOUT_MS,
		retries = RADIO_BROWSER_DEFAULT_RETRIES,
		retryDelayMs = RADIO_BROWSER_DEFAULT_RETRY_DELAY_MS,
		requestInit = {},
	} = options;

	const url = createRadioBrowserSearchUrl(base, {limit, offset});
	let lastError = null;
	for (let attempt = 0; attempt <= retries; attempt++) {
		try {
			const response = await fetchWithTimeout(url, {
				method: 'GET',
				headers: {accept: 'application/json'},
				mode: 'cors',
				...requestInit,
			}, timeoutMs);
			if (!response.ok) {
				throw new Error(`HTTP ${response.status}`);
			}
			const json = await response.json();
			return {
				url,
				stations: normalizeRemoteStations(json),
			};
		} catch (error) {
			lastError = error;
			if (attempt < retries) {
				await delay(retryDelayMs);
			}
		}
	}

	throw lastError || new Error('Failed to fetch Radio Browser stations');
}

export async function fetchRadioBrowserStationsWithFailover(options = {}) {
	const {
		bases = [RADIO_BROWSER_API_BASE],
		limit = RADIO_BROWSER_DEFAULT_LIMIT,
		offset = 0,
		timeoutMs = RADIO_BROWSER_DEFAULT_TIMEOUT_MS,
		retries = RADIO_BROWSER_DEFAULT_RETRIES,
		retryDelayMs = RADIO_BROWSER_DEFAULT_RETRY_DELAY_MS,
		requestInit = {},
		onMirrorError,
	} = options;

	let lastError = null;
	for (const base of bases) {
		try {
			const result = await fetchRadioBrowserStations({
				base,
				limit,
				offset,
				timeoutMs,
				retries,
				retryDelayMs,
				requestInit,
			});
			return result;
		} catch (error) {
			lastError = error;
			if (typeof onMirrorError === 'function') {
				onMirrorError(error, base);
			}
		}
	}

	throw lastError || new Error('No Radio Browser mirror available');
}
