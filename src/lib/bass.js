// BassEngine — real-time bass that follows the player's melody.
//
// Behaviour:
//   - On each player note: play the bass equivalent immediately (root, bass octave)
//   - Between notes: walk toward the next note using scale steps
//   - On phrase end: hold the last root, let it ring
//   - On section: stop

const SCALE_INTERVALS = {
  major:      [0, 2, 4, 5, 7, 9, 11],
  minor:      [0, 2, 3, 5, 7, 8, 10],
  dorian:     [0, 2, 3, 5, 7, 9, 10],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
};

// MIDI note names for logging
const NOTE_NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];

class BassEngine {
  constructor() {
    this.player      = null;
    this.useAudio    = false;
    this.audioPlayer = null;

    this.tempo       = 120;
    this.key         = 'C';
    this.scaleType   = 'major';

    // Current state
    this.lastPlayerNote  = null;   // most recent note the player played
    this.currentBassNote = null;   // note currently sounding
    this.walkTimer       = null;   // setTimeout for walk steps
    this.holdTimer       = null;   // setTimeout to stop held note

    // Walking bass state
    this.walkTarget  = null;
    this.walkScale   = [];
    this.walkIdx     = 0;
  }

  connectMidi(player)  { this.player = player; this.useAudio = false; }
  connectAudio(player) { this.audioPlayer = player; this.useAudio = true; }

  // Called on every player note-on
  noteHeard(midiNote, velocity, tempo, key) {
    this.tempo = tempo || this.tempo;
    if (key) {
      this.key       = key;
      this.scaleType = this._detectScaleType();
    }

    this.lastPlayerNote = midiNote;
    this._cancelWalk();

    // Map player note to bass range (MIDI 28–52 = E1–E3)
    const bassNote = this._toBassRange(midiNote);
    const bassVel  = Math.round(velocity * 0.75);  // slightly softer than player

    this._playNote(bassNote, bassVel);

    // Schedule a walk toward the next likely note after half a beat
    const halfBeatMs = (60000 / this.tempo) / 2;
    this.walkTimer = setTimeout(() => this._startWalk(bassNote), halfBeatMs);

    const name = NOTE_NAMES[midiNote % 12];
    const bassName = NOTE_NAMES[bassNote % 12];
    console.log(`🎸 ${name} → bass ${bassName}${Math.floor(bassNote/12)-1} (MIDI ${bassNote})`);
  }

  // Called on phrase end — hold current note, stop walking
  phraseEnd() {
    this._cancelWalk();
    // Let the current note ring for 1 bar then stop
    const barMs = (60000 / this.tempo) * 4;
    if (this.holdTimer) clearTimeout(this.holdTimer);
    this.holdTimer = setTimeout(() => this._stopCurrent(), barMs);
  }

  // Called on section break — stop everything
  stop() {
    this._cancelWalk();
    if (this.holdTimer) clearTimeout(this.holdTimer);
    this._stopCurrent();
  }

  // ── Internal ───────────────────────────────────────────────────────────────

  // Map any MIDI note to bass range by dropping octaves until in 28–52
  _toBassRange(note) {
    let n = note;
    while (n > 52) n -= 12;
    while (n < 28) n += 12;
    return n;
  }

  _buildScale(rootPc) {
    const intervals = SCALE_INTERVALS[this.scaleType] || SCALE_INTERVALS.major;
    const notes = [];
    // Build across bass range
    for (let oct = 1; oct <= 4; oct++) {
      for (const i of intervals) {
        const n = rootPc + oct * 12 + i;
        if (n >= 28 && n <= 55) notes.push(n);
      }
    }
    return [...new Set(notes)].sort((a, b) => a - b);
  }

  _detectScaleType() {
    // Simple heuristic — could be improved with actual note history
    return 'major';
  }

  _startWalk(fromNote) {
    if (!this.lastPlayerNote) return;

    const rootPc   = this._keyToPc(this.key);
    this.walkScale = this._buildScale(rootPc);
    if (this.walkScale.length === 0) return;

    // Walk toward the root of the current key in bass range
    const target = this._toBassRange(rootPc + 48); // root in bass range
    this.walkTarget = target;

    // Find current position in scale
    this.walkIdx = this.walkScale.reduce((best, n, i) =>
      Math.abs(n - fromNote) < Math.abs(this.walkScale[best] - fromNote) ? i : best, 0);

    this._walkStep();
  }

  _walkStep() {
    if (!this.walkTarget || this.walkScale.length === 0) return;

    const current = this.walkScale[this.walkIdx];
    if (current === this.walkTarget) return; // arrived

    // Move one scale step toward target
    const targetIdx = this.walkScale.reduce((best, n, i) =>
      Math.abs(n - this.walkTarget) < Math.abs(this.walkScale[best] - this.walkTarget) ? i : best, 0);

    if (targetIdx > this.walkIdx) this.walkIdx = Math.min(this.walkScale.length - 1, this.walkIdx + 1);
    else if (targetIdx < this.walkIdx) this.walkIdx = Math.max(0, this.walkIdx - 1);
    else return;

    const nextNote = this.walkScale[this.walkIdx];
    const walkVel  = 45 + Math.round(Math.random() * 15); // soft walk notes
    this._playNote(nextNote, walkVel);

    // Next walk step on the next beat subdivision
    const stepMs = (60000 / this.tempo) / 2;
    this.walkTimer = setTimeout(() => this._walkStep(), stepMs);
  }

  _cancelWalk() {
    if (this.walkTimer) { clearTimeout(this.walkTimer); this.walkTimer = null; }
    this.walkTarget = null;
  }

  _playNote(note, velocity) {
    this._stopCurrent();
    this.currentBassNote = note;

    if (this.useAudio && this.audioPlayer) {
      this.audioPlayer.playNote(note, velocity);
    } else if (this.player) {
      this.player.playNote(note, velocity);
    }

    // Auto-stop after 1 beat to avoid notes bleeding into each other
    const beatMs = 60000 / this.tempo;
    if (this.holdTimer) clearTimeout(this.holdTimer);
    this.holdTimer = setTimeout(() => this._stopCurrent(), beatMs * 0.9);
  }

  _stopCurrent() {
    if (this.currentBassNote === null) return;
    if (this.useAudio && this.audioPlayer) {
      this.audioPlayer.stopNote(this.currentBassNote);
    } else if (this.player) {
      this.player.stopNote(this.currentBassNote);
    }
    this.currentBassNote = null;
  }

  _keyToPc(key) {
    const map = { C:0,'C#':1,D:2,'D#':3,E:4,F:5,'F#':6,G:7,'G#':8,A:9,'A#':10,B:11 };
    return map[key] || 0;
  }
}

export default BassEngine;
