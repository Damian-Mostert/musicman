import * as tf from '@tensorflow/tfjs-node';

class BeatTracker {
  constructor() {
    this.timestamps    = [];
    this.maxTimestamps = 32;
    this.tempo         = null;
    this.phase         = null;   // absolute ms timestamp of a beat downbeat
    this.confidence    = 0;
    this.locked        = false;
    this.minNotes      = 8;

    // Live tempo tracking — after lock, keep refining tempo from player notes
    this.recentIntervals = [];   // last 8 inter-note intervals (ms)
    this.maxIntervals    = 8;

    // Latency: offset of player notes from drum beat grid (negative = player behind)
    this.latencyOffsets = [];
    this.latencyMs      = 0;
    this.maxOffsetSamples = 16;
  }

  addNote(timestampMs) {
    if (this.timestamps.length > 0) {
      const interval = timestampMs - this.timestamps[this.timestamps.length - 1];
      // Beat-level intervals: 60 BPM (1000ms) down to 200 BPM (300ms)
      // Wider window than before — catches 8th-note playing too
      if (interval >= 200 && interval <= 1200) {
        this.recentIntervals.push(interval);
        if (this.recentIntervals.length > this.maxIntervals) this.recentIntervals.shift();
      }
    }
    this.timestamps.push(timestampMs);
    if (this.timestamps.length > this.maxTimestamps) this.timestamps.shift();
  }

  // After lock, call this on each new player note to keep tempo in sync.
  // Returns updated tempo or null if not enough data.
  refinetempo() {
    if (!this.locked || this.recentIntervals.length < 4) return null;

    const sorted = [...this.recentIntervals].sort((a, b) => a - b);
    const medianInterval = sorted[Math.floor(sorted.length / 2)];
    let newTempo = 60000 / medianInterval;

    // If the raw interval suggests double the locked tempo, halve it.
    // e.g. locked=80, playing 8th notes gives intervals ~375ms = 160 BPM → halve to 80.
    if (newTempo > this.tempo * 1.6) newTempo /= 2;

    newTempo = Math.round(newTempo);

    // Only accept within 10% of locked tempo after alias correction
    if (Math.abs(newTempo - this.tempo) / this.tempo > 0.10) return null;

    this.tempo = Math.round(this.tempo * 0.85 + newTempo * 0.15);
    return this.tempo;
  }

  async analyse() {
    if (this.timestamps.length < this.minNotes) return null;
    const ts   = this.timestamps;
    const span = ts[ts.length - 1] - ts[0];
    if (span < 800) return null;

    const scorePair = (bpm, phase) => {
      const period = 60000 / bpm;
      let total = 0;
      for (const t of ts) {
        const mod  = ((t - phase) % period + period) % period;
        const dist = Math.min(mod, period - mod);
        total += dist;
      }
      return (total / ts.length) / period;
    };

    const bestPhaseFor = (bpm) => {
      const period = 60000 / bpm;
      let best = Infinity, bestPh = ts[0];
      for (let p = 0; p < 64; p++) {
        const ph    = ts[0] + (p / 64) * period;
        const score = scorePair(bpm, ph);
        if (score < best) { best = score; bestPh = ph; }
      }
      return { score: best, phase: bestPh };
    };

    // Search 60–180 BPM only — human musicians don't play at 200+ BPM.
    // Prefer the LOWEST BPM among equally-good candidates.
    // This kills the double-tempo alias: 80 BPM beats 160 BPM.
    const scores = [];
    for (let bpm = 60; bpm <= 180; bpm++) {
      const { score, phase } = bestPhaseFor(bpm);
      scores.push({ bpm, score, phase });
    }

    const minScore  = Math.min(...scores.map(s => s.score));
    const threshold = minScore * 1.02;
    const good      = scores.filter(s => s.score <= threshold);
    // Pick LOWEST BPM — avoids double-tempo alias
    const best      = good.reduce((a, b) => a.bpm < b.bpm ? a : b);

    const scoresTensor = tf.tensor1d(scores.map(s => s.score));
    const minTensor    = scoresTensor.min();
    const confidence   = Math.max(0, Math.min(1, 1 - minTensor.dataSync()[0] * 5));
    scoresTensor.dispose();
    minTensor.dispose();

    return { tempo: best.bpm, phase: best.phase, confidence };
  }

