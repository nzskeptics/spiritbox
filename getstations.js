const axios = require("axios");
const cheerio = require('cheerio');
const {writeFileSync} = require('fs');
const {resolve} = require('path');

const DEFAULTS = {
	pages: 3,
	limit: Number.POSITIVE_INFINITY,
	timeoutMs: 5000,
	retries: 1,
	retryDelayMs: 300,
	concurrency: 8,
};

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
	console.log(`  --pages=<n>         Pages to scrape (default: ${DEFAULTS.pages})`);
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

async function checkStation(station, options) {
	const {timeoutMs, retries, retryDelayMs} = options;
	for (let attempt = 0; attempt <= retries; attempt++) {
		try {
			await axios.head(station.url, {
				timeout: timeoutMs,
				maxRedirects: 5,
				validateStatus: (status) => status >= 200 && status < 400,
			});
			return true;
		} catch (error) {
			const isLastAttempt = attempt === retries;
			if (isLastAttempt) return false;
			console.log(`Retrying ${station.name} (${attempt + 1}/${retries}) after ${retryDelayMs}ms`);
			await delay(retryDelayMs);
		}
	}
	return false;
}

async function getStations(url) {
	const page = await axios.get(url);
	const $ = cheerio.load(page.data);
	var matches = [];
	var regex = /var stream([0-9]{1,2}) = {\n\t       mp3: "(.*?)"/g;
	let match;
	while ((match = regex.exec(page.data))) {
		matches.push({id: match[1], url: match[2].replace('stream/1', '')});
	}
	//return page.data.match(/var stream([0-9]{1,2}) = {\n\t       mp3: "(.*?)"/g);
	var stations = $('tr', page.data).get().map(item => {
		var id = $('td', item)[0].attribs.id.replace('play_nohtml5_', '');
		if (matches.find(match => match.id == id)) {
			return {
				// id: id,
				name: $('.text-danger', item).text(),
				website: $('.small.text-success', item).attr("href"),
				url: matches.find(match => match.id == id).url
			};
		}
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
	for (let page = 1; page <= pages; page++) {
		const url = `https://www.internet-radio.com/stations/talk/page${page}?sortby=listeners`;
		console.log('Getting', url);
		stations.push(...await getStations(url));
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
