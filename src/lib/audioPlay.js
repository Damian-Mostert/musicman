import { AudioContext } from 'node-web-audio-api';
import fs from 'fs';
import path from 'path';

class AudioPlayer {
  constructor() {
    this.ctx = new AudioContext();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.7;
    this.master.connect(this.ctx.destination);

    // Shared noise buffer for snare/hihat
    this._noiseBuffer = this._makeNoise(2.0);

    // Recording state
    this._recording   = false;
    this._recChunks   = [];   // Float32Array chunks (synth output)
    this._recNode     = null;
    this._recStartMs  = 0;    // wall-clock ms when recording started
    this.micChunks    = [];   // { data: Int16Array, offsetMs: number }
    this._micStartMs  = 0;    // wall-clock ms of first mic chunk
  }

  listPorts() { return ['System Speakers/Headphones']; }
  connect(portName) { console.log(`🔊 Connected to: ${portName}`); }

  // ── Bass note synthesis ────────────────────────────────────────────────────
  // Sawtooth osc → lowpass filter → ADSR gain
  // Sounds like a warm electric bass.
  playNote(note, velocity = 64) {
    const ctx = this.ctx;
    const freq = 440 * Math.pow(2, (note - 69) / 12);
    const amp  = (velocity / 127) * 0.55;
    const now  = ctx.currentTime;

    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(freq, now);

    // Sub-oscillator one octave down for body
    const sub = ctx.createOscillator();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(freq / 2, now);

    // Lowpass — roll off the harsh highs
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(900, now);
    filter.Q.value = 1.2;

    // ADSR envelope
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, now);
    env.gain.linearRampToValueAtTime(amp,       now + 0.008);  // attack
    env.gain.linearRampToValueAtTime(amp * 0.6, now + 0.06);   // decay
    env.gain.setValueAtTime(amp * 0.6,          now + 0.06);   // sustain

    const subGain = ctx.createGain();
    subGain.gain.value = 0.4;

    osc.connect(filter);
    sub.connect(subGain);
    subGain.connect(filter);
    filter.connect(env);
    env.connect(this.master);

    osc.start(now);
    sub.start(now);

