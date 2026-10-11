const http = require('http');
const https = require('https');
const dnsNative = require('dns');
const dns = dnsNative.promises;
const {writeFileSync, readFileSync, existsSync} = require('fs');
const {resolve} = require('path');

const DEFAULTS = {
	pages: 8,
	limit: 1000,
	timeoutMs: 5000,
	retries: 1,
	retryDelayMs: 300,
	concurrency: 8,
	pageSize: 200,
	mirrorProbeTimeoutMs: 5000,
};

const USER_AGENT = 'spiritbox-station-grabber/1.0 (+https://github.com/nzskeptics/spiritbox)';
let radioBrowserApiPromise = null;

// Prefer IPv4 first to reduce timeouts in environments with flaky IPv6 routing.
try {
	dnsNative.setDefaultResultOrder('ipv4first');
} catch {}

function getSharedRadioBrowserApi() {
	if (!radioBrowserApiPromise) {
		radioBrowserApiPromise = import('./js/radioBrowserApi.mjs');
	}
	return radioBrowserApiPromise;
}

function getArgValue(name) {
	const prefix = `--${name}=`;
	const match = process.argv.find((arg) => arg.startsWith(prefix));
	if (!match) return null;
	return match.slice(prefix.length);
}

function hasFlag(name) {
	return process.argv.includes(`--${name}`);
}

function printHelp() {
	console.log('Usage: node ./getstations.js [options]');
	console.log('');
	console.log('Options:');
	console.log(`  --pages=<n>         API batches to fetch (${DEFAULTS.pageSize} each, default: ${DEFAULTS.pages})`);
	console.log(`  --limit=<n>         Stations to test after scrape (default: ${DEFAULTS.limit})`);
	console.log('  --all               Test all scraped stations (overrides --limit)');
	console.log(`  --timeout=<ms>      HEAD request timeout in ms (default: ${DEFAULTS.timeoutMs})`);
	console.log(`  --retries=<n>       Retries per station check (default: ${DEFAULTS.retries})`);
	console.log(`  --retryDelay=<ms>   Delay between retries (default: ${DEFAULTS.retryDelayMs})`);
	console.log(`  --concurrency=<n>   Parallel station checks (default: ${DEFAULTS.concurrency})`);
	console.log('  --help              Show this help');
	console.log('');
	console.log('Examples:');
	console.log('  node ./getstations.js');
	console.log('  node ./getstations.js --pages=1 --limit=25');
	console.log('  node ./getstations.js --all --concurrency=12');
}

function parsePositiveInt(name, fallback) {
	const raw = getArgValue(name);
	if (!raw) return fallback;
	const parsed = Number.parseInt(raw, 10);
	if (!Number.isInteger(parsed) || parsed <= 0) {
		throw new Error(`Invalid value for --${name}: ${raw}. Expected a positive integer.`);
	}
	return parsed;
}

function parseNonNegativeInt(name, fallback) {
	const raw = getArgValue(name);
	if (!raw) return fallback;
	const parsed = Number.parseInt(raw, 10);
	if (!Number.isInteger(parsed) || parsed < 0) {
		throw new Error(`Invalid value for --${name}: ${raw}. Expected a non-negative integer.`);
	}
	return parsed;
}

function delay(ms) {
	return new Promise((resolveFn) => setTimeout(resolveFn, ms));
}

function requestText(url, options = {}) {
	const {
		method = 'GET',
		headers = {},
		timeoutMs = 10000,
		family,
	} = options;

	return new Promise((resolvePromise, rejectPromise) => {
		let parsed;
		try {
			parsed = new URL(url);
		} catch (error) {
			rejectPromise(error);
			return;
		}

		const transport = parsed.protocol === 'https:' ? https : http;
		const req = transport.request({
			protocol: parsed.protocol,
			hostname: parsed.hostname,
			port: parsed.port || undefined,
			path: `${parsed.pathname}${parsed.search}`,
			method,
			headers,
			family,
		}, (res) => {
			res.setEncoding('utf8');
			let body = '';
			res.on('data', (chunk) => {
				body += chunk;
			});
			res.on('end', () => {
				resolvePromise({
					statusCode: Number(res.statusCode) || 0,
					headers: res.headers,
					body,
				});
			});
		});

		req.setTimeout(timeoutMs, () => {
			req.destroy(new Error(`Request timed out after ${timeoutMs}ms`));
		});

		req.on('error', (error) => rejectPromise(error));
		req.end();
	});
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 10000) {
	const controller = new AbortController();
	const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
	try {
		return await fetch(url, {...options, signal: controller.signal});
	} finally {
		clearTimeout(timeoutId);
	}
}

