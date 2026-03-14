import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import AIMusician from './lib/think.js';
import MusicModelTrainer from './lib/mlModel.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, '..');

dotenv.config({ path: path.join(rootDir, '.env') });

async function main() {
  console.log('🎵 MusicMan ML Model Training\n');

  const ai = new AIMusician(
    process.env.AI_API_KEY,
    path.join(rootDir, 'storage')
  );

  const trainer = new MusicModelTrainer(
    ai,
    path.join(rootDir, 'models', 'music_model')
  );

  // Load existing training data if available
  trainer.loadTrainingData();

  console.log('Options:');
  console.log('1. Collect training data from Claude (100 samples)');
  console.log('2. Train model on collected data');
  console.log('3. Both (collect + train)');
  console.log('4. Test prediction\n');

  const option = process.argv[2] || '3';

  switch (option) {
    case '1':
      await trainer.collectTrainingData(100);
      break;

    case '2':
      await trainer.loadModel() || trainer.createModel();
      await trainer.train(50);
      break;

    case '3':
      await trainer.collectTrainingData(100);
      await trainer.train(50);
      break;

    case '4':
      const loaded = await trainer.loadModel();
      if (!loaded) {
        console.log('❌ No model found. Train first.');
        break;
      }
      
      const testContext = {
        recent_notes: [60, 62, 64, 65, 67, 69, 71, 72],
        tempo: 120,
        intensity: 0.7,
        key: 'C',
        avg_pitch: 66
      };
      
      console.log('Test context:', testContext);
      const prediction = trainer.predict(testContext);
      console.log('Prediction:', prediction);
      break;

    default:
      console.log('Invalid option');
  }

  console.log('\n✓ Done');
  process.exit(0);
}

main().catch(console.error);
