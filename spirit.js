// import stations from './stations.json'
const audioContext = new AudioContext();
audioContext.createGain();
const bufferSize = 4096;
function noise(profile) {
	const lowpass = profile.lowpass;
	const hiss = profile.hiss;
	const crackleChance = profile.crackleChance;
	let last = 0;
	const node = audioContext.createScriptProcessor(bufferSize, 1, 1);
	node.onaudioprocess = function(e) {
		const output = e.outputBuffer.getChannelData(0);
		for (let i = 0; i < bufferSize; i++) {
			const white = Math.random() * 2 - 1;
			last = last * lowpass + white * (1 - lowpass);
			let sample = last * (1 - hiss) + white * hiss;
			if (Math.random() < crackleChance) {
				sample += (Math.random() * 2 - 1) * 0.65;
			}
			output[i] = sample;
		}
	};
	return node;
}
// noise.connect(audioContext.destination);
// import {createApp} from 'https://unpkg.com/petite-vue?module';
import {createApp} from './petite-vue.es.js?v=20261021';

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
	version: '20261021',
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
	transitionMs: 300,
	fadeToken: 0,
	staticRatio: 50,
	jitterMs: 50,
	isStatic: false,
	staticPosition: 0,
	staticNode: null,
	staticFilter: null,
	staticGain: null,
	staticLevelFactor: 0.28,
	number: 12,
	volume: 50,
	ms: 300,
	index: 0,
	allStations: null,
	retuneTimer: null,
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
		if (!this.play || this.isStatic) return null;
		return this.stations?.[this.index];
	},
	get currentStationNumber() {
		if (this.isStatic) return 0;
		return Math.min(this.number, Math.max(1, this.index + 1));
	},
	get tunePercent() {
		if (this.number <= 1) return 0;
		const source = this.isStatic ? this.staticPosition : this.index;
		const clamped = Math.min(this.number - 1, Math.max(0, source));
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
			isStatic: this.isStatic,
			loadedStations: this.allStations?.length ?? 0,
			activeStations: this.stations.length,
		});
		this.playPause();
	},
	async ensureAudioContext() {
		if (audioContext.state !== 'running') {
			try {
				await audioContext.resume();
				this.dbg('audioContext resumed', {state: audioContext.state});
			} catch (error) {
				this.dbg('audioContext resume failed', {message: error?.message ?? String(error)});
			}
		}
	},
	chooseNextIndex() {
		const count = this.stations.length;
		let next = Math.floor(Math.random() * count);
		if (count > 1 && !this.isStatic) {
			while (next === this.index) {
				next = Math.floor(Math.random() * count);
			}
		}
		return next;
	},
	chooseStaticPosition() {
		if (this.number <= 1) return 0;
		const base = Math.floor(Math.random() * (this.number - 1));
		const between = 0.15 + Math.random() * 0.7;
		return base + between;
	},
	shouldPlayStatic() {
		if (!this.play || !this.stations.length) return false;
		if (this.staticRatio <= 0) return false;
		return Math.random() * 100 < this.staticRatio;
	},
	clampVolume(value) {
		return Math.max(0, Math.min(1, value));
	},
	beginTransition() {
		this.fadeToken += 1;
		return this.fadeToken;
	},
	fadeStation(index, target, durationMs, token) {
		const audio = this.getAudio(index);
		if (!audio) return;
		const to = this.clampVolume(target);
		const from = audio.muted ? 0 : this.clampVolume(audio.volume);
		if (Math.abs(from - to) < 0.002) {
			this.setAudioVolume(index, to);
			return;
		}
		audio.muted = false;
		if (audio.paused) {
			const playPromise = audio.play?.();
			if (playPromise?.catch) {
				playPromise.catch((error) => {
					this.dbg('play() rejected', {index, message: error?.message ?? String(error)});
				});
			}
		}
		const start = performance.now();
		const step = (now) => {
			if (token !== this.fadeToken) return;
			const t = durationMs <= 0 ? 1 : Math.min(1, (now - start) / durationMs);
			const eased = t * (2 - t);
			const value = this.clampVolume(from + (to - from) * eased);
			audio.volume = value;
			audio.muted = value <= 0.001;
			if (t < 1) {
				requestAnimationFrame(step);
			}
		};
		requestAnimationFrame(step);
	},
	fadeStaticGain(target, durationMs, token, stopWhenSilent = false) {
		if (!this.staticGain) return;
		const to = this.clampVolume(target);
		const from = this.clampVolume(this.staticGain.gain.value || 0);
		if (Math.abs(from - to) < 0.002) {
			this.staticGain.gain.value = to;
			if (stopWhenSilent && to <= 0.001 && token === this.fadeToken) this.stopStatic();
			return;
		}
		const start = performance.now();
		const step = (now) => {
			if (token !== this.fadeToken) return;
			const t = durationMs <= 0 ? 1 : Math.min(1, (now - start) / durationMs);
			const eased = t * (2 - t);
			this.staticGain.gain.value = this.clampVolume(from + (to - from) * eased);
			if (t < 1) {
				requestAnimationFrame(step);
				return;
			}
			if (stopWhenSilent && this.staticGain.gain.value <= 0.001 && token === this.fadeToken) {
				this.stopStatic();
			}
		};
		requestAnimationFrame(step);
	},
	staticTargetGain() {
		return this.clampVolume((this.volume / 100) * this.staticLevelFactor);
	},
	retuneStaticTexture() {
		if (!this.staticFilter) return;
		const now = audioContext.currentTime;
		const targetFrequency = 980 + (Math.random() - 0.5) * 220;
		const targetQ = 0.85 + Math.random() * 0.45;
		this.staticFilter.frequency.setTargetAtTime(targetFrequency, now, 0.06);
		this.staticFilter.Q.setTargetAtTime(targetQ, now, 0.08);
		this.staticLevelFactor = Math.max(0.24, Math.min(0.32, this.staticLevelFactor + (Math.random() - 0.5) * 0.03));
	},
	startStatic() {
		if (this.staticNode && this.staticFilter && this.staticGain) return;
		const profile = {
			lowpass: 0.89 + Math.random() * 0.04,
			hiss: 0.31 + Math.random() * 0.12,
			crackleChance: 0.001 + Math.random() * 0.0025,
		};
		const node = noise(profile);
		const filter = audioContext.createBiquadFilter();
		filter.type = 'bandpass';
		filter.frequency.value = 980;
		filter.Q.value = 1.0;
		const gain = audioContext.createGain();
		gain.gain.value = 0;
		node.connect(filter);
		filter.connect(gain);
		gain.connect(audioContext.destination);
		this.staticNode = node;
		this.staticFilter = filter;
		this.staticGain = gain;
		this.staticLevelFactor = 0.27 + Math.random() * 0.04;
		this.dbg('static started', {
			profile,
			filterType: filter.type,
			frequency: filter.frequency.value,
			gain: gain.gain.value,
			levelFactor: this.staticLevelFactor,
		});
	},
	stopStatic() {
		if (this.staticNode) {
			try {
				this.staticNode.disconnect();
			} catch {}
		}
		if (this.staticFilter) {
			try {
				this.staticFilter.disconnect();
			} catch {}
		}
		if (this.staticGain) {
			try {
				this.staticGain.disconnect();
			} catch {}
		}
		this.staticNode = null;
		this.staticFilter = null;
		this.staticGain = null;
	},
	playStatic() {
		const token = this.beginTransition();
		this.isStatic = true;
		this.staticPosition = this.chooseStaticPosition();
		this.syncNeedle();
		this.startStatic();
		this.retuneStaticTexture();
		for (const i of this.stations.keys()) {
			this.fadeStation(i, 0, this.transitionMs, token);
		}
		this.fadeStaticGain(this.staticTargetGain(), this.transitionMs, token);
	},
	playStation(index) {
		const token = this.beginTransition();
		const targetVolume = this.clampVolume(this.volume / 100);
		this.isStatic = false;
		this.index = index;
		this.syncNeedle();
		for (const i of this.stations.keys()) {
			this.fadeStation(i, i === index ? targetVolume : 0, this.transitionMs, token);
		}
		this.fadeStaticGain(0, this.transitionMs, token, true);
	},
	playNextSelection() {
		if (this.shouldPlayStatic()) {
			this.dbg('retune selection', {mode: 'static', ratio: this.staticRatio});
			this.playStatic();
			return;
		}
		const next = this.chooseNextIndex();
		this.dbg('retune selection', {mode: 'station', index: next, ratio: this.staticRatio});
		this.playStation(next);
	},
	nextRetuneDelay() {
		const jitter = Math.max(0, Number(this.jitterMs) || 0);
		const min = Math.max(50, this.ms - jitter);
		const max = this.ms + jitter;
		return Math.floor(min + Math.random() * (max - min + 1));
	},
	scheduleRetuneTick() {
		if (!this.play || !this.stations.length) return;
		const delay = this.nextRetuneDelay();
		this.retuneTimer = setTimeout(() => {
			this.playNextSelection();
			this.dbg('retune tick', {
				delay,
				isStatic: this.isStatic,
				index: this.index,
				name: this.station?.name,
				url: this.station?.url,
				staticPosition: this.staticPosition,
			});
			this.scheduleRetuneTick();
		}, delay);
	},
	retune() {
		clearTimeout(this.retuneTimer);
		this.retuneTimer = null;
		if (!this.play || !this.stations.length) {
			this.dbg('retune skipped', {play: this.play, stations: this.stations.length});
			return;
		}
		this.dbg('retune started', {ms: this.ms, jitterMs: this.jitterMs, stations: this.stations.length, mode: 'randomized'});
		this.scheduleRetuneTick();
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
		this.stopStatic();
		this.isStatic = false;
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
		const token = this.beginTransition();
		if (this.isStatic && this.staticGain) {
			this.fadeStaticGain(this.staticTargetGain(), 120, token);
			return;
		}
		for (const i of this.stations.keys()) {
			this.fadeStation(i, i === this.index ? this.clampVolume(this.volume / 100) : 0, 120, token);
		}
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
				if (this.isStatic) {
					this.playStatic();
				} else {
					this.unmute(this.index);
				}
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
			clearTimeout(this.retuneTimer);
			this.retuneTimer = null;
			this.stopAllStreams();
			this.play = false;
			return;
		}
		this.dbg('playPause -> play', {stations: this.stations.length, ms: this.ms, volume: this.volume});
		this.play = true;
		this.shuffle();
		queueMicrotask(() => {
			this.ensureAudioContext();
			this.startAllStreams();
			this.playNextSelection();
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
					retuneActive: !!this.retuneTimer,
				});
			}, 2000);
		}
		fetch("./stations.json?v=20261021")
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
