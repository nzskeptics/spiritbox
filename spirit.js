// import stations from './stations.json'
// import {createApp} from 'https://unpkg.com/petite-vue?module';
import {createApp} from './petite-vue.es.js?v=20261028';
import {RADIO_BROWSER_API_BASE, fetchRadioBrowserStationsWithFailover} from './radioBrowserApi.mjs';

const APP_CONFIG = {
	radio: {
		bases: [RADIO_BROWSER_API_BASE],
		query: {
			offset: 0,
			randomizeOffset: true,
			totalTopStations: 1000,
			pageSamplesPerLoad: 4,
		},
		request: {
			timeoutMs: 10000,
			retries: 2,
			retryDelayMs: 350,
		},
		tuning: {
			scanBias: {
				enabled: true,
				biasStrength: 0.75,
				holdStepsMin: 4,
				holdStepsMax: 12,
				reverseChance: 0.35,
			},
		},
	},
	audio: {
		engine: {
			workletModule: './noise-worklet.js?v=20261028',
			streamPrewarmCount: 3,
			bufferSize: 4096,
		},
		static: {
			preset: 'classic',
			presets: {
				conservative: {
					volume: {relative: 0.18, variance: 0.02, stationBedRelative: 0.03},
					tone: {variance: 0.2, wowFlutter: {enabled: true, depthHz: 8, speedHz: 0.14}},
					drift: {stepMin: 0.003, stepMax: 0.014, accel: 0.006, flipChance: 0.1},
					chunking: {enabledByDefault: true, interval: {minMs: 900, maxMs: 1800}, jumpAmount: 0.55},
					microMute: {enabled: true, intervalMinMs: 3200, intervalMaxMs: 6200, durationMinMs: 20, durationMaxMs: 54, duckMin: 0.25, duckMax: 0.5},
					hum: {enabled: true, relativeLevel: 0.07, wanderHz: 0.09, wanderDepthHz: 0.8},
					wordWindow: {enabled: true, duckRatio: 0.6, preMs: 45, postMs: 110, recoverMs: 100},
				},
				classic: {
					volume: {relative: 0.2, variance: 0.03, stationBedRelative: 0.04},
					tone: {variance: 0.3, wowFlutter: {enabled: true, depthHz: 12, speedHz: 0.18}},
					drift: {stepMin: 0.005, stepMax: 0.02, accel: 0.008, flipChance: 0.12},
					chunking: {enabledByDefault: true, interval: {minMs: 750, maxMs: 1500}, jumpAmount: 0.7},
					microMute: {enabled: true, intervalMinMs: 2500, intervalMaxMs: 5200, durationMinMs: 24, durationMaxMs: 68, duckMin: 0.22, duckMax: 0.45},
					hum: {enabled: true, relativeLevel: 0.08, wanderHz: 0.12, wanderDepthHz: 1.2},
					wordWindow: {enabled: true, duckRatio: 0.5, preMs: 55, postMs: 130, recoverMs: 120},
				},
				aggressive: {
					volume: {relative: 0.24, variance: 0.05, stationBedRelative: 0.06},
					tone: {variance: 0.45, wowFlutter: {enabled: true, depthHz: 18, speedHz: 0.24}},
					drift: {stepMin: 0.008, stepMax: 0.03, accel: 0.012, flipChance: 0.18},
					chunking: {enabledByDefault: true, interval: {minMs: 550, maxMs: 1200}, jumpAmount: 0.82},
					microMute: {enabled: true, intervalMinMs: 1800, intervalMaxMs: 4200, durationMinMs: 28, durationMaxMs: 82, duckMin: 0.16, duckMax: 0.4},
					hum: {enabled: true, relativeLevel: 0.1, wanderHz: 0.18, wanderDepthHz: 1.8},
					wordWindow: {enabled: true, duckRatio: 0.42, preMs: 70, postMs: 170, recoverMs: 135},
				},
			},
			volume: {
				relative: 0.2,
				variance: 0.03,
				stationBedRelative: 0.04,
			},
			tone: {
				variance: 0.3,
				frequency: {
					center: 980,
					spread: 120,
				},
				q: {
					center: 1.0,
					spread: 0.22,
				},
				wowFlutter: {
					enabled: true,
					depthHz: 12,
					speedHz: 0.18,
				},
			},
			drift: {
				stepMin: 0.005,
				stepMax: 0.02,
				accel: 0.008,
				flipChance: 0.12,
			},
			chunking: {
				enabledByDefault: true,
				interval: {
					minMs: 750,
					maxMs: 1500,
				},
				jumpAmount: 0.7,
				uiRange: {
					min: 250,
					max: 2500,
					step: 50,
				},
			},
			microMute: {
				enabled: true,
				intervalMinMs: 2500,
				intervalMaxMs: 5200,
				durationMinMs: 24,
				durationMaxMs: 68,
				duckMin: 0.22,
				duckMax: 0.45,
			},
			hum: {
				enabled: true,
				baseHz: 58,
				overtoneHz: 116,
				relativeLevel: 0.08,
				wanderHz: 0.12,
				wanderDepthHz: 1.2,
			},
			wordWindow: {
				enabled: true,
				duckRatio: 0.5,
				preMs: 55,
				postMs: 130,
				recoverMs: 120,
			},
		},
	},
	controls: {
		volume: {
			min: 0,
			max: 100,
			step: 1,
			default: 50,
			visible: true,
		},
		stations: {
			min: 4,
			max: 20,
			default: 10,
			visible: true,
		},
		hopIntervalMs: {
			min: 50,
			max: 500,
			step: 50,
			default: 100,
			visible: true,
		},
		stationDensity: {
			min: 0,
			max: 100,
			step: 5,
			default: 20,
			visible: true,
		},
		jitterMs: {
			min: 0,
			max: 200,
			step: 5,
			default: 0,
			visible: false,
		},
		chunkMode: {
			visible: true,
		},
		staticPreset: {
			visible: true,
		},
		sliderMotion: {
			default: 1,
			visible: true,
		},
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

function applyStaticPreset(config, nextPresetName) {
	const staticConfig = config?.audio?.static;
	if (!staticConfig) return false;
	const presetName = nextPresetName || staticConfig.preset;
	const preset = staticConfig.presets?.[presetName];
	if (!preset) return false;
	staticConfig.preset = presetName;

	const mergeInto = (target, source) => {
		for (const [key, value] of Object.entries(source)) {
			if (value && typeof value === 'object' && !Array.isArray(value)) {
				if (!target[key] || typeof target[key] !== 'object' || Array.isArray(target[key])) target[key] = {};
				mergeInto(target[key], value);
				continue;
			}
			target[key] = value;
		}
	};

	mergeInto(staticConfig, preset);
	return true;
}

applyStaticPreset(APP_CONFIG);

const RADIO_QUERY = APP_CONFIG.radio.query;
const RADIO_REQUEST = APP_CONFIG.radio.request;
const SCAN_BIAS = APP_CONFIG.radio.tuning.scanBias;
const AUDIO_ENGINE = APP_CONFIG.audio.engine;
const STATIC_CFG = APP_CONFIG.audio.static;

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
	let lowpass = profile.lowpass;
	let hiss = profile.hiss;
	let crackleChance = profile.crackleChance;
	let last = 0;
	const node = context.createScriptProcessor(AUDIO_ENGINE.bufferSize, 1, 1);
	node.setProfile = function(nextProfile) {
		if (!nextProfile) return;
		if (Number.isFinite(nextProfile.lowpass)) lowpass = nextProfile.lowpass;
		if (Number.isFinite(nextProfile.hiss)) hiss = nextProfile.hiss;
		if (Number.isFinite(nextProfile.crackleChance)) crackleChance = nextProfile.crackleChance;
	};
	node.onaudioprocess = function(e) {
		const output = e.outputBuffer.getChannelData(0);
		for (let i = 0; i < AUDIO_ENGINE.bufferSize; i++) {
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
			.addModule(AUDIO_ENGINE.workletModule)
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

function clampValue(value, min, max) {
	return Math.max(min, Math.min(max, Number(value) || 0));
}

function deepClone(value) {
	if (typeof structuredClone === 'function') return structuredClone(value);
	return JSON.parse(JSON.stringify(value));
}

function getStaticLevelBounds() {
	const base = clampValue(STATIC_CFG.volume.relative, 0, 1);
	const variance = Math.max(0, Number(STATIC_CFG.volume.variance) || 0);
	return {
		min: clampValue(base - variance, 0, 1),
		max: clampValue(base + variance, 0, 1),
	};
}

function randomBetween(min, max) {
	if (max <= min) return min;
	return min + Math.random() * (max - min);
}

function getStaticToneVariance() {
	return clampValue(STATIC_CFG.tone.variance, 0, 1);
}

function varyTone(center, halfSpread, variance, min, max) {
	const next = center + (Math.random() * 2 - 1) * halfSpread * variance;
	return clampValue(next, min, max);
}

function getStaticDriftConfig() {
	const cfg = STATIC_CFG.drift;
	const stepMin = clampValue(cfg.stepMin, 0, 1);
	const stepMax = Math.max(stepMin, clampValue(cfg.stepMax, 0, 1));
	return {
		stepMin,
		stepMax,
		accel: clampValue(cfg.accel, 0, 1),
		flipChance: clampValue(cfg.flipChance, 0, 1),
	};
}

function getChunkIntervalBounds() {
	const min = Math.max(0, Number(STATIC_CFG.chunking.interval.minMs) || 0);
	const max = Math.max(min, Number(STATIC_CFG.chunking.interval.maxMs) || min);
	return {min, max};
}

const CHUNK_MODE_VALUES_MS = [0, 750, 1500];
const STATIC_PRESET_ORDER = ['conservative', 'classic', 'aggressive'];
const STATIC_PRESET_LABELS = {
	conservative: 'Soft',
	classic: 'Medium',
	aggressive: 'Hard',
};

function clampModeIndex(value, maxIndex) {
	return Math.max(0, Math.min(maxIndex, Number(value) || 0));
}

function chunkModeToMs(mode) {
	return CHUNK_MODE_VALUES_MS[clampModeIndex(mode, CHUNK_MODE_VALUES_MS.length - 1)];
}

function chunkMsToMode(ms, enabled = true) {
	if (!enabled || !Number.isFinite(ms) || ms <= 0) return 0;
	if (ms >= 1125) return 2;
	return 1;
}

function getInitialChunkMode() {
	const bounds = getChunkIntervalBounds();
	const avg = (bounds.min + bounds.max) / 2;
	return chunkMsToMode(avg, Boolean(STATIC_CFG.chunking.enabledByDefault));
}

function presetModeToName(mode) {
	return STATIC_PRESET_ORDER[clampModeIndex(mode, STATIC_PRESET_ORDER.length - 1)] || STATIC_PRESET_ORDER[1];
}

function presetNameToMode(name) {
	const index = STATIC_PRESET_ORDER.indexOf(name);
	return index === -1 ? 1 : index;
}

function shuffled(array) {
	const out = [...array];
	for (let i = out.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[out[i], out[j]] = [out[j], out[i]];
	}
	return out;
}

function getStationPageCount(limit) {
	const safeLimit = Math.max(1, Number(limit) || 1);
	const poolSize = Math.max(safeLimit, Number(RADIO_QUERY.totalTopStations) || safeLimit);
	return Math.max(1, Math.floor(poolSize / safeLimit));
}

function getSampleOffsets(limit) {
	const safeLimit = Math.max(1, Number(limit) || 1);
	const baseOffset = Math.max(0, Number(RADIO_QUERY.offset) || 0);
	if (!RADIO_QUERY.randomizeOffset) return [baseOffset];
	const pageCount = getStationPageCount(safeLimit);
	const sampleCount = Math.max(1, Math.min(pageCount, Number(RADIO_QUERY.pageSamplesPerLoad) || 1));
	const pages = shuffled(Array.from({length: pageCount}, (_, i) => i)).slice(0, sampleCount);
	return pages.map((page) => baseOffset + page * safeLimit);
}

async function getStationsFromRadioBrowser(limit) {
	const safeLimit = Math.max(1, Number(limit) || 1);
	const offsets = getSampleOffsets(safeLimit);
	const mergedStations = [];
	const seenUrls = new Set();
	let lastError = null;

	for (const offset of offsets) {
		try {
			const result = await fetchRadioBrowserStationsWithFailover({
				bases: APP_CONFIG.radio.bases,
				limit: safeLimit,
				offset,
				timeoutMs: RADIO_REQUEST.timeoutMs,
				retries: RADIO_REQUEST.retries,
				retryDelayMs: RADIO_REQUEST.retryDelayMs,
			});
			for (const station of result.stations) {
				if (seenUrls.has(station.url)) continue;
				seenUrls.add(station.url);
				mergedStations.push(station);
			}
			if (mergedStations.length >= safeLimit) break;
		} catch (error) {
			lastError = error;
		}
	}

	if (!mergedStations.length) {
		if (lastError) throw lastError;
		throw new Error('No compatible stations returned');
	}

	const selected = shuffled(mergedStations).slice(0, safeLimit);
	return {stations: selected, source: `radio-browser:${RADIO_BROWSER_API_BASE}`};
}

function buildUiState() {
	const transitions = APP_CONFIG.ui.transitions;
	return {
		needleMotion: normalizeNeedleMotion(APP_CONFIG.ui.needleMotion),
		tuneDisplayPercent: 0,
		needleFrame: null,
		stationToStationMs: transitions.stationToStationMs,
		stationToStaticMs: transitions.stationToStaticMs,
		staticToStationMs: transitions.staticToStationMs,
		volumeRampMs: transitions.volumeRampMs,
		keepStaticEngineWarm: transitions.keepStaticEngineWarm,
		fadeToken: 0,
		times: [50, 100, 250, 500, 750, 1000],
	};
}

function buildControlState() {
	const controls = deepClone(APP_CONFIG.controls);
	controls.stations.max = Math.max(1, controls.stations.max);
	controls.stations.value = Math.max(controls.stations.min, Math.min(controls.stations.default, controls.stations.max));
	controls.volume.value = clampValue(controls.volume.default, controls.volume.min, controls.volume.max);
	controls.hopIntervalMs.value = clampValue(controls.hopIntervalMs.default, controls.hopIntervalMs.min, controls.hopIntervalMs.max);
	controls.stationDensity.value = clampValue(controls.stationDensity.default, controls.stationDensity.min, controls.stationDensity.max);
	controls.jitterMs.value = clampValue(controls.jitterMs.default, controls.jitterMs.min, controls.jitterMs.max);
	controls.chunkMode.min = 0;
	controls.chunkMode.max = CHUNK_MODE_VALUES_MS.length - 1;
	controls.chunkMode.step = 1;
	controls.chunkMode.value = getInitialChunkMode();
	controls.staticPreset.min = 0;
	controls.staticPreset.max = STATIC_PRESET_ORDER.length - 1;
	controls.staticPreset.step = 1;
	controls.staticPreset.value = presetNameToMode(STATIC_CFG.preset);
	controls.sliderMotion.min = 0;
	controls.sliderMotion.max = 1;
	controls.sliderMotion.step = 1;
	controls.sliderMotion.value = clampModeIndex(controls.sliderMotion.default, controls.sliderMotion.max);
	return {
		controls,
	};
}

function buildStaticState() {
	return {
		isStatic: false,
		staticPosition: 0,
		staticNode: null,
		staticFilter: null,
		staticGain: null,
		staticInitPromise: null,
		staticHumOscA: null,
		staticHumOscB: null,
		staticHumGain: null,
		staticHumPhase: 0,
		staticLevelFactor: clampValue(STATIC_CFG.volume.relative, 0, 1),
		staticToneDrift: 0,
		staticToneVelocity: 0,
		chunkingEnabled: Boolean(STATIC_CFG.chunking.enabledByDefault),
		chunkIntervalMinMs: getChunkIntervalBounds().min,
		chunkIntervalMaxMs: getChunkIntervalBounds().max,
		chunkTimer: null,
		microMuteTimer: null,
		scanDirection: Math.random() < 0.5 ? -1 : 1,
		scanRunRemaining: 0,
		streamPrewarmCount: AUDIO_ENGINE.streamPrewarmCount,
	};
}

function buildRuntimeState() {
	return {
		index: 0,
		sweepCursor: 0,
		allStations: null,
		retuneTimer: null,
		play: false,
	};
}

const SPIRIT_APP_COMPUTED = {
	get stationDigits() {
		return Array.from({length: this.controls.stations.value}, (_, i) => i + 1);
	},
	get barPrimary() {
		return '|'.repeat(512);
	},
	get barSecondary() {
		return Array.from({length: 64}, () => '....|').join('') + '....';
	},
	get stations() {
		return this.allStations?.slice(0, this.controls.stations.value) ?? [];
	},
	get chunkModeMs() {
		return chunkModeToMs(this.controls.chunkMode.value);
	},
	get chunkModeLabel() {
		return this.chunkModeMs === 0 ? 'Off' : `${this.chunkModeMs}ms`;
	},
	get staticPresetName() {
		return presetModeToName(this.controls.staticPreset.value);
	},
	get staticPresetLabel() {
		return STATIC_PRESET_LABELS[this.staticPresetName] || 'Medium';
	},
	get sliderMotionLabel() {
		return this.controls.sliderMotion.value === 1 ? 'Sweep' : 'Random';
	},
	get station() {
		if (!this.play || this.isStatic) return null;
		return this.stations?.[this.index];
	},
	get currentStationNumber() {
		if (this.isStatic) return 0;
		return Math.min(this.controls.stations.value, Math.max(1, this.index + 1));
	},
	get tunePercent() {
		if (this.controls.stations.value <= 1) return 0;
		const source = this.isStatic ? this.staticPosition : this.index;
		const clamped = Math.min(this.controls.stations.value - 1, Math.max(0, source));
		return (clamped / (this.controls.stations.value - 1)) * 100;
	},
	get needleMotionClass() {
		return `motion-${this.needleMotion}`;
	},
	get needleStyle() {
		return {left: `${this.tuneDisplayPercent}%`};
	},
};

const SPIRIT_APP_METHODS = {
	playSilently(audio) {
		if (!audio?.paused) return;
		const playPromise = audio.play?.();
		if (playPromise?.catch) playPromise.catch(() => {});
	},
	clearRetuneTimer() {
		clearTimeout(this.retuneTimer);
		this.retuneTimer = null;
	},
	applyStations(stations) {
		this.allStations = stations;
		if (this.controls.stations.value > this.allStations.length) {
			this.controls.stations.value = this.allStations.length;
		}
		if (this.sweepCursor >= this.controls.stations.value) {
			this.sweepCursor = 0;
		}
		this.syncNeedle();
	},
	async loadStations() {
		const preferFile = new URLSearchParams(window.location.search).get('source') === 'file';
		if (!preferFile) {
			try {
				const remote = await getStationsFromRadioBrowser(this.controls.stations.max);
				this.applyStations(remote.stations);
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
			this.applyStations(json);
		} catch (error) {
			console.error('Failed to load stations from remote API and stations.json', error);
			this.allStations = [];
		}
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
	applyNoiseProfile(profile) {
		if (!this.staticNode || !profile) return;
		if (typeof this.staticNode.setProfile === 'function') {
			this.staticNode.setProfile(profile);
			return;
		}
		if (this.staticNode.port?.postMessage) {
			this.staticNode.port.postMessage({type: 'set-profile', profile});
		}
	},
	buildNoiseProfile(drift = this.staticToneDrift) {
		const toneVariance = getStaticToneVariance();
		const driftScaled = clampValue(drift, -1, 1) * toneVariance;
		return {
			lowpass: varyTone(0.91 - driftScaled * 0.018, 0.012, toneVariance, 0.87, 0.95),
			hiss: varyTone(0.34 + driftScaled * 0.025, 0.03, toneVariance, 0.26, 0.44),
			crackleChance: varyTone(0.0018 + Math.abs(driftScaled) * 0.00045, 0.0006, toneVariance, 0.0005, 0.0034),
		};
	},
	stationBedStaticTarget() {
		const relative = clampValue(STATIC_CFG.volume.stationBedRelative, 0, 1);
		return this.clampVolume((this.controls.volume.value / 100) * relative);
	},
	setStaticHumTarget() {
		if (!STATIC_CFG.hum.enabled || !this.staticHumGain) return;
		const target = this.clampVolume((this.isStatic ? this.staticTargetGain() : this.stationBedStaticTarget()) * STATIC_CFG.hum.relativeLevel);
		this.staticHumGain.gain.setTargetAtTime(target, getAudioContext().currentTime, 0.08);
	},
	retuneHum() {
		if (!STATIC_CFG.hum.enabled || !this.staticHumOscA || !this.staticHumOscB) return;
		const context = getAudioContext();
		const now = context.currentTime;
		this.staticHumPhase += randomBetween(0.6, 1.4) * STATIC_CFG.hum.wanderHz;
		const wobble = Math.sin(this.staticHumPhase) * STATIC_CFG.hum.wanderDepthHz;
		this.staticHumOscA.frequency.setTargetAtTime(STATIC_CFG.hum.baseHz + wobble, now, 0.2);
		this.staticHumOscB.frequency.setTargetAtTime(STATIC_CFG.hum.overtoneHz + wobble * 0.85, now, 0.24);
	},
	startHumBed() {
		if (!STATIC_CFG.hum.enabled || this.staticHumOscA || this.staticHumOscB) return;
		const context = getAudioContext();
		const humGain = context.createGain();
		humGain.gain.value = 0;
		const oscA = context.createOscillator();
		oscA.type = 'sine';
		oscA.frequency.value = STATIC_CFG.hum.baseHz;
		const oscB = context.createOscillator();
		oscB.type = 'triangle';
		oscB.frequency.value = STATIC_CFG.hum.overtoneHz;
		oscA.connect(humGain);
		oscB.connect(humGain);
		humGain.connect(this.staticGain);
		oscA.start();
		oscB.start();
		this.staticHumGain = humGain;
		this.staticHumOscA = oscA;
		this.staticHumOscB = oscB;
		this.setStaticHumTarget();
	},
	stopHumBed() {
		if (this.staticHumOscA) {
			try { this.staticHumOscA.stop(); } catch {}
			try { this.staticHumOscA.disconnect(); } catch {}
		}
		if (this.staticHumOscB) {
			try { this.staticHumOscB.stop(); } catch {}
			try { this.staticHumOscB.disconnect(); } catch {}
		}
		if (this.staticHumGain) {
			try { this.staticHumGain.disconnect(); } catch {}
		}
		this.staticHumOscA = null;
		this.staticHumOscB = null;
		this.staticHumGain = null;
	},
	resetScanRun() {
		if (!SCAN_BIAS.enabled) return;
		if (Math.random() < SCAN_BIAS.reverseChance) this.scanDirection *= -1;
		this.scanRunRemaining = Math.floor(randomBetween(SCAN_BIAS.holdStepsMin, SCAN_BIAS.holdStepsMax + 1));
	},
	nextScanIndex(count) {
		if (!SCAN_BIAS.enabled || count <= 1) return null;
		if (this.scanRunRemaining <= 0) this.resetScanRun();
		this.scanRunRemaining = Math.max(0, this.scanRunRemaining - 1);
		if (Math.random() > SCAN_BIAS.biasStrength) return null;
		return (this.index + this.scanDirection + count) % count;
	},
	advanceStaticDrift() {
		const driftCfg = getStaticDriftConfig();
		if (Math.random() < driftCfg.flipChance) {
			this.staticToneVelocity *= -0.6;
		}
		this.staticToneVelocity += (Math.random() * 2 - 1) * driftCfg.accel;
		const maxStep = randomBetween(driftCfg.stepMin, driftCfg.stepMax);
		this.staticToneVelocity = clampValue(this.staticToneVelocity, -maxStep, maxStep);
		this.staticToneDrift = clampValue(this.staticToneDrift + this.staticToneVelocity, -1, 1);
	},
	nextChunkDelay() {
		this.chunkIntervalMinMs = Math.max(0, Number(this.chunkIntervalMinMs) || 0);
		this.chunkIntervalMaxMs = Math.max(this.chunkIntervalMinMs, Number(this.chunkIntervalMaxMs) || this.chunkIntervalMinMs);
		return Math.floor(randomBetween(this.chunkIntervalMinMs, this.chunkIntervalMaxMs));
	},
	clearChunkTimer() {
		clearTimeout(this.chunkTimer);
		this.chunkTimer = null;
	},
	clearMicroMuteTimer() {
		clearTimeout(this.microMuteTimer);
		this.microMuteTimer = null;
	},
	applyChunkJump() {
		const jumpAmount = clampValue(STATIC_CFG.chunking.jumpAmount, 0, 1);
		const target = randomBetween(-1, 1);
		this.staticToneDrift = clampValue(this.staticToneDrift + (target - this.staticToneDrift) * jumpAmount, -1, 1);
		if (Math.random() < 0.5) this.staticToneVelocity *= -0.5;
		this.retuneStaticTexture(false);
	},
	scheduleChunkTick() {
		this.clearChunkTimer();
		if (!this.play || !this.chunkingEnabled) return;
		const delay = this.nextChunkDelay();
		this.chunkTimer = setTimeout(() => {
			if (!this.play || !this.chunkingEnabled) {
				this.clearChunkTimer();
				return;
			}
			this.startStatic().then(() => {
				this.applyChunkJump();
			}).catch(() => {});
			this.scheduleChunkTick();
		}, delay);
	},
	updateChunking() {
		if (!this.play || !this.chunkingEnabled) {
			this.clearChunkTimer();
			return;
		}
		this.scheduleChunkTick();
	},
	updateChunkMode() {
		this.controls.chunkMode.value = clampModeIndex(this.controls.chunkMode.value, this.controls.chunkMode.max);
		const ms = this.chunkModeMs;
		this.chunkingEnabled = ms > 0;
		this.chunkIntervalMinMs = ms;
		this.chunkIntervalMaxMs = ms;
		this.updateChunking();
	},
	updateStaticPreset() {
		this.controls.staticPreset.value = clampModeIndex(this.controls.staticPreset.value, this.controls.staticPreset.max);
		const name = this.staticPresetName;
		if (!applyStaticPreset(APP_CONFIG, name)) return;
		if (this.controls.chunkMode.value !== 0) this.updateChunkMode();
		if (this.staticNode && this.staticFilter && this.staticGain) {
			this.retuneStaticTexture(false);
			this.setStaticHumTarget();
		}
		this.updateMicroMute();
		this.updateChunking();
	},
	scheduleMicroMuteTick() {
		this.clearMicroMuteTimer();
		const cfg = STATIC_CFG.microMute;
		if (!this.play || !cfg.enabled) return;
		const waitMs = Math.floor(randomBetween(cfg.intervalMinMs, cfg.intervalMaxMs));
		this.microMuteTimer = setTimeout(() => {
			if (!this.play || !cfg.enabled) {
				this.clearMicroMuteTimer();
				return;
			}
			const token = this.fadeToken;
			const baseTarget = this.isStatic ? this.staticTargetGain() : this.stationBedStaticTarget();
			const duckFactor = randomBetween(cfg.duckMin, cfg.duckMax);
			const duckTarget = this.clampVolume(baseTarget * duckFactor);
			const dur = Math.floor(randomBetween(cfg.durationMinMs, cfg.durationMaxMs));
			this.fadeStaticGain(duckTarget, Math.max(18, Math.floor(dur * 0.35)), token);
			setTimeout(() => {
				if (token !== this.fadeToken) return;
				this.fadeStaticGain(baseTarget, Math.max(30, Math.floor(dur * 0.65)), token);
			}, dur);
			this.scheduleMicroMuteTick();
		}, waitMs);
	},
	updateMicroMute() {
		if (!this.play || !STATIC_CFG.microMute.enabled) {
			this.clearMicroMuteTimer();
			return;
		}
		this.scheduleMicroMuteTick();
	},
	applyWordWindowBurst(token, baseTarget) {
		const cfg = STATIC_CFG.wordWindow;
		if (!cfg.enabled || !this.staticGain) return;
		const duckTarget = this.clampVolume(baseTarget * clampValue(cfg.duckRatio, 0, 1));
		this.fadeStaticGain(duckTarget, Math.max(18, cfg.preMs), token);
		setTimeout(() => {
			if (token !== this.fadeToken || !this.staticGain) return;
			this.fadeStaticGain(baseTarget, Math.max(30, cfg.recoverMs), token);
		}, cfg.preMs);
		setTimeout(() => {
			if (token !== this.fadeToken || !this.staticGain) return;
			this.fadeStaticGain(duckTarget, Math.max(18, Math.floor(cfg.preMs * 0.8)), token);
			setTimeout(() => {
				if (token !== this.fadeToken || !this.staticGain) return;
				this.fadeStaticGain(baseTarget, Math.max(30, cfg.recoverMs), token);
			}, Math.max(18, Math.floor(cfg.preMs * 0.8)));
		}, cfg.postMs);
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
		if (count <= 1) return 0;
		if (this.controls.sliderMotion.value === 1) {
			const next = this.sweepCursor % count;
			this.sweepCursor = (next + 1) % count;
			return next;
		}
		const scanNext = this.nextScanIndex(count);
		if (scanNext !== null) return scanNext;
		let next = Math.floor(Math.random() * count);
		if (count > 1 && !this.isStatic) {
			while (next === this.index) {
				next = Math.floor(Math.random() * count);
			}
		}
		return next;
	},
	chooseStaticPosition(targetIndex = null) {
		if (this.controls.stations.value <= 1) return 0;
		if (Number.isFinite(targetIndex)) {
			const clamped = Math.max(0, Math.min(this.controls.stations.value - 1, targetIndex));
			return clamped;
		}
		const base = Math.floor(Math.random() * (this.controls.stations.value - 1));
		const between = 0.15 + Math.random() * 0.7;
		return base + between;
	},
	updateSliderMotion() {
		this.controls.sliderMotion.value = clampModeIndex(this.controls.sliderMotion.value, this.controls.sliderMotion.max);
		if (this.controls.sliderMotion.value === 1 && this.stations.length) {
			this.sweepCursor = this.isStatic ? 0 : (this.index + 1) % this.stations.length;
		}
	},
	shouldPlayStatic() {
		if (!this.play || !this.stations.length) return false;
		this.controls.stationDensity.value = clampValue(this.controls.stationDensity.value, this.controls.stationDensity.min, this.controls.stationDensity.max);
		const staticChance = 100 - this.controls.stationDensity.value;
		if (staticChance <= 0) return false;
		return Math.random() * 100 < staticChance;
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
		return this.clampVolume((this.controls.volume.value / 100) * this.staticLevelFactor);
	},
	retuneStaticTexture(advanceDrift = true) {
		if (!this.staticFilter) return;
		const context = getAudioContext();
		const now = context.currentTime;
		const toneVariance = getStaticToneVariance();
		if (advanceDrift) this.advanceStaticDrift();
		const drift = this.staticToneDrift * toneVariance;
		const wowCfg = STATIC_CFG.tone.wowFlutter;
		if (wowCfg.enabled) {
			this.staticHumPhase += randomBetween(0.8, 1.2) * wowCfg.speedHz;
		}
		const wowHz = wowCfg.enabled ? Math.sin(this.staticHumPhase) * wowCfg.depthHz : 0;
		const targetFrequency = varyTone(
			STATIC_CFG.tone.frequency.center + drift * STATIC_CFG.tone.frequency.spread + wowHz,
			STATIC_CFG.tone.frequency.spread * 0.1,
			toneVariance,
			STATIC_CFG.tone.frequency.center - STATIC_CFG.tone.frequency.spread,
			STATIC_CFG.tone.frequency.center + STATIC_CFG.tone.frequency.spread
		);
		const targetQ = varyTone(
			STATIC_CFG.tone.q.center + drift * STATIC_CFG.tone.q.spread,
			STATIC_CFG.tone.q.spread * 0.1,
			toneVariance,
			STATIC_CFG.tone.q.center - STATIC_CFG.tone.q.spread,
			STATIC_CFG.tone.q.center + STATIC_CFG.tone.q.spread
		);
		const {min, max} = getStaticLevelBounds();
		this.staticFilter.frequency.setTargetAtTime(targetFrequency, now, 0.06);
		this.staticFilter.Q.setTargetAtTime(targetQ, now, 0.08);
		this.staticLevelFactor = clampValue(this.staticLevelFactor + (Math.random() - 0.5) * 0.02, min, max);
		this.applyNoiseProfile(this.buildNoiseProfile(this.staticToneDrift));
		this.retuneHum();
	},
	async startStatic() {
		if (this.staticNode && this.staticFilter && this.staticGain) return;
		if (this.staticInitPromise) return this.staticInitPromise;
		this.staticInitPromise = (async () => {
			await this.ensureAudioContext();
			const context = getAudioContext();
			this.staticToneDrift = varyTone(0, 0.35, 1, -1, 1);
			this.staticToneVelocity = 0;
			const profile = this.buildNoiseProfile(this.staticToneDrift);
			const node = this.createNoiseNode(profile);
			const filter = context.createBiquadFilter();
			filter.type = 'bandpass';
			filter.frequency.value = STATIC_CFG.tone.frequency.center;
			filter.Q.value = STATIC_CFG.tone.q.center;
			const gain = context.createGain();
			gain.gain.value = 0;
			node.connect(filter);
			filter.connect(gain);
			gain.connect(context.destination);
			this.staticNode = node;
			this.staticFilter = filter;
			this.staticGain = gain;
			this.startHumBed();
			const {min, max} = getStaticLevelBounds();
			this.staticLevelFactor = randomBetween(min, max);
		})();
		try {
			await this.staticInitPromise;
		} finally {
			this.staticInitPromise = null;
		}
	},
	stopStatic() {
		this.stopHumBed();
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
	playStatic(targetIndex = null) {
		const wasStatic = this.isStatic;
		const token = this.beginTransition();
		this.isStatic = true;
		this.staticPosition = this.chooseStaticPosition(targetIndex);
		this.syncNeedle();
		const fadeMs = wasStatic ? Math.max(240, Math.floor(this.stationToStaticMs * 0.7)) : this.stationToStaticMs;
		for (const i of this.stations.keys()) {
			this.fadeStation(i, 0, fadeMs, token);
		}
		const applyStaticFade = () => {
			this.retuneStaticTexture();
			this.fadeStaticGain(this.staticTargetGain(), fadeMs, token);
			this.setStaticHumTarget();
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
		const targetVolume = this.clampVolume(this.controls.volume.value / 100);
		const staticBedTarget = this.stationBedStaticTarget();
		this.isStatic = false;
		this.index = index;
		this.syncNeedle();
		this.refreshStreamWarmPool(index);
		const fadeMs = wasStatic ? this.staticToStationMs : this.stationToStationMs;
		for (const i of this.stations.keys()) {
			this.fadeStation(i, i === index ? targetVolume : 0, fadeMs, token);
		}
		const applyStaticBed = () => {
			this.retuneStaticTexture();
			this.fadeStaticGain(staticBedTarget, wasStatic ? fadeMs : this.stationToStationMs, token, false);
			this.setStaticHumTarget();
			this.applyWordWindowBurst(token, staticBedTarget);
		};
		if (this.staticNode && this.staticFilter && this.staticGain) {
			applyStaticBed();
			return;
		}
		this.startStatic().then(() => {
			if (token !== this.fadeToken) return;
			applyStaticBed();
		}).catch((error) => {
			console.warn('Background static start failed:', error?.message || error);
		});
	},
	playNextSelection() {
		const next = this.chooseNextIndex();
		if (this.shouldPlayStatic()) {
			this.playStatic(next);
			return;
		}
		this.playStation(next);
	},
	nextRetuneDelay() {
		this.controls.hopIntervalMs.value = clampValue(this.controls.hopIntervalMs.value, this.controls.hopIntervalMs.min, this.controls.hopIntervalMs.max);
		this.controls.stationDensity.value = clampValue(this.controls.stationDensity.value, this.controls.stationDensity.min, this.controls.stationDensity.max);
		this.controls.jitterMs.value = clampValue(this.controls.jitterMs.value, this.controls.jitterMs.min, this.controls.jitterMs.max);
		const jitter = this.controls.jitterMs.value;
		const min = Math.max(50, this.controls.hopIntervalMs.value - jitter);
		const max = this.controls.hopIntervalMs.value + jitter;
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
		this.clearChunkTimer();
		this.clearMicroMuteTimer();
		this.stopStatic();
		this.isStatic = false;
		for (let i = 0; i < this.controls.stations.value; i++) {
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
		this.setAudioVolume(index, this.controls.volume.value / 100);
	},
	updateVolume() {
		if (!this.play) return;
		this.controls.volume.value = clampValue(this.controls.volume.value, this.controls.volume.min, this.controls.volume.max);
		const token = this.beginTransition();
		if (this.isStatic && this.staticGain) {
			this.fadeStaticGain(this.staticTargetGain(), this.volumeRampMs, token);
			this.setStaticHumTarget();
			return;
		}
		if (this.staticGain) {
			this.fadeStaticGain(this.stationBedStaticTarget(), this.volumeRampMs, token);
			this.setStaticHumTarget();
		}
		for (const i of this.stations.keys()) {
			this.fadeStation(i, i === this.index ? this.clampVolume(this.controls.volume.value / 100) : 0, this.volumeRampMs, token);
		}
	},
	updateStationCount() {
		this.controls.stations.value = Math.max(this.controls.stations.min, Math.min(this.controls.stations.value, this.controls.stations.max));
		const stationCount = Math.min(this.controls.stations.value, this.allStations?.length ?? 0);
		if (!stationCount) return;
		if (this.index >= stationCount) this.index = 0;
		if (this.sweepCursor >= stationCount) this.sweepCursor = 0;
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
			this.clearChunkTimer();
			this.clearMicroMuteTimer();
			this.stopAllStreams();
			this.play = false;
			return;
		}
		this.play = true;
		this.updateSliderMotion();
		this.shuffle();
		queueMicrotask(() => {
			this.ensureAudioContext();
			this.startAllStreams();
			this.playNextSelection();
			this.retune();
			this.updateChunking();
			this.updateMicroMute();
		});
	},
	mounted() {
		this.updateSliderMotion();
		this.updateChunkMode();
		this.updateStaticPreset();
		this.syncNeedle();
		this.loadStations();
	},
};

function buildAppDefinition() {
	const app = {
		...buildUiState(),
		...buildControlState(),
		...buildStaticState(),
		...buildRuntimeState(),
		...SPIRIT_APP_METHODS,
	};
	Object.defineProperties(app, Object.getOwnPropertyDescriptors(SPIRIT_APP_COMPUTED));
	return app;
}

createApp(buildAppDefinition()).mount();
