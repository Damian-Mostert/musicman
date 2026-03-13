# MusicMan - AI Musical Companion

An AI agent that listens to your MIDI performance and responds with complementary music, remembering melodies it creates.

## Setup

1. Install dependencies:
```bash
npm install
```

2. Install sox for audio recording (macOS):
```bash
brew install sox
```

3. Set up Google Cloud Speech-to-Text:
- Create a Google Cloud project
- Enable Speech-to-Text API
- Download credentials JSON
- Set environment variable:
```bash
export GOOGLE_APPLICATION_CREDENTIALS="path/to/credentials.json"
```

4. Add your Anthropic API key to `.env`:
```
AI_API_KEY=your_key_here
```

5. Run:
```bash
npm start
```

## How It Works

- **Listens** to your MIDI input in real-time
- **Hears** your voice commands ("play a B", "play C major chord")
- **Analyzes** tempo, key, and intensity of your playing
- **Thinks** using Claude AI to generate musical responses
- **Plays** complementary notes back through MIDI output
- **Remembers** melodies in `storage/melodies.json`
- **Learns** from each session in `storage/memory.json`

## Memory System

The AI stores:
- Generated melodies with musical context (tempo, key, intensity)
- Session history
- Musical patterns and preferences

## Interactive Features

- Real-time tempo detection
- Key detection from your playing
- Dynamic intensity matching
- Phrase memory and development
- Musical conversation continuity
- Voice commands for direct control

## Voice Commands

Speak naturally:
- "Play a B"
- "Play C sharp"
- "Play D minor chord"
- "Play G major chord"
