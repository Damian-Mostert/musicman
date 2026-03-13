import easymidi from 'easymidi';

class MIDIPlayer {
  constructor() {
    this.output = null;
    this.portName = null;
  }

  listPorts() {
    return easymidi.getOutputs();
  }

  connect(portName) {
    this.portName = portName;
    this.output = new easymidi.Output(portName);
  }

  playNote(note, velocity = 64, channel = 0) {
    if (!this.output) {
      throw new Error('No MIDI port connected');
    }
    this.output.send('noteon', {
      note: note,
      velocity: velocity,
      channel: channel
    });
  }

  stopNote(note, channel = 0) {
    if (!this.output) {
      throw new Error('No MIDI port connected');
    }
    this.output.send('noteoff', {
      note: note,
      velocity: 0,
      channel: channel
    });
  }

  playNotes(notes) {
    for (const noteData of notes) {
      this.playNote(noteData.note, noteData.velocity || 64, noteData.channel || 0);
    }
  }

  close() {
    if (this.output) {
      this.output.close();
    }
  }
}

export default MIDIPlayer;
