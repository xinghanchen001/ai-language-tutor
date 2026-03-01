/**
 * AudioWorklet processor for microphone capture.
 * Receives audio at the browser's native sample rate,
 * downsamples to 16kHz, and posts Int16 PCM chunks to the main thread.
 */
class MicProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.nativeSampleRate = options.processorOptions?.sampleRate || 48000;
    this.buffer = new Float32Array(0);
    // Accumulate ~100ms of audio before sending (1600 samples at 16kHz)
    this.chunkSize = 1600;
  }

  process(inputs) {
    const input = inputs[0];
    if (!input || !input[0] || input[0].length === 0) return true;

    const float32 = input[0]; // mono channel

    // Downsample from native rate to 16kHz
    const ratio = this.nativeSampleRate / 16000;
    const targetLength = Math.floor(float32.length / ratio);
    const downsampled = new Float32Array(targetLength);

    for (let i = 0; i < targetLength; i++) {
      downsampled[i] = float32[Math.floor(i * ratio)];
    }

    // Append to buffer
    const newBuffer = new Float32Array(this.buffer.length + downsampled.length);
    newBuffer.set(this.buffer);
    newBuffer.set(downsampled, this.buffer.length);
    this.buffer = newBuffer;

    // Send chunks when we have enough data
    while (this.buffer.length >= this.chunkSize) {
      const chunk = this.buffer.slice(0, this.chunkSize);
      this.buffer = this.buffer.slice(this.chunkSize);

      // Convert Float32 to Int16
      const int16 = new Int16Array(chunk.length);
      for (let i = 0; i < chunk.length; i++) {
        const s = Math.max(-1, Math.min(1, chunk[i]));
        int16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
      }

      this.port.postMessage(int16.buffer, [int16.buffer]);
    }

    return true;
  }
}

registerProcessor("mic-processor", MicProcessor);