function shuffle(array) {
	const copy = [...array];
	for (let i = copy.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[copy[i], copy[j]] = [copy[j], copy[i]];
	}
	return copy;
}

function sanitizeHttpUrl(value, {allowPlaylist = false} = {}) {
	if (typeof value !== 'string') return null;
	const trimmed = value.trim();
	if (!trimmed) return null;
	let parsed;
	try {
		parsed = new URL(trimmed);
	} catch {
		return null;
	}
	if (!['http:', 'https:'].includes(parsed.protocol)) return null;
	const pathname = parsed.pathname.toLowerCase();
	if (!allowPlaylist && (pathname.endsWith('.m3u') || pathname.endsWith('.pls') || pathname.endsWith('.asx'))) return null;
	parsed.hash = '';
	return parsed.toString();
}

function sanitizeName(value) {
	if (typeof value !== 'string') return null;
	const name = value.replace(/\s+/g, ' ').trim();
	if (!name) return null;
	return name;
}

function normalizeStation(station) {
	if (!station || typeof station !== 'object') return null;
	const name = sanitizeName(station.name);
	const url = sanitizeHttpUrl(station.url);
	if (!name || !url) return null;
	const website = sanitizeHttpUrl(station.website, {allowPlaylist: true}) || '';
	return {name, website, url};
}

function curateStations(stations) {
	const deduped = [];
	const seen = new Set();
	for (const station of stations) {
		const normalized = normalizeStation(station);
		if (!normalized) continue;
		if (seen.has(normalized.url)) continue;
		seen.add(normalized.url);
		deduped.push(normalized);
	}
	return deduped;
}

function normalizeMirrorBase(value) {
	if (typeof value !== 'string') return null;
	const trimmed = value.trim();
	if (!trimmed) return null;
	let parsed;
	try {
		parsed = new URL(trimmed);
	} catch {
		return null;
	}
	if (!['http:', 'https:'].includes(parsed.protocol)) return null;
	parsed.hash = '';
	parsed.search = '';
	let pathname = parsed.pathname.replace(/\/+$/, '');
	if (!pathname.endsWith('/json')) {
		pathname = `${pathname}/json`.replace(/\/\/+/, '/');
	}
	return `${parsed.origin}${pathname}`;
}

function uniqueMirrors(values) {
	const seen = new Set();
	const out = [];
	for (const value of values) {
		const normalized = normalizeMirrorBase(value);
		if (!normalized || seen.has(normalized)) continue;
		seen.add(normalized);
		out.push(normalized);
	}
	return out;
}

function loadMirrorCache(cacheFile) {
	if (!existsSync(cacheFile)) return {mirrors: [], lastGoodMirror: null};
	try {
		const raw = readFileSync(cacheFile, 'utf8');
		const parsed = JSON.parse(raw);
		return {
			mirrors: uniqueMirrors(parsed?.mirrors || []),
			lastGoodMirror: normalizeMirrorBase(parsed?.lastGoodMirror) || null,
		};
	} catch {
		return {mirrors: [], lastGoodMirror: null};
	}
}

function saveMirrorCache(cacheFile, payload) {
	const mirrors = uniqueMirrors(payload?.mirrors || []);
	const lastGoodMirror = normalizeMirrorBase(payload?.lastGoodMirror) || null;
	const cachePayload = {
		updatedAt: new Date().toISOString(),
		lastGoodMirror,
		mirrors,
	};
	writeFileSync(cacheFile, JSON.stringify(cachePayload, null, '\t'));
}

async function discoverMirrorsFromSrv() {
	try {
		const srv = await dns.resolveSrv('_api._tcp.radio-browser.info');
		const hosts = srv.map((record) => record.name).filter(Boolean);
		return uniqueMirrors(shuffle(hosts).map((host) => `https://${host}`));
	} catch {
		return [];
	}
}

async function discoverMirrorsFromAllHost() {
	try {
		const allHosts = await dns.resolve4('all.api.radio-browser.info');
		const names = [];
		for (const host of allHosts) {
			try {
				const reversed = await dns.reverse(host);
				for (const name of reversed) {
					if (name.endsWith('.api.radio-browser.info')) names.push(name);
				}
			} catch {}
		}
		return uniqueMirrors(shuffle([...new Set(names)]).map((name) => `https://${name}`));
	} catch {
		return [];
	}
}

