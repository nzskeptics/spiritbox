class SpiritNoiseProcessor extends AudioWorkletProcessor {
	constructor() {
		super();
		this.profile = {
			lowpass: 0.9,
			hiss: 0.35,
			crackleChance: 0.0015,
		};
		this.last = 0;
		this.port.onmessage = (event) => {
			if (event.data?.type !== 'set-profile') return;
			const next = event.data.profile || {};
			this.profile = {
				lowpass: Number.isFinite(next.lowpass) ? next.lowpass : this.profile.lowpass,
				hiss: Number.isFinite(next.hiss) ? next.hiss : this.profile.hiss,
				crackleChance: Number.isFinite(next.crackleChance) ? next.crackleChance : this.profile.crackleChance,
			};
		};
	}

	process(_inputs, outputs) {
		const out = outputs[0];
		if (!out?.length) return true;
		const channel = out[0];
		const lowpass = this.profile.lowpass;
		const hiss = this.profile.hiss;
		const crackleChance = this.profile.crackleChance;
		for (let i = 0; i < channel.length; i++) {
			const white = Math.random() * 2 - 1;
			this.last = this.last * lowpass + white * (1 - lowpass);
			let sample = this.last * (1 - hiss) + white * hiss;
			if (Math.random() < crackleChance) {
				sample += (Math.random() * 2 - 1) * 0.65;
			}
			channel[i] = sample;
		}
		return true;
	}
}

registerProcessor('spirit-noise-processor', SpiritNoiseProcessor);
