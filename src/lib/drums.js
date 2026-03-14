import BeatTracker from './beatTracker.js';
import PhraseWatcher from './phraseWatcher.js';

const KICK  = 36;
const SNARE = 38;
const HIHAT = 42;
const RIDE  = 51;

// Each step: [kick, snare, hihat, ride, hh_vel, k_vel, s_vel]
// vel index → VEL array: 0=ghost(25), 1=soft(50), 2=med(72), 3=accent(95)
const VEL = [25, 50, 72, 95];

// ── Grooves ──────────────────────────────────────────────────────────────────
// Two bars each (32 steps). Bar 2 has subtle variations — ghost notes,
// open hihat on the "and of 4", slight kick variation. This is what makes
// a drummer sound like a person and not a loop.

const GROOVES = {
  // Minimal: just kick/snare, no hihat. Used when player is sparse/quiet.
  minimal: [
    // bar 1
    [1,0,0,0, 0,3,0],[0,0,0,0, 0,0,0],[0,0,0,0, 0,0,0],[0,0,0,0, 0,0,0],
    [0,1,0,0, 0,0,3],[0,0,0,0, 0,0,0],[0,0,0,0, 0,0,0],[0,0,0,0, 0,0,0],
    [1,0,0,0, 0,2,0],[0,0,0,0, 0,0,0],[0,0,0,0, 0,0,0],[0,0,0,0, 0,0,0],
    [0,1,0,0, 0,0,3],[0,0,0,0, 0,0,0],[0,0,0,0, 0,0,0],[0,0,0,0, 0,0,0],
    // bar 2 — add a kick on the "and of 3" and a ghost snare before beat 4
    [1,0,0,0, 0,3,0],[0,0,0,0, 0,0,0],[0,0,0,0, 0,0,0],[0,0,0,0, 0,0,0],
    [0,1,0,0, 0,0,3],[0,0,0,0, 0,0,0],[0,0,0,0, 0,0,0],[0,0,0,0, 0,0,0],
    [1,0,0,0, 0,2,0],[0,0,0,0, 0,0,0],[1,0,0,0, 0,1,0],[0,1,0,0, 0,0,0],
    [0,1,0,0, 0,0,3],[0,0,0,0, 0,0,0],[0,0,0,0, 0,0,0],[0,0,0,0, 0,0,0],
  ],

  // Rock: quarter-note hihat, kick on 1&3, snare on 2&4
  rock: [
    // bar 1
    [1,0,1,0, 2,3,0],[0,0,0,0, 0,0,0],[0,1,1,0, 2,0,3],[0,0,0,0, 0,0,0],
    [1,0,1,0, 2,2,0],[0,0,0,0, 0,0,0],[0,1,1,0, 2,0,3],[0,0,0,0, 0,0,0],
    [1,0,1,0, 2,3,0],[0,0,0,0, 0,0,0],[0,1,1,0, 2,0,3],[0,0,0,0, 0,0,0],
    [1,0,1,0, 2,2,0],[0,0,0,0, 0,0,0],[0,1,1,0, 2,0,3],[0,0,0,0, 0,0,0],
    // bar 2 — extra kick on "and of 2", ghost hihat on off-beats
    [1,0,1,0, 2,3,0],[0,0,0,0, 0,0,0],[0,1,1,0, 2,0,3],[0,0,1,0, 1,0,0],
    [1,0,1,0, 2,2,0],[1,0,0,0, 0,1,0],[0,1,1,0, 2,0,3],[0,0,1,0, 1,0,0],
    [1,0,1,0, 2,3,0],[0,0,0,0, 0,0,0],[0,1,1,0, 2,0,3],[0,0,1,0, 1,0,0],
    [1,0,1,0, 2,2,0],[0,0,0,0, 0,0,0],[0,1,1,0, 2,0,3],[0,0,0,0, 0,0,0],
  ],

  // Groove: 8th-note hihat with ghost notes, more kick variation
  groove: [
    // bar 1
    [1,0,1,0, 2,3,0],[0,0,1,0, 1,0,0],[0,1,1,0, 2,0,3],[0,0,1,0, 1,0,0],
    [1,0,1,0, 2,2,0],[0,0,1,0, 1,0,0],[0,1,1,0, 2,0,3],[0,0,1,0, 1,0,0],
    [1,0,1,0, 2,3,0],[0,0,1,0, 1,0,0],[0,1,1,0, 2,0,3],[0,0,1,0, 1,0,0],
    [1,0,1,0, 2,2,0],[0,0,1,0, 1,0,0],[0,1,1,0, 2,0,3],[0,0,1,0, 2,0,0],
    // bar 2 — ghost snares on "e" of 2 and "a" of 3, kick on "and of 4"
    [1,0,1,0, 2,3,0],[0,0,1,0, 1,0,0],[0,1,1,0, 2,0,3],[0,1,1,0, 1,0,0],
    [1,0,1,0, 2,2,0],[0,0,1,0, 1,0,0],[0,1,1,0, 2,0,3],[0,0,1,0, 1,0,0],
    [1,0,1,0, 2,3,0],[0,1,1,0, 1,0,0],[0,1,1,0, 2,0,3],[0,0,1,0, 1,0,0],
    [1,0,1,0, 2,2,0],[1,0,1,0, 1,1,0],[0,1,1,0, 2,0,3],[0,0,1,0, 2,0,0],
  ],

  // Half-time: snare on beat 3 only, very open feel
  halftime: [
    // bar 1
    [1,0,1,0, 2,3,0],[0,0,0,0, 0,0,0],[0,0,1,0, 1,0,0],[0,0,0,0, 0,0,0],
    [0,0,1,0, 1,0,0],[0,0,0,0, 0,0,0],[0,0,1,0, 1,0,0],[0,0,0,0, 0,0,0],
    [1,1,1,0, 2,2,3],[0,0,0,0, 0,0,0],[0,0,1,0, 1,0,0],[0,0,0,0, 0,0,0],
    [0,0,1,0, 1,0,0],[0,0,0,0, 0,0,0],[0,0,1,0, 1,0,0],[0,0,0,0, 0,0,0],
    // bar 2 — add a kick on "and of 2", ghost snare before beat 3
    [1,0,1,0, 2,3,0],[0,0,0,0, 0,0,0],[0,0,1,0, 1,0,0],[0,0,0,0, 0,0,0],
    [1,0,1,0, 1,1,0],[0,0,0,0, 0,0,0],[0,0,1,0, 1,0,0],[0,1,0,0, 0,0,0],
    [1,1,1,0, 2,2,3],[0,0,0,0, 0,0,0],[0,0,1,0, 1,0,0],[0,0,0,0, 0,0,0],
    [0,0,1,0, 1,0,0],[0,0,0,0, 0,0,0],[0,0,1,0, 2,0,0],[0,0,0,0, 0,0,0],
  ],
};

