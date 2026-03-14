# MusicMan - AI Musical Companion

An AI agent that listens to your performance and responds with complementary music, remembering melodies it creates.

## Features

✅ **Works with or without MIDI** - Auto-detects and falls back to mic + speakers
✅ **Zero-latency responses** - Hybrid AI + local music theory engine
✅ **Voice commands** - Speak naturally to control playback
✅ **Musical memory** - Remembers and builds on previous phrases
✅ **Real-time analysis** - Tempo, key, and intensity detection

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

### Input Options
1. **MIDI Device** (preferred) - Connect a MIDI keyboard or controller
2. **Audio Fallback** - Sing, hum, or play an instrument into your microphone

### Hybrid Response System
- **Local Music Theory Engine** - Instant (<10ms) responses using harmonic rules
- **AI Prediction Buffer** - Pre-generated Claude responses for creative variety
- **Zero perceived latency** - Always has a response ready

### What It Does
- **Listens** to your MIDI or audio input in real-time
- **Hears** your voice commands ("play a B", "play C major chord")
- **Analyzes** tempo, key, and intensity of your playing
- **Thinks** using Claude AI to generate musical responses
- **Plays** complementary notes back through MIDI or speakers
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

## Audio Mode (No MIDI Required)

If no MIDI devices are detected, MusicMan automatically uses:
- **Input**: System microphone (sing, hum, or play acoustic instrument)
- **Output**: System speakers or headphones
- **Pitch detection**: Real-time frequency analysis
- **Synthesis**: Simple sine wave audio generation

Perfect for testing or when you don't have MIDI hardware!
