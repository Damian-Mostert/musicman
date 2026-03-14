// PhraseWatcher — listens to the player's note stream and classifies what's happening.
//
// Gap classification (time since last note):
//   < 600ms          → still playing (no event)
//   600ms – 2.5s     → phrase end  (natural breath between phrases)
//   2.5s – 6s        → pause       (player stopped but will resume — hold the beat)
//   > 6s             → section     (new section or song stop — reset everything)
//
// Timing quality (beat offset per note while drums running):
//   < 15% of beat    → on beat
//   15–35% of beat   → slightly off (mention it after 3 consecutive)
//   > 35% of beat    → badly off    (mention immediately, flag as mistake)

class PhraseWatcher {
  constructor() {
    this.lastNoteTime    = Date.now();
    this.noteTimestamps  = [];   // all note times this phrase
    this.beatOffsets     = [];   // signed beat offsets while drums running (ms)

    // Thresholds
    this.phraseEndMs   = 600;    // gap that ends a phrase
    this.pauseMs       = 2500;   // gap that's a pause (hold beat)
    this.sectionMs     = 6000;   // gap that's a section break (reset)

    // Timing feedback state
    this.consecutiveSlightlyOff = 0;
    this.lastFeedbackTime       = 0;
    this.feedbackCooldownMs     = 4000;  // don't spam feedback

    // Callbacks — set by caller
    this.onPhraseEnd  = null;   // ()          — natural phrase gap, drummer keeps playing
    this.onPause      = null;   // ()          — player paused, drummer holds
    this.onSection    = null;   // ()          — long stop, drummer resets
    this.onTimingFeedback = null; // (msg, severity) — 'slightly_off' | 'badly_off'

    this._checkInterval = null;
    this._phraseEndFired = false;
    this._pauseFired     = false;
  }

  start() {
    this._checkInterval = setInterval(() => this._check(), 100);
  }

  stop() {
    if (this._checkInterval) clearInterval(this._checkInterval);
  }

  // Call on every note-on
  noteHeard(timestampMs, beatOffsetMs = null) {
    const now = timestampMs || Date.now();
    this.lastNoteTime = now;
    this.noteTimestamps.push(now);
    // Keep last 32 notes for phrase analysis
    if (this.noteTimestamps.length > 32) this.noteTimestamps.shift();

    // Reset gap-event flags — player is playing again
    this._phraseEndFired = false;
    this._pauseFired     = false;

    // Timing feedback
    if (beatOffsetMs !== null) {
      this._assessTiming(beatOffsetMs, now);
    }
  }

  // beatOffsetMs: signed ms from nearest beat (negative = behind, positive = ahead)
  // beatPeriodMs: length of one beat in ms (for relative threshold)
  _assessTiming(beatOffsetMs, now) {
    const absOffset = Math.abs(beatOffsetMs);
    this.beatOffsets.push(beatOffsetMs);
    if (this.beatOffsets.length > 16) this.beatOffsets.shift();

    // Need at least 4 samples and cooldown respected
    if (this.beatOffsets.length < 4) return;
    if (now - this.lastFeedbackTime < this.feedbackCooldownMs) return;

    // Use median of recent offsets — single bad notes don't trigger feedback
    const sorted = [...this.beatOffsets].sort((a, b) => a - b);
    const medianOffset = sorted[Math.floor(sorted.length / 2)];
    const absMedian    = Math.abs(medianOffset);

    // We need the beat period to compute relative thresholds.
    // Store it externally via setBeatPeriod().
    const period = this._beatPeriodMs || 500; // default 120 BPM
    const relOffset = absMedian / period;

    if (relOffset > 0.35) {
      // Badly off — consistent large offset
      const direction = medianOffset < 0 ? 'behind' : 'ahead of';
      const ms = Math.round(absMedian);
      this._emitFeedback(
        `You're consistently ${ms}ms ${direction} the beat`,
        'badly_off'
      );
      this.consecutiveSlightlyOff = 0;
    } else if (relOffset > 0.15) {
      this.consecutiveSlightlyOff++;
      if (this.consecutiveSlightlyOff >= 3) {
        const direction = medianOffset < 0 ? 'dragging' : 'rushing';
        this._emitFeedback(`Timing is ${direction} slightly`, 'slightly_off');
        this.consecutiveSlightlyOff = 0;
      }
    } else {
      // On beat — reset counter
      this.consecutiveSlightlyOff = 0;
    }
  }

  _emitFeedback(msg, severity) {
    this.lastFeedbackTime = Date.now();
    this.beatOffsets = []; // reset after feedback so we don't repeat immediately
    if (this.onTimingFeedback) this.onTimingFeedback(msg, severity);
  }

  setBeatPeriod(ms) {
    this._beatPeriodMs = ms;
  }

  _check() {
    const silentMs = Date.now() - this.lastNoteTime;

    if (silentMs >= this.sectionMs && !this._pauseFired) {
      // Long silence — section break
      this._pauseFired     = true;
      this._phraseEndFired = true;
      this.noteTimestamps  = [];
      this.beatOffsets     = [];
      if (this.onSection) this.onSection();

    } else if (silentMs >= this.pauseMs && !this._pauseFired) {
      // Medium silence — pause (hold beat, don't reset)
      this._pauseFired = true;
      if (this.onPause) this.onPause();

    } else if (silentMs >= this.phraseEndMs && !this._phraseEndFired) {
      // Short gap — phrase end (drummer keeps playing, melody can respond)
      this._phraseEndFired = true;
      if (this.onPhraseEnd) this.onPhraseEnd(this._currentPhrase());
    }
  }

  // Returns timing stats for the current phrase
  _currentPhrase() {
    return {
      noteCount:    this.noteTimestamps.length,
      durationMs:   this.noteTimestamps.length > 1
                      ? this.noteTimestamps[this.noteTimestamps.length - 1] - this.noteTimestamps[0]
                      : 0,
      medianOffset: this._medianOffset(),
    };
  }

  _medianOffset() {
    if (this.beatOffsets.length === 0) return 0;
    const s = [...this.beatOffsets].sort((a, b) => a - b);
    return s[Math.floor(s.length / 2)];
  }

  reset() {
    this.noteTimestamps         = [];
    this.beatOffsets            = [];
    this.consecutiveSlightlyOff = 0;
    this._phraseEndFired        = false;
    this._pauseFired            = false;
    this.lastNoteTime           = Date.now();
  }
}

export default PhraseWatcher;
