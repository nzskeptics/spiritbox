if ('serviceWorker' in navigator) {
	if (!['localhost', '127.0.0.1'].includes(window.location.hostname)) {
		navigator.serviceWorker.register('/sw.js')
		.then((reg) => {
			console.log('Registration succeeded. Scope is ' + reg.scope);
		}).catch((error) => {
			console.log('Registration failed with ' + error);
		});
	}
}
