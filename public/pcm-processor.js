/**
 * PCM Audio Worklet Processor
 * Runs on the audio rendering thread for glitch-free AI voice playback.
 * Receives Float32 PCM samples from the main thread, queues them,
 * and feeds them to the audio output at the correct sample rate.
 */
class PCMProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buffer = new Float32Array(0);

    this.port.onmessage = (event) => {
      if (event.data.command === "clear") {
        this.buffer = new Float32Array(0);
        return;
      }

      // Append incoming Float32 samples to the buffer
      const incoming = event.data;
      if (incoming instanceof Float32Array) {
        const newBuffer = new Float32Array(this.buffer.length + incoming.length);
        newBuffer.set(this.buffer, 0);
        newBuffer.set(incoming, this.buffer.length);
        this.buffer = newBuffer;
      }
    };
  }

  process(inputs, outputs, parameters) {
    const output = outputs[0];
    if (!output || output.length === 0) return true;

    const channel = output[0];
    const needed = channel.length;

    if (this.buffer.length >= needed) {
      // Fill output from buffer
      channel.set(this.buffer.subarray(0, needed));
      this.buffer = this.buffer.subarray(needed);
    } else {
      // Partial fill + zero padding (buffer underrun)
      channel.set(this.buffer);
      for (let i = this.buffer.length; i < needed; i++) {
        channel[i] = 0;
      }
      this.buffer = new Float32Array(0);
    }

    return true;
  }
}

registerProcessor("pcm-processor", PCMProcessor);
