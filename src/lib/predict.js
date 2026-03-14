// Local music theory engine for instant (<10ms) responses
class MusicTheoryEngine {
  constructor() {
    this.scales = {
      major:      [0, 2, 4, 5, 7, 9, 11],
      minor:      [0, 2, 3, 5, 7, 8, 10],
      dorian:     [0, 2, 3, 5, 7, 9, 10],
      mixolydian: [0, 2, 4, 5, 7, 9, 10]
    };
    // Phrase state — gives the melody direction and memory
    this.phraseNotes  = [];   // notes played so far in current phrase
    this.phraseDir    = 1;    // +1 ascending, -1 descending
    this.phraseLength = 0;
  }

  getScaleNotes(root, scaleType = 'major') {
    return (this.scales[scaleType] || this.scales.major).map(i => root + i);
  }

  // Build a scale across 2 octaves rooted near the player
  _buildScale(root, scaleType) {
    const intervals = this.scales[scaleType] || this.scales.major;
    const notes = [];
    for (const oct of [0, 12]) {
      for (const i of intervals) notes.push(root + oct + i);
    }
    return notes.filter(n => n >= 48 && n <= 84);
  }

  generateInstantResponse(recentNotes, tempo, intensity, key) {
    if (!recentNotes || recentNotes.length === 0) return [];

    const root      = this.detectRoot(recentNotes);
    const scaleType = this.detectScaleType(recentNotes);
    const scale     = this._buildScale(root, scaleType);
    const lastPlayed = recentNotes[recentNotes.length - 1];

    // Find closest scale note to what the player just played
    let scaleIdx = scale.reduce((best, n, i) =>
      Math.abs(n - lastPlayed) < Math.abs(scale[best] - lastPlayed) ? i : best, 0);

    // Every 4 notes flip direction so the phrase has shape
    this.phraseLength++;
    if (this.phraseLength % 4 === 0) {
      this.phraseDir *= -1;
    }

    const numNotes = tempo > 140 ? 2 : tempo > 100 ? 3 : 4;
    const notes    = [];
    const stepSizes = intensity > 0.6 ? [1, 2, 3] : [1, 2]; // bigger leaps when energetic

    for (let i = 0; i < numNotes; i++) {
      const step = stepSizes[Math.floor(Math.random() * stepSizes.length)] * this.phraseDir;
      scaleIdx = Math.max(0, Math.min(scale.length - 1, scaleIdx + step));

      // Occasionally land on a chord tone (root, third, fifth) for resolution
      const chordTones = [0, 2, 4]; // scale degrees
      const useChordTone = Math.random() < 0.3;
      if (useChordTone) {
        const ct = chordTones[Math.floor(Math.random() * chordTones.length)];
        scaleIdx = Math.max(0, Math.min(scale.length - 1, ct + Math.floor(scaleIdx / 7) * 7));
      }

      notes.push({
        note:     scale[scaleIdx],
        velocity: Math.round(intensity * 80 + 30),
        duration: (60 / tempo) * (Math.random() > 0.4 ? 0.5 : 0.25)
      });
    }

    this.phraseNotes.push(...notes.map(n => n.note));
    if (this.phraseNotes.length > 16) this.phraseNotes = this.phraseNotes.slice(-16);

    return notes;
  }

  detectRoot(notes) {
    if (!notes || notes.length === 0) return 60;
    const counts = {};
    notes.forEach(n => { const c = n % 12; counts[c] = (counts[c] || 0) + 1; });
    const top = Object.keys(counts).reduce((a, b) => counts[a] > counts[b] ? a : b);
    return parseInt(top) + 60;
  }

  detectScaleType(notes) {
    if (!notes || notes.length < 3) return 'major';
    const intervals = [];
    for (let i = 1; i < Math.min(notes.length, 5); i++) {
      intervals.push((notes[i] - notes[0]) % 12);
    }
    return intervals.includes(3) ? 'minor' : 'major';
  }

  // Reset phrase when player stops, so next phrase starts fresh
  resetPhrase() {
    this.phraseNotes  = [];
    this.phraseLength = 0;
    this.phraseDir    = 1;
  }
}

export default MusicTheoryEngine;
