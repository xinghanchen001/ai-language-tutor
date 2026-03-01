/**
 * Gemini Live API Client
 * Connects to hx-core Cloud Run WebSocket proxy which forwards to Vertex AI.
 * The proxy handles Authorization headers that browsers can't set.
 * Also includes MicrophoneCapture for capturing and encoding mic audio.
 */

// --- Types ---

export type LiveLanguage = "en" | "de";
export type ConnectionStatus = "disconnected" | "connecting" | "connected" | "error";

export interface LiveTranscriptEntry {
  role: "user" | "model";
  text: string;
  timestamp: number;
}

export interface GeminiLiveCallbacks {
  onConnectionStatusChange: (status: ConnectionStatus) => void;
  onAudioChunk: (pcmInt16Data: ArrayBuffer) => void;
  onInputTranscription: (text: string) => void;
  onOutputTranscription: (text: string) => void;
  onTextResponse: (text: string) => void;
  onTurnComplete: () => void;
  onInterrupted: () => void;
  onError: (error: Error) => void;
}

// --- System Prompts ---

const SYSTEM_PROMPTS: Record<LiveLanguage, string> = {
  en: `You are an English language teacher. I will show you things around me. Tell me what they are, and give me 3 adjectives to describe their texture or look. Don't just give me the name. Speak clearly and at a moderate pace. When I speak, always correct my mistakes — fix my grammar, suggest better vocabulary, and point out pronunciation errors. Explain briefly why the correction matters. Be encouraging and conversational.`,
  de: `Du bist ein Deutschlehrer. Ich werde dir Dinge um mich herum zeigen. Sage mir, was sie sind, und gib mir 3 Adjektive, um ihre Textur oder ihr Aussehen zu beschreiben. Nenne nicht nur den Namen. Sprich klar und in mäßigem Tempo. Wenn ich spreche, korrigiere immer meine Fehler — verbessere meine Grammatik, schlage besseres Vokabular vor und weise auf Aussprachefehler hin. Erkläre kurz, warum die Korrektur wichtig ist. Sei ermutigend und gesprächig.`,
};

// --- Constants ---

const MODEL_ID = "gemini-live-2.5-flash-native-audio";

// --- Helpers ---

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

// --- Microphone Capture ---

export class MicrophoneCapture {
  private stream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private workletNode: AudioWorkletNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private _muted = false;
  private chunkCount = 0;

  get muted(): boolean {
    return this._muted;
  }

  set muted(value: boolean) {
    this._muted = value;
  }

  async start(onChunk: (pcmBase64: string) => void): Promise<MediaStream> {
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
      },
    });

    const audioTracks = this.stream.getAudioTracks();
    console.log(`[Mic] Audio tracks: ${audioTracks.length}, enabled: ${audioTracks[0]?.enabled}, readyState: ${audioTracks[0]?.readyState}`);

    // Use browser's native sample rate — the worklet downsamples to 16kHz
    this.audioContext = new AudioContext();
    await this.audioContext.resume();
    const nativeSampleRate = this.audioContext.sampleRate;
    console.log(`[Mic] AudioContext sample rate: ${nativeSampleRate}Hz, state: ${this.audioContext.state}`);

    // Load the mic capture AudioWorklet
    await this.audioContext.audioWorklet.addModule("/mic-processor.js");

    this.source = this.audioContext.createMediaStreamSource(this.stream);
    this.workletNode = new AudioWorkletNode(this.audioContext, "mic-processor", {
      processorOptions: { sampleRate: nativeSampleRate },
    });

    // Receive downsampled Int16 PCM chunks from the worklet
    this.workletNode.port.onmessage = (e) => {
      if (this._muted) return;

      const pcmBuffer: ArrayBuffer = e.data;
      this.chunkCount++;
      if (this.chunkCount <= 3 || this.chunkCount % 100 === 0) {
        console.log(`[Mic] Audio chunk #${this.chunkCount}: ${pcmBuffer.byteLength} bytes`);
      }

      const base64 = arrayBufferToBase64(pcmBuffer);
      onChunk(base64);
    };

    this.source.connect(this.workletNode);
    // AudioWorklet doesn't need to connect to destination to process
    // but we connect to keep the pipeline alive
    this.workletNode.connect(this.audioContext.destination);

    console.log(`[Mic] AudioWorklet capture pipeline connected`);

    return this.stream;
  }

  stop(): void {
    this.workletNode?.disconnect();
    this.source?.disconnect();
    this.workletNode = null;
    this.source = null;

    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }

    if (this.stream) {
      this.stream.getTracks().forEach((t) => t.stop());
      this.stream = null;
    }
  }
}

