// Local music theory engine for instant (<10ms) responses
class MusicTheoryEngine {
  constructor() {
    this.scales = {
      major: [0, 2, 4, 5, 7, 9, 11],
      minor: [0, 2, 3, 5, 7, 8, 10],
      dorian: [0, 2, 3, 5, 7, 9, 10],
      mixolydian: [0, 2, 4, 5, 7, 9, 10]
    };
    
    this.chordProgressions = {
      major: [[0, 4, 7], [5, 9, 12], [7, 11, 14], [0, 4, 7]],
      minor: [[0, 3, 7], [5, 8, 12], [7, 10, 14], [0, 3, 7]]
    };
  }

  getScaleNotes(root, scaleType = 'major') {
    const intervals = this.scales[scaleType] || this.scales.major;
    return intervals.map(i => root + i);
  }

  getComplementaryNote(recentNotes, tempo, intensity, key) {
    if (!recentNotes || recentNotes.length === 0) return null;
    
    const lastNote = recentNotes[recentNotes.length - 1];
    const root = this.detectRoot(recentNotes);
    const scaleType = this.detectScaleType(recentNotes);
    const scaleNotes = this.getScaleNotes(root, scaleType);
    
    // Harmonic intervals (thirds, fifths, sixths)
    const harmonicIntervals = intensity > 0.6 ? [3, 4, 5, 7, 8, 9] : [4, 7, 9];
    const interval = harmonicIntervals[Math.floor(Math.random() * harmonicIntervals.length)];
    
    let targetNote = lastNote + interval;
    targetNote = this.snapToScale(targetNote, scaleNotes);
    
    return {
      note: Math.max(48, Math.min(84, targetNote)),
      velocity: Math.round(intensity * 100 + 27),
      duration: 60 / tempo * (Math.random() > 0.5 ? 0.5 : 0.25)
    };
  }

  generateInstantResponse(recentNotes, tempo, intensity, key) {
    const numNotes = tempo > 140 ? 2 : (tempo > 100 ? 3 : 4);
    const notes = [];
    
    for (let i = 0; i < numNotes; i++) {
      const note = this.getComplementaryNote(recentNotes, tempo, intensity, key);
      if (note) {
        notes.push(note);
        recentNotes = [...recentNotes, note.note];
      }
    }
    
    return notes;
  }

  detectRoot(notes) {
    if (!notes || notes.length === 0) return 60;
    const noteClasses = notes.map(n => n % 12);
    const counts = {};
    noteClasses.forEach(n => counts[n] = (counts[n] || 0) + 1);
    const mostCommon = Object.keys(counts).reduce((a, b) => counts[a] > counts[b] ? a : b);
    return parseInt(mostCommon) + 60;
  }

  detectScaleType(notes) {
    if (!notes || notes.length < 3) return 'major';
    const intervals = [];
    for (let i = 1; i < Math.min(notes.length, 5); i++) {
      intervals.push((notes[i] - notes[0]) % 12);
    }
    const hasMinorThird = intervals.includes(3);
    return hasMinorThird ? 'minor' : 'major';
  }

  snapToScale(note, scaleNotes) {
    const noteClass = note % 12;
    const scaleClasses = scaleNotes.map(n => n % 12);
    
    if (scaleClasses.includes(noteClass)) return note;
    
    const distances = scaleClasses.map(s => {
      const dist = Math.abs(noteClass - s);
      return Math.min(dist, 12 - dist);
    });
    const closest = distances.indexOf(Math.min(...distances));
    const adjustment = scaleClasses[closest] - noteClass;
    
    return note + (adjustment > 6 ? adjustment - 12 : adjustment < -6 ? adjustment + 12 : adjustment);
  }
}

export default MusicTheoryEngine;
