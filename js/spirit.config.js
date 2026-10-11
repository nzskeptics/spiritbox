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
			retry: {
				count: 2,
				delayMs: 350,
			},
		},
		tuning: {
			scanBias: {
				enabled: true,
				biasStrength: 0.75,
				holdSteps: {
					min: 4,
					max: 12,
				},
				reverseChance: 0.35,
			},
			frequencyBand: {
				minStationSeparation: 0.055,
				resolution: 180,
				repeats: {
					min: 2,
					max: 4,
				},
			},
		},
	},
	audio: {
		engine: {
			workletModule: './js/noise-worklet.js',
			streamPrewarmCount: 3,
			bufferSize: 4096,
		},
		static: {
			preset: 'medium',
			presets: {
				soft: {
					volume: {relative: 0.12, variance: 0.01, stationBedRelative: {min: 0.1, max: 0.3}},
					tone: {variance: 0.1, wowFlutter: {enabled: true, depthHz: 4, speedHz: 0.08}},
					drift: {step: {min: 0.0015, max: 0.007}, accel: 0.003, flipChance: 0.05},
					chunking: {enabledByDefault: true, interval: {minMs: 1200, maxMs: 2200}, jumpAmount: 0.48, edgeBias: 0.55},
					microMute: {
						enabled: true,
						interval: {minMs: 4200, maxMs: 7600},
						duration: {minMs: 16, maxMs: 40},
						duck: {min: 0.65, max: 0.85},
					},
					hum: {enabled: true, relativeLevel: 0.05, wander: {hz: 0.06, depthHz: 0.5}},
					wordWindow: {enabled: true, duckRatio: 0.78, timing: {preMs: 35, postMs: 95, recoverMs: 85}},
				},
				medium: {
					volume: {relative: 0.2, variance: 0.035, stationBedRelative: {min: 0.1, max: 0.5}},
					tone: {variance: 0.38, wowFlutter: {enabled: true, depthHz: 12, speedHz: 0.18}},
					drift: {step: {min: 0.005, max: 0.022}, accel: 0.009, flipChance: 0.13},
					chunking: {enabledByDefault: true, interval: {minMs: 700, maxMs: 1450}, jumpAmount: 0.88, edgeBias: 0.72},
					microMute: {
						enabled: true,
						interval: {minMs: 2300, maxMs: 5000},
						duration: {minMs: 24, maxMs: 70},
						duck: {min: 0.22, max: 0.42},
					},
					hum: {enabled: true, relativeLevel: 0.085, wander: {hz: 0.13, depthHz: 1.3}},
					wordWindow: {enabled: true, duckRatio: 0.48, timing: {preMs: 58, postMs: 138, recoverMs: 125}},
				},
				hard: {
					volume: {relative: 0.34, variance: 0.08, stationBedRelative: {min: 0.1, max: 0.8}},
					tone: {variance: 0.8, wowFlutter: {enabled: true, depthHz: 26, speedHz: 0.31}},
					drift: {step: {min: 0.014, max: 0.055}, accel: 0.024, flipChance: 0.28},
					chunking: {enabledByDefault: true, interval: {minMs: 350, maxMs: 900}, jumpAmount: 0.98, edgeBias: 0.82},
					microMute: {
						enabled: true,
						interval: {minMs: 1200, maxMs: 2800},
						duration: {minMs: 36, maxMs: 120},
						duck: {min: 0.08, max: 0.28},
					},
					hum: {enabled: true, relativeLevel: 0.14, wander: {hz: 0.24, depthHz: 2.8}},
					wordWindow: {enabled: true, duckRatio: 0.26, timing: {preMs: 95, postMs: 240, recoverMs: 170}},
				},
			},
			volume: {
				relative: 0.2,
				variance: 0.03,
				stationBedRelative: {min: 0.35, max: 0.55},
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
				step: {
					min: 0.005,
					max: 0.02,
				},
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
				edgeBias: 0.65,
				uiRange: {
					min: 250,
					max: 2500,
					step: 50,
				},
			},
			microMute: {
				enabled: true,
				interval: {
					minMs: 2500,
					maxMs: 5200,
				},
				duration: {
					minMs: 24,
					maxMs: 68,
				},
				duck: {
					min: 0.22,
					max: 0.45,
				},
			},
			hum: {
				enabled: true,
				baseHz: 58,
				overtoneHz: 116,
				relativeLevel: 0.08,
				wander: {
					hz: 0.12,
					depthHz: 1.2,
				},
			},
			wordWindow: {
				enabled: true,
				duckRatio: 0.5,
				timing: {
					preMs: 55,
					postMs: 130,
					recoverMs: 120,
				},
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
				station: {
					toStationMs: 520,
					toStaticMs: 720,
				},
				static: {
					toStationMs: 880,
				},
				volume: {
					rampMs: 180,
				},
				keepStaticEngineWarm: true,
			},
		},
	},
};
