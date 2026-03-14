// PhraseWatcher — classifies silence gaps and learns the player's natural phrasing.
//
// Gap classification (adapts to player over time):
//   < phraseEndMs        → still playing
//   phraseEndMs–pauseMs  → phrase end  (natural breath, band keeps playing)
//   pauseMs–sectionMs    → pause       (player stopped, bass stops, drums hold)
//   > sectionMs          → section     (full stop — everything stops and resets)
//
// Thresholds start at defaults and learn from the player's actual gap history.

class PhraseWatcher {
  constructor() {
    this.lastNoteTime   = Date.now();
    this.noteTimestamps = [];
    this.beatOffsets    = [];

    // Adaptive thresholds
    this.phraseEndMs = 600;
    this.pauseMs     = 2500;
    this.sectionMs   = 6000;

    // Gap learning — observe how long the player naturally pauses between phrases
    this._observedGaps  = [];   // gaps that fell in the phrase-end zone (ms)
    this._maxGapSamples = 20;
    this._lastPhraseEndTime = null;

    // Timing feedback
    this.consecutiveSlightlyOff = 0;
    this.lastFeedbackTime       = 0;
    this.feedbackCooldownMs     = 4000;

    // Callbacks
    this.onPhraseEnd      = null;  // (phrase) — natural gap
    this.onPause          = null;  // ()       — player stopped, hold
    this.onSection        = null;  // ()       — full stop, reset
    this.onTimingFeedback = null;  // (msg, severity)

    this._checkInterval  = null;
    this._phraseEndFired = false;
    this._pauseFired     = false;
  }

  start() {
    this._checkInterval = setInterval(() => this._check(), 80);
  }

  stop() {
    if (this._checkInterval) clearInterval(this._checkInterval);
  }

  noteHeard(timestampMs, beatOffsetMs = null) {
    const now = timestampMs || Date.now();

    // If we were in a phrase-end state, measure the gap and learn from it
    if (this._phraseEndFired && this._lastPhraseEndTime !== null) {
      const gap = now - this._lastPhraseEndTime;
      // Only learn from gaps in the phrase-end zone (not pauses or sections)
      if (gap >= this.phraseEndMs && gap < this.pauseMs) {
        this._learnGap(gap);
      }
    }

    this.lastNoteTime = now;
    this.noteTimestamps.push(now);
    if (this.noteTimestamps.length > 32) this.noteTimestamps.shift();

    this._phraseEndFired = false;
    this._pauseFired     = false;
    this._lastPhraseEndTime = null;

    if (beatOffsetMs !== null) this._assessTiming(beatOffsetMs, now);
  }

  // Learn the player's natural phrase gap — adapt phraseEndMs threshold
  _learnGap(gapMs) {
    this._observedGaps.push(gapMs);
    if (this._observedGaps.length > this._maxGapSamples) this._observedGaps.shift();
    if (this._observedGaps.length < 4) return;

    // Use the 25th percentile of observed gaps as the phrase-end threshold
    // This means: "the player almost always pauses at least this long between phrases"
    const sorted = [...this._observedGaps].sort((a, b) => a - b);
    const p25    = sorted[Math.floor(sorted.length * 0.25)];
    const p75    = sorted[Math.floor(sorted.length * 0.75)];

    // Clamp to sane range: 300ms–1500ms for phrase end
    this.phraseEndMs = Math.max(300, Math.min(1500, Math.round(p25 * 0.85)));
    // Pause threshold = well above the typical phrase gap
    this.pauseMs     = Math.max(this.phraseEndMs + 500, Math.min(4000, Math.round(p75 * 1.5)));

    console.log(`🎵 Phrase gap learned: phraseEnd=${this.phraseEndMs}ms pause=${this.pauseMs}ms`);
  }

  _assessTiming(beatOffsetMs, now) {
    this.beatOffsets.push(beatOffsetMs);
    if (this.beatOffsets.length > 16) this.beatOffsets.shift();
    if (this.beatOffsets.length < 4) return;
    if (now - this.lastFeedbackTime < this.feedbackCooldownMs) return;

    const sorted     = [...this.beatOffsets].sort((a, b) => a - b);
    const median     = sorted[Math.floor(sorted.length / 2)];
    const absMedian  = Math.abs(median);
    const period     = this._beatPeriodMs || 500;
    const relOffset  = absMedian / period;

    if (relOffset > 0.35) {
      const dir = median < 0 ? 'behind' : 'ahead of';
      this._emitFeedback(`You're consistently ${Math.round(absMedian)}ms ${dir} the beat`, 'badly_off');
      this.consecutiveSlightlyOff = 0;
    } else if (relOffset > 0.15) {
      this.consecutiveSlightlyOff++;
      if (this.consecutiveSlightlyOff >= 3) {
        const dir = median < 0 ? 'dragging' : 'rushing';
        this._emitFeedback(`Timing is ${dir} slightly`, 'slightly_off');
        this.consecutiveSlightlyOff = 0;
      }
    } else {
      this.consecutiveSlightlyOff = 0;
    }
  }

  _emitFeedback(msg, severity) {
    this.lastFeedbackTime = Date.now();
    this.beatOffsets = [];
    if (this.onTimingFeedback) this.onTimingFeedback(msg, severity);
  }

  setBeatPeriod(ms) { this._beatPeriodMs = ms; }

  _check() {
    const silentMs = Date.now() - this.lastNoteTime;

    if (silentMs >= this.sectionMs && !this._pauseFired) {
      this._pauseFired     = true;
      this._phraseEndFired = true;
      this.noteTimestamps  = [];
      this.beatOffsets     = [];
      if (this.onSection) this.onSection();

    } else if (silentMs >= this.pauseMs && !this._pauseFired) {
      this._pauseFired = true;
      if (this.onPause) this.onPause();

    } else if (silentMs >= this.phraseEndMs && !this._phraseEndFired) {
      this._phraseEndFired    = true;
      this._lastPhraseEndTime = Date.now();
      if (this.onPhraseEnd) this.onPhraseEnd(this._currentPhrase());
    }
  }

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
    this._lastPhraseEndTime     = null;
    this.lastNoteTime           = Date.now();
    // Don't reset _observedGaps — keep learned thresholds across sections
  }
}

export default PhraseWatcher;
