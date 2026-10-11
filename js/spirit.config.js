import {RADIO_BROWSER_API_BASE} from './radioBrowserApi.mjs';

export const APP_CONFIG = {
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
			frequencyBand: {
				minStationSeparation: 0.055,
				resolution: 180,
				repeatsMin: 2,
				repeatsMax: 4,
			},
		},
	},
	audio: {
		engine: {
			workletModule: './noise-worklet.js',
			streamPrewarmCount: 3,
			bufferSize: 4096,
		},
		static: {
			preset: 'medium',
			presets: {
				soft: {
					volume: {relative: 0.18, variance: 0.02, stationBedRelative: 0.03},
					tone: {variance: 0.2, wowFlutter: {enabled: true, depthHz: 8, speedHz: 0.14}},
					drift: {stepMin: 0.003, stepMax: 0.014, accel: 0.006, flipChance: 0.1},
					chunking: {enabledByDefault: true, interval: {minMs: 900, maxMs: 1800}, jumpAmount: 0.55},
					microMute: {enabled: true, intervalMinMs: 3200, intervalMaxMs: 6200, durationMinMs: 20, durationMaxMs: 54, duckMin: 0.25, duckMax: 0.5},
					hum: {enabled: true, relativeLevel: 0.07, wanderHz: 0.09, wanderDepthHz: 0.8},
					wordWindow: {enabled: true, duckRatio: 0.6, preMs: 45, postMs: 110, recoverMs: 100},
				},
				medium: {
					volume: {relative: 0.2, variance: 0.03, stationBedRelative: 0.04},
					tone: {variance: 0.3, wowFlutter: {enabled: true, depthHz: 12, speedHz: 0.18}},
					drift: {stepMin: 0.005, stepMax: 0.02, accel: 0.008, flipChance: 0.12},
					chunking: {enabledByDefault: true, interval: {minMs: 750, maxMs: 1500}, jumpAmount: 0.7},
					microMute: {enabled: true, intervalMinMs: 2500, intervalMaxMs: 5200, durationMinMs: 24, durationMaxMs: 68, duckMin: 0.22, duckMax: 0.45},
					hum: {enabled: true, relativeLevel: 0.08, wanderHz: 0.12, wanderDepthHz: 1.2},
					wordWindow: {enabled: true, duckRatio: 0.5, preMs: 55, postMs: 130, recoverMs: 120},
				},
				hard: {
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
				stationBedRelative: 0.5,
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
			label: 'Volume',
			help: 'Overall loudness of what you hear.',
			min: 0,
			max: 100,
			step: 1,
			default: 50,
			visible: true,
		},
		stations: {
			label: 'Stations',
			help: 'How many radio channels the spirit box can sweep through.',
			min: 4,
			max: 20,
			step: 1,
			default: 10,
			visible: true,
		},
		hopIntervalMs: {
			label: 'Interval',
			help: 'How quickly the spirit box jumps to the next channel.',
			min: 50,
			max: 500,
			step: 50,
			default: 100,
			visible: true,
		},
		stationDensity: {
			label: 'Density',
			help: 'Balance between voices and noise. Higher means more radio audio, lower means more hiss.',
			min: 0,
			max: 100,
			step: 5,
			default: 20,
			visible: true,
		},
		jitterMs: {
			label: 'Jitter',
			help: 'Adds randomness to jump timing so scans feel less mechanical.',
			min: 0,
			max: 200,
			step: 5,
			default: 0,
			visible: false,
		},
		chunking: {
			label: 'Jump',
			help: 'How many consecutive frequencies play before jumping to a new starting frequency.',
			min: 0,
			max: 1500,
			step: 750,
			default: 750,
			visible: true,
		},
		static: {
			label: 'Static',
			help: 'Noise character: soft, medium, or harsh background hiss.',
			optionHelp: {
				soft: 'Soft',
				medium: 'Medium',
				hard: 'Hard',
			},
			options: ['soft', 'medium', 'hard'],
			default: 'medium',
			visible: true,
		},
		motion: {
			label: 'Motion',
			help: 'Choose scan style: random jumps or steady left-to-right sweep.',
			optionHelp: {
				random: 'Jump randomly',
				sweep: 'Sweep left to right',
			},
			options: ['random', 'sweep'],
			default: 'sweep',
			visible: true,
		},
	},
	ui: {
		needle: {
			// step = instant jumps, smooth = CSS easing, analog = eased + slight wobble
			motion: 'analog',
			mode: {
				// smooth animates sweep movement; jump snaps to each next sweep position.
				sweep: 'smooth',
				// jump makes chunk/static dial changes instantaneous; slide keeps animated motion.
				chunk: 'jump',
			},
			transitions: {
				stationToStationMs: 520,
				stationToStaticMs: 720,
				staticToStationMs: 880,
				volumeRampMs: 180,
				keepStaticEngineWarm: true,
			},
		},
	},
};
