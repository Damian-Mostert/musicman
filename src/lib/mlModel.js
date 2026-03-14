import * as tf from '@tensorflow/tfjs-node';
import fs from 'fs';
import path from 'path';

// ── Drum Pattern ML Model ────────────────────────────────────────────────────
// Learns: musical context → 16-step drum pattern
// Trains in the background from real session data

export class DrumModel {
  constructor(modelPath) {
    this.modelPath = modelPath + '_drums';
    this.model = null;
    this.trainingData = [];   // { input: [...], output: [...] }
    this.minSamplesBeforeTrain = 8;
    this.isTraining = false;
  }

  // Input: [tempo/200, intensity, key/11, avg_pitch/127] = 4 features
  // Output: 16 steps × 4 drums = 64 binary values
  _createModel() {
    const model = tf.sequential({
      layers: [
        tf.layers.dense({ units: 32, activation: 'relu', inputShape: [4] }),
        tf.layers.dense({ units: 64, activation: 'relu' }),
        tf.layers.dense({ units: 64, activation: 'sigmoid' }) // 64 outputs
      ]
    });
    model.compile({ optimizer: tf.train.adam(0.01), loss: 'binaryCrossentropy' });
    return model;
  }

  _contextToInput(context) {
    const keyMap = { C:0,'C#':1,D:2,'D#':3,E:4,F:5,'F#':6,G:7,'G#':8,A:9,'A#':10,B:11 };
    return [
      (context.tempo || 120) / 200,
      context.intensity || 0.5,
      (keyMap[context.key] || 0) / 11,
      (context.avg_pitch || 60) / 127
    ];
  }

  _patternToOutput(pattern) {
    // Flatten 16×4 pattern to 64 values
    return pattern.flat().map(v => v ? 1 : 0);
  }

  _outputToPattern(values) {
    const pattern = [];
    for (let i = 0; i < 16; i++) {
      pattern.push([
        values[i * 4]     > 0.5 ? 1 : 0,
        values[i * 4 + 1] > 0.5 ? 1 : 0,
        values[i * 4 + 2] > 0.5 ? 1 : 0,
        values[i * 4 + 3] > 0.5 ? 1 : 0,
      ]);
    }
    // Always keep kick on beat 1, snare on 5 & 13
    pattern[0][0] = 1;
    pattern[4][1] = 1;
    pattern[12][1] = 1;
    return pattern;
  }

  // Record a good pattern that worked for this context
  record(context, pattern) {
    this.trainingData.push({
      input: this._contextToInput(context),
      output: this._patternToOutput(pattern)
    });
    // Keep last 500 samples
    if (this.trainingData.length > 500) this.trainingData.shift();
  }

  async trainAsync() {
    if (this.isTraining || this.trainingData.length < this.minSamplesBeforeTrain) return;
    this.isTraining = true;

    try {
      if (!this.model) this.model = this._createModel();

      const xs = tf.tensor2d(this.trainingData.map(d => d.input));
      const ys = tf.tensor2d(this.trainingData.map(d => d.output));

      await this.model.fit(xs, ys, {
        epochs: 20,
        batchSize: 8,
        verbose: 0
      });

      xs.dispose();
      ys.dispose();
      await this._save();
      console.log(`🥁 Drum model trained on ${this.trainingData.length} patterns`);
    } catch (e) {
      console.error('Drum model training error:', e.message);
    } finally {
      this.isTraining = false;
    }
  }

  predict(context) {
    if (!this.model) return null;
    const input = tf.tensor2d([this._contextToInput(context)]);
    const output = this.model.predict(input);
    const values = Array.from(output.dataSync());
    input.dispose();
    output.dispose();
    return this._outputToPattern(values);
  }

