const files = [
	'./petite-vue.es.js',
	'./spirit.js',
	'./index.html',
	'./style.css',
	'./stations.json',
	'./wood.jpg',
	'./grille.jpg',
];
const cacheName = 'v2';

self.addEventListener('install', (event) => {
	event.waitUntil(
		caches.open(cacheName).then((cache) => {
			return cache.addAll(files);
		})
	);
});

self.addEventListener('activate', (event) => {
	event.waitUntil(
		caches.keys().then((keys) => Promise.all(
			keys
				.filter((key) => key !== cacheName)
				.map((key) => caches.delete(key))
		))
	);
});

self.addEventListener('fetch', (event) => {
	if (!(event.request.url.startsWith('http'))) return;
	event.respondWith(
		caches.match(event.request).then((resp) => {
			return resp || fetch(event.request).then((response) => {
				return caches.open(cacheName).then((cache) => {
					cache.put(event.request, response.clone());
					return response;
				});
			});
		})
	);
});
