// import stations from './stations.json'
const audioContext = new AudioContext();
audioContext.createGain();
const bufferSize = 4096;
function noise() {
	const factors = [
		[0, 0.99886, 0.0555179],
		[0, 0.96900, 0.0750759],
		[0, 0.96900, 0.1538520],
		[0, 0.86650, 0.3104856],
		[0, 0.55000, 0.5329522],
		[0, -0.7616, 0.0168980],
	];
	var node = audioContext.createScriptProcessor(bufferSize, 1, 1);
	node.onaudioprocess = function(e) {
		const output = e.outputBuffer.getChannelData(0);
		for (var i = 0; i < bufferSize; i++) {
			const white = Math.random() * 2 - 1;
			for (const factor of factors) {
				factor[0] = factor[0] * factor[1] + white * factor[2];
			}
			output[i] = factors.reduce((sum, [value]) => sum + value, 0) + white * 0.5362;
			output[i] *= 0.11;
			factors[5][0] = white * 0.115926;
		}
	};
	return node;
}
// noise.connect(audioContext.destination);
// import {createApp} from 'https://unpkg.com/petite-vue?module';
import {createApp} from './petite-vue.es.js?v=20261020';

const UI_CONFIG = {
	// step = instant jumps, smooth = CSS easing, analog = eased + slight wobble
	needleMotion: 'analog',
};

function normalizeNeedleMotion(value) {
	if (['step', 'smooth', 'analog'].includes(value)) return value;
	return 'analog';
}

const debugEnabled = new URLSearchParams(window.location.search).has('debug')
	|| localStorage.getItem('spiritDebug') === '1'
	|| ['localhost', '127.0.0.1'].includes(window.location.hostname);

console.info('[spirit] script loaded', {
	version: '20261020',
	debugEnabled,
	host: window.location.host,
	search: window.location.search,
	needleMotion: normalizeNeedleMotion(UI_CONFIG.needleMotion),
});