  async _save() {
    const dir = path.dirname(this.modelPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    await this.model.save(`file://${this.modelPath}`);
  }

  async load() {
    try {
      this.model = await tf.loadLayersModel(`file://${this.modelPath}/model.json`);
      this.model.compile({ optimizer: tf.train.adam(0.01), loss: 'binaryCrossentropy' });
      console.log('✓ Drum model loaded');
      return true;
    } catch {
      return false;
    }
  }
}

// ── Melody ML Model ─────────────────────────────────────────────────────────
// Learns: [recent_notes, tempo, intensity, key, avg_pitch] → [note, vel, dur] × 3
// Records every response played. On silence/mistake, marks last response as poor.

export class MelodyModel {
  constructor(modelPath) {
    this.modelPath = modelPath + '_melody';
    this.model = null;
    this.trainingData = [];      // { input, output, weight }
    this.minSamplesBeforeTrain = 10;
    this.isTraining = false;
    this.lastSample = null;      // most recent recorded sample, for mistake penalising
  }

  _createModel() {
    const model = tf.sequential({
      layers: [
        // Input: 8 recent notes + tempo + intensity + key + avg_pitch = 12
        tf.layers.dense({ units: 64, activation: 'relu', inputShape: [12] }),
        tf.layers.dropout({ rate: 0.15 }),
        tf.layers.dense({ units: 128, activation: 'relu' }),
        tf.layers.dropout({ rate: 0.15 }),
        tf.layers.dense({ units: 64, activation: 'relu' }),
        // Output: note/vel/dur × 3 notes = 9
        tf.layers.dense({ units: 9, activation: 'sigmoid' })
      ]
    });
    model.compile({ optimizer: tf.train.adam(0.001), loss: 'meanSquaredError' });
    return model;
  }

  _contextToInput(context) {
    const keyMap = { C:0,'C#':1,D:2,'D#':3,E:4,F:5,'F#':6,G:7,'G#':8,A:9,'A#':10,B:11 };
    const notes = context.recent_notes || [];
    const input = [];
    for (let i = 0; i < 8; i++) input.push(notes[i] ? notes[i] / 127 : 0);
    input.push((context.tempo || 120) / 200);
    input.push(context.intensity || 0.5);
    input.push((keyMap[context.key] || 0) / 11);
    input.push((context.avg_pitch || 60) / 127);
    return input;
  }

  _notesToOutput(notes) {
    const out = [];
    for (let i = 0; i < 3; i++) {
      if (notes[i]) {
        out.push(notes[i].note / 127);
        out.push((notes[i].velocity || 64) / 127);
        out.push(Math.min(1, (notes[i].duration || 0.4)));
      } else {
        out.push(0, 0, 0);
      }
    }
    return out;
  }

  _outputToNotes(values) {
    const notes = [];
    for (let i = 0; i < 3; i++) {
      const note = Math.round(values[i * 3] * 127);
      const velocity = Math.round(values[i * 3 + 1] * 127);
      const duration = values[i * 3 + 2];
      if (note >= 36 && note <= 96 && velocity > 10) {
        notes.push({ note, velocity, duration });
      }
    }
    return notes;
  }

  // Record a response that was played. weight=1 good, weight=0 mistake.
  record(context, notes, weight = 1) {
    const sample = {
      input: this._contextToInput(context),
      output: this._notesToOutput(notes),
      weight
    };
    this.trainingData.push(sample);
    this.lastSample = sample;
    if (this.trainingData.length > 1000) this.trainingData.shift();
  }

  // Call when player stops — penalise the last response
  markLastAsMistake() {
    if (this.lastSample) {
      this.lastSample.weight = 0.1; // don't erase, just down-weight
    }
  }

  async trainAsync() {
    if (this.isTraining || this.trainingData.length < this.minSamplesBeforeTrain) return;
    this.isTraining = true;
    try {
      if (!this.model) this.model = this._createModel();

      // Duplicate high-weight samples so good responses are reinforced
      const expanded = [];
      for (const s of this.trainingData) {
        expanded.push(s);
        if (s.weight >= 1) expanded.push(s); // good samples appear twice
      }

      const xs = tf.tensor2d(expanded.map(d => d.input));
      const ys = tf.tensor2d(expanded.map(d => d.output));

      await this.model.fit(xs, ys, { epochs: 15, batchSize: 16, verbose: 0 });

      xs.dispose();
      ys.dispose();
      await this._save();
      console.log(`🎹 Melody model trained on ${this.trainingData.length} phrases`);
    } catch (e) {
      console.error('Melody model training error:', e.message);
    } finally {
      this.isTraining = false;
    }
  }

