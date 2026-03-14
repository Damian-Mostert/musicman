import Speaker from 'speaker';

// Simple audio synthesizer for playing notes through speakers
class AudioPlayer {
  constructor() {
    this.speaker = null;
    this.sampleRate = 44100;
    this.activeNotes = new Map();
    this.isPlaying = false;
    this.time = 0;
  }

  listPorts() {
    return ['System Speakers/Headphones'];
  }

  connect(portName) {
    console.log(`🔊 Connected to: ${portName}`);
    
    this.speaker = new Speaker({
      channels: 2,
      bitDepth: 16,
      sampleRate: this.sampleRate,
      highWaterMark: 8192 // Larger buffer to prevent underflow
    });

    this.isPlaying = true;
    this.startAudioLoop();
  }

  startAudioLoop() {
    const bufferSize = 2048; // Larger buffer
    const interval = (bufferSize / this.sampleRate) * 1000 * 0.8; // Fill slightly faster
    
    this.audioInterval = setInterval(() => {
      if (!this.isPlaying) return;
      
      const buffer = this.generateAudioBuffer(bufferSize);
      if (this.speaker && !this.speaker.destroyed) {
        try {
          this.speaker.write(buffer);
        } catch (err) {
          // Ignore write errors (buffer full)
        }
      }
    }, interval);
  }

  generateAudioBuffer(size) {
    const buffer = Buffer.alloc(size * 4);
    
    for (let i = 0; i < size; i++) {
      let sample = 0;
      
      // Mix melodic notes (bass guitar tone)
      this.activeNotes.forEach((noteData, note) => {
        const frequency = this.midiToFrequency(note);
        const amplitude = (noteData.velocity / 127) * 0.25;
        const t = noteData.time;

        // Pluck envelope: fast attack, exponential decay with sustain
        const attack = Math.min(t / 0.008, 1.0);           // 8ms attack
        const decay  = Math.exp(-t * 3.5);                 // body decay
        const env    = attack * decay;

        // Sawtooth via additive harmonics — bass guitar has strong low harmonics
        // Higher harmonics decay faster (simulates string + body resonance)
        let s = 0;
        s += Math.sin(2 * Math.PI * frequency       * t) * 1.00 * Math.exp(-t * 2);
        s += Math.sin(2 * Math.PI * frequency * 2   * t) * 0.60 * Math.exp(-t * 4);
        s += Math.sin(2 * Math.PI * frequency * 3   * t) * 0.30 * Math.exp(-t * 7);
        s += Math.sin(2 * Math.PI * frequency * 4   * t) * 0.15 * Math.exp(-t * 12);
        s += Math.sin(2 * Math.PI * frequency * 5   * t) * 0.07 * Math.exp(-t * 18);

        // Slight body thump at note-on (low freq transient)
        const thump = Math.sin(2 * Math.PI * frequency * 0.5 * t) * Math.exp(-t * 20) * 0.4;

        sample += (s + thump) * amplitude * env;
        noteData.time += 1 / this.sampleRate;
      });

      // Mix drum hits
      if (this.drumHits) {
        this.drumHits.forEach(hit => {
          const amp = (hit.velocity / 127) * 0.35;
          const t = hit.time;
          if (hit.type === 'kick') {
            // Sine sweep: 150Hz -> 50Hz with fast decay
            const freq = 150 * Math.exp(-t * 30);
            sample += Math.sin(2 * Math.PI * freq * t) * amp * Math.exp(-t * 20);
          } else if (hit.type === 'snare') {
            // Noise burst + tone
            const noise = (Math.random() * 2 - 1) * Math.exp(-t * 25);
            const tone  = Math.sin(2 * Math.PI * 200 * t) * Math.exp(-t * 30);
            sample += (noise * 0.6 + tone * 0.4) * amp;
          } else if (hit.type === 'hihat') {
            sample += (Math.random() * 2 - 1) * amp * 0.5 * Math.exp(-t * 80);
          } else if (hit.type === 'ride') {
            sample += (Math.random() * 2 - 1) * amp * 0.4 * Math.exp(-t * 40);
          }
          hit.time += 1 / this.sampleRate;
        });
      }
      
      sample = Math.max(-1, Math.min(1, sample));
      const intSample = Math.round(sample * 32767);
      buffer.writeInt16LE(intSample, i * 4);
      buffer.writeInt16LE(intSample, i * 4 + 2);
    }
    
    this.activeNotes.forEach((noteData, note) => {
      if (noteData.time > 3.0) this.activeNotes.delete(note);
    });

    if (this.drumHits) {
      this.drumHits = this.drumHits.filter(h => h.time < 0.15);
    }
    
    return buffer;
  }

  playNote(note, velocity = 64) {
    this.activeNotes.set(note, {
      velocity: velocity,
      time: 0
    });
  }

  stopNote(note) {
    this.activeNotes.delete(note);
  }

  midiToFrequency(midi) {
    return 440 * Math.pow(2, (midi - 69) / 12);
  }

  close() {
    this.isPlaying = false;
    
    if (this.audioInterval) {
      clearInterval(this.audioInterval);
    }
    
    if (this.speaker && !this.speaker.destroyed) {
      this.speaker.end();
    }
  }
}

export default AudioPlayer;