// ── Fills ─────────────────────────────────────────────────────────────────────
// 8-step fills (half a bar). Played on the last half of bar 4/8.
// After the fill, drummer drops back into the groove on beat 1.
const FILLS = [
  // Simple snare roll into beat 1
  [[0,1,0,0,0,0,2],[0,1,0,0,0,0,1],[0,1,0,0,0,0,2],[0,1,0,0,0,0,3],
   [0,1,0,0,0,0,2],[0,1,0,0,0,0,2],[0,1,0,0,0,0,3],[1,1,0,0,0,3,3]],
  // Kick-snare alternating
  [[1,0,0,0,0,2,0],[0,1,0,0,0,0,2],[1,0,0,0,0,2,0],[0,1,0,0,0,0,3],
   [1,0,0,0,0,2,0],[0,1,0,0,0,0,2],[1,1,0,0,0,2,2],[0,1,0,0,0,0,3]],
  // Tom-like snare hits descending velocity
  [[0,1,0,0,0,0,3],[0,0,0,0,0,0,0],[0,1,0,0,0,0,2],[0,0,0,0,0,0,0],
   [0,1,0,0,0,0,3],[0,1,0,0,0,0,1],[0,1,0,0,0,0,2],[1,1,0,0,0,3,3]],
];

class DrumEngine {
  constructor(storagePath) {
    this.storagePath = storagePath;
    this.grooveName  = 'minimal';
    this.pattern     = GROOVES.minimal;
    this.patternLen  = this.pattern.length; // 32 steps = 2 bars
    this.step        = 0;
    this.barCount    = 0;   // how many bars played — triggers fills
    this.tempo       = 120;
    this.running     = false;
    this.intervalId  = null;
    this.player      = null;
    this.useAudio    = false;
    this.audioPlayer = null;

    this.beatTracker  = new BeatTracker();
    this.tempoLocked  = false;
    this.hasStarted   = false;
    this.tickGen      = 0;
    this.nextTickAt   = 0;
    this.lastStepAt   = null;

    this.intensity          = 0.5;
    this.recentNoteDensity  = 0;
    this.lastNoteTimestamps = [];
    this.lastEvolveTime     = 0;
    this.evolveIntervalMs   = 8000;

    // Fill state
    this.fillEveryBars  = 8;
    this.inFill         = false;
    this.fillStep       = 0;
    this.fillPattern    = null;

    // Phrase / silence handling via PhraseWatcher
    this.phraseWatcher    = new PhraseWatcher();
    this.onPhraseEnd      = null;  // (phrase) — natural gap, respond now
    this.onPause          = null;  // ()       — player paused, hold beat
    this.onSection        = null;  // ()       — long stop, full reset
    this.onTimingFeedback = null;  // (msg, severity)
    // legacy compat
    this.onSilence        = null;
  }

