import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import AIMusician from './lib/think.js';
import MusicTheoryEngine from './lib/predict.js';
import AudioPlayer from './lib/audioPlay.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, '..');

dotenv.config({ path: path.join(rootDir, '.env') });

async function testSystem() {
  console.log('🎵 MusicMan Test Mode (Local Only)\n');

  const ai = new AIMusician(
    null, // No API key
    path.join(rootDir, 'storage')
  );

  const localEngine = new MusicTheoryEngine();
  
  // Initialize audio player
  const player = new AudioPlayer();
  player.connect('System Speakers/Headphones');
  
  console.log('🔊 Audio output enabled\n');

  // Simulate playing a C major scale
  const testNotes = [
    { note: 60, velocity: 80, name: 'C' },
    { note: 62, velocity: 75, name: 'D' },
    { note: 64, velocity: 85, name: 'E' },
    { note: 65, velocity: 70, name: 'F' },
    { note: 67, velocity: 90, name: 'G' },
    { note: 69, velocity: 80, name: 'A' },
    { note: 71, velocity: 75, name: 'B' },
    { note: 72, velocity: 85, name: 'C' }
  ];

  console.log('🎹 Simulating input: C major scale\n');

  for (const noteData of testNotes) {
    // Simulate MIDI input
    const msg = {
      _type: 'noteon',
      note: noteData.note,
      velocity: noteData.velocity
    };

    ai.processInput(msg);
    const state = ai.getMusicalState();
    
    console.log(`♪ YOU play: ${noteData.name} (${noteData.note}) | Tempo: ${state.tempo} BPM | Key: ${state.key} | Energy: ${state.intensity}`);

    // Get local engine response
    const context = ai.getMusicalContext();
    const response = localEngine.generateInstantResponse(
      context.recent_notes,
      context.tempo,
      context.intensity,
      context.key
    );

    if (response && response.length > 0) {
      const noteNames = response.map(n => {
        const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
        return names[n.note % 12];
      });
      console.log(`🎹 Responds: [${response.map(n => n.note).join(', ')}] = [${noteNames.join(', ')}]`);
      
      // Play the response through speakers
      for (const note of response) {
        player.playNote(note.note, note.velocity || 64);
        await new Promise(resolve => setTimeout(resolve, (note.duration || 0.4) * 700));
      }
      
      // Stop notes
      await new Promise(resolve => setTimeout(resolve, 100));
      for (const note of response) {
        player.stopNote(note.note);
      }
    }

    console.log('');

    // Wait between notes (simulate tempo)
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  console.log('✓ Test complete!\n');
  console.log('Summary:');
  console.log(`- Notes played: ${testNotes.length}`);
  console.log(`- Final tempo: ${ai.getMusicalState().tempo} BPM`);
  console.log(`- Detected key: ${ai.getMusicalState().key}`);
  console.log(`- Melodies created: ${ai.getMusicalState().phrases_learned}`);
  
  ai.saveSession();
  console.log('\n✓ Session saved');
  
  // Cleanup
  player.close();
  
  process.exit(0);
}

testSystem().catch(console.error);
