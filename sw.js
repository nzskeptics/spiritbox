const APP_SHELL_CACHE = 'spiritbox-shell-v4';
const RUNTIME_CACHE = 'spiritbox-runtime-v4';
const APP_SHELL_FILES = [
	'./',
	'./index.html',
	'./css/reset.min.css',
	'./css/style.css',
	'./js/petite-vue.es.js',
	'./js/spirit.js',
	'./js/spirit.config.js',
	'./js/radioBrowserApi.mjs',
	'./js/noise-worklet.js',
	'./data/stations.json',
	'./assets/wood.jpg',
	'./assets/grille.jpg',
	'./assets/radio.jpg',
	'./assets/logo.svg',
];

self.addEventListener('install', (event) => {
	event.waitUntil(
		caches.open(APP_SHELL_CACHE).then((cache) => {
			return cache.addAll(APP_SHELL_FILES);
		})
	);
	self.skipWaiting();
});

self.addEventListener('activate', (event) => {
	event.waitUntil(
		caches.keys().then((keys) => Promise.all(
			keys
				.filter((key) => ![APP_SHELL_CACHE, RUNTIME_CACHE].includes(key))
				.map((key) => caches.delete(key))
		))
	);
	self.clients.claim();
});

function isApiOrStreamRequest(request) {
	const url = new URL(request.url);
	if (request.destination === 'audio' || request.destination === 'video') return true;
	if (url.hostname.includes('radio-browser.info')) return true;
	if (url.pathname.includes('/json/')) return true;
	if (url.pathname.includes('/stations/search')) return true;
	return false;
}

function isLocalDataRequest(request) {
	const url = new URL(request.url);
	return url.origin === self.location.origin && url.pathname.endsWith('/data/stations.json');
}

async function networkFirst(request, cacheName) {
	const cache = await caches.open(cacheName);
	try {
		const response = await fetch(request);
		cache.put(request, response.clone());
		return response;
	} catch {
		const cached = await cache.match(request);
		if (cached) return cached;
		throw new Error('Network unavailable and no cached response');
	}
}

async function staleWhileRevalidate(request, cacheName) {
	const cache = await caches.open(cacheName);
	const cached = await cache.match(request);
	const networkPromise = fetch(request)
		.then((response) => {
			cache.put(request, response.clone());
			return response;
		})
		.catch(() => null);
	if (cached) {
		networkPromise.catch(() => {});
		return cached;
	}
	const network = await networkPromise;
	if (network) return network;
	throw new Error('Request failed and no cached response');
}

self.addEventListener('fetch', (event) => {
	const {request} = event;
	if (request.method !== 'GET') return;
	if (!(request.url.startsWith('http'))) return;

	if (isApiOrStreamRequest(request)) {
		event.respondWith(fetch(request));
		return;
	}

	if (isLocalDataRequest(request)) {
		event.respondWith(networkFirst(request, APP_SHELL_CACHE));
		return;
	}

	const destination = request.destination;
	if (request.mode === 'navigate' || destination === 'script' || destination === 'style') {
		event.respondWith(networkFirst(request, APP_SHELL_CACHE));
		return;
	}

	event.respondWith(staleWhileRevalidate(request, RUNTIME_CACHE));
});