  predict(context) {
    if (!this.model) return null;
    const input = tf.tensor2d([this._contextToInput(context)]);
    const output = this.model.predict(input);
    const values = Array.from(output.dataSync());
    input.dispose();
    output.dispose();
    const notes = this._outputToNotes(values);
    return notes.length > 0 ? notes : null;
  }

  async _save() {
    const dir = path.dirname(this.modelPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    await this.model.save(`file://${this.modelPath}`);
  }

  async load() {
    try {
      this.model = await tf.loadLayersModel(`file://${this.modelPath}/model.json`);
      this.model.compile({ optimizer: tf.train.adam(0.001), loss: 'meanSquaredError' });
      console.log('✓ Melody model loaded');
      return true;
    } catch {
      return false;
    }
  }
}

// ── Melody ML Model (existing, used by train.js / index.js) ──────────────────

class MusicModelTrainer {
  constructor(aiMusician, modelPath) {
    this.ai = aiMusician;
    this.modelPath = modelPath;
    this.model = null;
    this.trainingData = [];
    this.maxTrainingSize = 5000;
  }

  // Create the neural network architecture
  createModel() {
    const model = tf.sequential({
      layers: [
        // Input: [recent_notes(8), tempo(1), intensity(1), key(1), avg_pitch(1)] = 12 features
        tf.layers.dense({ units: 64, activation: 'relu', inputShape: [12] }),
        tf.layers.dropout({ rate: 0.2 }),
        tf.layers.dense({ units: 128, activation: 'relu' }),
        tf.layers.dropout({ rate: 0.2 }),
        tf.layers.dense({ units: 64, activation: 'relu' }),
        // Output: [note1, vel1, dur1, note2, vel2, dur2, note3, vel3, dur3] = 9 values
        tf.layers.dense({ units: 9, activation: 'linear' })
      ]
    });

    model.compile({
      optimizer: tf.train.adam(0.001),
      loss: 'meanSquaredError',
      metrics: ['mae']
    });

    return model;
  }

  // Convert musical context to tensor input
  contextToTensor(context) {
    const input = [];
    
    // Recent notes (8 notes, normalized to 0-1)
    const notes = context.recent_notes || [];
    for (let i = 0; i < 8; i++) {
      input.push(notes[i] ? notes[i] / 127 : 0);
    }
    
    // Tempo (normalized)
    input.push((context.tempo || 120) / 200);
    
    // Intensity (already 0-1)
    input.push(context.intensity || 0.5);
    
    // Key (convert to number 0-11, normalized)
    const keyMap = { C: 0, 'C#': 1, D: 2, 'D#': 3, E: 4, F: 5, 'F#': 6, G: 7, 'G#': 8, A: 9, 'A#': 10, B: 11 };
    input.push((keyMap[context.key] || 0) / 11);
    
    // Average pitch (normalized)
    input.push((context.avg_pitch || 60) / 127);
    
    return tf.tensor2d([input]);
  }

  // Convert AI response to tensor output
  responsesToTensor(notes) {
    const output = [];
    
    // Take first 3 notes (pad if less)
    for (let i = 0; i < 3; i++) {
      if (notes[i]) {
        output.push(notes[i].note / 127);
        output.push(notes[i].velocity / 127);
        output.push(notes[i].duration || 0.5);
      } else {
        output.push(0, 0, 0);
      }
    }
    
    return tf.tensor2d([output]);
  }

