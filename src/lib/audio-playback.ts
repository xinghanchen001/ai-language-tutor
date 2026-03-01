/**
 * Audio Playback Manager
 * Handles real-time playback of PCM audio chunks from the Gemini Live API
 * using AudioWorklet for glitch-free rendering on a dedicated audio thread.
 *
 * Gemini outputs 24kHz Int16 PCM. We resample to the browser's native rate
 * (usually 48kHz) since many browsers don't support non-standard AudioContext rates.
 */
export class AudioPlaybackManager {
  private audioContext: AudioContext | null = null;
  private workletNode: AudioWorkletNode | null = null;
  private _initialized = false;
  private nativeSampleRate = 48000;

  get isInitialized(): boolean {
    return this._initialized;
  }

  /**
   * Initialize the audio pipeline. Must be called after a user gesture
   * (browser autoplay policy requires user interaction first).
   */
  async initialize(): Promise<void> {
    if (this._initialized) return;

    // Use browser's native sample rate to avoid AudioContext errors
    this.audioContext = new AudioContext();
    this.nativeSampleRate = this.audioContext.sampleRate;
    console.log(`[Audio Playback] Native sample rate: ${this.nativeSampleRate}Hz`);

    // Load the AudioWorklet processor
    await this.audioContext.audioWorklet.addModule("/pcm-processor.js");

    // Create worklet node and connect to speakers
    this.workletNode = new AudioWorkletNode(this.audioContext, "pcm-processor");
    this.workletNode.connect(this.audioContext.destination);

    this._initialized = true;
  }

  /**
   * Play a chunk of PCM audio received from the WebSocket.
   * @param pcmInt16Data - ArrayBuffer containing Int16 PCM samples at 24kHz
   */
  playChunk(pcmInt16Data: ArrayBuffer): void {
    if (!this.workletNode) return;

    // Convert Int16 to Float32 (Web Audio API format)
    const int16 = new Int16Array(pcmInt16Data);

    // Resample from 24kHz to native rate (e.g., 48kHz)
    const ratio = this.nativeSampleRate / 24000;
    const targetLength = Math.round(int16.length * ratio);
    const float32 = new Float32Array(targetLength);

    for (let i = 0; i < targetLength; i++) {
      const srcIndex = Math.min(Math.floor(i / ratio), int16.length - 1);
      float32[i] = int16[srcIndex] / 32768.0;
    }

    // Send to worklet for queued playback
    this.workletNode.port.postMessage(float32);
  }

  /** Clear the playback buffer (e.g., when AI is interrupted). */
  stop(): void {
    if (this.workletNode) {
      this.workletNode.port.postMessage({ command: "clear" });
    }
  }

  /** Destroy the audio context and release resources. */
  async destroy(): Promise<void> {
    this.stop();
    if (this.workletNode) {
      this.workletNode.disconnect();
      this.workletNode = null;
    }
    if (this.audioContext) {
      await this.audioContext.close();
      this.audioContext = null;
    }
    this._initialized = false;
  }
}
