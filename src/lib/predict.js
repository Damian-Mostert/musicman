import { buildScale, detectScale, detectRoot, CHORD_TONES, KEY_TO_PC } from './theory.js';

class MusicTheoryEngine {
  constructor() {
    this.phraseNotes  = [];
    this.phraseDir    = 1;
    this.phraseLength = 0;
  }

  generateInstantResponse(recentNotes, tempo, intensity, key) {
    if (!recentNotes || recentNotes.length === 0) return [];

    // Detect root and scale from what the player actually played
    const notePcs  = recentNotes.map(n => n % 12);
    const rootPc   = key ? (KEY_TO_PC[key] ?? detectRoot(recentNotes)) : detectRoot(recentNotes);
    const scaleType = detectScale(notePcs);
    const lastPlayed = recentNotes[recentNotes.length - 1];

    // Melody lives in mid range, one octave below player average
    const playerAvg = recentNotes.reduce((a, b) => a + b, 0) / recentNotes.length;
    const minNote   = Math.max(36, Math.round(playerAvg) - 24);
    const maxNote   = Math.round(playerAvg) - 1;
    const scale     = buildScale(rootPc, scaleType, minNote, maxNote);
    if (scale.length === 0) return [];

    // Start from the scale note closest to what the player just played (transposed down)
    const target = lastPlayed - 12;
    let scaleIdx = scale.reduce((best, n, i) =>
      Math.abs(n - target) < Math.abs(scale[best] - target) ? i : best, 0);

    // Phrase direction flips every 4 notes — gives melodic shape
    this.phraseLength++;
    if (this.phraseLength % 4 === 0) this.phraseDir *= -1;

    const numNotes  = tempo > 140 ? 2 : tempo > 100 ? 3 : 4;
    const stepSizes = intensity > 0.6 ? [1, 2, 3] : [1, 2];
    const chordDegrees = CHORD_TONES[scaleType] || [0, 2, 4];
    const notes = [];

    for (let i = 0; i < numNotes; i++) {
      const step = stepSizes[Math.floor(Math.random() * stepSizes.length)] * this.phraseDir;
      scaleIdx = Math.max(0, Math.min(scale.length - 1, scaleIdx + step));

      // 30% chance: snap to a chord tone (root/3rd/5th/7th) for resolution
      if (Math.random() < 0.3) {
        const deg = chordDegrees[Math.floor(Math.random() * chordDegrees.length)];
        const octaveOffset = Math.floor(scaleIdx / (CHORD_TONES[scaleType]?.length || 5));
        scaleIdx = Math.max(0, Math.min(scale.length - 1,
          deg + octaveOffset * (CHORD_TONES[scaleType]?.length || 5)));
      }

      notes.push({
        note:     scale[scaleIdx],
        velocity: Math.round(intensity * 70 + 25),
        duration: (60 / tempo) * (Math.random() > 0.4 ? 0.5 : 0.25)
      });
    }

    this.phraseNotes.push(...notes.map(n => n.note));
    if (this.phraseNotes.length > 16) this.phraseNotes = this.phraseNotes.slice(-16);

    return notes;
  }

  resetPhrase() {
    this.phraseNotes  = [];
    this.phraseLength = 0;
    this.phraseDir    = 1;
  }
}

export default MusicTheoryEngine;
