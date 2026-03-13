import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import MIDIListener from './lib/listen.js';
import MIDIPlayer from './lib/play.js';
import AIMusician from './lib/think.js';
import VoiceListener from './lib/voice.js';
import MusicTheoryEngine from './lib/predict.js';
import PredictionBuffer from './lib/buffer.js';
import readline from 'readline';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, '..');

dotenv.config({ path: path.join(rootDir, '.env') });

class MusicMan {
  constructor() {
    this.settingsPath = path.join(rootDir, 'settings.json');
    this.settings = this.loadSettings();
    this.listener = new MIDIListener();
    this.player = new MIDIPlayer();
    this.voice = new VoiceListener();
    this.ai = new AIMusician(
      process.env.AI_API_KEY,
      path.join(rootDir, 'storage')
    );
    this.localEngine = new MusicTheoryEngine();
    this.predictionBuffer = new PredictionBuffer(this.ai);
    this.responseQueue = [];
    this.voiceQueue = [];
    this.running = false;
    this.lastBufferRefresh = 0;
    this.bufferRefreshInterval = 2000; // Refresh every 2 seconds
  }

  loadSettings() {
    try {
      return JSON.parse(fs.readFileSync(this.settingsPath, 'utf8'));
    } catch {
      return { midi_input: '', midi_output: '', ai_model: '' };
    }
  }

  saveSettings() {
    fs.writeFileSync(this.settingsPath, JSON.stringify(this.settings, null, 2));
  }

  async setup() {
    const inputPorts = this.listener.listPorts();
    const outputPorts = this.player.listPorts();

    console.log('Available MIDI Input Ports:');
    inputPorts.forEach((port, i) => console.log(`  ${i}: ${port}`));

    console.log('\nAvailable MIDI Output Ports:');
    outputPorts.forEach((port, i) => console.log(`  ${i}: ${port}`));

    if (!this.settings.midi_input) {
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
      });

      const inputIdx = await new Promise(resolve => {
        rl.question('\nSelect input port number: ', resolve);
      });
      this.settings.midi_input = inputPorts[parseInt(inputIdx)];

      const outputIdx = await new Promise(resolve => {
        rl.question('Select output port number: ', resolve);
      });
      this.settings.midi_output = outputPorts[parseInt(outputIdx)];

      rl.close();
      this.saveSettings();
    }
  }

  handleMidiInput(msg) {
    if (msg._type === 'noteon' && msg.velocity > 0) {
      this.ai.processInput(msg);
      const state = this.ai.getMusicalState();
      console.log(`♪ Note ${msg.note} | Tempo: ${state.tempo} BPM | Key: ${state.key} | Energy: ${state.intensity}`);
      this.responseQueue.push(Date.now());
      
      // Refresh prediction buffer in background if needed
      const now = Date.now();
      if (now - this.lastBufferRefresh > this.bufferRefreshInterval) {
        this.lastBufferRefresh = now;
        const context = this.ai.getMusicalContext();
        this.predictionBuffer.fillBuffer(context).catch(err => 
          console.error('Buffer refresh error:', err.message)
        );
      }
    }
  }

  handleVoiceCommand(transcript) {
    console.log(`🎤 Processing: "${transcript}"`);
    this.voiceQueue.push(transcript);
  }

  async responseLoop() {
    while (this.running) {
      // Handle voice commands first (use AI directly)
      if (this.voiceQueue.length > 0) {
        const voiceCommand = this.voiceQueue.shift();
        const notes = await this.ai.generateResponse(voiceCommand);
        
        if (notes && notes.length > 0) {
          console.log(`🎹 AI plays: [${notes.map(n => n.note).join(', ')}]`);
          await this.playNotes(notes);
        }
      }
      
      // Handle MIDI responses with hybrid approach
      if (this.responseQueue.length > 0) {
        this.responseQueue.shift();
        
        const context = this.ai.getMusicalContext();
        const recentNotes = context.recent_notes;
        
        // Try prediction buffer first (pre-generated AI response)
        let notes = this.predictionBuffer.getBestMatch(context);
        let source = 'AI-buffered';
        
        // Fallback to instant local engine if buffer empty
        if (!notes || notes.length === 0) {
          notes = this.localEngine.generateInstantResponse(
            recentNotes,
            context.tempo,
            context.intensity,
            context.key
          );
          source = 'Local';
        }
        
        if (notes && notes.length > 0) {
          const bufferStatus = this.predictionBuffer.getBufferStatus();
          console.log(`🎹 ${source} responds: [${notes.map(n => n.note).join(', ')}] (buffer: ${bufferStatus.size})`);
          await this.playNotes(notes);
        }
      }
      
      await new Promise(resolve => setTimeout(resolve, 50));
    }
  }

  async playNotes(notes) {
    // Play notes with timing
    for (const noteData of notes) {
      this.player.playNote(noteData.note, noteData.velocity || 64);
      const duration = noteData.duration || 0.4;
      await new Promise(resolve => setTimeout(resolve, duration * 700));
    }
    
    // Release notes
    await new Promise(resolve => setTimeout(resolve, 100));
    for (const noteData of notes) {
      this.player.stopNote(noteData.note);
    }
  }

  async start() {
    this.listener.connect(this.settings.midi_input);
    this.player.connect(this.settings.midi_output);

    this.listener.listen((msg) => this.handleMidiInput(msg));
    
    // Start voice listening
    this.voice.startListening((transcript) => this.handleVoiceCommand(transcript));

    this.running = true;
    this.responseLoop();

    console.log('\n🎵 MusicMan is listening to MIDI and voice... (Ctrl+C to stop)\n');

    process.on('SIGINT', () => {
      console.log('\n\nStopping...');
      this.running = false;
      this.voice.stopListening();
      this.ai.saveSession();
      this.listener.close();
      this.player.close();
      console.log('Session saved. Goodbye!');
      process.exit(0);
    });
  }
}

async function main() {
  const app = new MusicMan();
  await app.setup();
  await app.start();
}

main().catch(console.error);
