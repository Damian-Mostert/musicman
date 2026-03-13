# Hybrid Predictive Music System

## Architecture Overview

MusicMan now uses a **hybrid approach** to eliminate network latency and provide instant musical responses:

### 3-Tier Response System

1. **Local Music Theory Engine** (`predict.js`)
   - Instant response (<10ms)
   - Uses harmonic rules, scales, and chord theory
   - Always available as fallback
   - Deterministic but musically correct

2. **AI Prediction Buffer** (`buffer.js`)
   - Pre-generates 3-5 AI responses in background
   - Stores multiple variations (harmonic, melodic, rhythmic)
   - Scores and selects best match for current context
   - Refreshes every 2 seconds during play

3. **Claude AI** (enhanced creativity)
   - Generates high-quality, context-aware responses
   - Runs in background to fill prediction buffer
   - Remembers melodies and learns from sessions
   - No blocking on network latency

## How It Works

```
User plays note
    ↓
[Instant Response Path]
    ↓
1. Check Prediction Buffer (AI pre-generated)
    ↓ (if empty)
2. Use Local Engine (music theory rules)
    ↓
Play response immediately (<50ms total)
    ↓
[Background Process]
    ↓
Refresh AI buffer with new predictions
```

## Key Features

### Zero-Latency Response
- **Local engine** responds instantly when buffer is empty
- **Buffered AI** responses feel instant (pre-generated)
- No waiting for network calls during performance

### Intelligent Buffer Management
- Generates 3 variations per refresh: harmonic, melodic, rhythmic
- Scores matches based on tempo, intensity, key, and age
- Auto-refreshes every 2 seconds during active play
- Keeps 5 best predictions ready

### Graceful Degradation
```
Best:    AI-buffered response (creative + instant)
Good:    Local engine response (correct + instant)
Fallback: Always has a response ready
```

## Console Output

You'll see which system responded:
- `🎹 AI-buffered responds: [62, 65, 69] (buffer: 3)` - Pre-generated AI
- `🎹 Local responds: [64, 67, 71] (buffer: 0)` - Music theory engine

## Performance Characteristics

| System | Latency | Quality | Availability |
|--------|---------|---------|--------------|
| Local Engine | <10ms | Good | 100% |
| AI Buffer | <50ms | Excellent | ~80% |
| Direct AI | 300-1000ms | Excellent | 100% (voice only) |

## Configuration

In `index.js`:
```javascript
this.bufferRefreshInterval = 2000; // Refresh every 2 seconds
```

In `buffer.js`:
```javascript
this.maxBufferSize = 5; // Keep 5 predictions ready
```

## Musical Intelligence

### Local Engine
- Detects scale type (major/minor/dorian/mixolydian)
- Generates harmonic intervals (3rds, 5th, 6ths)
- Snaps notes to detected scale
- Adjusts note count based on tempo

### AI Buffer
- Generates 3 variations per context
- Scores based on tempo/intensity/key match
- Ages out old predictions
- Maintains musical continuity

## Best Practices

1. **Let the buffer warm up** - First few responses use local engine
2. **Steady tempo helps** - Better predictions with consistent timing
3. **Voice commands bypass buffer** - Direct AI for explicit requests
4. **Monitor buffer size** - Shows in console output

## Future Enhancements

- [ ] Local ML model (ONNX) for even better instant responses
- [ ] Adaptive buffer size based on tempo
- [ ] Prediction confidence scoring
- [ ] User preference learning in local engine
