import easymidi from 'easymidi';

class MIDIListener {
  constructor() {
    this.input = null;
    this.portName = null;
  }

  listPorts() {
    return easymidi.getInputs();
  }

  connect(portName) {
    this.portName = portName;
    this.input = new easymidi.Input(portName);
  }

  listen(callback) {
    if (!this.input) {
      throw new Error('No MIDI port connected');
    }

    this.input.on('noteon', (msg) => {
      callback(msg);
    });

    this.input.on('noteoff', (msg) => {
      callback(msg);
    });
  }

  close() {
    if (this.input) {
      this.input.close();
    }
  }
}

export default MIDIListener;
