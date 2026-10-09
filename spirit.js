// import stations from './stations.json'
// import {createApp} from 'https://unpkg.com/petite-vue?module';
import {createApp} from './petite-vue.es.js?v=20261028';
import {RADIO_BROWSER_API_BASE, fetchRadioBrowserStationsWithFailover} from './radioBrowserApi.mjs';

const APP_CONFIG = {
	radio: {
		bases: [RADIO_BROWSER_API_BASE],
		limit: 200,
		offset: 0,
		timeoutMs: 10000,
		retries: 2,
		retryDelayMs: 350,
	},
	audio: {
		workletModule: './noise-worklet.js?v=20261028',
		streamPrewarmCount: 3,
		bufferSize: 4096,
	},
	defaults: {
		number: 12,
		volume: 50,
		ms: 300,
		staticRatio: 50,
		jitterMs: 50,
	},
	ui: {
		// step = instant jumps, smooth = CSS easing, analog = eased + slight wobble
		needleMotion: 'analog',
		transitions: {
			stationToStationMs: 520,
			stationToStaticMs: 720,
			staticToStationMs: 880,
			volumeRampMs: 180,
			keepStaticEngineWarm: true,
		},
	},
};

let audioContext = null;
let noiseWorkletReady = false;
let noiseWorkletLoadingPromise = null;

function getAudioContext() {
	if (!audioContext) {
		audioContext = new AudioContext();
	}
	return audioContext;
}