createApp({
	debug: debugEnabled,
	needleMotion: normalizeNeedleMotion(UI_CONFIG.needleMotion),
	tuneDisplayPercent: 0,
	needleFrame: null,
	number: 6,
	volume: 50,
	ms: 300,
	index: 0,
	allStations: null,
	interval: null,
	play: false,
	times: [200, 400, 600, 800, 1000],
	dbg(...args) {
		if (!this.debug) return;
		console.log('[spirit]', ...args);
	},
	get stationDigits() {
		return Array.from({length: this.number}, (_, i) => i + 1);
	},
	get barPrimary() {
		return '|'.repeat(512);
	},
	get barSecondary() {
		return Array.from({length: 64}, () => '....|').join('') + '....';
	},
	get stations() {
		return this.allStations?.slice(0, this.number) ?? [];
	},
	get station() {
		if (!this.play) return null;
		return this.stations?.[this.index];
	},
	get currentStationNumber() {
		return Math.min(this.number, Math.max(1, this.index + 1));
	},
	get tunePercent() {
		if (this.number <= 1) return 0;
		const clamped = Math.min(this.number - 1, Math.max(0, this.index));
		return (clamped / (this.number - 1)) * 100;
	},
	get needleMotionClass() {
		return `motion-${this.needleMotion}`;
	},
	get needleStyle() {
		return {left: `${this.tuneDisplayPercent}%`};
	},
	syncNeedle() {
		const target = this.tunePercent;
		if (this.needleMotion === 'step' || this.needleMotion === 'smooth') {
			if (this.needleFrame) cancelAnimationFrame(this.needleFrame);
			this.needleFrame = null;
			this.tuneDisplayPercent = target;
			return;
		}
		this.animateNeedle(target);
	},
	animateNeedle(target) {
		if (this.needleFrame) cancelAnimationFrame(this.needleFrame);
		const start = this.tuneDisplayPercent;
		const delta = target - start;
		if (Math.abs(delta) < 0.1) {
			this.tuneDisplayPercent = target;
			this.needleFrame = null;
			return;
		}
		const startTime = performance.now();
		const duration = 260 + Math.min(240, Math.abs(delta) * 8);
		const step = (now) => {
			const t = Math.min(1, (now - startTime) / duration);
			const eased = 1 - Math.pow(1 - t, 3);
			const wobble = Math.sin(t * Math.PI * 4) * (1 - t) * 0.6;
			this.tuneDisplayPercent = start + delta * eased + wobble;
			if (t < 1) {
				this.needleFrame = requestAnimationFrame(step);
				return;
			}
			this.tuneDisplayPercent = target;
			this.needleFrame = null;
		};
		this.needleFrame = requestAnimationFrame(step);
	},
	onPlayClick() {
		this.dbg('play button clicked', {
			play: this.play,
			loadedStations: this.allStations?.length ?? 0,
			activeStations: this.stations.length,
		});
		this.playPause();
	},
	retune() {
		clearInterval(this.interval);
		if (!this.play || !this.stations.length) {
			this.dbg('retune skipped', {play: this.play, stations: this.stations.length});
			return;
		}
		this.dbg('retune started', {ms: this.ms, stations: this.stations.length});
		this.interval = setInterval(() => {
			const count = this.stations.length;
			let next = Math.floor(Math.random() * count);
			if (count > 1) {
				while (next === this.index) {
					next = Math.floor(Math.random() * count);
				}
			}
			this.index = next;
			this.syncNeedle();
			this.dbg('retune tick', {index: this.index, name: this.station?.name, url: this.station?.url});
			this.unmute(this.index);
		}, this.ms);
	},
	getAudio(index) {
		return document.querySelector(`#audioBank audio[data-audio-index="${index}"]`);
	},
	setAudioVolume(index, value) {
		const audio = this.getAudio(index);
		if (!audio) {
			this.dbg('audio ref missing', {index, value});
			return;
		}
		audio.muted = value === 0;
		audio.volume = value;
		this.dbg('set volume', {index, value, paused: audio.paused});
		if (audio.paused) {
			const playPromise = audio.play?.();
			if (playPromise?.catch) {
				playPromise.catch((error) => {
					this.dbg('play() rejected', {index, message: error?.message ?? String(error)});
				});
			}
		}
	},
	startAllStreams() {
		this.dbg('startAllStreams', {count: this.stations.length});
		for (const i of this.stations.keys()) {
			this.setAudioVolume(i, 0);
		}
		this.attachAudioDebugListeners();
	},
	attachAudioDebugListeners() {
		if (!this.debug) return;
		for (const i of this.stations.keys()) {
			const audio = this.getAudio(i);
			if (!audio || audio.dataset.debugWired === '1') continue;
			audio.dataset.debugWired = '1';
			for (const eventName of ['playing', 'pause', 'stalled', 'waiting', 'error', 'canplay']) {
				audio.addEventListener(eventName, () => {
					this.dbg('audio event', {
						event: eventName,
						index: i,
						src: audio.currentSrc || audio.src,
						readyState: audio.readyState,
						networkState: audio.networkState,
						error: audio.error?.message || audio.error?.code || null,
					});
				});
			}
		}
	},
	stopAllStreams() {
		this.dbg('stopAllStreams', {count: this.number});
		for (let i = 0; i < this.number; i++) {
			const audio = this.getAudio(i);
			if (!audio) continue;
			audio.muted = true;
			audio.volume = 0;
			audio.pause?.();
		}
	},
	unmute(index) {
		if (!this.play || !this.stations.length) {
			this.dbg('unmute skipped', {play: this.play, stations: this.stations.length});
			return;
		}
		for (const i of this.stations.keys()) {
			this.setAudioVolume(i, 0);
		}
		this.dbg('unmute index', {index, name: this.stations[index]?.name, url: this.stations[index]?.url, volume: this.volume});
		this.setAudioVolume(index, this.volume / 100);
	},
	updateVolume() {
		if (!this.play) return;
		this.dbg('volume changed', {volume: this.volume, index: this.index});
		this.unmute(this.index);
	},
	updateStationCount() {
		const stationCount = Math.min(this.number, this.allStations?.length ?? 0);
		this.dbg('station count changed', {number: this.number, stationCount});
		if (!stationCount) return;
		if (this.index >= stationCount) this.index = 0;
		this.syncNeedle();
		if (this.play) {
			queueMicrotask(() => {
				this.startAllStreams();
				this.unmute(this.index);
			});
		}
		this.retune();
	},
	shuffle() {
		if (!this.allStations?.length) return;
		this.allStations = this.allStations.sort(() => Math.random() - 0.5);
		this.dbg('stations shuffled', {count: this.allStations.length});
	},
	playPause() {
		if (!this.allStations?.length) return;
		if (this.play) {
			this.dbg('playPause -> stop');
			clearInterval(this.interval);
			this.interval = null;
			this.stopAllStreams();
			this.play = false;
			return;
		}
		this.dbg('playPause -> play', {stations: this.stations.length, ms: this.ms, volume: this.volume});
		this.play = true;
		this.shuffle();
		queueMicrotask(() => {
			this.startAllStreams();
			this.unmute(this.index);
			this.retune();
		});
	},
	mounted() {
		this.dbg('mounted', {debug: this.debug, hint: 'Use ?debug in URL or localStorage.spiritDebug=1'});
		this.syncNeedle();
		if (this.debug) {
			window.addEventListener('click', (event) => {
				const target = event.target;
				this.dbg('window click', {
					tag: target?.tagName,
					id: target?.id || null,
					className: target?.className || null,
				});
			});
			setInterval(() => {
				this.dbg('heartbeat', {
					play: this.play,
					index: this.index,
					stations: this.stations.length,
					intervalActive: !!this.interval,
				});
			}, 2000);
		}
		fetch("./stations.json?v=20261020")
			.then((response) => response.json())
			.then((json) => {
				this.allStations = json;
				this.dbg('stations loaded', {count: this.allStations.length});
				const playButton = document.getElementById('playButton');
				if (playButton && this.debug) {
					playButton.addEventListener('click', () => {
						this.dbg('native play button click observed');
					});
				}
				if (this.number > this.allStations.length) {
					this.number = this.allStations.length;
				}
				this.syncNeedle();
			})
			.catch((error) => {
				console.error('Failed to load stations.json', error);
				this.dbg('stations load failed', {message: error?.message ?? String(error)});
				this.allStations = [];
			});
	},
}).mount();