// --- Gemini Live Client ---

export class GeminiLiveClient {
  private ws: WebSocket | null = null;
  private callbacks: GeminiLiveCallbacks;
  private _status: ConnectionStatus = "disconnected";
  private _language: LiveLanguage;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 3;
  private intentionalDisconnect = false;
  private proxyUrl = "";

  constructor(language: LiveLanguage, callbacks: GeminiLiveCallbacks) {
    this._language = language;
    this.callbacks = callbacks;
  }

  get status(): ConnectionStatus {
    return this._status;
  }

  get language(): LiveLanguage {
    return this._language;
  }

  private setStatus(status: ConnectionStatus): void {
    this._status = status;
    this.callbacks.onConnectionStatusChange(status);
  }

  /**
   * Fetch proxy config from server, open WebSocket to hx-core proxy,
   * send setup message (which proxy forwards to Vertex AI), and wait for setupComplete.
   */
  async connect(): Promise<void> {
    this.intentionalDisconnect = false;
    this.setStatus("connecting");

    // Step 1: Get proxy config from server
    const res = await fetch("/api/live-token", { method: "POST" });
    if (!res.ok) {
      const data = await res.json();
      const msg = data.error || `Config fetch failed: ${res.status}`;
      this.setStatus("error");
      throw new Error(msg);
    }
    const { proxyUrl, projectId, location } = await res.json();
    this.proxyUrl = proxyUrl;

    console.log("[Gemini Live] Proxy URL acquired, connecting WebSocket...");

    // Step 2: Open WebSocket to hx-core proxy
    return new Promise<void>((resolve, reject) => {
      this.ws = new WebSocket(proxyUrl);

      this.ws.onopen = () => {
        console.log("[Gemini Live] WebSocket opened to proxy, sending setup...");

        // Send setup message — the proxy forwards this to Vertex AI
        // Use Vertex AI model path format
        const modelPath = `projects/${projectId}/locations/${location}/publishers/google/models/${MODEL_ID}`;

        this.send({
          setup: {
            model: modelPath,
            generation_config: {
              response_modalities: ["AUDIO"],
              speech_config: {
                voice_config: {
                  prebuilt_voice_config: {
                    voice_name: "Kore",
                  },
                },
              },
            },
            system_instruction: {
              parts: [{ text: SYSTEM_PROMPTS[this._language] }],
            },
            // Enable transcription for both input (user speech) and output (AI speech)
            input_audio_transcription: {},
            output_audio_transcription: {},
          },
        });
      };

      this.ws.onmessage = (event) => {
        try {
          const dataStr =
            typeof event.data === "string"
              ? event.data
              : new TextDecoder().decode(event.data);
          const data = JSON.parse(dataStr);

          if (data.error) {
            console.error("[Gemini Live] Server error:", data.error);
            this.setStatus("error");
            reject(new Error(data.error.message || data.error || JSON.stringify(data.error)));
            return;
          }

          if (data.setupComplete !== undefined) {
            console.log("[Gemini Live] Session established!");
            this.reconnectAttempts = 0;
            this.setStatus("connected");
            resolve();
          }
        } catch {
          // Not JSON, ignore
        }
        this.handleMessage(event.data);
      };

      this.ws.onerror = () => {
        console.error("[Gemini Live] WebSocket error");
        this.setStatus("error");
        reject(new Error("WebSocket connection failed"));
      };

      this.ws.onclose = (e) => {
        console.log("[Gemini Live] WebSocket closed:", e.code, e.reason);
        if (!this.intentionalDisconnect && this._status === "connected") {
          this.handleUnexpectedDisconnect();
        } else if (!this.intentionalDisconnect) {
          this.setStatus("error");
          const errMsg = e.reason || `Connection closed (code ${e.code})`;
          this.callbacks.onError(new Error(errMsg));
          reject(new Error(errMsg));
        } else {
          this.setStatus("disconnected");
        }
      };

      setTimeout(() => {
        if (this._status === "connecting") {
          this.disconnect();
          reject(new Error("Connection timeout"));
        }
      }, 15000);
    });
  }