  // Collect training data from Claude
  async collectTrainingData(numSamples = 100) {
    console.log(`📚 Collecting ${numSamples} training samples from Claude...`);
    
    for (let i = 0; i < numSamples; i++) {
      // Generate varied musical contexts
      const context = this.generateRandomContext();
      
      try {
        const response = await this.ai.generateResponse(null, context);
        
        if (response && response.length > 0) {
          this.trainingData.push({ context, response });
          
          if (i % 10 === 0) {
            console.log(`  Collected ${i + 1}/${numSamples} samples...`);
          }
        }
      } catch (error) {
        console.error(`  Error collecting sample ${i}:`, error.message);
      }
      
      // Rate limit
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    console.log(`✓ Collected ${this.trainingData.length} training samples`);
    this.saveTrainingData();
  }

  // Generate random but musically valid contexts for training
  generateRandomContext() {
    const keys = ['C', 'D', 'E', 'F', 'G', 'A', 'B', 'C#', 'D#', 'F#', 'G#', 'A#'];
    const scales = {
      major: [0, 2, 4, 5, 7, 9, 11],
      minor: [0, 2, 3, 5, 7, 8, 10]
    };
    
    const key = keys[Math.floor(Math.random() * keys.length)];
    const scaleType = Math.random() > 0.5 ? 'major' : 'minor';
    const scale = scales[scaleType];
    const root = 48 + Math.floor(Math.random() * 24);
    
    // Generate notes in scale
    const recent_notes = [];
    for (let i = 0; i < 8; i++) {
      const scaleNote = scale[Math.floor(Math.random() * scale.length)];
      recent_notes.push(root + scaleNote);
    }
    
    return {
      recent_notes,
      tempo: 80 + Math.floor(Math.random() * 100),
      intensity: Math.random(),
      key,
      avg_pitch: root + 12
    };
  }

  // Train the model
  async train(epochs = 50) {
    if (this.trainingData.length === 0) {
      console.log('⚠️  No training data. Collect data first.');
      return;
    }

    console.log(`🧠 Training model on ${this.trainingData.length} samples...`);
    
    this.model = this.createModel();
    
    // Prepare tensors
    const inputs = [];
    const outputs = [];
    
    for (const sample of this.trainingData) {
      const inputTensor = this.contextToTensor(sample.context);
      const outputTensor = this.responsesToTensor(sample.response);
      inputs.push(inputTensor);
      outputs.push(outputTensor);
    }
    
    const xs = tf.concat(inputs);
    const ys = tf.concat(outputs);
    
    // Train
    await this.model.fit(xs, ys, {
      epochs,
      batchSize: 32,
      validationSplit: 0.2,
      callbacks: {
        onEpochEnd: (epoch, logs) => {
          console.log(`  Epoch ${epoch + 1}/${epochs} - loss: ${logs.loss.toFixed(4)} - val_loss: ${logs.val_loss.toFixed(4)}`);
        }
      }
    });
    
    console.log('✓ Training complete');
    await this.saveModel();
    
    // Cleanup
    xs.dispose();
    ys.dispose();
    inputs.forEach(t => t.dispose());
    outputs.forEach(t => t.dispose());
  }

  // Predict response using trained model
  predict(context) {
    if (!this.model) return null;
    
    const inputTensor = this.contextToTensor(context);
    const prediction = this.model.predict(inputTensor);
    const values = prediction.dataSync();
    
    // Convert back to notes
    const notes = [];
    for (let i = 0; i < 3; i++) {
      const note = Math.round(values[i * 3] * 127);
      const velocity = Math.round(values[i * 3 + 1] * 127);
      const duration = values[i * 3 + 2];
      
      if (note > 0 && velocity > 0) {
        notes.push({ note, velocity, duration });
      }
    }
    
    inputTensor.dispose();
    prediction.dispose();
    
    return notes;
  }

  // Save model to disk
  async saveModel() {
    if (!this.model) return;
    
    const modelDir = path.dirname(this.modelPath);
    if (!fs.existsSync(modelDir)) {
      fs.mkdirSync(modelDir, { recursive: true });
    }
    
    await this.model.save(`file://${this.modelPath}`);
    console.log(`✓ Model saved to ${this.modelPath}`);
  }

  // Load model from disk
  async loadModel() {
    try {
      this.model = await tf.loadLayersModel(`file://${this.modelPath}/model.json`);
      console.log('✓ Model loaded from disk');
      return true;
    } catch (error) {
      console.log('⚠️  No saved model found');
      return false;
    }
  }

  // Save training data
  saveTrainingData() {
    const dataPath = path.join(path.dirname(this.modelPath), 'training_data.json');
    fs.writeFileSync(dataPath, JSON.stringify(this.trainingData, null, 2));
  }

  // Load training data
  loadTrainingData() {
    const dataPath = path.join(path.dirname(this.modelPath), 'training_data.json');
    try {
      this.trainingData = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
      console.log(`✓ Loaded ${this.trainingData.length} training samples`);
    } catch {
      this.trainingData = [];
    }
  }
}

export default MusicModelTrainer;
