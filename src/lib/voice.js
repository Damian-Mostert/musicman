import speech from '@google-cloud/speech';
import recorder from 'node-record-lpcm16';

class VoiceListener {
  constructor() {
    this.client = new speech.SpeechClient();
    this.isListening = false;
    this.recording = null;
  }

  startListening(callback) {
    this.isListening = true;
    console.log('🎤 Voice listening active... (say commands like "play a B" or "play C major chord")');

    const request = {
      config: {
        encoding: 'LINEAR16',
        sampleRateHertz: 16000,
        languageCode: 'en-US',
        enableAutomaticPunctuation: true,
      },
      interimResults: false,
    };

    const recognizeStream = this.client
      .streamingRecognize(request)
      .on('error', (error) => {
        console.error('Speech recognition error:', error.message);
      })
      .on('data', (data) => {
        const transcript = data.results[0]?.alternatives[0]?.transcript;
        if (transcript) {
          console.log(`🎤 Heard: "${transcript}"`);
          callback(transcript);
        }
      });

    this.recording = recorder.record({
      sampleRateHertz: 16000,
      threshold: 0,
      verbose: false,
      recordProgram: 'sox',
      silence: '2.0',
    });

    this.recording.stream().pipe(recognizeStream);
  }

  stopListening() {
    this.isListening = false;
    if (this.recording) {
      this.recording.stop();
    }
  }
}

export default VoiceListener;
