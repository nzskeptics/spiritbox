// import stations from './stations.json'
// import {createApp} from 'https://unpkg.com/petite-vue?module';
import {createApp} from './petite-vue.es.js';
import {fetchRadioBrowserStationsWithFailover} from './radioBrowserApi.mjs';
import {APP_CONFIG} from './spirit.config.js';

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
	const node = context.createScriptProcessor(APP_CONFIG.audio.engine.bufferSize, 1, 1);
	node.setProfile = function(nextProfile) {
		if (!nextProfile) return;
		if (Number.isFinite(nextProfile.lowpass)) lowpass = nextProfile.lowpass;
		if (Number.isFinite(nextProfile.hiss)) hiss = nextProfile.hiss;
		if (Number.isFinite(nextProfile.crackleChance)) crackleChance = nextProfile.crackleChance;
	};
	node.onaudioprocess = function(e) {
		const output = e.outputBuffer.getChannelData(0);
		for (let i = 0; i < APP_CONFIG.audio.engine.bufferSize; i++) {
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
			.addModule(APP_CONFIG.audio.engine.workletModule)
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

function clampControl(control) {
	if (!control || typeof control !== 'object') return 0;
	return clampValue(control.value ?? control.default, control.min, control.max);
}

function deepClone(value) {
	if (typeof structuredClone === 'function') return structuredClone(value);
	return JSON.parse(JSON.stringify(value));
}

function getStaticLevelBounds() {
	const base = clampValue(APP_CONFIG.audio.static.volume.relative, 0, 1);
	const variance = Math.max(0, Number(APP_CONFIG.audio.static.volume.variance) || 0);
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
	return clampValue(APP_CONFIG.audio.static.tone.variance, 0, 1);
}

function varyTone(center, halfSpread, variance, min, max) {
	const next = center + (Math.random() * 2 - 1) * halfSpread * variance;
	return clampValue(next, min, max);
}

function getStaticDriftConfig() {
	const cfg = APP_CONFIG.audio.static.drift;
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
	const min = Math.max(0, Number(APP_CONFIG.audio.static.chunking.interval.minMs) || 0);
	const max = Math.max(min, Number(APP_CONFIG.audio.static.chunking.interval.maxMs) || min);
	return {min, max};
}

function normalizeOptionValue(value, options, fallback) {
	if (options.includes(value)) return value;
	if (options.includes(fallback)) return fallback;
	return options[0];
}

function toTitleCase(value) {
	if (typeof value !== 'string' || !value.length) return '';
	return value.charAt(0).toUpperCase() + value.slice(1);
}

function isSweepMotion(value) {
	return value === 'sweep';
}

function shouldJumpChunkNeedle(mode) {
	return mode !== 'slide';
}

function shouldJumpSweepNeedle(mode) {
	return mode === 'jump';
}

function clampChunkingMs(value) {
	return clampValue(value, APP_CONFIG.controls.chunking.min, APP_CONFIG.controls.chunking.max);
}

function shuffled(array) {
	const out = [...array];
	for (let i = out.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[out[i], out[j]] = [out[j], out[i]];
	}
	return out;
}

function buildStationBandPositions(count, minSeparation = APP_CONFIG.radio.tuning.frequencyBand.minStationSeparation) {
	if (count <= 0) return [];
	if (count === 1) return [0];
	const maxPossibleSep = 1 / (count - 1);
	const safeMinSep = clampValue(minSeparation, 0, maxPossibleSep);
	const slack = Math.max(0, 1 - safeMinSep * (count - 1));
	const anchors = Array.from({length: count}, () => Math.random() * slack).sort((a, b) => a - b);
	return anchors.map((anchor, i) => anchor + i * safeMinSep);
}

function buildSweepBandSlots(stationCount, stationBandPositions) {
	if (stationCount <= 0) return [];
	if (stationCount === 1) return [0];
	const baseResolution = Math.max(24, Number(APP_CONFIG.radio.tuning.frequencyBand.resolution) || 180);
	const resolution = Math.max(baseResolution, stationCount * 10);
	const minSepBins = Math.max(1, Math.round(clampValue(APP_CONFIG.radio.tuning.frequencyBand.minStationSeparation, 0, 1) * resolution));
	const repeatsMin = Math.max(1, Number(APP_CONFIG.radio.tuning.frequencyBand.repeatsMin) || 2);
	const repeatsMax = Math.max(repeatsMin, Number(APP_CONFIG.radio.tuning.frequencyBand.repeatsMax) || 4);
	const slots = Array.from({length: resolution}, () => -1);
	const occurrences = [];

	for (let station = 0; station < stationCount; station++) {
		const repeats = Math.max(repeatsMin, Math.floor(randomBetween(repeatsMin, repeatsMax + 1)));
		for (let i = 0; i < repeats; i++) occurrences.push(station);
	}

	const preferredAnchors = stationBandPositions?.map((pos) => Math.round(clampValue(pos, 0, 1) * (resolution - 1))) || [];

	for (const station of shuffled(occurrences)) {
		let placed = false;
		for (let attempt = 0; attempt < 48; attempt++) {
			const jitter = Math.floor(randomBetween(-minSepBins, minSepBins + 1));
			const anchor = preferredAnchors[station] ?? Math.floor(Math.random() * resolution);
			const candidate = ((anchor + jitter) % resolution + resolution) % resolution;
			if (slots[candidate] !== -1) continue;
			let conflict = false;
			for (let d = -minSepBins; d <= minSepBins; d++) {
				const idx = ((candidate + d) % resolution + resolution) % resolution;
				if (slots[idx] === station) {
					conflict = true;
					break;
				}
			}
			if (conflict) continue;
			slots[candidate] = station;
			placed = true;
			break;
		}
		if (placed) continue;
		const fallback = Math.floor(Math.random() * resolution);
		if (slots[fallback] === -1) {
			slots[fallback] = station;
			continue;
		}
		const empty = slots.findIndex((slot) => slot === -1);
		if (empty !== -1) slots[empty] = station;
	}

	for (let i = 0; i < slots.length; i++) {
		if (slots[i] !== -1) continue;
		slots[i] = Math.floor(Math.random() * stationCount);
	}

	return slots;
}

function getStationPageCount(limit) {
	const safeLimit = Math.max(1, Number(limit) || 1);
	const poolSize = Math.max(safeLimit, Number(APP_CONFIG.radio.query.totalTopStations) || safeLimit);
	return Math.max(1, Math.floor(poolSize / safeLimit));
}

function getSampleOffsets(limit) {
	const safeLimit = Math.max(1, Number(limit) || 1);
	const baseOffset = Math.max(0, Number(APP_CONFIG.radio.query.offset) || 0);
	if (!APP_CONFIG.radio.query.randomizeOffset) return [baseOffset];
	const pageCount = getStationPageCount(safeLimit);
	const sampleCount = Math.max(1, Math.min(pageCount, Number(APP_CONFIG.radio.query.pageSamplesPerLoad) || 1));
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
				timeoutMs: APP_CONFIG.radio.request.timeoutMs,
				retries: APP_CONFIG.radio.request.retries,
				retryDelayMs: APP_CONFIG.radio.request.retryDelayMs,
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
	return {stations: selected, source: `radio-browser:${APP_CONFIG.radio.bases[0]}`};
}

function buildUiState() {
	const configuredUi = APP_CONFIG.ui || {};
	const configuredNeedle = configuredUi.needle || {};
	const configuredNeedleMode = configuredNeedle.mode || {};
	const transitions = configuredNeedle.transitions || {};
	return {
		ui: {
			needle: {
				motion: normalizeNeedleMotion(configuredNeedle.motion),
				mode: {
					sweep: configuredNeedleMode.sweep === 'jump' ? 'jump' : 'smooth',
					chunk: configuredNeedleMode.chunk === 'slide' ? 'slide' : 'jump',
				},
				transitions: {
					stationToStationMs: transitions.stationToStationMs,
					stationToStaticMs: transitions.stationToStaticMs,
					staticToStationMs: transitions.staticToStationMs,
					volumeRampMs: transitions.volumeRampMs,
					keepStaticEngineWarm: transitions.keepStaticEngineWarm,
				},
			},
			runtime: {
				tuneDisplayPercent: 0,
				needleFrame: null,
				fadeToken: 0,
				times: [50, 100, 250, 500, 750, 1000],
			},
		},
	};
}

function buildControlState() {
	const controls = deepClone(APP_CONFIG.controls);
	controls.stations.max = Math.max(1, controls.stations.max);
	controls.stations.value = Math.max(controls.stations.min, Math.min(controls.stations.default, controls.stations.max));
	controls.volume.value = clampControl(controls.volume);
	controls.hopIntervalMs.value = clampControl(controls.hopIntervalMs);
	controls.stationDensity.value = clampControl(controls.stationDensity);
	controls.jitterMs.value = clampControl(controls.jitterMs);
	controls.chunking.max = Math.max(controls.chunking.min, controls.chunking.max);
	controls.chunking.value = clampChunkingMs(controls.chunking.default);
	controls.static.value = normalizeOptionValue(
		APP_CONFIG.audio.static.preset,
		controls.static.options,
		controls.static.default
	);
	controls.motion.value = normalizeOptionValue(
		controls.motion.default,
		controls.motion.options,
		'sweep'
	);
	return {
		controls,
	};
}

function buildStaticState() {
	return {
		static: {
			active: false,
			position: 0,
			node: null,
			filter: null,
			gain: null,
			initPromise: null,
			hum: {
				osc: {
					A: null,
					B: null,
				},
				gain: null,
				phase: 0,
			},
			levelFactor: clampValue(APP_CONFIG.audio.static.volume.relative, 0, 1),
			tone: {
				drift: 0,
				velocity: 0,
			},
			chunking: {
				enabled: Boolean(APP_CONFIG.audio.static.chunking.enabledByDefault),
				interval: {
					minMs: getChunkIntervalBounds().min,
					maxMs: getChunkIntervalBounds().max,
				},
				timer: null,
			},
			microMute: {
				timer: null,
			},
			scan: {
				direction: Math.random() < 0.5 ? -1 : 1,
				runRemaining: 0,
			},
			stream: {
				prewarmCount: APP_CONFIG.audio.engine.streamPrewarmCount,
			},
		},
	};
}

function buildRuntimeState() {
	return {
		runtime: {
			index: 0,
			allStations: null,
			retuneTimer: null,
			play: false,
		},
		sweep: {
			cursor: 0,
			bandIndex: 0,
			currentBandIndex: 0,
			stationBandPositions: [],
			bandSlots: [],
		},
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
		return this.runtime.allStations?.slice(0, this.controls.stations.value) ?? [];
	},
	get allStations() {
		return this.runtime.allStations;
	},
	get play() {
		return this.runtime.play;
	},
	get chunkingMs() {
		return clampChunkingMs(this.controls.chunking.value);
	},
	get chunkingLabel() {
		return this.chunkingMs === 0 ? 'Off' : `${this.chunkingMs}ms`;
	},
	get staticName() {
		return this.controls.static.value;
	},
	get staticLabel() {
		return toTitleCase(this.staticName) || 'Medium';
	},
	get motionLabel() {
		return toTitleCase(this.controls.motion.value) || 'Sweep';
	},
	get station() {
		if (!this.runtime.play || this.static.active) return null;
		return this.stations?.[this.runtime.index];
	},
	get currentStationNumber() {
		if (this.static.active) return 0;
		return Math.min(this.controls.stations.value, Math.max(1, this.runtime.index + 1));
	},
	get tunePercent() {
		if (this.controls.stations.value <= 1) return 0;
		if (isSweepMotion(this.controls.motion.value)) {
			if (this.static.active) return clampValue(this.static.position, 0, 1) * 100;
			const slotsCount = this.sweep.bandSlots?.length || 0;
			if (slotsCount > 1) return (this.sweep.currentBandIndex / (slotsCount - 1)) * 100;
			return 0;
		}
		const source = this.static.active ? this.static.position : this.runtime.index;
		const clamped = Math.min(this.controls.stations.value - 1, Math.max(0, source));
		return (clamped / (this.controls.stations.value - 1)) * 100;
	},
	get needleMotionClass() {
		return `motion-${this.ui.needle.motion}`;
	},
	get needleStyle() {
		return {left: `${this.ui.runtime.tuneDisplayPercent}%`};
	},
	get times() {
		return this.ui.runtime.times;
	},
};

const SPIRIT_APP_METHODS = {
	playSilently(audio) {
		if (!audio?.paused) return;
		const playPromise = audio.play?.();
		if (playPromise?.catch) playPromise.catch(() => {});
	},
	clearRetuneTimer() {
		clearTimeout(this.runtime.retuneTimer);
		this.runtime.retuneTimer = null;
	},
	applyStations(stations) {
		this.runtime.allStations = stations;
		if (this.controls.stations.value > this.runtime.allStations.length) {
			this.controls.stations.value = this.runtime.allStations.length;
		}
		this.rebuildStationBand();
		if (this.sweep.cursor >= this.controls.stations.value) {
			this.sweep.cursor = 0;
		}
		this.syncNeedle();
	},
	rebuildStationBand() {
		this.sweep.stationBandPositions = buildStationBandPositions(this.stations.length);
		this.sweep.bandSlots = buildSweepBandSlots(this.stations.length, this.sweep.stationBandPositions);
	},
	getSweepStep() {
		const slotsCount = Math.max(2, this.sweep.bandSlots?.length || 0);
		return 1 / (slotsCount - 1);
	},
	getSweepStationIndex(bandIndex = this.sweep.bandIndex) {
		if (!this.sweep.bandSlots?.length) return 0;
		const idx = ((Math.floor(bandIndex) % this.sweep.bandSlots.length) + this.sweep.bandSlots.length) % this.sweep.bandSlots.length;
		return this.sweep.bandSlots[idx];
	},
	advanceSweepBand() {
		if (!this.sweep.bandSlots?.length) return;
		this.sweep.bandIndex = (this.sweep.bandIndex + 1) % this.sweep.bandSlots.length;
	},
	reseedSweepBand() {
		if (!this.sweep.bandSlots?.length) return;
		this.sweep.bandIndex = Math.floor(Math.random() * this.sweep.bandSlots.length);
	},
	chooseSweepIndex() {
		if (!this.stations.length) return 0;
		this.sweep.currentBandIndex = this.sweep.bandIndex;
		const next = this.getSweepStationIndex(this.sweep.bandIndex);
		this.advanceSweepBand();
		return next;
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
			const response = await fetch('./stations.json');
			if (!response.ok) {
				throw new Error(`HTTP ${response.status}`);
			}
			const json = await response.json();
			this.applyStations(json);
		} catch (error) {
			console.error('Failed to load stations from remote API and stations.json', error);
			this.runtime.allStations = [];
		}
	},
	syncNeedle() {
		const target = this.tunePercent;
		const chunkNeedleMode = this.ui.needle.mode.chunk;
		if (this.static.active && shouldJumpChunkNeedle(chunkNeedleMode)) {
			if (this.ui.runtime.needleFrame) cancelAnimationFrame(this.ui.runtime.needleFrame);
			this.ui.runtime.needleFrame = null;
			this.ui.runtime.tuneDisplayPercent = target;
			return;
		}
		const isSweepNeedle = isSweepMotion(this.controls.motion.value);
		if (isSweepNeedle && shouldJumpSweepNeedle(this.ui.needle.mode.sweep)) {
			if (this.ui.runtime.needleFrame) cancelAnimationFrame(this.ui.runtime.needleFrame);
			this.ui.runtime.needleFrame = null;
			this.ui.runtime.tuneDisplayPercent = target;
			return;
		}
		if (isSweepNeedle && target < this.ui.runtime.tuneDisplayPercent) {
			if (this.ui.needle.mode.sweep !== 'smooth') {
				if (this.ui.runtime.needleFrame) cancelAnimationFrame(this.ui.runtime.needleFrame);
				this.ui.runtime.needleFrame = null;
				this.ui.runtime.tuneDisplayPercent = target;
				return;
			}
			this.animateSweepWrap(target);
			return;
		}
		if (this.ui.needle.motion === 'step' || this.ui.needle.motion === 'smooth') {
			if (this.ui.runtime.needleFrame) cancelAnimationFrame(this.ui.runtime.needleFrame);
			this.ui.runtime.needleFrame = null;
			this.ui.runtime.tuneDisplayPercent = target;
			return;
		}
		this.animateNeedle(target);
	},
	animateSweepWrap(target) {
		if (this.ui.runtime.needleFrame) cancelAnimationFrame(this.ui.runtime.needleFrame);
		const start = this.ui.runtime.tuneDisplayPercent;
		const endCap = 100;
		const firstDelta = Math.max(0, endCap - start);
		const toEndDuration = 100 + Math.min(180, firstDelta * 4);
		const fromStartDuration = 90 + Math.min(220, Math.max(0, target) * 6);

		const startPhaseTwo = () => {
			this.ui.runtime.tuneDisplayPercent = 0;
			if (target <= 0.1) {
				this.ui.runtime.tuneDisplayPercent = target;
				this.ui.runtime.needleFrame = null;
				return;
			}
			const phaseTwoStart = performance.now();
			const stepTwo = (now) => {
				const t = Math.min(1, (now - phaseTwoStart) / fromStartDuration);
				const eased = 1 - Math.pow(1 - t, 3);
				this.ui.runtime.tuneDisplayPercent = target * eased;
				if (t < 1) {
					this.ui.runtime.needleFrame = requestAnimationFrame(stepTwo);
					return;
				}
				this.ui.runtime.tuneDisplayPercent = target;
				this.ui.runtime.needleFrame = null;
			};
			this.ui.runtime.needleFrame = requestAnimationFrame(stepTwo);
		};

		if (firstDelta <= 0.1) {
			startPhaseTwo();
			return;
		}

		const phaseOneStart = performance.now();
		const stepOne = (now) => {
			const t = Math.min(1, (now - phaseOneStart) / toEndDuration);
			const eased = 1 - Math.pow(1 - t, 3);
			this.ui.runtime.tuneDisplayPercent = start + firstDelta * eased;
			if (t < 1) {
				this.ui.runtime.needleFrame = requestAnimationFrame(stepOne);
				return;
			}
			startPhaseTwo();
		};
		this.ui.runtime.needleFrame = requestAnimationFrame(stepOne);
	},
	animateNeedle(target) {
		if (this.ui.runtime.needleFrame) cancelAnimationFrame(this.ui.runtime.needleFrame);
		const start = this.ui.runtime.tuneDisplayPercent;
		const delta = target - start;
		const isSweepNeedle = isSweepMotion(this.controls.motion.value);
		if (Math.abs(delta) < 0.1) {
			this.ui.runtime.tuneDisplayPercent = target;
			this.ui.runtime.needleFrame = null;
			return;
		}
		const startTime = performance.now();
		const duration = 260 + Math.min(240, Math.abs(delta) * 8);
		const step = (now) => {
			const t = Math.min(1, (now - startTime) / duration);
			const eased = 1 - Math.pow(1 - t, 3);
			const wobble = isSweepNeedle ? 0 : Math.sin(t * Math.PI * 4) * (1 - t) * 0.6;
			const nextValue = start + delta * eased + wobble;
			if (isSweepNeedle && delta > 0) {
				this.ui.runtime.tuneDisplayPercent = Math.max(this.ui.runtime.tuneDisplayPercent, Math.min(target, nextValue));
			} else {
				this.ui.runtime.tuneDisplayPercent = nextValue;
			}
			if (t < 1) {
				this.ui.runtime.needleFrame = requestAnimationFrame(step);
				return;
			}
			this.ui.runtime.tuneDisplayPercent = target;
			this.ui.runtime.needleFrame = null;
		};
		this.ui.runtime.needleFrame = requestAnimationFrame(step);
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
		if (!this.static.node || !profile) return;
		if (typeof this.static.node.setProfile === 'function') {
			this.static.node.setProfile(profile);
			return;
		}
		if (this.static.node.port?.postMessage) {
			this.static.node.port.postMessage({type: 'set-profile', profile});
		}
	},
	buildNoiseProfile(drift = this.static.tone.drift) {
		const toneVariance = getStaticToneVariance();
		const driftScaled = clampValue(drift, -1, 1) * toneVariance;
		return {
			lowpass: varyTone(0.91 - driftScaled * 0.018, 0.012, toneVariance, 0.87, 0.95),
			hiss: varyTone(0.34 + driftScaled * 0.025, 0.03, toneVariance, 0.26, 0.44),
			crackleChance: varyTone(0.0018 + Math.abs(driftScaled) * 0.00045, 0.0006, toneVariance, 0.0005, 0.0034),
		};
	},
	stationBedStaticTarget() {
		const relative = clampValue(APP_CONFIG.audio.static.volume.stationBedRelative, 0, 1);
		return this.clampVolume((this.controls.volume.value / 100) * relative);
	},
	setStaticHumTarget() {
		if (!APP_CONFIG.audio.static.hum.enabled || !this.static.hum.gain) return;
		const target = this.clampVolume((this.static.active ? this.staticTargetGain() : this.stationBedStaticTarget()) * APP_CONFIG.audio.static.hum.relativeLevel);
		this.static.hum.gain.gain.setTargetAtTime(target, getAudioContext().currentTime, 0.08);
	},
	retuneHum() {
		if (!APP_CONFIG.audio.static.hum.enabled || !this.static.hum.osc.A || !this.static.hum.osc.B) return;
		const context = getAudioContext();
		const now = context.currentTime;
		this.static.hum.phase += randomBetween(0.6, 1.4) * APP_CONFIG.audio.static.hum.wanderHz;
		const wobble = Math.sin(this.static.hum.phase) * APP_CONFIG.audio.static.hum.wanderDepthHz;
		this.static.hum.osc.A.frequency.setTargetAtTime(APP_CONFIG.audio.static.hum.baseHz + wobble, now, 0.2);
		this.static.hum.osc.B.frequency.setTargetAtTime(APP_CONFIG.audio.static.hum.overtoneHz + wobble * 0.85, now, 0.24);
	},
	startHumBed() {
		if (!APP_CONFIG.audio.static.hum.enabled || this.static.hum.osc.A || this.static.hum.osc.B) return;
		const context = getAudioContext();
		const humGain = context.createGain();
		humGain.gain.value = 0;
		const osc = {
			A: context.createOscillator(),
			B: context.createOscillator(),
		};
		osc.A.type = 'sine';
		osc.A.frequency.value = APP_CONFIG.audio.static.hum.baseHz;
		osc.B.type = 'triangle';
		osc.B.frequency.value = APP_CONFIG.audio.static.hum.overtoneHz;
		osc.A.connect(humGain);
		osc.B.connect(humGain);
		humGain.connect(this.static.gain);
		osc.A.start();
		osc.B.start();
		this.static.hum.gain = humGain;
		this.static.hum.osc.A = osc.A;
		this.static.hum.osc.B = osc.B;
		this.setStaticHumTarget();
	},
	stopHumBed() {
		if (this.static.hum.osc.A) {
			try { this.static.hum.osc.A.stop(); } catch {}
			try { this.static.hum.osc.A.disconnect(); } catch {}
		}
		if (this.static.hum.osc.B) {
			try { this.static.hum.osc.B.stop(); } catch {}
			try { this.static.hum.osc.B.disconnect(); } catch {}
		}
		if (this.static.hum.gain) {
			try { this.static.hum.gain.disconnect(); } catch {}
		}
		this.static.hum.osc.A = null;
		this.static.hum.osc.B = null;
		this.static.hum.gain = null;
	},
	resetScanRun() {
		if (!APP_CONFIG.radio.tuning.scanBias.enabled) return;
		if (Math.random() < APP_CONFIG.radio.tuning.scanBias.reverseChance) this.static.scan.direction *= -1;
		this.static.scan.runRemaining = Math.floor(randomBetween(APP_CONFIG.radio.tuning.scanBias.holdStepsMin, APP_CONFIG.radio.tuning.scanBias.holdStepsMax + 1));
	},
	nextScanIndex(count) {
		if (!APP_CONFIG.radio.tuning.scanBias.enabled || count <= 1) return null;
		if (this.static.scan.runRemaining <= 0) this.resetScanRun();
		this.static.scan.runRemaining = Math.max(0, this.static.scan.runRemaining - 1);
		if (Math.random() > APP_CONFIG.radio.tuning.scanBias.biasStrength) return null;
		return (this.runtime.index + this.static.scan.direction + count) % count;
	},
	advanceStaticDrift() {
		const driftCfg = getStaticDriftConfig();
		if (Math.random() < driftCfg.flipChance) {
			this.static.tone.velocity *= -0.6;
		}
		this.static.tone.velocity += (Math.random() * 2 - 1) * driftCfg.accel;
		const maxStep = randomBetween(driftCfg.stepMin, driftCfg.stepMax);
		this.static.tone.velocity = clampValue(this.static.tone.velocity, -maxStep, maxStep);
		this.static.tone.drift = clampValue(this.static.tone.drift + this.static.tone.velocity, -1, 1);
	},
	nextChunkDelay() {
		this.static.chunking.interval.minMs = Math.max(0, Number(this.static.chunking.interval.minMs) || 0);
		this.static.chunking.interval.maxMs = Math.max(this.static.chunking.interval.minMs, Number(this.static.chunking.interval.maxMs) || this.static.chunking.interval.minMs);
		return Math.floor(randomBetween(this.static.chunking.interval.minMs, this.static.chunking.interval.maxMs));
	},
	clearChunkTimer() {
		clearTimeout(this.static.chunking.timer);
		this.static.chunking.timer = null;
	},
	clearMicroMuteTimer() {
		clearTimeout(this.static.microMute.timer);
		this.static.microMute.timer = null;
	},
	applyChunkJump() {
		const jumpAmount = clampValue(APP_CONFIG.audio.static.chunking.jumpAmount, 0, 1);
		const target = randomBetween(-1, 1);
		this.static.tone.drift = clampValue(this.static.tone.drift + (target - this.static.tone.drift) * jumpAmount, -1, 1);
		if (Math.random() < 0.5) this.static.tone.velocity *= -0.5;
		this.retuneStaticTexture(false);
	},
	scheduleChunkTick() {
		this.clearChunkTimer();
		if (!this.runtime.play || !this.static.chunking.enabled) return;
		const delay = this.nextChunkDelay();
		this.static.chunking.timer = setTimeout(() => {
			if (!this.runtime.play || !this.static.chunking.enabled) {
				this.clearChunkTimer();
				return;
			}
			if (isSweepMotion(this.controls.motion.value)) this.reseedSweepBand();
			this.startStatic().then(() => {
				this.applyChunkJump();
			}).catch(() => {});
			this.scheduleChunkTick();
		}, delay);
	},
	refreshChunkingTimer() {
		if (!this.runtime.play || !this.static.chunking.enabled) {
			this.clearChunkTimer();
			return;
		}
		this.scheduleChunkTick();
	},
	updateChunking() {
		this.controls.chunking.value = clampChunkingMs(this.controls.chunking.value);
		const ms = this.chunkingMs;
		this.static.chunking.enabled = ms > 0;
		this.static.chunking.interval.minMs = ms;
		this.static.chunking.interval.maxMs = ms;
		this.refreshChunkingTimer();
	},
	updateStatic() {
		this.controls.static.value = normalizeOptionValue(
			this.controls.static.value,
			this.controls.static.options,
			this.controls.static.default
		);
		const presetName = this.controls.static.value;
		if (!applyStaticPreset(APP_CONFIG, presetName)) return;
		if (this.controls.chunking.value !== 0) this.updateChunking();
		if (this.static.node && this.static.filter && this.static.gain) {
			this.retuneStaticTexture(false);
			this.setStaticHumTarget();
		}
		this.updateMicroMute();
		this.refreshChunkingTimer();
	},
	scheduleMicroMuteTick() {
		this.clearMicroMuteTimer();
		const cfg = APP_CONFIG.audio.static.microMute;
		if (!this.runtime.play || !cfg.enabled) return;
		const waitMs = Math.floor(randomBetween(cfg.intervalMinMs, cfg.intervalMaxMs));
		this.static.microMute.timer = setTimeout(() => {
			if (!this.runtime.play || !cfg.enabled) {
				this.clearMicroMuteTimer();
				return;
			}
			const token = this.ui.runtime.fadeToken;
			const baseTarget = this.static.active ? this.staticTargetGain() : this.stationBedStaticTarget();
			const duck = {
				factor: randomBetween(cfg.duckMin, cfg.duckMax),
				durationMs: Math.floor(randomBetween(cfg.durationMinMs, cfg.durationMaxMs)),
			};
			duck.target = this.clampVolume(baseTarget * duck.factor);
			this.fadeStaticGain(duck.target, Math.max(18, Math.floor(duck.durationMs * 0.35)), token);
			setTimeout(() => {
				if (token !== this.ui.runtime.fadeToken) return;
				this.fadeStaticGain(baseTarget, Math.max(30, Math.floor(duck.durationMs * 0.65)), token);
			}, duck.durationMs);
			this.scheduleMicroMuteTick();
		}, waitMs);
	},
	updateMicroMute() {
		if (!this.runtime.play || !APP_CONFIG.audio.static.microMute.enabled) {
			this.clearMicroMuteTimer();
			return;
		}
		this.scheduleMicroMuteTick();
	},
	applyWordWindowBurst(token, baseTarget) {
		const cfg = APP_CONFIG.audio.static.wordWindow;
		if (!cfg.enabled || !this.static.gain) return;
		const duck = {
			target: this.clampVolume(baseTarget * clampValue(cfg.duckRatio, 0, 1)),
		};
		this.fadeStaticGain(duck.target, Math.max(18, cfg.preMs), token);
		setTimeout(() => {
			if (token !== this.ui.runtime.fadeToken || !this.static.gain) return;
			this.fadeStaticGain(baseTarget, Math.max(30, cfg.recoverMs), token);
		}, cfg.preMs);
		setTimeout(() => {
			if (token !== this.ui.runtime.fadeToken || !this.static.gain) return;
			this.fadeStaticGain(duck.target, Math.max(18, Math.floor(cfg.preMs * 0.8)), token);
			setTimeout(() => {
				if (token !== this.ui.runtime.fadeToken || !this.static.gain) return;
				this.fadeStaticGain(baseTarget, Math.max(30, cfg.recoverMs), token);
			}, Math.max(18, Math.floor(cfg.preMs * 0.8)));
		}, cfg.postMs);
	},
	getWarmStationIndexes(anchorIndex = this.runtime.index) {
		const count = this.stations.length;
		const warmCount = Math.min(Math.max(1, this.static.stream.prewarmCount), count);
		const warm = new Set();
		if (!count) return warm;
		const start = Math.min(Math.max(0, anchorIndex), count - 1);
		for (let i = 0; i < warmCount; i++) {
			warm.add((start + i) % count);
		}
		return warm;
	},
	refreshStreamWarmPool(anchorIndex = this.runtime.index) {
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
		if (isSweepMotion(this.controls.motion.value)) {
			return this.chooseSweepIndex();
		}
		const scanNext = this.nextScanIndex(count);
		if (scanNext !== null) return scanNext;
		let next = Math.floor(Math.random() * count);
		if (count > 1 && !this.static.active) {
			while (next === this.runtime.index) {
				next = Math.floor(Math.random() * count);
			}
		}
		return next;
	},
	chooseStaticPosition(targetIndex = null) {
		if (this.controls.stations.value <= 1) return 0;
		if (isSweepMotion(this.controls.motion.value) && targetIndex == null) {
			if (this.sweep.bandSlots?.length <= 1) return 0;
			return this.sweep.currentBandIndex / (this.sweep.bandSlots.length - 1);
		}
		if (Number.isFinite(targetIndex)) {
			if (isSweepMotion(this.controls.motion.value)) {
				if (this.sweep.bandSlots?.length > 1) {
					const slotsLen = this.sweep.bandSlots.length;
					for (let offset = 0; offset < slotsLen; offset++) {
						const right = (this.sweep.currentBandIndex + offset) % slotsLen;
						if (this.sweep.bandSlots[right] === targetIndex) return right / (slotsLen - 1);
						const left = (this.sweep.currentBandIndex - offset + slotsLen) % slotsLen;
						if (this.sweep.bandSlots[left] === targetIndex) return left / (slotsLen - 1);
					}
				}
				const pos = this.sweep.stationBandPositions?.[targetIndex];
				if (Number.isFinite(pos)) return pos;
			}
			const clamped = Math.max(0, Math.min(this.controls.stations.value - 1, targetIndex));
			return clamped;
		}
		const base = Math.floor(Math.random() * (this.controls.stations.value - 1));
		const between = 0.15 + Math.random() * 0.7;
		return base + between;
	},
	updateMotion() {
		this.controls.motion.value = normalizeOptionValue(
			this.controls.motion.value,
			this.controls.motion.options,
			this.controls.motion.default
		);
		if (isSweepMotion(this.controls.motion.value) && this.stations.length) {
			this.sweep.cursor = this.static.active ? 0 : (this.runtime.index + 1) % this.stations.length;
			if (this.sweep.bandSlots?.length) {
				const found = this.sweep.bandSlots.findIndex((stationIndex) => stationIndex === this.sweep.cursor);
				if (found !== -1) {
					this.sweep.bandIndex = found;
					this.sweep.currentBandIndex = found;
				}
			}
		}
	},
	shouldPlayStatic() {
		if (!this.runtime.play || !this.stations.length) return false;
		this.controls.stationDensity.value = clampControl(this.controls.stationDensity);
		const staticChance = 100 - this.controls.stationDensity.value;
		if (staticChance <= 0) return false;
		return Math.random() * 100 < staticChance;
	},
	clampVolume(value) {
		return Math.max(0, Math.min(1, value));
	},
	beginTransition() {
		this.ui.runtime.fadeToken += 1;
		return this.ui.runtime.fadeToken;
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
			if (token !== this.ui.runtime.fadeToken) return;
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
		if (!this.static.gain) return;
		const to = this.clampVolume(target);
		const from = this.clampVolume(this.static.gain.gain.value || 0);
		if (Math.abs(from - to) < 0.002) {
			this.static.gain.gain.value = to;
			if (stopWhenSilent && to <= 0.001 && token === this.ui.runtime.fadeToken) this.stopStatic();
			return;
		}
		const start = performance.now();
		const step = (now) => {
			if (token !== this.ui.runtime.fadeToken) return;
			const t = durationMs <= 0 ? 1 : Math.min(1, (now - start) / durationMs);
			const eased = t * (2 - t);
			this.static.gain.gain.value = this.clampVolume(from + (to - from) * eased);
			if (t < 1) {
				requestAnimationFrame(step);
				return;
			}
			if (stopWhenSilent && this.static.gain.gain.value <= 0.001 && token === this.ui.runtime.fadeToken) {
				this.stopStatic();
			}
		};
		requestAnimationFrame(step);
	},
	staticTargetGain() {
		return this.clampVolume((this.controls.volume.value / 100) * this.static.levelFactor);
	},
	retuneStaticTexture(advanceDrift = true) {
		if (!this.static.filter) return;
		const context = getAudioContext();
		const now = context.currentTime;
		const toneVariance = getStaticToneVariance();
		if (advanceDrift) this.advanceStaticDrift();
		const drift = this.static.tone.drift * toneVariance;
		const wowCfg = APP_CONFIG.audio.static.tone.wowFlutter;
		if (wowCfg.enabled) {
			this.static.hum.phase += randomBetween(0.8, 1.2) * wowCfg.speedHz;
		}
		const wowHz = wowCfg.enabled ? Math.sin(this.static.hum.phase) * wowCfg.depthHz : 0;
		const targetFrequency = varyTone(
			APP_CONFIG.audio.static.tone.frequency.center + drift * APP_CONFIG.audio.static.tone.frequency.spread + wowHz,
			APP_CONFIG.audio.static.tone.frequency.spread * 0.1,
			toneVariance,
			APP_CONFIG.audio.static.tone.frequency.center - APP_CONFIG.audio.static.tone.frequency.spread,
			APP_CONFIG.audio.static.tone.frequency.center + APP_CONFIG.audio.static.tone.frequency.spread
		);
		const targetQ = varyTone(
			APP_CONFIG.audio.static.tone.q.center + drift * APP_CONFIG.audio.static.tone.q.spread,
			APP_CONFIG.audio.static.tone.q.spread * 0.1,
			toneVariance,
			APP_CONFIG.audio.static.tone.q.center - APP_CONFIG.audio.static.tone.q.spread,
			APP_CONFIG.audio.static.tone.q.center + APP_CONFIG.audio.static.tone.q.spread
		);
		const {min, max} = getStaticLevelBounds();
		this.static.filter.frequency.setTargetAtTime(targetFrequency, now, 0.06);
		this.static.filter.Q.setTargetAtTime(targetQ, now, 0.08);
		this.static.levelFactor = clampValue(this.static.levelFactor + (Math.random() - 0.5) * 0.02, min, max);
		this.applyNoiseProfile(this.buildNoiseProfile(this.static.tone.drift));
		this.retuneHum();
	},
	async startStatic() {
		if (this.static.node && this.static.filter && this.static.gain) return;
		if (this.static.initPromise) return this.static.initPromise;
		this.static.initPromise = (async () => {
			await this.ensureAudioContext();
			const context = getAudioContext();
			this.static.tone.drift = varyTone(0, 0.35, 1, -1, 1);
			this.static.tone.velocity = 0;
			const profile = this.buildNoiseProfile(this.static.tone.drift);
			const node = this.createNoiseNode(profile);
			const filter = context.createBiquadFilter();
			filter.type = 'bandpass';
			filter.frequency.value = APP_CONFIG.audio.static.tone.frequency.center;
			filter.Q.value = APP_CONFIG.audio.static.tone.q.center;
			const gain = context.createGain();
			gain.gain.value = 0;
			node.connect(filter);
			filter.connect(gain);
			gain.connect(context.destination);
			this.static.node = node;
			this.static.filter = filter;
			this.static.gain = gain;
			this.startHumBed();
			const {min, max} = getStaticLevelBounds();
			this.static.levelFactor = randomBetween(min, max);
		})();
		try {
			await this.static.initPromise;
		} finally {
			this.static.initPromise = null;
		}
	},
	stopStatic() {
		this.stopHumBed();
		if (this.static.node) {
			try { this.static.node.disconnect(); } catch {}
		}
		if (this.static.filter) {
			try { this.static.filter.disconnect(); } catch {}
		}
		if (this.static.gain) {
			try { this.static.gain.disconnect(); } catch {}
		}
		this.static.node = null;
		this.static.filter = null;
		this.static.gain = null;
	},
	playStatic(targetIndex = null) {
		const wasStatic = this.static.active;
		const token = this.beginTransition();
		this.static.active = true;
		this.static.position = this.chooseStaticPosition(targetIndex);
		this.syncNeedle();
		const fadeMs = wasStatic ? Math.max(240, Math.floor(this.ui.needle.transitions.stationToStaticMs * 0.7)) : this.ui.needle.transitions.stationToStaticMs;
		for (const i of this.stations.keys()) {
			this.fadeStation(i, 0, fadeMs, token);
		}
		const applyStaticFade = () => {
			this.retuneStaticTexture();
			this.fadeStaticGain(this.staticTargetGain(), fadeMs, token);
			this.setStaticHumTarget();
		};
		if (this.static.node && this.static.filter && this.static.gain) {
			applyStaticFade();
			return;
		}
		this.startStatic().then(applyStaticFade).catch((error) => {
			console.warn('Static engine start failed:', error?.message || error);
		});
	},
	playStation(index) {
		const wasStatic = this.static.active;
		const token = this.beginTransition();
		const targetVolume = this.clampVolume(this.controls.volume.value / 100);
		const staticBedTarget = this.stationBedStaticTarget();
		this.static.active = false;
		this.runtime.index = index;
		this.syncNeedle();
		this.refreshStreamWarmPool(index);
		const fadeMs = wasStatic ? this.ui.needle.transitions.staticToStationMs : this.ui.needle.transitions.stationToStationMs;
		for (const i of this.stations.keys()) {
			this.fadeStation(i, i === index ? targetVolume : 0, fadeMs, token);
		}
		const applyStaticBed = () => {
			this.retuneStaticTexture();
			this.fadeStaticGain(staticBedTarget, wasStatic ? fadeMs : this.ui.needle.transitions.stationToStationMs, token, false);
			this.setStaticHumTarget();
			this.applyWordWindowBurst(token, staticBedTarget);
		};
		if (this.static.node && this.static.filter && this.static.gain) {
			applyStaticBed();
			return;
		}
		this.startStatic().then(() => {
			if (token !== this.ui.runtime.fadeToken) return;
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
		this.controls.hopIntervalMs.value = clampControl(this.controls.hopIntervalMs);
		this.controls.stationDensity.value = clampControl(this.controls.stationDensity);
		this.controls.jitterMs.value = clampControl(this.controls.jitterMs);
		const jitter = this.controls.jitterMs.value;
		const min = Math.max(50, this.controls.hopIntervalMs.value - jitter);
		const max = this.controls.hopIntervalMs.value + jitter;
		return Math.floor(min + Math.random() * (max - min + 1));
	},
	scheduleRetuneTick() {
		if (!this.runtime.play || !this.stations.length) return;
		const delay = this.nextRetuneDelay();
		this.runtime.retuneTimer = setTimeout(() => {
			this.playNextSelection();
			this.scheduleRetuneTick();
		}, delay);
	},
	retune() {
		this.clearRetuneTimer();
		if (!this.runtime.play || !this.stations.length) return;
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
		this.refreshStreamWarmPool(this.runtime.index);
	},
	stopAllStreams() {
		this.clearChunkTimer();
		this.clearMicroMuteTimer();
		this.stopStatic();
		this.static.active = false;
		for (let i = 0; i < this.controls.stations.value; i++) {
			const audio = this.getAudio(i);
			if (!audio) continue;
			audio.muted = true;
			audio.volume = 0;
			audio.pause?.();
		}
	},
	unmute(index) {
		if (!this.runtime.play || !this.stations.length) return;
		this.refreshStreamWarmPool(index);
		for (const i of this.stations.keys()) {
			this.setAudioVolume(i, 0);
		}
		this.setAudioVolume(index, this.controls.volume.value / 100);
	},
	updateVolume() {
		if (!this.runtime.play) return;
		this.controls.volume.value = clampControl(this.controls.volume);
		const token = this.beginTransition();
		if (this.static.active && this.static.gain) {
			this.fadeStaticGain(this.staticTargetGain(), this.ui.needle.transitions.volumeRampMs, token);
			this.setStaticHumTarget();
			return;
		}
		if (this.static.gain) {
			this.fadeStaticGain(this.stationBedStaticTarget(), this.ui.needle.transitions.volumeRampMs, token);
			this.setStaticHumTarget();
		}
		for (const i of this.stations.keys()) {
			this.fadeStation(i, i === this.runtime.index ? this.clampVolume(this.controls.volume.value / 100) : 0, this.ui.needle.transitions.volumeRampMs, token);
		}
	},
	updateStationCount() {
		this.controls.stations.value = Math.max(this.controls.stations.min, Math.min(this.controls.stations.value, this.controls.stations.max));
		const stationCount = Math.min(this.controls.stations.value, this.runtime.allStations?.length ?? 0);
		if (!stationCount) return;
		if (this.runtime.index >= stationCount) this.runtime.index = 0;
		if (this.sweep.cursor >= stationCount) this.sweep.cursor = 0;
		this.rebuildStationBand();
		this.syncNeedle();
		if (this.runtime.play) {
			queueMicrotask(() => {
				this.startAllStreams();
				if (this.static.active) this.playStatic();
				else this.unmute(this.runtime.index);
			});
		}
		this.retune();
	},
	shuffle() {
		if (!this.runtime.allStations?.length) return;
		const shuffled = [...this.runtime.allStations];
		for (let i = shuffled.length - 1; i > 0; i--) {
			const j = Math.floor(Math.random() * (i + 1));
			[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
		}
		this.runtime.allStations = shuffled;
	},
	playPause() {
		if (!this.runtime.allStations?.length) return;
		if (this.runtime.play) {
			this.clearRetuneTimer();
			this.clearChunkTimer();
			this.clearMicroMuteTimer();
			this.stopAllStreams();
			this.runtime.play = false;
			return;
		}
		this.runtime.play = true;
		this.updateMotion();
		this.shuffle();
		if (isSweepMotion(this.controls.motion.value)) {
			this.sweep.cursor = 0;
			this.sweep.bandIndex = 0;
			this.sweep.currentBandIndex = 0;
		}
		queueMicrotask(() => {
			this.ensureAudioContext();
			this.startAllStreams();
			this.playNextSelection();
			this.retune();
			this.refreshChunkingTimer();
			this.updateMicroMute();
		});
	},
	mounted() {
		this.updateMotion();
		this.updateChunking();
		this.updateStatic();
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
