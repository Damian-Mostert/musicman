import fs from 'fs';
import path from 'path';
import readline from 'readline';

const ask = (rl, q) => new Promise(resolve => rl.question(q, resolve));

class SongManager {
  constructor(storagePath) {
    this.songsFile = path.join(storagePath, 'songs.json');
    this.songs = this.load();
    this.currentSong = null;
  }

  load() {
    try {
      return JSON.parse(fs.readFileSync(this.songsFile, 'utf8'));
    } catch {
      return [];
    }
  }

  save() {
    fs.writeFileSync(this.songsFile, JSON.stringify(this.songs, null, 2));
  }

  async prompt() {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

    console.log('\n🎵 Welcome to MusicMan\n');

    if (this.songs.length > 0) {
      console.log('  [1] New song');
      console.log('  [2] Load existing song');
      const choice = (await ask(rl, '\nChoose (1/2): ')).trim();

      if (choice === '2') {
        console.log('\nYour songs:');
        this.songs.forEach((s, i) => {
          const date = new Date(s.lastPlayed).toLocaleDateString();
          console.log(`  [${i + 1}] ${s.name}  (last played: ${date}, tempo: ${s.tempo || '?'} BPM, key: ${s.key || '?'})`);
        });

        const idx = parseInt(await ask(rl, '\nSelect song number: ')) - 1;
        rl.close();

        if (idx >= 0 && idx < this.songs.length) {
          this.currentSong = this.songs[idx];
          this.currentSong.lastPlayed = new Date().toISOString();
          this.save();
          console.log(`\n▶  Loaded: "${this.currentSong.name}"\n`);
          return this.currentSong;
        }
        console.log('Invalid selection, starting new song.\n');
      }
    }

    const name = (await ask(rl, 'Song name: ')).trim() || 'Untitled';
    rl.close();

    this.currentSong = {
      name,
      created: new Date().toISOString(),
      lastPlayed: new Date().toISOString(),
      tempo: null,
      key: null,
      timeSignature: '4/4',
      style: null,
      teachingNotes: [],
      sessions: [],
      drumPatterns: [],
      melodies: []
    };

    this.songs.push(this.currentSong);
    this.save();
    console.log(`\n✓ New song "${name}" created\n`);
    return this.currentSong;
  }

  // Interactive teaching session — just the essentials
  async teachSong() {
    const song = this.currentSong;
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

    console.log(`\n🎸 "${song.name}"`);

    if (song.tempo || song.key) {
      console.log(`   Tempo: ${song.tempo || 'auto'}  Key: ${song.key || 'auto'}`);
      const edit = (await ask(rl, '   Change settings? (y/N): ')).trim().toLowerCase();
      if (edit !== 'y') { rl.close(); return; }
    }

    const tempoIn = (await ask(rl, '   Tempo BPM (blank = detect): ')).trim();
    if (tempoIn && !isNaN(tempoIn)) song.tempo = parseInt(tempoIn);

    const keys = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
    const keyIn = (await ask(rl, '   Key (blank = detect): ')).trim().toUpperCase();
    if (keys.includes(keyIn)) song.key = keyIn;

    rl.close();
    this.save();
    console.log(`   ✓ Tempo: ${song.tempo || 'auto'}  Key: ${song.key || 'auto'}\n`);
  }

  // Call this when the drummer locks in a tempo
  recordTempo(bpm) {
    if (!this.currentSong) return;
    if (!this.currentSong.tempo) {
      this.currentSong.tempo = bpm;
      this.save();
    }
  }

  // Call this when a good drum pattern is confirmed
  recordDrumPattern(pattern, context) {
    if (!this.currentSong) return;
    this.currentSong.drumPatterns.push({ pattern, context, timestamp: new Date().toISOString() });
    if (this.currentSong.drumPatterns.length > 50) this.currentSong.drumPatterns.shift();
    this.currentSong.key = context.key || this.currentSong.key;
    this.save();
  }

  // Call on session end
  recordSession(sessionData) {
    if (!this.currentSong) return;
    this.currentSong.lastPlayed = new Date().toISOString();
    this.currentSong.sessions.push(sessionData);
    if (this.currentSong.sessions.length > 20) this.currentSong.sessions.shift();
    this.save();
  }
}

export default SongManager;
