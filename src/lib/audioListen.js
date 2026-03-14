import recorder from 'node-record-lpcm16';
import { EventEmitter } from 'events';

// Simple pitch detection using autocorrelation
class AudioListener extends EventEmitter {
  constructor() {
    super();
    this.recording = null;
    this.isListening = false;
    this.sampleRate = 16000;
    this.lastNoteTime = 0;
    this.noteThrottle = 333;     // ms between notes — floor of 180 BPM 8th notes
    this.lastNote = null;
    this.consecutiveSame = 0;    // suppress repeated identical notes from noise
  }

  listPorts() {
    return ['System Microphone'];
  }

  connect(portName) {
    console.log(`🎤 Connected to: ${portName}`);
  }

  listen(callback) {
    this.isListening = true;
    console.log('🎤 Audio listening started - hum or sing into your microphone...');
    console.log('   (Listening for frequencies 80-1000Hz, RMS threshold: 500)');
    
    let chunkCount = 0;
    
    this.recording = recorder.record({
      sampleRateHertz: this.sampleRate,
      threshold: 0,
      verbose: false,
      recordProgram: 'sox',
      silence: '0.1',
    });

    const stream = this.recording.stream();
    
    stream.on('data', (chunk) => {
      if (!this.isListening) return;
      
      chunkCount++;
      
      const samples = new Int16Array(chunk.buffer, chunk.byteOffset, chunk.length / 2);
      
      // Calculate RMS for debugging
      let rms = 0;
      for (let i = 0; i < samples.length; i++) {
        rms += samples[i] * samples[i];
      }
      rms = Math.sqrt(rms / samples.length);
      
      // Debug every 50 chunks (~1 second)
      if (chunkCount % 50 === 0) {
        console.log(`📊 Audio level: ${rms.toFixed(0)} (need >500 to detect pitch)`);
      }
      
      const pitch = this.detectPitch(samples);
      
      if (pitch && pitch > 80 && pitch < 1000) {
        const note = this.frequencyToMidi(pitch);
        const velocity = this.getAmplitude(samples);
        
        // Throttle note events
        const now = Date.now();
        if (velocity > 15 && now - this.lastNoteTime > this.noteThrottle) {
          // Suppress noise: ignore if same note repeating more than 4x in a row
          if (note === this.lastNote) {
            this.consecutiveSame++;
          } else {
            this.consecutiveSame = 0;
          }
          this.lastNote = note;

          if (this.consecutiveSame < 4) {
            this.lastNoteTime = now;
            const msg = { _type: 'noteon', note, velocity: Math.min(127, velocity * 2) };
            console.log(`🎵 Detected: Note ${note} (${pitch.toFixed(1)}Hz) Vel ${msg.velocity}`);
            callback(msg);
          }
        }
      }
    });
    
    stream.on('error', (err) => {
      console.error('Audio stream error:', err.message);
    });
  }

  detectPitch(samples) {
    // Calculate RMS to check if there's enough signal
    let rms = 0;
    for (let i = 0; i < samples.length; i++) {
      rms += samples[i] * samples[i];
    }
    rms = Math.sqrt(rms / samples.length);
    
    if (rms < 800) return null; // Too quiet — raised from 500 to cut background noise
    
    const minFreq = 80;
    const maxFreq = 1000;
    const minPeriod = Math.floor(this.sampleRate / maxFreq);
    const maxPeriod = Math.floor(this.sampleRate / minFreq);
    
    let bestCorrelation = 0;
    let bestPeriod = 0;
    
    // Autocorrelation
    for (let period = minPeriod; period < maxPeriod; period++) {
      let correlation = 0;
      for (let i = 0; i < samples.length - period; i++) {
        correlation += Math.abs(samples[i] * samples[i + period]);
      }
      
      if (correlation > bestCorrelation) {
        bestCorrelation = correlation;
        bestPeriod = period;
      }
    }
    
    if (bestPeriod === 0 || bestCorrelation < 1000000) return null;
    return this.sampleRate / bestPeriod;
  }

  frequencyToMidi(frequency) {
    return Math.max(36, Math.min(84, Math.round(69 + 12 * Math.log2(frequency / 440))));
  }

  getAmplitude(samples) {
    let sum = 0;
    for (let i = 0; i < samples.length; i++) {
      sum += Math.abs(samples[i]);
    }
    const avg = sum / samples.length;
    return Math.min(127, Math.round(avg / 50));
  }

  close() {
    this.isListening = false;
    if (this.recording) {
      this.recording.stop();
    }
  }
}

export default AudioListener;