  connectMidi(p)  { this.player = p; this.useAudio = false; }
  connectAudio(p) { this.audioPlayer = p; this.useAudio = true; }

  start() { this._startPhraseWatcher(); }

  _beginPlaying() {
    if (this.running) return;
    this.running        = true;
    this.hasStarted     = true;
    this.step           = 0;
    this.barCount       = 0;
    this.tickGen        = (this.tickGen || 0) + 1;
    this.nextTickAt     = Date.now();
    this.lastEvolveTime = Date.now();
    console.log(`🥁 Drummer in at ${this.tempo} BPM`);
    this._tick(this.tickGen);
  }

  stop() {
    this.running     = false;
    this.hasStarted  = false;
    this.tempoLocked = false;
    this.tickGen     = (this.tickGen || 0) + 1;
    if (this.intervalId) clearTimeout(this.intervalId);
    this.phraseWatcher.stop();
  }

  _tick(gen) {
    if (!this.running || gen !== this.tickGen) return;

    const stepMs = (60000 / this.tempo) / 4;

    // ── Humanisation ─────────────────────────────────────────────────────────
    // Real drummers are never perfectly on the grid.
    // Hihat rushes slightly (+), kick/snare drag slightly (-).
    // We apply a small random offset per hit inside _playStep.
    // The tick itself fires on time — humanisation is per-instrument.

    this.lastStepAt = Date.now();

    if (this.inFill) {
      this._playStep(this.fillPattern[this.fillStep], true);
      this.fillStep++;
      if (this.fillStep >= this.fillPattern.length) {
        this.inFill   = false;
        this.fillStep = 0;
        // Snap step back to bar start after fill
        this.step = 0;
      }
    } else {
      this._playStep(this.pattern[this.step], false);
      this.step = (this.step + 1) % this.patternLen;

      // Track bar boundaries (every 16 steps = 1 bar)
      if (this.step % 16 === 0) {
        this.barCount++;

        // Evolve groove every evolveIntervalMs
        const now = Date.now();
        if (now - this.lastEvolveTime > this.evolveIntervalMs) {
          this.lastEvolveTime = now;
          this._evolve();
        }

        // Trigger fill on bar N (last 8 steps of that bar)
        if (this.barCount % this.fillEveryBars === 0) {
          this._startFill();
        }
      }
    }

    this.nextTickAt += stepMs;
    const drift = this.nextTickAt - Date.now();
    this.intervalId = setTimeout(() => this._tick(gen), Math.max(0, drift));
  }