  disconnect(): void {
    this.intentionalDisconnect = true;
    this.reconnectAttempts = 0;
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.setStatus("disconnected");
  }

  sendVideoFrame(jpegBase64: string): void {
    this.send({
      realtime_input: {
        media_chunks: [{ mime_type: "image/jpeg", data: jpegBase64 }],
      },
    });
  }

  sendAudioChunk(pcmBase64: string): void {
    this.send({
      realtime_input: {
        media_chunks: [{ mime_type: "audio/pcm;rate=16000", data: pcmBase64 }],
      },
    });
  }

  sendTextMessage(text: string): void {
    this.send({
      client_content: {
        turns: [{ role: "user", parts: [{ text }] }],
        turn_complete: true,
      },
    });
  }

  async switchLanguage(language: LiveLanguage): Promise<void> {
    this._language = language;
    if (this._status === "connected" || this._status === "connecting") {
      this.disconnect();
      await new Promise((r) => setTimeout(r, 300));
      await this.connect();
    }
  }

  // --- Private ---

  private handleMessage(rawData: string | ArrayBuffer): void {
    try {
      const dataStr =
        typeof rawData === "string"
          ? rawData
          : new TextDecoder().decode(rawData);
      const data = JSON.parse(dataStr);

      console.log("[Gemini Live] Received:", Object.keys(data));

      if (data.setupComplete !== undefined) return;
      if (data.error) return;

      const serverContent = data.serverContent;
      if (serverContent) {
        const parts = serverContent.modelTurn?.parts;
        if (parts) {
          for (const part of parts) {
            if (part.inlineData?.data) {
              const pcmData = base64ToArrayBuffer(part.inlineData.data);
              this.callbacks.onAudioChunk(pcmData);
            }
            if (part.text) {
              this.callbacks.onTextResponse(part.text);
            }
          }
        }

        if (serverContent.inputTranscription?.text) {
          this.callbacks.onInputTranscription(serverContent.inputTranscription.text);
        }
        if (serverContent.outputTranscription?.text) {
          this.callbacks.onOutputTranscription(serverContent.outputTranscription.text);
        }

        if (serverContent.interrupted) {
          console.log("[Gemini Live] Model interrupted by user");
          this.callbacks.onInterrupted();
        }

        if (serverContent.turnComplete) {
          this.callbacks.onTurnComplete();
        }
      }

      if (data.goAway) {
        this.callbacks.onError(new Error("Session ending soon — server sent GoAway"));
      }
    } catch {
      // Ignore malformed messages
    }
  }

  private async handleUnexpectedDisconnect(): Promise<void> {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      const delay = Math.pow(2, this.reconnectAttempts) * 1000;
      this.setStatus("connecting");
      await new Promise((r) => setTimeout(r, delay));
      if (!this.intentionalDisconnect) {
        await this.connect();
      }
    } else {
      this.setStatus("error");
      this.callbacks.onError(new Error("Connection lost after multiple retries"));
    }
  }

  private msgCount = 0;

  private send(message: object): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.msgCount++;
      if (this.msgCount <= 5 || this.msgCount % 50 === 0) {
        console.log("[Gemini Live] Sending:", Object.keys(message), `(#${this.msgCount})`);
      }
      this.ws.send(JSON.stringify(message));
    }
  }
}
