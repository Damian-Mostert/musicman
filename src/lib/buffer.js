// Predictive buffer that pre-generates AI responses in background
class PredictionBuffer {
  constructor(aiMusician) {
    this.ai = aiMusician;
    this.buffer = [];
    this.maxBufferSize = 5;
    this.isGenerating = false;
    this.lastContext = null;
  }

  async fillBuffer(musicalContext) {
    if (this.isGenerating || this.buffer.length >= this.maxBufferSize) return;
    
    this.isGenerating = true;
    this.lastContext = musicalContext;
    
    try {
      // Generate multiple variations in parallel
      const variations = await Promise.all([
        this.ai.generateResponse(null, { ...musicalContext, variation: 'harmonic' }),
        this.ai.generateResponse(null, { ...musicalContext, variation: 'melodic' }),
        this.ai.generateResponse(null, { ...musicalContext, variation: 'rhythmic' })
      ]);
      
      variations.forEach(notes => {
        if (notes && notes.length > 0) {
          this.buffer.push({
            notes,
            context: { ...musicalContext },
            timestamp: Date.now(),
            score: 0
          });
        }
      });
      
      // Keep buffer size manageable
      if (this.buffer.length > this.maxBufferSize) {
        this.buffer = this.buffer.slice(-this.maxBufferSize);
      }
    } catch (error) {
      console.error('Buffer generation error:', error.message);
    } finally {
      this.isGenerating = false;
    }
  }

  getBestMatch(currentContext) {
    if (this.buffer.length === 0) return null;
    
    // Score each buffered response based on context similarity
    this.buffer.forEach(item => {
      item.score = this.scoreMatch(item.context, currentContext);
    });
    
    // Sort by score and return best match
    this.buffer.sort((a, b) => b.score - a.score);
    const best = this.buffer.shift(); // Remove from buffer after use
    
    return best ? best.notes : null;
  }

  scoreMatch(bufferedContext, currentContext) {
    let score = 100;
    
    // Tempo similarity (most important for timing)
    const tempoDiff = Math.abs(bufferedContext.tempo - currentContext.tempo);
    score -= tempoDiff * 0.5;
    
    // Intensity similarity
    const intensityDiff = Math.abs(bufferedContext.intensity - currentContext.intensity);
    score -= intensityDiff * 20;
    
    // Key match
    if (bufferedContext.key === currentContext.key) {
      score += 20;
    }
    
    // Age penalty (older predictions less relevant)
    const age = (Date.now() - bufferedContext.timestamp) / 1000;
    score -= age * 2;
    
    return Math.max(0, score);
  }

  clear() {
    this.buffer = [];
  }

  getBufferStatus() {
    return {
      size: this.buffer.length,
      generating: this.isGenerating,
      oldestAge: this.buffer.length > 0 ? (Date.now() - this.buffer[0].timestamp) / 1000 : 0
    };
  }
}

export default PredictionBuffer;