  _playStep(hit, isFill) {
    const [kick, snare, hihat, ride, hh_vel, k_vel, s_vel] = hit;
    const scale = 0.55 + this.intensity * 0.45;

    // ── Velocity humanisation ─────────────────────────────────────────────────
    // Each hit gets ±12 velocity jitter. Fills hit harder.
    const jitter = () => (Math.random() - 0.5) * 24;
    const fillBoost = isFill ? 15 : 0;

    const kv = Math.max(20, Math.min(127, Math.round(VEL[k_vel || 2] * scale + jitter() + fillBoost)));
    const sv = Math.max(20, Math.min(127, Math.round(VEL[s_vel || 2] * scale + jitter() + fillBoost)));
    const hv = Math.max(15, Math.min(100, Math.round(VEL[hh_vel || 1] * scale + jitter())));

    // ── Micro-timing humanisation ─────────────────────────────────────────────
    // Hihat rushes 0–8ms, kick/snare drag 0–12ms.
    // We schedule each hit with a tiny individual delay.
    const hhDelay    = Math.random() * 8;           // hihat rushes
    const kickDelay  = 5 + Math.random() * 12;      // kick drags slightly
    const snareDelay = 8 + Math.random() * 15;      // snare drags more

    if (this.useAudio) {
      if (kick)  setTimeout(() => this._synthDrum('kick',  kv), kickDelay);
      if (snare) setTimeout(() => this._synthDrum('snare', sv), snareDelay);
      if (hihat) setTimeout(() => this._synthDrum('hihat', hv), hhDelay);
      if (ride)  setTimeout(() => this._synthDrum('ride',  Math.round(hv * 0.85)), hhDelay);
    } else if (this.player) {
      if (kick)  setTimeout(() => this._midiHit(KICK,  kv), kickDelay);
      if (snare) setTimeout(() => this._midiHit(SNARE, sv), snareDelay);
      if (hihat) setTimeout(() => this._midiHit(HIHAT, hv), hhDelay);
      if (ride)  setTimeout(() => this._midiHit(RIDE,  Math.round(hv * 0.85)), hhDelay);
    }
  }

  _midiHit(note, velocity) {
    this.player.playNote(note, velocity, 9);
    setTimeout(() => this.player.stopNote(note, 9), 40);
  }

  _synthDrum(type, velocity) {
    if (!this.audioPlayer) return;
    if (!this.audioPlayer.drumHits) this.audioPlayer.drumHits = [];
    this.audioPlayer.drumHits.push({ type, velocity, time: 0 });
  }

  // ── Fills ──────────────────────────────────────────────────────────────────

  _startFill() {
    this.inFill      = true;
    this.fillStep    = 0;
    this.fillPattern = FILLS[Math.floor(Math.random() * FILLS.length)];
    console.log('🥁 Fill!');
  }

  // ── Phrase watcher ─────────────────────────────────────────────────────────

  _startPhraseWatcher() {
    const pw = this.phraseWatcher;

    pw.onPhraseEnd = (phrase) => {
      // Natural breath between phrases — drummer keeps playing, melody responds
      if (this.onPhraseEnd) this.onPhraseEnd(phrase);
    };

    pw.onPause = () => {
      // Player paused (2.5s) — drummer keeps the beat, just waits
      console.log('🥁 Player paused — holding beat...');
      if (this.onPause) this.onPause();
      if (this.onSilence) this.onSilence('pause');
    };

    pw.onSection = () => {
      // Long stop (6s) — full reset, re-listen for new tempo
      console.log('🥁 Section break — resetting...');
      this._stopAndReset();
      if (this.onSection) this.onSection();
      if (this.onSilence) this.onSilence('section');
    };

    pw.onTimingFeedback = (msg, severity) => {
      console.log(`🎯 Timing: ${msg}`);
      if (this.onTimingFeedback) this.onTimingFeedback(msg, severity);
    };

    pw.start();
  }

  _stopAndReset() {
    this.tickGen = (this.tickGen || 0) + 1;
    this.running     = false;
    this.hasStarted  = false;
    this.tempoLocked = false;
    this.step        = 0;
    this.barCount    = 0;
    this.inFill      = false;
    this.lastStepAt  = null;
    this.lastNoteTimestamps = [];
    this.recentNoteDensity  = 0;
    this.grooveName  = 'minimal';
    this.pattern     = GROOVES.minimal;
    this.patternLen  = this.pattern.length;
    if (this.intervalId) clearTimeout(this.intervalId);
    this.beatTracker.reset();
    this.phraseWatcher.reset();
  }

