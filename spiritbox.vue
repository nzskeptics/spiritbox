<template>
	<form>
		<button type='button' @click="play = !play">{{play ? 'Stop' : 'Play'}}</button>
		<h2>Station: <a v-if="station" :href="station.website">{{station.name}}</a></h2>
		<h2>Number of Stations: {{number}}</h2>
		<input id="number" type="range" min="2" max="16" v-model.number="number" :title="stations.slice(0, number).map((station) => station.name).join('\n')" />
		<h2>Switches per {{per}} seconds: {{rate}}</h2>
		<input id="rate" type="range" min="1" max="10" v-model.number="rate" :title="(per / rate).toFixed(2) + ' seconds per station'" />
		{{index}}
		<div v-if="play">
			<audio v-for="(details, id) in stations" :key="id" :ref="'audio-' + id" controls autoplay disabled :src="details.url" />
		</div>
	</form>
</template>

<script>
	export default {
		data() {
			return {
				number: 6,
				rate: 2,
				per: 5,
				index: 0,
				allStations: require('./stations.json'),
				interval: null,
				play: false,
			};
		},
		mounted() {
			this.retune();
		},
		computed: {
			stations() {
				return this.allStations.slice(0, this.number).sort(() => Math.random() - 0.5);
			},
			station() {
				return this.stations[this.index];
			},
		},
		methods: {
			retune() {
				clearInterval(this.interval);
				if (this.play) this.interval = setInterval(() => {
					this.index = Math.floor(Math.random() * this.number);
				}, this.per * 1000 / this.rate);
			},
			unmute(index) {
				for (const [index, station] of this.stations.entries()) {
					this.$refs['audio-' + index][0].muted = true;
				}
				this.$refs['audio-' + index][0].muted = false;
			},
		},
		watch: {
			number() {
				this.retune();
			},
			rate() {
				this.retune();
			},
			play() {
				this.retune();
			},
			index() {
				this.unmute(this.index);
			}
		},
	};
</script>

<style scoped>
	#slider {
		width: 80%;
		margin-right: 1em;
		margin-bottom: 2em;
	}
</style>
