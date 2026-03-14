# What Happens When You Run `npm start`

## Startup Sequence

### 1. Environment Check
```
✓ Loading .env file
✓ Checking AI_API_KEY
✓ Checking Google Cloud credentials
```

### 2. Device Detection

#### Scenario A: MIDI Devices Found
```
Available MIDI Input Ports:
  0: USB MIDI Keyboard
  1: IAC Driver Bus 1

Available MIDI Output Ports:
  0: USB MIDI Keyboard
  1: IAC Driver Bus 1

Select input port number: _
```

#### Scenario B: No MIDI Devices
```
⚠️  No MIDI devices detected. Falling back to audio (mic + speakers).
   You can sing, hum, or play an instrument into your microphone.

🎤 Connected to: System Microphone
🔊 Connected to: System Speakers/Headphones
```

### 3. System Initialization
```
🎤 Voice listening active... (say commands like "play a B")
🎵 MusicMan is listening to [MIDI/audio] and voice... (Ctrl+C to stop)
```

### 4. Real-Time Interaction

#### When You Play:
```
♪ Note 60 | Tempo: 120 BPM | Key: C | Energy: 0.7
🎹 AI-buffered responds: [64, 67, 71] (buffer: 3)
```

**Response Sources:**
- `AI-buffered` = Pre-generated Claude response (best quality, instant)
- `Local` = Music theory engine (good quality, instant fallback)

**Buffer Status:**
- `(buffer: 3)` = 3 AI responses ready
- `(buffer: 0)` = Using local engine

#### When You Speak:
```
🎤 Heard: "play C major chord"
🎤 Processing: "play C major chord"
🎹 AI plays: [60, 64, 67]
```

### 5. Background Processes

**Every 2 seconds during play:**
- AI generates 3 new response variations
- Buffer refreshes with latest musical context
- Old predictions are scored and aged out

**Continuous:**
- Tempo detection from note timing
- Key detection from note patterns
- Intensity tracking from velocity
- Melody storage to memory.json

### 6. Shutdown (Ctrl+C)
```
Stopping...
Session saved. Goodbye!
```

**Saves:**
- `storage/memory.json` - Session history and patterns
- `storage/melodies.json` - All generated melodies with context
- `settings.json` - MIDI port preferences

## System Requirements

### Required:
- Node.js (v18+)
- `sox` installed (`brew install sox`)
- Anthropic API key in `.env`
- Google Cloud credentials for Speech-to-Text

### Optional:
- MIDI keyboard/controller (will use audio if not available)
- Microphone (for voice commands and audio mode)
- Speakers/headphones (for audio mode output)

## Performance Characteristics

| Mode | Input Latency | Response Latency | Quality |
|------|---------------|------------------|---------|
| MIDI + AI Buffer | <5ms | <50ms | Excellent |
| MIDI + Local | <5ms | <10ms | Good |
| Audio + AI Buffer | ~50ms | <100ms | Excellent |
| Audio + Local | ~50ms | ~60ms | Good |

## Troubleshooting

### No MIDI devices detected
✓ **Expected behavior** - System automatically uses audio mode

### Voice commands not working
- Check Google Cloud credentials
- Verify microphone permissions
- Ensure `sox` is installed

### No audio output in audio mode
- Check speaker/headphone connection
- Verify system audio settings
- Try different output device

### Buffer always shows 0
- Check Anthropic API key
- Verify network connection
- AI will retry in background, local engine provides fallback

## Tips for Best Experience

1. **Let buffer warm up** - First 2-3 responses use local engine while AI buffer fills
2. **Steady tempo** - More consistent tempo = better predictions
3. **Clear phrases** - Pause between musical phrases for better context
4. **Voice commands** - Use for explicit control, bypasses prediction system
