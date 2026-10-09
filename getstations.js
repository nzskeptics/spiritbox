const axios = require("axios");
const cheerio = require('cheerio');
const dns = require('dns').promises;
const {writeFileSync} = require('fs');
const {resolve} = require('path');

const DEFAULTS = {
	pages: 3,
	limit: Number.POSITIVE_INFINITY,
	timeoutMs: 5000,
	retries: 1,
	retryDelayMs: 300,
	concurrency: 8,
	pageSize: 200,
};

const USER_AGENT = 'spiritbox-station-grabber/1.0 (+https://github.com/nzskeptics/spiritbox)';
let radioBrowserApiPromise = null;

function getSharedRadioBrowserApi() {
	if (!radioBrowserApiPromise) {
		radioBrowserApiPromise = import('./radioBrowserApi.mjs');
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
	console.log('  --limit=<n>         Stations to test after scrape (default: all)');
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
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function shuffle(array) {
	const copy = [...array];
	for (let i = copy.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[copy[i], copy[j]] = [copy[j], copy[i]];
	}
	return copy;
}

async function getRadioBrowserServers() {
	const sharedApi = await getSharedRadioBrowserApi();
	try {
		const srv = await dns.resolveSrv('_api._tcp.radio-browser.info');
		const hosts = srv.map((record) => record.name).filter(Boolean);
		if (hosts.length) {
			return shuffle(hosts).map((host) => `https://${host}/json`);
		}
	} catch {}

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
		if (names.length) {
			return shuffle([...new Set(names)]).map((name) => `https://${name}/json`);
		}
	} catch {}

	return [sharedApi.RADIO_BROWSER_API_BASE];
}

async function checkStation(station, options) {
	const {timeoutMs, retries, retryDelayMs} = options;
	for (let attempt = 0; attempt <= retries; attempt++) {
		try {
			await axios.head(station.url, {
				timeout: timeoutMs,
				maxRedirects: 5,
				headers: {'User-Agent': USER_AGENT},
				validateStatus: (status) => status >= 200 && status < 400,
			});
			return true;
		} catch (error) {
			try {
				await axios.get(station.url, {
					timeout: timeoutMs,
					maxRedirects: 5,
					responseType: 'stream',
					headers: {Range: 'bytes=0-1', 'User-Agent': USER_AGENT},
					validateStatus: (status) => status >= 200 && status < 500,
				});
				return true;
			} catch {
				const isLastAttempt = attempt === retries;
				if (isLastAttempt) return false;
			}
			console.log(`Retrying ${station.name} (${attempt + 1}/${retries}) after ${retryDelayMs}ms`);
			await delay(retryDelayMs);
		}
	}
	return false;
}

async function getStationsBatch(offset, pageSize, serverBases) {
	const sharedApi = await getSharedRadioBrowserApi();
	const result = await sharedApi.fetchRadioBrowserStationsWithFailover({
		bases: serverBases,
		limit: pageSize,
		offset,
		timeoutMs: 15000,
		retries: 1,
		retryDelayMs: 300,
		requestInit: {
			headers: {
				accept: 'application/json',
				'User-Agent': USER_AGENT,
			},
		},
		onMirrorError(error, base) {
			console.log(`Radio Browser mirror failed: ${base}`);
		},
	});

	return result.stations;
}

async function getStationsFromInternetRadio(pageNumber) {
	const url = `https://www.internet-radio.com/stations/talk/page${pageNumber}?sortby=listeners`;
	const page = await axios.get(url, {timeout: 15000});
	const $ = cheerio.load(page.data);
	const matches = [];
	const regex = /var stream([0-9]{1,2}) = {\n\t       mp3: "(.*?)"/g;
	let match;
	while ((match = regex.exec(page.data))) {
		matches.push({id: match[1], url: match[2].replace('stream/1', '')});
	}
	const stations = $('tr', page.data).get().map((item) => {
		const id = $('td', item)[0]?.attribs?.id?.replace('play_nohtml5_', '');
		const stream = matches.find((candidate) => candidate.id === id);
		if (!stream) return null;
		return {
			name: $('.text-danger', item).text(),
			website: $('.small.text-success', item).attr('href'),
			url: stream.url,
		};
	});
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
	const stationsFile = resolve(__dirname, "stations.json");
	const stations = [];
	const seenUrls = new Set();
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
		for (const station of batch) {
			if (seenUrls.has(station.url)) continue;
			seenUrls.add(station.url);
			stations.push(station);
		}
	}
	const selectedStations = Number.isFinite(limit) ? stations.slice(0, limit) : stations;
	console.log(`Collected ${stations.length} stations; testing ${selectedStations.length} with concurrency ${concurrency}.`);
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
	console.log('Writing to', stationsFile);
	writeFileSync(stationsFile, JSON.stringify(cors, null, '\t'));
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

// mp3: "(.*?)"

// 'var stream[0-9]{1,2} = {\n	       mp3: "(.*?)"'