function createScriptNoiseNode(context, profile) {
	const lowpass = profile.lowpass;
	const hiss = profile.hiss;
	const crackleChance = profile.crackleChance;
	let last = 0;
	const node = context.createScriptProcessor(APP_CONFIG.audio.bufferSize, 1, 1);
	node.onaudioprocess = function(e) {
		const output = e.outputBuffer.getChannelData(0);
		for (let i = 0; i < APP_CONFIG.audio.bufferSize; i++) {
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

async function ensureNoiseWorkletLoaded(context) {
	if (!context.audioWorklet) return false;
	if (noiseWorkletReady) return true;
	if (!noiseWorkletLoadingPromise) {
		noiseWorkletLoadingPromise = context.audioWorklet
			.addModule(APP_CONFIG.audio.workletModule)
			.then(() => {
				noiseWorkletReady = true;
				return true;
			})
			.catch((error) => {
				console.warn('Falling back to ScriptProcessor static noise:', error?.message || error);
				return false;
			});
	}
	return noiseWorkletLoadingPromise;
}

function normalizeNeedleMotion(value) {
	if (['step', 'smooth', 'analog'].includes(value)) return value;
	return 'analog';
}

async function getStationsFromRadioBrowser() {
	const result = await fetchRadioBrowserStationsWithFailover({
		bases: APP_CONFIG.radio.bases,
		limit: APP_CONFIG.radio.limit,
		offset: APP_CONFIG.radio.offset,
		timeoutMs: APP_CONFIG.radio.timeoutMs,
		retries: APP_CONFIG.radio.retries,
		retryDelayMs: APP_CONFIG.radio.retryDelayMs,
	});
	const stations = result.stations;
	if (!stations.length) {
		throw new Error('No compatible stations returned');
	}
	return {stations, source: `radio-browser:${RADIO_BROWSER_API_BASE}`};
}

createApp({
	needleMotion: normalizeNeedleMotion(APP_CONFIG.ui.needleMotion),
	tuneDisplayPercent: 0,
	needleFrame: null,
	stationToStationMs: APP_CONFIG.ui.transitions.stationToStationMs,
	stationToStaticMs: APP_CONFIG.ui.transitions.stationToStaticMs,
	staticToStationMs: APP_CONFIG.ui.transitions.staticToStationMs,
	volumeRampMs: APP_CONFIG.ui.transitions.volumeRampMs,
	keepStaticEngineWarm: APP_CONFIG.ui.transitions.keepStaticEngineWarm,
	fadeToken: 0,
	staticRatio: APP_CONFIG.defaults.staticRatio,
	jitterMs: APP_CONFIG.defaults.jitterMs,
	isStatic: false,
	staticPosition: 0,
	staticNode: null,
	staticFilter: null,
	staticGain: null,
	staticInitPromise: null,
	staticLevelFactor: 0.28,
	streamPrewarmCount: APP_CONFIG.audio.streamPrewarmCount,
	number: APP_CONFIG.defaults.number,
	volume: APP_CONFIG.defaults.volume,
	ms: APP_CONFIG.defaults.ms,
	index: 0,
	allStations: null,
	retuneTimer: null,
	play: false,
	times: [200, 400, 600, 800, 1000],
	playSilently(audio) {
		if (!audio?.paused) return;
		const playPromise = audio.play?.();
		if (playPromise?.catch) playPromise.catch(() => {});
	},
	clearRetuneTimer() {
		clearTimeout(this.retuneTimer);
		this.retuneTimer = null;
	},
	applyStations(stations, source) {
		this.allStations = stations;
		if (this.number > this.allStations.length) {
			this.number = this.allStations.length;
		}
		this.syncNeedle();
	},
	async loadStations() {
		const preferFile = new URLSearchParams(window.location.search).get('source') === 'file';
		if (!preferFile) {
			try {
				const remote = await getStationsFromRadioBrowser();
				this.applyStations(remote.stations, remote.source);
				return;
			} catch (error) {
				console.warn('Remote station load failed, falling back to stations.json:', error?.message || error);
			}
		}
		try {
			const response = await fetch('./stations.json?v=20261028');
			if (!response.ok) {
				throw new Error(`HTTP ${response.status}`);
			}
			const json = await response.json();
			this.applyStations(json, 'stations.json');
		} catch (error) {
			console.error('Failed to load stations from remote API and stations.json', error);
			this.allStations = [];
		}
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
		this.playPause();
	},
	async ensureAudioContext() {
		const context = getAudioContext();
		if (context.state !== 'running') {
			try {
				await context.resume();
			} catch (error) {
				console.warn('AudioContext resume failed:', error?.message || error);
			}
		}
		try {
			await ensureNoiseWorkletLoaded(context);
		} catch (error) {
			console.warn('Noise worklet init failed:', error?.message || error);
		}
	},
	createNoiseNode(profile) {
		const context = getAudioContext();
		if (noiseWorkletReady) {
			const node = new AudioWorkletNode(context, 'spirit-noise-processor');
			node.port.postMessage({type: 'set-profile', profile});
			return node;
		}
		return createScriptNoiseNode(context, profile);
	},
	getWarmStationIndexes(anchorIndex = this.index) {
		const count = this.stations.length;
		const warmCount = Math.min(Math.max(1, this.streamPrewarmCount), count);
		const warm = new Set();
		if (!count) return warm;
		const start = Math.min(Math.max(0, anchorIndex), count - 1);
		for (let i = 0; i < warmCount; i++) {
			warm.add((start + i) % count);
		}
		return warm;
	},
	refreshStreamWarmPool(anchorIndex = this.index) {
		const warm = this.getWarmStationIndexes(anchorIndex);
		for (const i of this.stations.keys()) {
			const audio = this.getAudio(i);
			if (!audio) continue;
			if (warm.has(i)) {
				audio.muted = true;
				audio.volume = 0;
				this.playSilently(audio);
				continue;
			}
			audio.muted = true;
			audio.volume = 0;
			audio.pause?.();
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
		this.playSilently(audio);
		const start = performance.now();
		const step = (now) => {
			if (token !== this.fadeToken) return;
			const t = durationMs <= 0 ? 1 : Math.min(1, (now - start) / durationMs);
			const eased = t * (2 - t);
			const value = this.clampVolume(from + (to - from) * eased);
			audio.volume = value;
			audio.muted = value <= 0.001;
			if (t < 1) requestAnimationFrame(step);
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
		const context = getAudioContext();
		const now = context.currentTime;
		const targetFrequency = 980 + (Math.random() - 0.5) * 220;
		const targetQ = 0.85 + Math.random() * 0.45;
		this.staticFilter.frequency.setTargetAtTime(targetFrequency, now, 0.06);
		this.staticFilter.Q.setTargetAtTime(targetQ, now, 0.08);
		this.staticLevelFactor = Math.max(0.24, Math.min(0.32, this.staticLevelFactor + (Math.random() - 0.5) * 0.03));
	},
	async startStatic() {
		if (this.staticNode && this.staticFilter && this.staticGain) return;
		if (this.staticInitPromise) return this.staticInitPromise;
		this.staticInitPromise = (async () => {
			await this.ensureAudioContext();
			const context = getAudioContext();
			const profile = {
				lowpass: 0.89 + Math.random() * 0.04,
				hiss: 0.31 + Math.random() * 0.12,
				crackleChance: 0.001 + Math.random() * 0.0025,
			};
			const node = this.createNoiseNode(profile);
			const filter = context.createBiquadFilter();
			filter.type = 'bandpass';
			filter.frequency.value = 980;
			filter.Q.value = 1.0;
			const gain = context.createGain();
			gain.gain.value = 0;
			node.connect(filter);
			filter.connect(gain);
			gain.connect(context.destination);
			this.staticNode = node;
			this.staticFilter = filter;
			this.staticGain = gain;
			this.staticLevelFactor = 0.27 + Math.random() * 0.04;
		})();
		try {
			await this.staticInitPromise;
		} finally {
			this.staticInitPromise = null;
		}
	},
	stopStatic() {
		if (this.staticNode) {
			try { this.staticNode.disconnect(); } catch {}
		}
		if (this.staticFilter) {
			try { this.staticFilter.disconnect(); } catch {}
		}
		if (this.staticGain) {
			try { this.staticGain.disconnect(); } catch {}
		}
		this.staticNode = null;
		this.staticFilter = null;
		this.staticGain = null;
	},
	playStatic() {
		const wasStatic = this.isStatic;
		const token = this.beginTransition();
		this.isStatic = true;
		this.staticPosition = this.chooseStaticPosition();
		this.syncNeedle();
		const fadeMs = wasStatic ? Math.max(240, Math.floor(this.stationToStaticMs * 0.7)) : this.stationToStaticMs;
		for (const i of this.stations.keys()) {
			this.fadeStation(i, 0, fadeMs, token);
		}
		const applyStaticFade = () => {
			this.retuneStaticTexture();
			this.fadeStaticGain(this.staticTargetGain(), fadeMs, token);
		};
		if (this.staticNode && this.staticFilter && this.staticGain) {
			applyStaticFade();
			return;
		}
		this.startStatic().then(applyStaticFade).catch((error) => {
			console.warn('Static engine start failed:', error?.message || error);
		});
	},
	playStation(index) {
		const wasStatic = this.isStatic;
		const token = this.beginTransition();
		const targetVolume = this.clampVolume(this.volume / 100);
		this.isStatic = false;
		this.index = index;
		this.syncNeedle();
		this.refreshStreamWarmPool(index);
		const fadeMs = wasStatic ? this.staticToStationMs : this.stationToStationMs;
		for (const i of this.stations.keys()) {
			this.fadeStation(i, i === index ? targetVolume : 0, fadeMs, token);
		}
		this.fadeStaticGain(0, wasStatic ? fadeMs : this.stationToStationMs, token, !this.keepStaticEngineWarm);
	},
	playNextSelection() {
		if (this.shouldPlayStatic()) {
			this.playStatic();
			return;
		}
		const next = this.chooseNextIndex();
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
			this.scheduleRetuneTick();
		}, delay);
	},
	retune() {
		this.clearRetuneTimer();
		if (!this.play || !this.stations.length) return;
		this.scheduleRetuneTick();
	},
	getAudio(index) {
		return document.querySelector(`#audioBank audio[data-audio-index="${index}"]`);
	},
	setAudioVolume(index, value) {
		const audio = this.getAudio(index);
		if (!audio) return;
		audio.muted = value === 0;
		audio.volume = value;
		this.playSilently(audio);
	},
	startAllStreams() {
		this.refreshStreamWarmPool(this.index);
	},
	stopAllStreams() {
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
		if (!this.play || !this.stations.length) return;
		this.refreshStreamWarmPool(index);
		for (const i of this.stations.keys()) {
			this.setAudioVolume(i, 0);
		}
		this.setAudioVolume(index, this.volume / 100);
	},
	updateVolume() {
		if (!this.play) return;
		const token = this.beginTransition();
		if (this.isStatic && this.staticGain) {
			this.fadeStaticGain(this.staticTargetGain(), this.volumeRampMs, token);
			return;
		}
		for (const i of this.stations.keys()) {
			this.fadeStation(i, i === this.index ? this.clampVolume(this.volume / 100) : 0, this.volumeRampMs, token);
		}
	},
	updateStationCount() {
		const stationCount = Math.min(this.number, this.allStations?.length ?? 0);
		if (!stationCount) return;
		if (this.index >= stationCount) this.index = 0;
		this.syncNeedle();
		if (this.play) {
			queueMicrotask(() => {
				this.startAllStreams();
				if (this.isStatic) this.playStatic();
				else this.unmute(this.index);
			});
		}
		this.retune();
	},
	shuffle() {
		if (!this.allStations?.length) return;
		const shuffled = [...this.allStations];
		for (let i = shuffled.length - 1; i > 0; i--) {
			const j = Math.floor(Math.random() * (i + 1));
			[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
		}
		this.allStations = shuffled;
	},
	playPause() {
		if (!this.allStations?.length) return;
		if (this.play) {
			this.clearRetuneTimer();
			this.stopAllStreams();
			this.play = false;
			return;
		}
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
		this.syncNeedle();
		this.loadStations();
	},
}).mount();