  async tryLock() {
    if (this.locked) return null;
    if (this.timestamps.length < this.minNotes) return null;

    // ── Step 1: Detect tempo from inter-note intervals (not grid search) ──────
    // Inter-note intervals are immune to the double-tempo alias because
    // they measure actual gaps between notes, not fit to a grid.
    if (this.recentIntervals.length < 4) return null;

    const sorted = [...this.recentIntervals].sort((a, b) => a - b);
    const medianInterval = sorted[Math.floor(sorted.length / 2)];

    // The median interval could be a beat or a subdivision.
    // Bias toward slower tempos: keep halving until we're in 60-150 BPM.
    // 60-150 covers virtually all real music. Above 150 is more likely a subdivision.
    let beatInterval = medianInterval;
    let rawBpm = 60000 / beatInterval;
    while (rawBpm > 150) { beatInterval *= 2;  rawBpm = 60000 / beatInterval; }
    while (rawBpm < 60)  { beatInterval /= 2;  rawBpm = 60000 / beatInterval; }

    const tempo = Math.round(60000 / beatInterval);
    if (tempo < 60 || tempo > 180) return null;

    // Confidence: how consistent are the intervals?
    const mean = this.recentIntervals.reduce((a, b) => a + b, 0) / this.recentIntervals.length;
    const variance = this.recentIntervals.reduce((s, v) => s + (v - mean) ** 2, 0) / this.recentIntervals.length;
    const cv = Math.sqrt(variance) / mean;  // coefficient of variation (0=perfect, 1=chaotic)
    const confidence = Math.max(0, Math.min(1, 1 - cv * 3));

    if (confidence < 0.4) return null;

    // ── Step 2: Detect phase via grid search at the confirmed tempo ───────────
    const period = 60000 / tempo;
    const ts = this.timestamps;
    let bestScore = Infinity, bestPhase = ts[0];
    for (let p = 0; p < 64; p++) {
      const ph = ts[0] + (p / 64) * period;
      let total = 0;
      for (const t of ts) {
        const mod  = ((t - ph) % period + period) % period;
        total += Math.min(mod, period - mod);
      }
      const score = total / ts.length;
      if (score < bestScore) { bestScore = score; bestPhase = ph; }
    }

    this.tempo      = tempo;
    this.phase      = bestPhase;
    this.confidence = confidence;
    this.locked     = true;

    const scheduleAt = this._nextBarAt(Date.now());
    return { tempo, phase: bestPhase, confidence, scheduleAt };
  }

  // Absolute ms timestamp of the next bar downbeat after nowMs
  _nextBarAt(nowMs, beatsPerBar = 4) {
    const periodMs = 60000 / this.tempo;
    const barMs    = periodMs * beatsPerBar;
    const adjPhase = this.phase + this.latencyMs;
    const elapsed  = ((nowMs - adjPhase) % barMs + barMs) % barMs;
    const remaining = barMs - elapsed;
    // If we're within 20ms of a bar, skip to the next one
    const wait = remaining < 20 ? remaining + barMs : remaining;
    return nowMs + wait;
  }

  // ms to wait from nowMs until next bar (for logging)
  msUntilNextBar(nowMs, beatsPerBar = 4) {
    return this._nextBarAt(nowMs, beatsPerBar) - nowMs;
  }

  // Measure player-note offset from the DRUM beat grid (not the detected phase).
  // drumGridPhase = the absolute timestamp the drum engine is using as its phase origin.
  measureLatency(playerTs, drumGridPhase) {
    if (!this.locked || drumGridPhase == null) return this.latencyMs;

    const period = 60000 / this.tempo;
    let offset   = ((playerTs - drumGridPhase) % period + period) % period;
    if (offset > period / 2) offset -= period;  // signed

    this.latencyOffsets.push(offset);
    if (this.latencyOffsets.length > this.maxOffsetSamples) this.latencyOffsets.shift();

    const sorted   = [...this.latencyOffsets].sort((a, b) => a - b);
    this.latencyMs = sorted[Math.floor(sorted.length / 2)];
    return this.latencyMs;
  }

  reset() {
    this.timestamps      = [];
    this.recentIntervals = [];
    this.tempo           = null;
    this.phase           = null;
    this.confidence      = 0;
    this.locked          = false;
    this.latencyOffsets  = [];
    this.latencyMs       = 0;
  }
}

export default BeatTracker;
