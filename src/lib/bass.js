import { buildScale, detectScale, detectRoot, CHORD_TONES, KEY_TO_PC, NOTE_NAMES } from './theory.js';

// A real bassist:
//  - Locks to the beat grid (doesn't fire on every player note)
//  - Plays root on beat 1, walks on beats 2/3/4
//  - Holds notes — doesn't chatter
//  - Updates target note when player plays something new, but waits for next beat to move
//  - Keeps the same root/scale for several bars before reconsidering

class BassEngine {
  constructor() {
    this.player      = null;
    this.useAudio    = false;
    this.audioPlayer = null;

    this.tempo    = 120;
    this.running  = false;

    // Stable tonality — only update after enough evidence
    this.noteHistory  = [];
    this.rootPc       = 0;   // C
    this.scaleType    = 'pentatonic_maj';
    this.historyDirty = false;  // re-detect only when new notes arrive

      // What the player is currently on — bass targets this
    this.targetNote   = null;
    this.currentNote  = null;

    // Walk state
    this.walkScale    = [];
    this.walkPos      = 0;
    this.walkTarget   = 0;
  }

  connectMidi(player)  { this.player = player; this.useAudio = false; }
  connectAudio(player) { this.audioPlayer = player; this.useAudio = true; }

  // Called by index-local on every player note — just update target, no scheduling
  noteHeard(midiNote, velocity, tempo, key) {
    this.tempo = tempo || this.tempo;
    const pc = midiNote % 12;
    this.noteHistory.push(pc);
    if (this.noteHistory.length > 24) this.noteHistory.shift();
    this.historyDirty = true;
    this.targetNote = midiNote;
    this.running = true;  // armed — will play on next onBeat() call
  }

  // Called by DrumEngine on every beat tick — bass is slaved to drum grid
  onBeat(beatIndex) {
    if (!this.running || this.targetNote === null) return;

    this._redetectIfDirty();

    const isBar1 = (beatIndex % 4) === 0;

    if (isBar1) {
      this._rebuildWalkScale();
      const rootNote = this._bassNote(this.rootPc + 48);
      this._play(rootNote, 75);
      this.walkPos    = this._nearestScaleIdx(rootNote);
      this.walkTarget = this._nearestScaleIdx(this._bassNote(this.targetNote));
    } else {
      this._stepWalk();
    }
  }

  phraseEnd() {
    // On phrase end, drop to root and hold for a bar
    if (!this.running) return;
    this._redetectIfDirty();
    const root = this._bassNote(this.rootPc + 48);
    this._play(root, 60);
  }

  stop() {
    this.running    = false;
    this.targetNote = null;
    this._stopCurrent();
  }


  _stepWalk() {
    if (this.walkScale.length === 0) return;

    // Move one scale step toward walkTarget
    if (this.walkPos < this.walkTarget)      this.walkPos++;
    else if (this.walkPos > this.walkTarget) this.walkPos--;

    // Update walk target to follow player's current note
    if (this.targetNote) {
      this.walkTarget = this._nearestScaleIdx(this._bassNote(this.targetNote));
    }

    const note = this.walkScale[this.walkPos];
    if (note !== undefined) this._play(note, 55 + Math.round(Math.random() * 12));
  }

  // ── Tonality ───────────────────────────────────────────────────────────────

  _redetectIfDirty() {
    if (!this.historyDirty || this.noteHistory.length < 3) return;
    this.historyDirty = false;
    this.rootPc    = detectRoot(this.noteHistory);
    this.scaleType = detectScale(this.noteHistory);
  }

  _rebuildWalkScale() {
    this.walkScale = buildScale(this.rootPc, this.scaleType, 28, 55);
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  _bassNote(note) {
    let n = note;
    while (n > 52) n -= 12;
    while (n < 28) n += 12;
    return n;
  }

  _nearestScaleIdx(note) {
    if (this.walkScale.length === 0) return 0;
    return this.walkScale.reduce((best, n, i) =>
      Math.abs(n - note) < Math.abs(this.walkScale[best] - note) ? i : best, 0);
  }

  _play(note, velocity) {
    this._stopCurrent();
    this.currentNote = note;

    if (this.useAudio && this.audioPlayer) {
      this.audioPlayer.playNote(note, velocity);
    } else if (this.player) {
      this.player.playNote(note, velocity);
    }

    // Hold for 85% of a beat then release — gives a slight staccato feel
    const holdMs = (60000 / this.tempo) * 0.85;
    setTimeout(() => this._stopCurrent(), holdMs);

    const name = NOTE_NAMES[note % 12];
    const oct  = Math.floor(note / 12) - 1;
    console.log(`🎸 ${name}${oct} [${this.scaleType} / beat ${this.beatCount % this.beatsPerBar + 1}]`);
  }

  _stopCurrent() {
    if (this.currentNote === null) return;
    if (this.useAudio && this.audioPlayer) {
      this.audioPlayer.stopNote(this.currentNote);
    } else if (this.player) {
      this.player.stopNote(this.currentNote);
    }
    this.currentNote = null;
  }
}

export default BassEngine;