async function discoverMirrorsFromApiDirectory(sharedApi) {
	try {
		const directoryUrl = `${sharedApi.RADIO_BROWSER_API_BASE}/servers`;
		const response = await sharedApi.fetchWithTimeout(directoryUrl, {
			method: 'GET',
			headers: {accept: 'application/json', 'User-Agent': USER_AGENT},
			mode: 'cors',
		}, 8000);
		if (!response.ok) return [];
		const json = await response.json();
		if (!Array.isArray(json)) return [];
		const mirrors = [];
		for (const item of json) {
			if (typeof item === 'string') {
				mirrors.push(item.startsWith('http') ? item : `https://${item}`);
				continue;
			}
			if (!item || typeof item !== 'object') continue;
			if (typeof item.url === 'string') mirrors.push(item.url);
			if (typeof item.name === 'string') mirrors.push(`https://${item.name}`);
		}
		return uniqueMirrors(mirrors);
	} catch {
		return [];
	}
}

async function fetchStationsFromRadioBrowser(sharedApi, options = {}) {
	const {
		base = sharedApi.RADIO_BROWSER_API_BASE,
		limit = DEFAULTS.pageSize,
		offset = 0,
		timeoutMs = 15000,
		retries = 1,
		retryDelayMs = 300,
	} = options;

	const params = new URLSearchParams({
		order: 'clickcount',
		reverse: 'true',
		hidebroken: 'true',
		has_extended_info: 'true',
		limit: String(limit),
		offset: String(offset),
	});
	const url = `${base}/stations?${params.toString()}`;
	let lastError = null;
	for (let attempt = 0; attempt <= retries; attempt++) {
		try {
			const response = await requestText(url, {
				method: 'GET',
				timeoutMs,
				family: 4,
				headers: {
					accept: 'application/json',
					'User-Agent': USER_AGENT,
				},
			});
			if (response.statusCode < 200 || response.statusCode >= 300) {
				throw new Error(`HTTP ${response.statusCode}`);
			}
			const json = JSON.parse(response.body);
			return {
				url,
				stations: sharedApi.normalizeRemoteStations(json),
			};
		} catch (error) {
			lastError = error;
			if (attempt < retries) await delay(retryDelayMs);
		}
	}

	throw lastError || new Error('Failed to fetch Radio Browser stations');
}

async function probeMirror(sharedApi, base, timeoutMs) {
	const startedAt = Date.now();
	try {
		await fetchStationsFromRadioBrowser(sharedApi, {
			base,
			limit: 1,
			offset: 0,
			timeoutMs,
			retries: 0,
			retryDelayMs: 0,
		});
		return {ok: true, elapsedMs: Date.now() - startedAt, error: null};
	} catch (error) {
		const causeCode = error?.cause?.code || error?.code || '';
		const causeMessage = error?.cause?.message || '';
		const message = error?.message || 'unknown error';
		const errorSummary = [causeCode, causeMessage || message].filter(Boolean).join(' ');
		return {
			ok: false,
			elapsedMs: Date.now() - startedAt,
			error: errorSummary || message,
		};
	}
}

async function resolveRadioBrowserMirrors({sharedApi, cacheFile, probeTimeoutMs}) {
	const cache = loadMirrorCache(cacheFile);
	const fromSrv = await discoverMirrorsFromSrv();
	const fromAllHost = await discoverMirrorsFromAllHost();
	const fromApi = await discoverMirrorsFromApiDirectory(sharedApi);
	const discovered = uniqueMirrors([...fromSrv, ...fromAllHost, ...fromApi]);
	const candidates = uniqueMirrors([
		cache.lastGoodMirror,
		...discovered,
		...cache.mirrors,
		sharedApi.RADIO_BROWSER_API_BASE,
	]);

	let workingMirror = null;
	for (const mirror of candidates) {
		const probe = await probeMirror(sharedApi, mirror, probeTimeoutMs);
		if (!probe.ok) {
			console.log(`Mirror probe failed: ${mirror} (${probe.elapsedMs}ms) ${probe.error}`);
			continue;
		}
		console.log(`Mirror probe ok: ${mirror} (${probe.elapsedMs}ms)`);
		workingMirror = mirror;
		break;
	}

	const orderedMirrors = workingMirror
		? [workingMirror, ...candidates.filter((item) => item !== workingMirror)]
		: candidates;

	saveMirrorCache(cacheFile, {
		lastGoodMirror: workingMirror,
		mirrors: uniqueMirrors([...discovered, ...orderedMirrors]),
	});

	return {
		workingMirror,
		orderedMirrors,
		discoveryCounts: {
			srv: fromSrv.length,
			allHost: fromAllHost.length,
			apiDirectory: fromApi.length,
			cached: cache.mirrors.length,
			candidates: candidates.length,
		},
	};
}

