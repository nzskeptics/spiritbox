const files = [
	'https://unpkg.com/petite-vue?module',
	'/spirit.js',
	'/index.html',
	'/style.css',
	'/stations.json',
	'/wood.jpg',
	'/grille.jpg',
];

self.addEventListener('install', (event) => {
	event.waitUntil(
		caches.open('v1').then((cache) => {
			return cache.addAll(files);
		})
	);
});

self.addEventListener('fetch', (event) => {
	if (!(event.request.url.startsWith('http'))) return;
	event.respondWith(
		caches.match(event.request).then((resp) => {
			return resp || fetch(event.request).then((response) => {
				return caches.open('v1').then((cache) => {
					cache.put(event.request, response.clone());
					return response;
				});
			});
		})
	);
});
