// Shared music theory — scales, chord tones, detection
// Used by both predict.js (melody) and bass.js (bass lines)

export const SCALES = {
  major:          [0, 2, 4, 5, 7, 9, 11],
  minor:          [0, 2, 3, 5, 7, 8, 10],
  dorian:         [0, 2, 3, 5, 7, 9, 10],
  mixolydian:     [0, 2, 4, 5, 7, 9, 10],
  pentatonic_maj: [0, 2, 4, 7, 9],           // major pentatonic — safe over everything
  pentatonic_min: [0, 3, 5, 7, 10],          // minor pentatonic — blues/rock staple
  blues:          [0, 3, 5, 6, 7, 10],       // minor pentatonic + b5 blue note
};

// Chord tones per scale (scale degree indices, 0-based)
// These are the "safe" landing notes — root, 3rd, 5th, 7th
export const CHORD_TONES = {
  major:          [0, 2, 4, 6],   // 1 3 5 maj7
  minor:          [0, 2, 4, 6],   // 1 b3 5 b7
  dorian:         [0, 2, 4, 6],   // 1 b3 5 b7
  mixolydian:     [0, 2, 4, 6],   // 1 3 5 b7  ← the dominant 7th sound
  pentatonic_maj: [0, 1, 2, 3],   // all tones are safe
  pentatonic_min: [0, 1, 2, 3],
  blues:          [0, 1, 2, 4],   // root, b3, 4, 5
};

export const KEY_TO_PC = {
  C:0,'C#':1,D:2,'D#':3,E:4,F:5,'F#':6,G:7,'G#':8,A:9,'A#':10,B:11
};

export const NOTE_NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];

// Build a scale as absolute MIDI notes within a range
export function buildScale(rootPc, scaleType, minNote = 36, maxNote = 84) {
  const intervals = SCALES[scaleType] || SCALES.pentatonic_maj;
  const notes = [];
  for (let oct = 0; oct <= 9; oct++) {
    for (const i of intervals) {
      const n = rootPc + oct * 12 + i;
      if (n >= minNote && n <= maxNote) notes.push(n);
    }
  }
  return notes;
}

// Detect scale type from a set of played note pitch classes.
// Returns the scale name that best fits the notes heard.
export function detectScale(notePcs) {
  if (!notePcs || notePcs.length < 3) return 'pentatonic_maj'; // safe default

  // Count how many played notes fit each scale (relative to each possible root)
  let bestScale = 'pentatonic_maj';
  let bestScore = -1;

  for (const [scaleName, intervals] of Object.entries(SCALES)) {
    // Try all 12 roots
    for (let root = 0; root < 12; root++) {
      const scaleSet = new Set(intervals.map(i => (root + i) % 12));
      const score = notePcs.filter(pc => scaleSet.has(pc)).length;
      if (score > bestScore) {
        bestScore = score;
        bestScale = scaleName;
      }
    }
  }

  // Pentatonic is a subset of major/minor — if score is tied, prefer pentatonic
  // (fewer notes = safer, less chance of clashing)
  return bestScale;
}

// Detect the most likely root from played notes (most frequent pitch class)
export function detectRoot(notes) {
  if (!notes || notes.length === 0) return 0;
  const counts = {};
  notes.forEach(n => { const pc = n % 12; counts[pc] = (counts[pc] || 0) + 1; });
  return parseInt(Object.keys(counts).reduce((a, b) => counts[a] > counts[b] ? a : b));
}
