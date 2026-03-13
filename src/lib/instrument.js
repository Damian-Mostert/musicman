class Instrument {
  constructor(name, midiChannel = 0) {
    this.name = name;
    this.midiChannel = midiChannel;
    this.noteRange = [21, 108]; // A0 to C8
    this.activeNotes = new Set();
  }

  getVoiceCharacteristics() {
    throw new Error('Must implement getVoiceCharacteristics()');
  }

  getPreferredRange() {
    throw new Error('Must implement getPreferredRange()');
  }

  validateNote(note) {
    const [minNote, maxNote] = this.getPreferredRange();
    return note >= minNote && note <= maxNote;
  }

  filterNotes(notes) {
    return notes.filter(n => this.validateNote(n.note));
  }

  getAIContext() {
    const chars = this.getVoiceCharacteristics();
    const [minNote, maxNote] = this.getPreferredRange();
    return `${this.name}: range ${minNote}-${maxNote}, style: ${chars.style || 'melodic'}`;
  }
}

class Piano extends Instrument {
  constructor(midiChannel = 0) {
    super('Piano', midiChannel);
  }

  getVoiceCharacteristics() {
    return {
      style: 'harmonic and melodic',
      polyphony: 10,
      articulation: 'sustained',
      role: 'accompaniment or lead'
    };
  }

  getPreferredRange() {
    return [21, 108]; // Full piano range
  }
}

class Bass extends Instrument {
  constructor(midiChannel = 1) {
    super('Bass', midiChannel);
  }

  getVoiceCharacteristics() {
    return {
      style: 'rhythmic and foundational',
      polyphony: 1,
      articulation: 'short and punchy',
      role: 'bass line'
    };
  }

  getPreferredRange() {
    return [28, 55]; // E1 to G3
  }
}

class Lead extends Instrument {
  constructor(midiChannel = 2) {
    super('Lead', midiChannel);
  }

  getVoiceCharacteristics() {
    return {
      style: 'melodic and expressive',
      polyphony: 1,
      articulation: 'legato',
      role: 'melody'
    };
  }

  getPreferredRange() {
    return [60, 84]; // C4 to C6
  }
}

class Drums extends Instrument {
  constructor(midiChannel = 9) {
    super('Drums', midiChannel);
  }

  getVoiceCharacteristics() {
    return {
      style: 'rhythmic percussion',
      polyphony: 4,
      articulation: 'staccato',
      role: 'rhythm'
    };
  }

  getPreferredRange() {
    return [35, 81]; // GM drum map range
  }

  getDrumKit() {
    return {
      kick: 36,
      snare: 38,
      hihat_closed: 42,
      hihat_open: 46,
      crash: 49,
      ride: 51
    };
  }
}

class Pad extends Instrument {
  constructor(midiChannel = 3) {
    super('Pad', midiChannel);
  }

  getVoiceCharacteristics() {
    return {
      style: 'ambient and atmospheric',
      polyphony: 6,
      articulation: 'very sustained',
      role: 'texture and harmony'
    };
  }

  getPreferredRange() {
    return [48, 72]; // C3 to C5
  }
}

export { Instrument, Piano, Bass, Lead, Drums, Pad };
export default Instrument;