  noteHeard() {
    const now = Date.now();
    // Compute beat offset for timing feedback while drums are running
    let beatOffset = null;
    if (this.running && this.tempoLocked && this.lastStepAt !== null) {
      beatOffset = this.beatTracker.measureLatency(now, this.lastStepAt);
    }
    // Tell phraseWatcher a note arrived (updates gap timers + timing assessment)
    this.phraseWatcher.noteHeard(now, beatOffset);
    if (this.tempoLocked) {
      this.phraseWatcher.setBeatPeriod(60000 / this.tempo);
    }
    // Return whether we were in a pause state (drummer was holding)
    return false;
  }

  // ── Tempo sync ─────────────────────────────────────────────────────────────

  _trackDensity(timestampMs) {
    const now = timestampMs || Date.now();
    this.lastNoteTimestamps.push(now);
    const cutoff = now - 2000;
    this.lastNoteTimestamps = this.lastNoteTimestamps.filter(t => t > cutoff);
    const beatMs = 60000 / (this.tempo || 120);
    this.recentNoteDensity = (this.lastNoteTimestamps.length / 2000) * beatMs;
  }

  syncTempo(bpm, timestampMs) {
    this._trackDensity(timestampMs);
    if (this.tempoLocked) {
      // Keep refining tempo after lock so we track player drift
      const refined = this.beatTracker.refinetempo();
      if (refined) this.tempo = refined;
      return;
    }

    this.beatTracker.addNote(timestampMs || Date.now());
    this.beatTracker.tryLock().then(result => {
      if (!result || this.tempoLocked) return;

      let lockedTempo = Math.round(result.tempo);
      if (this.songTempo && Math.abs(lockedTempo - this.songTempo) / this.songTempo < 0.1) {
        lockedTempo = this.songTempo;
      }

      this.tempo       = lockedTempo;
      this.tempoLocked = true;
      this.hasStarted  = true;

      // Use scheduleAt from tryLock — computed right after analyse() resolved,
      // so the async gap doesn't corrupt the phase calculation.
      const waitMs = result.scheduleAt - Date.now();
      console.log(`🥁 Locked ${this.tempo} BPM — in ${(waitMs/1000).toFixed(2)}s`);
      const gen = this.tickGen + 1;
      setTimeout(() => {
        this.nextTickAt = result.scheduleAt; // tick grid anchored to the bar downbeat
        this._beginPlaying();
      }, Math.max(0, waitMs));
    }).catch(() => {});
  }

  syncIntensity(intensity) {
    this.intensity = this.intensity * 0.8 + intensity * 0.2;
  }

  // ── Groove selection ───────────────────────────────────────────────────────

  _evolve() {
    let target;
    if (this.recentNoteDensity < 0.5)    target = 'minimal';
    else if (this.intensity < 0.35)      target = 'halftime';
    else if (this.intensity < 0.55)      target = 'rock';
    else if (this.intensity < 0.75)      target = 'groove';
    else                                 target = 'groove';

    if (this.grooveName === target) return;

    // Switch on the next bar boundary (step 0) — already guaranteed since
    // _evolve is only called when step % 16 === 0
    this.grooveName = target;
    this.pattern    = GROOVES[target];
    this.patternLen = this.pattern.length;
    this.step       = 0;  // restart pattern from bar 1
    console.log(`🥁 → ${target} (density:${this.recentNoteDensity.toFixed(1)} intensity:${this.intensity.toFixed(2)})`);
  }

  // ── External API ───────────────────────────────────────────────────────────

  applyAIPattern(pattern) {
    if (!Array.isArray(pattern) || pattern.length !== 16) return;
    // Duplicate to 32 steps with bar-2 variation
    this.pattern    = [...pattern, ...pattern].map(s => s.length >= 7 ? [...s] : [...s, 2, 2, 2]);
    this.patternLen = 32;
    console.log('🥁 AI pattern applied');
  }

  getState() {
    return { tempo: this.tempo, step: this.step, intensity: this.intensity,
             groove: this.grooveName, barCount: this.barCount };
  }
}

export default DrumEngine;
