if ('serviceWorker' in navigator) {
	const hostname = window.location.hostname;
	const isLocalhost = ['localhost', '127.0.0.1'].includes(hostname);
	const params = new URLSearchParams(window.location.search);
	const enableOnLocalhost = params.get('sw') === '1';
	if (!isLocalhost || enableOnLocalhost) {
		navigator.serviceWorker.register('./sw.js', {scope: './'})
			.then((reg) => {
				console.log('Registration succeeded. Scope is ' + reg.scope);
			})
			.catch((error) => {
				console.log('Registration failed with ' + error);
			});
	}
}
