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
import {createApp} from '/petite-vue.es.js';
createApp({
	number: 6,
	volume: 50,
	ms: 300,
	index: 0,
	allStations: null,
	interval: null,
	play: false,
	times: [200, 400, 600, 800, 1000],
	get stations() {
		if (this.play) return this.allStations?.slice(0, this.number);
		return [];
	},
	get station() {
		return this.stations?.[this.index];
	},
	retune() {
		clearInterval(this.interval);
		if (this.play) this.interval = setInterval(() => {
			this.index = Math.floor(Math.random() * this.number);
			this.unmute(this.index);
		}, this.ms);
	},
	unmute(index) {
		console.log(this.$refs['audio0']);
		for (const i of this.stations.keys()) {
			// this.$refs['audio-' + i][0].muted = true;
			this.$refs['audio' + i].volume = 0;
		}
		// this.$refs['audio-' + index][0].muted = false;
		this.$refs['audio' + index].volume = this.volume / 100;
	},
	shuffle() {
		this.allStations = this.allStations.sort(() => Math.random() - 0.5);
	},
	playPause() {
		this.play = !this.play;
		if (this.play) {
			this.shuffle();
			this.unmute(this.index);
		}
		this.retune();
	},
	mounted() {
		fetch("stations.json")
			.then((response) => response.json())
			.then((json) => this.allStations = json);
	},
}).mount('form');