    // Store so stopNote can release
    this._activeNotes = this._activeNotes || new Map();
    // Stop any previous note on this pitch
    this._releaseNote(note);
    this._activeNotes.set(note, { osc, sub, env, amp });
  }

  stopNote(note) {
    this._releaseNote(note);
  }

  _releaseNote(note) {
    if (!this._activeNotes) return;
    const n = this._activeNotes.get(note);
    if (!n) return;
    const now = this.ctx.currentTime;
    n.env.gain.cancelScheduledValues(now);
    n.env.gain.setValueAtTime(n.env.gain.value, now);
    n.env.gain.linearRampToValueAtTime(0, now + 0.08);  // release
    n.osc.stop(now + 0.09);
    n.sub.stop(now + 0.09);
    this._activeNotes.delete(note);
  }

  // ── Drum synthesis ─────────────────────────────────────────────────────────
  // Called by DrumEngine via drumHits push — we expose a direct method instead.
  triggerDrum(type, velocity) {
    const ctx = this.ctx;
    const amp = (velocity / 127);
    const now = ctx.currentTime;

    if (type === 'kick') {
      // Sine sweep 150→45 Hz + click transient
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(150, now);
      osc.frequency.exponentialRampToValueAtTime(45, now + 0.08);

      const click = ctx.createOscillator();
      click.type = 'triangle';
      click.frequency.setValueAtTime(200, now);

      const env = ctx.createGain();
      env.gain.setValueAtTime(amp * 0.9, now);
      env.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

      const clickEnv = ctx.createGain();
      clickEnv.gain.setValueAtTime(amp * 0.4, now);
      clickEnv.gain.exponentialRampToValueAtTime(0.001, now + 0.02);

      // Slight distortion via waveshaper
      const dist = ctx.createWaveShaper();
      dist.curve = this._distCurve(6);

      osc.connect(dist); dist.connect(env); env.connect(this.master);
      click.connect(clickEnv); clickEnv.connect(this.master);
      osc.start(now); osc.stop(now + 0.36);
      click.start(now); click.stop(now + 0.03);

    } else if (type === 'snare') {
      // Noise burst through bandpass + short tone
      const noise = ctx.createBufferSource();
      noise.buffer = this._noiseBuffer;

      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 1800;
      bp.Q.value = 0.7;

      const tone = ctx.createOscillator();
      tone.type = 'triangle';
      tone.frequency.value = 185;

      const noiseEnv = ctx.createGain();
      noiseEnv.gain.setValueAtTime(amp * 0.7, now);
      noiseEnv.gain.exponentialRampToValueAtTime(0.001, now + 0.18);

      const toneEnv = ctx.createGain();
      toneEnv.gain.setValueAtTime(amp * 0.5, now);
      toneEnv.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

      noise.connect(bp); bp.connect(noiseEnv); noiseEnv.connect(this.master);
      tone.connect(toneEnv); toneEnv.connect(this.master);
      noise.start(now); noise.stop(now + 0.2);
      tone.start(now); tone.stop(now + 0.1);

    } else if (type === 'hihat') {
      // Short filtered noise burst
      const noise = ctx.createBufferSource();
      noise.buffer = this._noiseBuffer;

      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 7000;

      const env = ctx.createGain();
      const decay = 0.04;
      env.gain.setValueAtTime(amp * 0.4, now);
      env.gain.exponentialRampToValueAtTime(0.001, now + decay);

      noise.connect(hp); hp.connect(env); env.connect(this.master);
      noise.start(now); noise.stop(now + decay + 0.01);

    } else if (type === 'ride') {
      // Longer filtered noise — more shimmer
      const noise = ctx.createBufferSource();
      noise.buffer = this._noiseBuffer;

      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 5000;

      const env = ctx.createGain();
      env.gain.setValueAtTime(amp * 0.3, now);
      env.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

      noise.connect(hp); hp.connect(env); env.connect(this.master);
      noise.start(now); noise.stop(now + 0.13);
    }
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  _makeNoise(durationSec) {
    const ctx = this.ctx;
    const len = Math.floor(ctx.sampleRate * durationSec);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  _distCurve(amount) {
    const n = 256;
    const curve = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = (i * 2) / n - 1;
      curve[i] = ((Math.PI + amount) * x) / (Math.PI + amount * Math.abs(x));
    }
    return curve;
  }

  midiToFrequency(midi) {
    return 440 * Math.pow(2, (midi - 69) / 12);
  }

  // ── Recording ──────────────────────────────────────────────────────────────

  startRecording() {
    if (this._recording) return;
    this._recording  = true;
    this._recChunks  = [];
    this.micChunks   = [];
    this._recStartMs = Date.now();
    this._micStartMs = 0;

    // ScriptProcessorNode taps the master bus — bufferSize 4096, stereo out
    const proc = this.ctx.createScriptProcessor(4096, 2, 2);
    proc.onaudioprocess = (e) => {
      if (!this._recording) return;
      // Copy left channel samples
      const ch = e.inputBuffer.getChannelData(0);
      this._recChunks.push(new Float32Array(ch));
    };
    this.master.connect(proc);
    proc.connect(this.ctx.destination);
    this._recNode = proc;
    console.log('⏺  Recording started');
  }

  stopRecording(savePath) {
    if (!this._recording) return;
    this._recording = false;

    if (this._recNode) {
      this._recNode.disconnect();
      this._recNode = null;
    }

    // Flatten synth samples
    const synthLen = this._recChunks.reduce((s, c) => s + c.length, 0);
    const synth = new Float32Array(synthLen);
    let offset = 0;
    for (const chunk of this._recChunks) { synth.set(chunk, offset); offset += chunk.length; }
    this._recChunks = [];

    // Flatten mic samples — each chunk has a wall-clock timestamp
    // Align mic to synth by computing sample offset from recording start
    const sampleRate = this.ctx.sampleRate;
    let micTotalSamples = 0;
    for (const c of this.micChunks) micTotalSamples += c.data.length;

    const micRaw = new Int16Array(micTotalSamples);
    let micOffset = 0;
    for (const c of this.micChunks) { micRaw.set(c.data, micOffset); micOffset += c.data.length; }
    this.micChunks = [];

    // How many synth samples elapsed before the first mic chunk arrived
    const micDelayMs      = this._micStartMs - this._recStartMs;
    const micDelaySamples = Math.round((micDelayMs / 1000) * sampleRate);

    // Resample mic (16kHz) to synth sample rate, then shift by delay
    const micResampled = _resample(micRaw, 16000, sampleRate, synthLen - micDelaySamples);
    const micAligned   = new Float32Array(synthLen); // zero-padded at start
    micAligned.set(micResampled, micDelaySamples);

    // Mix synth + aligned mic to mono
    const mixed = new Float32Array(synthLen);
    for (let i = 0; i < synthLen; i++) {
      mixed[i] = (synth[i] + micAligned[i] * 0.8) / 2;
    }

    fs.mkdirSync(path.dirname(savePath), { recursive: true });
    fs.writeFileSync(savePath, _encodeWavMono(mixed, this.ctx.sampleRate));
    console.log(`💾 Saved recording → ${savePath}`);
  }

  close() {
    this.ctx.close();
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────

// Linear resample Int16 src (srcRate) to Float32 of targetLen samples at dstRate
function _resample(int16src, srcRate, dstRate, targetLen) {
  const out   = new Float32Array(targetLen);
  const ratio = int16src.length / targetLen;  // src samples per dst sample
  for (let i = 0; i < targetLen; i++) {
    const pos = i * ratio;
    const lo  = Math.floor(pos);
    const hi  = Math.min(lo + 1, int16src.length - 1);
    const t   = pos - lo;
    out[i]    = ((int16src[lo] * (1 - t) + int16src[hi] * t) / 32768);
  }
  return out;
}

// Mono WAV encoder
function _encodeWavMono(samples, sampleRate) {
  const bitsPerSample = 16;
  const dataLen = samples.length * (bitsPerSample / 8);
  const buf = Buffer.alloc(44 + dataLen);

  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + dataLen, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);              // PCM
  buf.writeUInt16LE(1, 22);              // mono
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * bitsPerSample / 8, 28);
  buf.writeUInt16LE(bitsPerSample / 8, 32);
  buf.writeUInt16LE(bitsPerSample, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(dataLen, 40);

  for (let i = 0; i < samples.length; i++) {
    buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, samples[i])) * 32767), 44 + i * 2);
  }
  return buf;
}

export default AudioPlayer;
