import Anthropic from '@anthropic-ai/sdk';
import fs from 'fs';
import path from 'path';

class AIMusician {
  constructor(apiKey, storagePath) {
    this.client = new Anthropic({ apiKey });
    this.storagePath = storagePath;
    this.memoryFile = path.join(storagePath, 'memory.json');
    this.melodiesFile = path.join(storagePath, 'melodies.json');
    this.memory = this.loadMemory();
    this.melodies = this.loadMelodies();
    this.currentContext = [];
    
    // Musical analysis
    this.noteTimes = [];
    this.maxNoteTimes = 16;
    this.detectedTempo = 120;
    this.detectedKey = null;
    this.intensity = 0.5;
  }

  loadMemory() {
    try {
      return JSON.parse(fs.readFileSync(this.memoryFile, 'utf8'));
    } catch {
      return { sessions: [], patterns: [], preferences: {} };
    }
  }

  loadMelodies() {
    try {
      return JSON.parse(fs.readFileSync(this.melodiesFile, 'utf8'));
    } catch {
      return [];
    }
  }

  saveMemory() {
    fs.mkdirSync(this.storagePath, { recursive: true });
    fs.writeFileSync(this.memoryFile, JSON.stringify(this.memory, null, 2));
  }

  saveMelodies() {
    fs.mkdirSync(this.storagePath, { recursive: true });
    fs.writeFileSync(this.melodiesFile, JSON.stringify(this.melodies, null, 2));
  }

  processInput(midiMsg) {
    const timestamp = Date.now() / 1000;
    const noteData = {
      type: midiMsg._type,
      note: midiMsg.note,
      velocity: midiMsg.velocity,
      time: timestamp
    };
    
    this.currentContext.push(noteData);
    
    if (noteData.note) {
      this.noteTimes.push(timestamp);
      if (this.noteTimes.length > this.maxNoteTimes) {
        this.noteTimes.shift();
      }
      this.analyzeTempo();
      this.analyzeIntensity(noteData.velocity);
    }
    
    if (this.currentContext.length > 50) {
      this.currentContext.shift();
    }
  }

  analyzeTempo() {
    if (this.noteTimes.length < 4) return;
    
    const intervals = [];
    for (let i = 1; i < this.noteTimes.length; i++) {
      intervals.push(this.noteTimes[i] - this.noteTimes[i - 1]);
    }
    
    const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    if (avgInterval > 0.1 && avgInterval < 2.0) {
      this.detectedTempo = Math.round(60 / avgInterval);
    }
  }

  analyzeIntensity(velocity) {
    if (velocity) {
      this.intensity = velocity / 127.0;
    }
  }

  detectKey(notes) {
    if (!notes || notes.length === 0) return null;
    
    const noteClasses = notes.map(n => n % 12);
    const counts = {};
    noteClasses.forEach(n => counts[n] = (counts[n] || 0) + 1);
    
    const mostCommon = Object.keys(counts).reduce((a, b) => 
      counts[a] > counts[b] ? a : b
    );
    
    const keyNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    return keyNames[parseInt(mostCommon)];
  }