async function getRadioBrowserServers() {
	const sharedApi = await getSharedRadioBrowserApi();
	const cacheFile = resolve(__dirname, 'data', 'radio-browser-mirrors.json');
	const resolution = await resolveRadioBrowserMirrors({
		sharedApi,
		cacheFile,
		probeTimeoutMs: DEFAULTS.mirrorProbeTimeoutMs,
	});
	const picked = resolution.workingMirror || 'none';
	const counts = resolution.discoveryCounts;
	console.log(
		`Mirror discovery: srv=${counts.srv}, allHost=${counts.allHost}, apiDirectory=${counts.apiDirectory}, cached=${counts.cached}, candidates=${counts.candidates}, selected=${picked}`
	);
	return resolution.orderedMirrors;
}

async function checkStation(station, options) {
	const {timeoutMs, retries, retryDelayMs} = options;
	for (let attempt = 0; attempt <= retries; attempt++) {
		try {
			const headResponse = await fetchWithTimeout(station.url, {
				method: 'HEAD',
				redirect: 'follow',
				headers: {'User-Agent': USER_AGENT},
			}, timeoutMs);
			if (headResponse.status >= 200 && headResponse.status < 400) {
				return true;
			}
			throw new Error(`HEAD HTTP ${headResponse.status}`);
		} catch {
			try {
				const getResponse = await fetchWithTimeout(station.url, {
					method: 'GET',
					redirect: 'follow',
					headers: {
						Range: 'bytes=0-1',
						'User-Agent': USER_AGENT,
					},
				}, timeoutMs);
				if (getResponse.status >= 200 && getResponse.status < 500) {
					try {
						await getResponse.body?.cancel?.();
					} catch {}
					return true;
				}
			} catch {}
			const isLastAttempt = attempt === retries;
			if (isLastAttempt) return false;
			console.log(`Retrying ${station.name} (${attempt + 1}/${retries}) after ${retryDelayMs}ms`);
			await delay(retryDelayMs);
		}
	}
	return false;
}

async function getStationsBatch(offset, pageSize, serverBases) {
	const sharedApi = await getSharedRadioBrowserApi();
	let lastError = null;
	for (const base of serverBases) {
		try {
			const result = await fetchStationsFromRadioBrowser(sharedApi, {
				base,
				limit: pageSize,
				offset,
				timeoutMs: 15000,
				retries: 1,
				retryDelayMs: 300,
			});
			return result.stations;
		} catch (error) {
			lastError = error;
			console.log(`Radio Browser mirror failed: ${base}`);
		}
	}
	throw lastError || new Error('No Radio Browser mirror available');
}

function decodeHtmlEntities(value) {
	if (typeof value !== 'string' || !value.length) return '';
	const named = {
		amp: '&',
		lt: '<',
		gt: '>',
		quot: '"',
		apos: "'",
		nbsp: ' ',
	};
	return value.replace(/&(#\d+|#x[0-9a-fA-F]+|[a-zA-Z]+);/g, (full, token) => {
		if (token[0] === '#') {
			const isHex = token[1]?.toLowerCase() === 'x';
			const raw = isHex ? token.slice(2) : token.slice(1);
			const codePoint = Number.parseInt(raw, isHex ? 16 : 10);
			if (!Number.isFinite(codePoint)) return full;
			try {
				return String.fromCodePoint(codePoint);
			} catch {
				return full;
			}
		}
		return Object.prototype.hasOwnProperty.call(named, token) ? named[token] : full;
	});
}

