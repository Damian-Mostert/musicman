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
    this._recording      = false;
    this._recChunks      = [];   // { data: Float32Array, wallMs: number }
    this._recNode        = null;
    this._recStartMs     = 0;    // wall-clock ms when recording started
    this.micChunks       = [];   // { data: Int16Array, wallMs: number }
    this._micStartMs     = 0;    // wall-clock ms of first mic chunk

    // Echo reference: rolling buffer of raw output at ctx.sampleRate
    this._refBuf         = [];   // Float32Array chunks
    this._refBufLen      = 0;    // total samples stored
    this._refMaxSamples  = 0;    // set once ctx.sampleRate is known
    this._refNode        = null;
    this._startRefCapture();
  }

  listPorts() { return ['System Speakers/Headphones']; }
  connect(portName) { console.log(`🔊 Connected to: ${portName}`); }

  // ── Bass note synthesis ────────────────────────────────────────────────────
  // Two detuned sawtooths → lowpass with filter envelope → ADSR amp envelope
  // Gives a thick, slightly chorused electric bass tone.
  playNote(note, velocity = 64) {
    const ctx  = this.ctx;
    const freq = 440 * Math.pow(2, (note - 69) / 12);
    const amp  = (velocity / 127) * 0.5;
    const now  = ctx.currentTime;

    // Two slightly detuned sawtooths for thickness
    const osc1 = ctx.createOscillator();
    osc1.type = 'sawtooth';
    osc1.frequency.setValueAtTime(freq * 1.003, now);

    const osc2 = ctx.createOscillator();
    osc2.type = 'sawtooth';
    osc2.frequency.setValueAtTime(freq * 0.997, now);

    // Sub-oscillator one octave down for body
    const sub = ctx.createOscillator();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(freq / 2, now);

    // Filter envelope — opens up on attack then closes for that classic bass pluck
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.Q.value = 2.5;
    filter.frequency.setValueAtTime(200, now);
    filter.frequency.linearRampToValueAtTime(1800, now + 0.025);  // filter attack
    filter.frequency.exponentialRampToValueAtTime(600, now + 0.18); // filter decay

    // Amp ADSR
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, now);
    env.gain.linearRampToValueAtTime(amp,       now + 0.006);
    env.gain.linearRampToValueAtTime(amp * 0.7, now + 0.07);
    env.gain.setValueAtTime(amp * 0.7,          now + 0.07);

    const subGain = ctx.createGain();
    subGain.gain.value = 0.45;
    const oscMix = ctx.createGain();
    oscMix.gain.value = 0.5;

    osc1.connect(oscMix); osc2.connect(oscMix);
    oscMix.connect(filter);
    sub.connect(subGain); subGain.connect(filter);
    filter.connect(env);
    env.connect(this.master);

    osc1.start(now); osc2.start(now); sub.start(now);

    this._activeNotes = this._activeNotes || new Map();
    this._releaseNote(note);
    this._activeNotes.set(note, { oscs: [osc1, osc2, sub], env, amp });
  }

  // ── Melody note synthesis ──────────────────────────────────────────────────
  // Sine + triangle blend with a slow vibrato — warm, vocal-like lead tone.
  playMelodyNote(note, velocity = 64) {
    const ctx  = this.ctx;
    const freq = 440 * Math.pow(2, (note - 69) / 12);
    const amp  = (velocity / 127) * 0.38;
    const now  = ctx.currentTime;

    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, now);

    // Sine layer for warmth
    const sine = ctx.createOscillator();
    sine.type = 'sine';
    sine.frequency.setValueAtTime(freq, now);

    // Slow vibrato LFO (~5 Hz, ±4 cents) — kicks in after 120ms
    const lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 5.2;
    const lfoGain = ctx.createGain();
    lfoGain.gain.setValueAtTime(0, now);
    lfoGain.gain.linearRampToValueAtTime(freq * 0.0023, now + 0.12); // ramp in
    lfo.connect(lfoGain);
    lfoGain.connect(osc.frequency);
    lfoGain.connect(sine.frequency);

    // Gentle highpass to keep it out of the bass range
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 180;

    // Amp envelope — slightly slower attack for legato feel
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, now);
    env.gain.linearRampToValueAtTime(amp,       now + 0.04);
    env.gain.linearRampToValueAtTime(amp * 0.8, now + 0.15);
    env.gain.setValueAtTime(amp * 0.8,          now + 0.15);

    const sineGain = ctx.createGain();
    sineGain.gain.value = 0.6;

    osc.connect(hp); sine.connect(sineGain); sineGain.connect(hp);
    hp.connect(env); env.connect(this.master);

    osc.start(now); sine.start(now); lfo.start(now);

    this._activeNotes = this._activeNotes || new Map();
    this._releaseMelodyNote(note);
    this._activeMelodyNotes = this._activeMelodyNotes || new Map();
    this._activeMelodyNotes.set(note, { oscs: [osc, sine, lfo], env, amp });
  }

  stopMelodyNote(note) { this._releaseMelodyNote(note); }

  _releaseMelodyNote(note) {
    if (!this._activeMelodyNotes) return;
    const n = this._activeMelodyNotes.get(note);
    if (!n) return;
    const now = this.ctx.currentTime;
    n.env.gain.cancelScheduledValues(now);
    n.env.gain.setValueAtTime(n.env.gain.value, now);
    n.env.gain.linearRampToValueAtTime(0, now + 0.12);
    for (const o of n.oscs) o.stop(now + 0.13);
    this._activeMelodyNotes.delete(note);
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
    n.env.gain.linearRampToValueAtTime(0, now + 0.08);
    for (const o of n.oscs) o.stop(now + 0.09);
    this._activeNotes.delete(note);
  }

  // ── Drum synthesis ─────────────────────────────────────────────────────────
  // Called by DrumEngine via drumHits push — we expose a direct method instead.
  triggerDrum(type, velocity) {
    const ctx = this.ctx;
    const amp = (velocity / 127);
    const now = ctx.currentTime;

    if (type === 'kick') {
      // Sub-bass sine sweep + click transient + slight distortion
      const body = ctx.createOscillator();
      body.type = 'sine';
      body.frequency.setValueAtTime(180, now);
      body.frequency.exponentialRampToValueAtTime(38, now + 0.06);
      body.frequency.exponentialRampToValueAtTime(30, now + 0.25);

      const click = ctx.createOscillator();
      click.type = 'triangle';
      click.frequency.setValueAtTime(3000, now);
      click.frequency.exponentialRampToValueAtTime(80, now + 0.012);

      const bodyEnv = ctx.createGain();
      bodyEnv.gain.setValueAtTime(amp * 1.1, now);
      bodyEnv.gain.exponentialRampToValueAtTime(0.001, now + 0.45);

      const clickEnv = ctx.createGain();
      clickEnv.gain.setValueAtTime(amp * 0.6, now);
      clickEnv.gain.exponentialRampToValueAtTime(0.001, now + 0.018);

      const dist = ctx.createWaveShaper();
      dist.curve = this._distCurve(8);

      body.connect(dist); dist.connect(bodyEnv); bodyEnv.connect(this.master);
      click.connect(clickEnv); clickEnv.connect(this.master);
      body.start(now); body.stop(now + 0.46);
      click.start(now); click.stop(now + 0.02);

    } else if (type === 'snare') {
      // Two noise layers (body + crack) + pitched tone
      const body = ctx.createBufferSource();
      body.buffer = this._noiseBuffer;
      const crack = ctx.createBufferSource();
      crack.buffer = this._noiseBuffer;

      const bodyBp = ctx.createBiquadFilter();
      bodyBp.type = 'bandpass';
      bodyBp.frequency.value = 1200;
      bodyBp.Q.value = 0.5;

      const crackHp = ctx.createBiquadFilter();
      crackHp.type = 'highpass';
      crackHp.frequency.value = 5000;

      const tone = ctx.createOscillator();
      tone.type = 'triangle';
      tone.frequency.setValueAtTime(220, now);
      tone.frequency.exponentialRampToValueAtTime(160, now + 0.05);

      const bodyEnv = ctx.createGain();
      bodyEnv.gain.setValueAtTime(amp * 0.75, now);
      bodyEnv.gain.exponentialRampToValueAtTime(0.001, now + 0.22);

      const crackEnv = ctx.createGain();
      crackEnv.gain.setValueAtTime(amp * 0.55, now);
      crackEnv.gain.exponentialRampToValueAtTime(0.001, now + 0.04);

      const toneEnv = ctx.createGain();
      toneEnv.gain.setValueAtTime(amp * 0.45, now);
      toneEnv.gain.exponentialRampToValueAtTime(0.001, now + 0.07);

      body.connect(bodyBp); bodyBp.connect(bodyEnv); bodyEnv.connect(this.master);
      crack.connect(crackHp); crackHp.connect(crackEnv); crackEnv.connect(this.master);
      tone.connect(toneEnv); toneEnv.connect(this.master);
      body.start(now); body.stop(now + 0.23);
      crack.start(now); crack.stop(now + 0.05);
      tone.start(now); tone.stop(now + 0.08);

    } else if (type === 'hihat') {
      // Two bandpass layers at different frequencies for metallic texture
      const n1 = ctx.createBufferSource();
      n1.buffer = this._noiseBuffer;
      const n2 = ctx.createBufferSource();
      n2.buffer = this._noiseBuffer;

      const bp1 = ctx.createBiquadFilter();
      bp1.type = 'bandpass';
      bp1.frequency.value = 8000 + Math.random() * 1500; // slight pitch variation
      bp1.Q.value = 1.2;

      const bp2 = ctx.createBiquadFilter();
      bp2.type = 'highpass';
      bp2.frequency.value = 10000;

      const decay = 0.038 + Math.random() * 0.012; // slight length variation
      const env = ctx.createGain();
      env.gain.setValueAtTime(amp * 0.45, now);
      env.gain.exponentialRampToValueAtTime(0.001, now + decay);

      n1.connect(bp1); bp1.connect(env); env.connect(this.master);
      n2.connect(bp2); bp2.connect(env);
      n1.start(now); n1.stop(now + decay + 0.01);
      n2.start(now); n2.stop(now + decay + 0.01);

    } else if (type === 'ride') {
      // Metallic shimmer: noise + a resonant pitched ping
      const noise = ctx.createBufferSource();
      noise.buffer = this._noiseBuffer;

      const hp = ctx.createBiquadFilter();
      hp.type = 'bandpass';
      hp.frequency.value = 6000;
      hp.Q.value = 0.8;

      // Pitched ping for the "bow" of the ride
      const ping = ctx.createOscillator();
      ping.type = 'sine';
      ping.frequency.value = 3400;

      const noiseEnv = ctx.createGain();
      noiseEnv.gain.setValueAtTime(amp * 0.28, now);
      noiseEnv.gain.exponentialRampToValueAtTime(0.001, now + 0.18);

      const pingEnv = ctx.createGain();
      pingEnv.gain.setValueAtTime(amp * 0.18, now);
      pingEnv.gain.exponentialRampToValueAtTime(0.001, now + 0.25);

      noise.connect(hp); hp.connect(noiseEnv); noiseEnv.connect(this.master);
      ping.connect(pingEnv); pingEnv.connect(this.master);
      noise.start(now); noise.stop(now + 0.19);
      ping.start(now); ping.stop(now + 0.26);
    }
  }

  // ── Echo reference capture ─────────────────────────────────────────────────
  // Continuously captures master output into a rolling 2-second PCM buffer
  // at the native sample rate. AudioListener calls getReferenceSamples() to
  // subtract our own sound from the mic before pitch detection.

  _startRefCapture() {
    // node-web-audio-api renders lazily — defer until first audio tick
    const tryConnect = () => {
      if (this._refNode) return;
      const sr = this.ctx.sampleRate;
      this._refMaxSamples = sr * 2; // 2-second rolling window
      const proc = this.ctx.createScriptProcessor(4096, 1, 1);
      proc.onaudioprocess = (e) => {
        const ch = e.inputBuffer.getChannelData(0);
        this._refBuf.push(new Float32Array(ch));
        this._refBufLen += ch.length;
        // Trim oldest chunks to stay within window
        while (this._refBufLen - this._refBuf[0].length >= this._refMaxSamples) {
          this._refBufLen -= this._refBuf.shift().length;
        }
      };
      this.master.connect(proc);
      proc.connect(this.ctx.destination);
      this._refNode = proc;
    };
    // Retry until the AudioContext is running
    const poll = setInterval(() => {
      if (this.ctx.state === 'running') { tryConnect(); clearInterval(poll); }
    }, 100);
  }

  // Returns the last `count` samples of output resampled to `targetRate` (mic rate).
  // Returns null if nothing has been captured yet.
  getReferenceSamples(count, targetRate) {
    if (this._refBufLen === 0) return null;
    const sr = this.ctx.sampleRate;
    // How many native samples do we need to cover `count` target samples?
    const nativeNeeded = Math.ceil(count * (sr / targetRate));
    const take = Math.min(nativeNeeded, this._refBufLen);

    // Flatten the tail of the rolling buffer
    const flat = new Float32Array(take);
    let pos = take;
    for (let i = this._refBuf.length - 1; i >= 0 && pos > 0; i--) {
      const chunk = this._refBuf[i];
      const copyLen = Math.min(chunk.length, pos);
      flat.set(chunk.subarray(chunk.length - copyLen), pos - copyLen);
      pos -= copyLen;
    }

    // Downsample to targetRate
    const ratio = sr / targetRate;
    const out = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      const srcPos = i * ratio;
      const lo = Math.floor(srcPos);
      const hi = Math.min(lo + 1, flat.length - 1);
      out[i] = flat[lo] * (1 - (srcPos - lo)) + flat[hi] * (srcPos - lo);
    }
    return out;
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

    const proc = this.ctx.createScriptProcessor(4096, 2, 2);
    proc.onaudioprocess = (e) => {
      if (!this._recording) return;
      const ch = e.inputBuffer.getChannelData(0);
      // Tag each chunk with wall-clock time so we can align with mic
      this._recChunks.push({ data: new Float32Array(ch), wallMs: Date.now() });
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

    // Flatten synth chunks. Each chunk has a wallMs timestamp.
    // Find the wall-clock time of the first chunk — this is when the synth
    // ScriptProcessor started firing, which may be later than _recStartMs
    // because node-web-audio-api doesn't render until something plays.
    const sampleRate = this.ctx.sampleRate;
    const chunks = this._recChunks;
    this._recChunks = [];
    if (chunks.length === 0) { console.log('Nothing recorded.'); return; }

    const synthStartMs = chunks[0].wallMs;
    const synthLen     = chunks.reduce((s, c) => s + c.data.length, 0);
    const synth        = new Float32Array(synthLen);
    let offset = 0;
    for (const c of chunks) { synth.set(c.data, offset); offset += c.data.length; }

    // Flatten mic
    let micTotalSamples = 0;
    for (const c of this.micChunks) micTotalSamples += c.data.length;
    const micRaw = new Int16Array(micTotalSamples);
    let micOffset = 0;
    for (const c of this.micChunks) { micRaw.set(c.data, micOffset); micOffset += c.data.length; }
    this.micChunks = [];

    // Resample mic from 16kHz to synth sample rate
    const micResampled = _resample(micRaw, 16000, sampleRate);

    // Align: mic starts at _micStartMs, synth starts at synthStartMs.
    // Positive = mic arrived after synth started (pad mic start with silence).
    // Negative = mic arrived before synth started (trim mic head).
    const micStartMs   = this._micStartMs > 0 ? this._micStartMs : synthStartMs;
    const offsetMs     = micStartMs - synthStartMs;
    const offsetSamples = Math.round((offsetMs / 1000) * sampleRate);

    const micAligned = new Float32Array(synthLen);
    if (offsetSamples >= 0) {
      // Mic starts after synth — pad front
      const copyLen = Math.min(micResampled.length, synthLen - offsetSamples);
      if (copyLen > 0) micAligned.set(micResampled.subarray(0, copyLen), offsetSamples);
    } else {
      // Mic starts before synth — trim mic head
      const trimSamples = Math.min(-offsetSamples, micResampled.length);
      const copyLen     = Math.min(micResampled.length - trimSamples, synthLen);
      if (copyLen > 0) micAligned.set(micResampled.subarray(trimSamples, trimSamples + copyLen), 0);
    }

    console.log(`🎚  Sync: synthStart=${synthStartMs - this._recStartMs}ms after rec, micOffset=${offsetMs.toFixed(0)}ms (${offsetSamples} samples)`);

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

// Linear resample Int16 src (srcRate) to Float32 at dstRate
function _resample(int16src, srcRate, dstRate) {
  const ratio    = srcRate / dstRate;           // src samples per dst sample
  const outLen   = Math.ceil(int16src.length / ratio);
  const out      = new Float32Array(outLen);
  for (let i = 0; i < outLen; i++) {
    const pos = i * ratio;
    const lo  = Math.floor(pos);
    const hi  = Math.min(lo + 1, int16src.length - 1);
    const t   = pos - lo;
    out[i]    = (int16src[lo] * (1 - t) + int16src[hi] * t) / 32768;
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