  parseVoiceCommand(transcript) {
    const text = transcript.toLowerCase();
    const notes = [];
    
    // Parse note names (C, D, E, F, G, A, B with optional # or b)
    const notePattern = /([a-g])(#|b)?/gi;
    const matches = text.matchAll(notePattern);
    
    const noteMap = { c: 60, d: 62, e: 64, f: 65, g: 67, a: 69, b: 71 };
    
    for (const match of matches) {
      let note = noteMap[match[1].toLowerCase()];
      if (match[2] === '#') note++;
      if (match[2] === 'b') note--;
      notes.push({ note, velocity: 80, duration: 0.5 });
    }
    
    // Parse chord names
    if (text.includes('chord') || text.includes('major') || text.includes('minor')) {
      const root = notes[0]?.note || 60;
      if (text.includes('major')) {
        return [{ note: root, velocity: 80, duration: 1 }, 
                { note: root + 4, velocity: 80, duration: 1 }, 
                { note: root + 7, velocity: 80, duration: 1 }];
      }
      if (text.includes('minor')) {
        return [{ note: root, velocity: 80, duration: 1 }, 
                { note: root + 3, velocity: 80, duration: 1 }, 
                { note: root + 7, velocity: 80, duration: 1 }];
      }
    }
    
    return notes;
  }

  async generateResponse(voiceCommand = null, contextOverride = null) {
    // If voice command provided, parse and return immediately
    if (voiceCommand) {
      const notes = this.parseVoiceCommand(voiceCommand);
      if (notes.length > 0) {
        return notes;
      }
    }
    
    const recentNotes = this.currentContext
      .slice(-12)
      .filter(c => c.note)
      .map(c => c.note);
    
    if (recentNotes.length === 0) return [];
    
    const detectedKey = this.detectKey(recentNotes);
    const avgNote = Math.round(recentNotes.reduce((a, b) => a + b, 0) / recentNotes.length);
    
    const context = contextOverride || {
      recent_notes: recentNotes.slice(-8),
      tempo: this.detectedTempo,
      intensity: Math.round(this.intensity * 100) / 100,
      key: detectedKey,
      avg_pitch: avgNote,
      remembered_phrases: this.melodies.slice(-2),
      voice_command: voiceCommand
    };
    
    const variationHint = context.variation ? `
- Style variation: ${context.variation} (${context.variation === 'harmonic' ? 'focus on chord tones and harmony' : context.variation === 'melodic' ? 'focus on flowing melody' : 'focus on rhythmic patterns'})` : '';
    
    const prompt = `You are a jazz musician jamming with another player in real-time.

Musical Context:
- They just played: ${JSON.stringify(context.recent_notes)}
- Detected tempo: ${context.tempo} BPM
- Playing intensity: ${context.intensity} (0-1 scale)
- Detected key: ${context.key}
- Average pitch: ${context.avg_pitch}
- Your previous phrases: ${JSON.stringify(context.remembered_phrases)}
${voiceCommand ? `- Voice command: "${voiceCommand}"` : ''}${variationHint}

Respond musically by:
1. ${voiceCommand ? 'Following the voice command if given' : 'Matching their energy and tempo feel'}
2. Playing complementary harmony or counter-melody
3. Building on your previous phrases when appropriate
4. Using 2-5 notes that fit the musical moment

Generate MIDI notes in range 48-84. Match their intensity.
Respond ONLY with JSON: [{"note": 62, "velocity": 70, "duration": 0.5}, ...]`;

    try {
      const response = await this.client.messages.create({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 300,
        messages: [{ role: 'user', content: prompt }]
      });
      
      const text = response.content[0].text;
      const start = text.indexOf('[');
      const end = text.lastIndexOf(']') + 1;
      
      if (start >= 0 && end > start) {
        const notes = JSON.parse(text.substring(start, end));
        this.rememberMelody(notes, recentNotes, context);
        return notes;
      }
    } catch (error) {
      console.error('AI response error:', error.message);
    }
    
    return [];
  }

  rememberMelody(generatedNotes, contextNotes, musicalContext) {
    const melody = {
      generated: generatedNotes,
      context: contextNotes,
      tempo: musicalContext.tempo,
      intensity: musicalContext.intensity,
      key: musicalContext.key,
      timestamp: new Date().toISOString()
    };
    
    this.melodies.push(melody);
    if (this.melodies.length > 100) {
      this.melodies.shift();
    }
    this.saveMelodies();
  }

  saveSession() {
    const session = {
      timestamp: new Date().toISOString(),
      notes_processed: this.currentContext.length,
      melodies_created: this.melodies.length,
      final_tempo: this.detectedTempo,
      avg_intensity: this.intensity
    };
    
    this.memory.sessions.push(session);
    this.saveMemory();
  }

  getMusicalState() {
    const recentNotes = this.currentContext
      .slice(-12)
      .filter(c => c.note)
      .map(c => c.note);
    
    return {
      tempo: this.detectedTempo,
      intensity: Math.round(this.intensity * 100) / 100,
      key: this.detectKey(recentNotes),
      phrases_learned: this.melodies.length
    };
  }

  getMusicalContext() {
    const recentNotes = this.currentContext
      .slice(-12)
      .filter(c => c.note)
      .map(c => c.note);
    
    return {
      recent_notes: recentNotes.slice(-8),
      tempo: this.detectedTempo,
      intensity: Math.round(this.intensity * 100) / 100,
      key: this.detectKey(recentNotes),
      avg_pitch: recentNotes.length > 0 ? Math.round(recentNotes.reduce((a, b) => a + b, 0) / recentNotes.length) : 60
    };
  }
}

export default AIMusician;
