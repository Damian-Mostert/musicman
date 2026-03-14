import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import MIDIListener from './lib/listen.js';
import MIDIPlayer from './lib/play.js';
import AudioListener from './lib/audioListen.js';
import AudioPlayer from './lib/audioPlay.js';
import AIMusician from './lib/think.js';
import MusicTheoryEngine from './lib/predict.js';
import DrumEngine from './lib/drums.js';
import BassEngine from './lib/bass.js';
import { DrumModel, MelodyModel } from './lib/mlModel.js';
import SongManager from './lib/songManager.js';
import readline from 'readline';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, '..');

dotenv.config({ path: path.join(rootDir, '.env') });

class MusicMan {
  constructor() {
    this.settingsPath = path.join(rootDir, 'settings.json');
    this.settings = this.loadSettings();
    this.listener = null;
    this.player = null;
    this.useAudio = false;
    this.ai = new AIMusician(
      null,
      path.join(rootDir, 'storage')
    );
    this.localEngine = new MusicTheoryEngine();
    this.drums = new DrumEngine(path.join(rootDir, 'storage'));
    this.bass  = new BassEngine();
    this.drumModel = new DrumModel(path.join(rootDir, 'models', 'music_model'));
    this.melodyModel = new MelodyModel(path.join(rootDir, 'models', 'music_model'));
    this.songs = new SongManager(path.join(rootDir, 'storage'));
    this.running = false;
    this.listenMode = process.env.LISTEN_MODE !== 'false';
    this.lastContext = null;

    // Band-mate phrasing state
    this.notesSinceResponse = 0;   // how many player notes heard since last response
    this.responseEvery = 4;        // respond after every N player notes (a phrase)
    this.lastResponseTime = 0;     // don't respond more than once per beat
  }

  loadSettings() {
    try {
      return JSON.parse(fs.readFileSync(this.settingsPath, 'utf8'));
    } catch {
      return { midi_input: '', midi_output: '' };
    }
  }

  saveSettings() {
    fs.writeFileSync(this.settingsPath, JSON.stringify(this.settings, null, 2));
  }

  async setup() {
    await this.songs.prompt();
    await this.songs.teachSong();

    // Store song tempo — drums will re-lock from player, but use this as a hint
    const song = this.songs.currentSong;
    if (song.tempo) {
      this.drums.songTempo = song.tempo;  // hint only, not a lock
      console.log(`🥁 Song tempo hint: ${song.tempo} BPM`);
    }

    const midiListener = new MIDIListener();
    const midiPlayer = new MIDIPlayer();
    
    const inputPorts = midiListener.listPorts();
    const outputPorts = midiPlayer.listPorts();

    if (inputPorts.length === 0 || outputPorts.length === 0) {
      console.log('⚠️  No MIDI devices detected. Falling back to audio (mic + speakers).');
      console.log('   You can sing, hum, or play an instrument into your microphone.\n');
      
      this.useAudio = true;
      this.listener = new AudioListener();
      this.player = new AudioPlayer();
      
      this.settings.midi_input = 'System Microphone';
      this.settings.midi_output = 'System Speakers/Headphones';
      this.saveSettings();
      return;
    }

    this.listener = midiListener;
    this.player = midiPlayer;
    this.useAudio = false;

    console.log('Available MIDI Input Ports:');
    inputPorts.forEach((port, i) => console.log(`  ${i}: ${port}`));

    console.log('\nAvailable MIDI Output Ports:');
    outputPorts.forEach((port, i) => console.log(`  ${i}: ${port}`));

    if (!this.settings.midi_input || !inputPorts.includes(this.settings.midi_input)) {
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

      this.drums.noteHeard();
      this.drums.syncTempo(state.tempo, Date.now());
      this.drums.syncIntensity(state.intensity);

      // Bass follows every note immediately
      this.bass.noteHeard(msg.note, msg.velocity, state.tempo, state.key);

      this.lastContext = this.ai.getMusicalContext();
    }
  }

  async _respond() {
    const context = this.ai.getMusicalContext();

    // Try learned model first, fall back to theory engine
    let notes = this.melodyModel.predict(context);
    let source = '🧠';

    if (!notes) {
      notes = this.localEngine.generateInstantResponse(
        context.recent_notes, context.tempo, context.intensity, context.key
      );
      source = '🎵';
    }

    if (!notes || notes.length === 0) return;

    // Sit below the player — drop notes down an octave if they're in the same range
    const playerAvg = context.avg_pitch || 60;
    notes = notes.map(n => {
      let note = n.note;
      // If our note is within 3 semitones above the player's range, drop an octave
      if (note >= playerAvg - 3) note -= 12;
      // Keep in a sensible bass/mid range
      note = Math.max(36, Math.min(72, note));
      return {
        ...n,
        note,
        velocity: Math.round(n.velocity * 0.65) // play softer, underneath
      };
    });

    console.log(`🎹 ${source} [${notes.map(n => n.note).join(', ')}]`);
    this.melodyModel.record(context, notes, 1);
    this.melodyModel.trainAsync().catch(() => {});
    await this.playNotes(notes);
  }