function stripTags(value) {
	if (typeof value !== 'string') return '';
	return decodeHtmlEntities(value.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
}

async function getStationsFromInternetRadio(pageNumber) {
	const url = `https://www.internet-radio.com/stations/talk/page${pageNumber}?sortby=listeners`;
	const page = await requestText(url, {
		method: 'GET',
		timeoutMs: 15000,
		headers: {'User-Agent': USER_AGENT},
	});
	if (page.statusCode < 200 || page.statusCode >= 300) {
		throw new Error(`HTTP ${page.statusCode}`);
	}

	const html = page.body;
	const streamMap = new Map();
	const streamRegex = /var\s+stream([0-9]{1,2})\s*=\s*\{[\s\S]*?mp3:\s*"(.*?)"/g;
	let streamMatch;
	while ((streamMatch = streamRegex.exec(html))) {
		streamMap.set(streamMatch[1], decodeHtmlEntities(streamMatch[2].replace('stream/1', '')));
	}

	const stations = [];
	const rowRegex = /<tr[\s\S]*?<\/tr>/g;
	let rowMatch;
	while ((rowMatch = rowRegex.exec(html))) {
		const row = rowMatch[0];
		const idMatch = row.match(/id\s*=\s*"play_nohtml5_([0-9]{1,2})"/i);
		if (!idMatch) continue;
		const stream = streamMap.get(idMatch[1]);
		if (!stream) continue;
		const nameMatch = row.match(/class\s*=\s*"text-danger"[^>]*>([\s\S]*?)<\/[^>]+>/i);
		const websiteMatch = row.match(/class\s*=\s*"small\s+text-success"[^>]*href\s*=\s*"([^"]*)"/i);
		stations.push({
			name: stripTags(nameMatch?.[1] || ''),
			website: decodeHtmlEntities((websiteMatch?.[1] || '').trim()),
			url: stream,
		});
	}

	return stations.filter(Boolean);
}

async function getAll(options = {}) {
	const {
		pages = DEFAULTS.pages,
		limit = DEFAULTS.limit,
		timeoutMs = DEFAULTS.timeoutMs,
		retries = DEFAULTS.retries,
		retryDelayMs = DEFAULTS.retryDelayMs,
		concurrency = DEFAULTS.concurrency,
	} = options;
	const stationsFile = resolve(__dirname, 'data', 'stations.json');
	const stations = [];
	const radioBrowserServers = await getRadioBrowserServers();
	console.log(`Radio Browser servers: ${radioBrowserServers.length}`);
	for (let page = 1; page <= pages; page++) {
		const offset = (page - 1) * DEFAULTS.pageSize;
		let batch = [];
		try {
			console.log(`Getting Radio Browser batch ${page}/${pages} (offset ${offset})`);
			batch = await getStationsBatch(offset, DEFAULTS.pageSize, radioBrowserServers);
		} catch (error) {
			console.log(`Radio Browser unavailable, falling back to internet-radio page ${page}: ${error.message || error}`);
			batch = await getStationsFromInternetRadio(page);
		}
		stations.push(...batch);
	}
	const curatedStations = curateStations(stations);
	const shuffledStations = shuffle(curatedStations);
	const selectedStations = Number.isFinite(limit) ? shuffledStations.slice(0, limit) : shuffledStations;
	console.log(`Collected ${stations.length} stations; curated to ${curatedStations.length}; testing ${selectedStations.length} with concurrency ${concurrency}.`);
	const cors = [];
	let cursor = 0;
	const workerCount = Math.min(concurrency, selectedStations.length || 1);
	const workers = Array.from({length: workerCount}, async () => {
		while (true) {
			const index = cursor;
			cursor += 1;
			if (index >= selectedStations.length) break;
			const station = selectedStations[index];
			console.log(`Testing [${index + 1}/${selectedStations.length}]`, station.name);
			const ok = await checkStation(station, {timeoutMs, retries, retryDelayMs});
			if (ok) cors.push(station);
		}
	});
	await Promise.all(workers);
	const finalStations = curateStations(cors);
	console.log('Writing to', stationsFile);
	writeFileSync(stationsFile, JSON.stringify(finalStations, null, '\t'));
}

async function main() {
	if (hasFlag('help')) {
		printHelp();
		return;
	}
	const pages = parsePositiveInt('pages', DEFAULTS.pages);
	const limit = hasFlag('all')
		? Number.POSITIVE_INFINITY
		: parsePositiveInt('limit', DEFAULTS.limit);
	const timeoutMs = parsePositiveInt('timeout', DEFAULTS.timeoutMs);
	const retries = parseNonNegativeInt('retries', DEFAULTS.retries);
	const retryDelayMs = parsePositiveInt('retryDelay', DEFAULTS.retryDelayMs);
	const concurrency = parsePositiveInt('concurrency', DEFAULTS.concurrency);
	console.log(`Options: pages=${pages}, limit=${Number.isFinite(limit) ? limit : 'all'}, timeout=${timeoutMs}ms, retries=${retries}, retryDelay=${retryDelayMs}ms, concurrency=${concurrency}`);
	await getAll({pages, limit, timeoutMs, retries, retryDelayMs, concurrency});
}

main().catch((error) => {
	console.error(error.message || error);
	process.exit(1);
});
