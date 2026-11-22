/** A wooden "knock knock", synthesised (no audio file to load). */
let ctx: AudioContext | null = null;

export function playKnock(times = 2) {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === "suspended") void ctx.resume();
    const ac = ctx;
    for (let i = 0; i < times; i++) {
      const at = ac.currentTime + i * 0.17;
      // body of the knock: a quick low thump
      const osc = ac.createOscillator();
      const og = ac.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(180, at);
      osc.frequency.exponentialRampToValueAtTime(70, at + 0.09);
      og.gain.setValueAtTime(0.0001, at);
      og.gain.exponentialRampToValueAtTime(0.5, at + 0.004);
      og.gain.exponentialRampToValueAtTime(0.0001, at + 0.13);
      osc.connect(og).connect(ac.destination);
      osc.start(at);
      osc.stop(at + 0.15);
      // the knuckle on wood: a short filtered noise click
      const len = Math.floor(ac.sampleRate * 0.04);
      const buf = ac.createBuffer(1, len, ac.sampleRate);
      const data = buf.getChannelData(0);
      for (let j = 0; j < len; j++) data[j] = (Math.random() * 2 - 1) * Math.pow(1 - j / len, 3);
      const noise = ac.createBufferSource();
      noise.buffer = buf;
      const bp = ac.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = 900;
      bp.Q.value = 1.2;
      const ng = ac.createGain();
      ng.gain.value = 0.35;
      noise.connect(bp).connect(ng).connect(ac.destination);
      noise.start(at);
    }
  } catch {
    /* audio unavailable — the knock is still visible */
  }
}