  _applyDrumModelPattern() {
    if (!this.lastContext) return;
    const predicted = this.drumModel.predict(this.lastContext);
    if (predicted) {
      this.drumModel.record(this.lastContext, predicted);
      this.drums.applyAIPattern(predicted);
      this.drumModel.trainAsync().catch(() => {});
    }
  }

  async responseLoop() {
    // Responses are now triggered directly from handleMidiInput after a full phrase.
    // This loop stays alive for any future async tasks.
    while (this.running) {
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  }

  async playNotes(notes) {
    for (const noteData of notes) {
      if (this.useAudio) {
        this.player.playMelodyNote(noteData.note, noteData.velocity || 64);
      } else {
        this.player.playNote(noteData.note, noteData.velocity || 64);
      }
      const duration = noteData.duration || 0.4;
      await new Promise(resolve => setTimeout(resolve, duration * 700));
    }

    await new Promise(resolve => setTimeout(resolve, 100));
    for (const noteData of notes) {
      if (this.useAudio) {
        this.player.stopMelodyNote(noteData.note);
      } else {
        this.player.stopNote(noteData.note);
      }
    }
  }

  async start() {
    const isRecording = process.argv.includes('record');

    await this.drumModel.load();
    await this.melodyModel.load();

    this.listener.connect(this.settings.midi_input);
    this.player.connect(this.settings.midi_output);

    if (this.useAudio) {
      this.drums.connectAudio(this.player);
      this.bass.connectAudio(this.player);
    } else {
      this.drums.connectMidi(this.player);
      this.bass.connectMidi(this.player);
    }
    this.drums.connectBass(this.bass);

    if (isRecording && this.useAudio) {
      this.listener.recTarget = this.player;
      this.player.startRecording();
    } else if (isRecording) {
      console.log('⚠️  Recording only works in audio mode (no MIDI devices).');
    }

    this.drums.onPhraseEnd = (phrase) => {
      this.bass.phraseEnd();
    };

    this.drums.onPause = () => {
      this.notesSinceResponse = 0;
      this.bass.stop();  // bass stops when player stops
    };

    this.drums.onSection = () => {
      this.bass.stop();  // full stop — bass and drums both reset
      if (this.lastContext) {
        this.notesSinceResponse = 0;
        this.localEngine.resetPhrase();
        this.melodyModel.markLastAsMistake();
        this.melodyModel.trainAsync().catch(() => {});
        this.drumModel.trainAsync().catch(() => {});
      }
    };

    this.drums.onTimingFeedback = (msg, severity) => {
      // Could surface this in UI — for now just log with emphasis
      if (severity === 'badly_off') {
        console.log(`⚠️  Timing feedback: ${msg}`);
      }
    };

    // Legacy onSilence still fires for 'pause' and 'section'
    this.drums.onSilence = (reason) => {
      if (reason === 'section' && this.lastContext) {
        this.drumModel.trainAsync().catch(() => {});
      }
    };

    // When drummer locks tempo, save it to the song
    const origBegin = this.drums._beginPlaying.bind(this.drums);
    this.drums._beginPlaying = () => {
      origBegin();
      this.songs.recordTempo(this.drums.tempo);
    };

    this.listener.listen((msg) => this.handleMidiInput(msg));

    this.running = true;
    this.responseLoop();
    this.drums.start();

    // Pass song settings into AI context
    const song = this.songs.currentSong;
    if (song) {
      if (song.key)   this.ai.detectedKey = song.key;
      if (song.tempo) this.ai.detectedTempo = song.tempo;
    }

    console.log('🥁 Drummer is listening — you lead, AI follows...');

    const inputType = this.useAudio ? 'audio' : 'MIDI';
    const mode = this.listenMode ? inputType : 'passive mode';
    console.log(`\n🎵 MusicMan is listening (${mode})... (Ctrl+C to stop)`);
    if (!this.listenMode) {
      console.log('   (Listen mode disabled - tracking only, no responses)\n');
    } else {
      console.log();
    }

    process.on('SIGINT', () => {
      console.log('\n\nStopping...');
      this.running = false;
      this.drums.stop();
      this.bass.stop();

      if (isRecording && this.useAudio) {
        const ts   = new Date().toISOString().replace(/T/, '_').replace(/:/g, '-').slice(0, 19);
        const file = path.join(rootDir, 'saved', `${ts}.wav`);
        this.player.stopRecording(file);
      }
      const sessionData = this.ai.saveSession();
      this.songs.recordSession({
        timestamp: new Date().toISOString(),
        tempo: this.drums.tempo,
        key: this.lastContext?.key || null
      });
      this.listener.close();
      this.player.close();
      console.log(`Session saved to "${this.songs.currentSong?.name}". Goodbye!`);
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
