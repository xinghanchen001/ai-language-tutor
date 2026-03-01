"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  Video,
  VideoOff,
  Mic,
  MicOff,
  Phone,
  PhoneOff,
  CircleDot,
  Monitor,
  Camera,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { AudioPlaybackManager } from "@/lib/audio-playback";
import {
  GeminiLiveClient,
  MicrophoneCapture,
  type LiveLanguage,
  type ConnectionStatus,
  type LiveTranscriptEntry,
} from "@/lib/gemini-live";

export default function LivePage() {
  // --- State ---
  const [connectionStatus, setConnectionStatus] =
    useState<ConnectionStatus>("disconnected");
  const [language, setLanguage] = useState<LiveLanguage>("en");
  const [isMicMuted, setIsMicMuted] = useState(false);
  const [isCameraOn, setIsCameraOn] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [transcripts, setTranscripts] = useState<LiveTranscriptEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [mobileTranscriptHeight, setMobileTranscriptHeight] = useState(30); // percentage of viewport

  // --- Refs ---
  const clientRef = useRef<GeminiLiveClient | null>(null);
  const audioPlaybackRef = useRef<AudioPlaybackManager | null>(null);
  const micCaptureRef = useRef<MicrophoneCapture | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const frameIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const transcriptEndRef = useRef<HTMLDivElement>(null);
  const dragStartY = useRef<number>(0);
  const dragStartHeight = useRef<number>(30);

  const isSessionActive = connectionStatus === "connected" || connectionStatus === "connecting";

  // --- Auto-scroll transcripts ---
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [transcripts]);

  // --- Cleanup on unmount ---
  useEffect(() => {
    return () => {
      stopSession();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- Frame capture ---
  const captureFrame = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || !clientRef.current) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width = 640;
    canvas.height = 480;
    ctx.drawImage(video, 0, 0, 640, 480);

    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const reader = new FileReader();
        reader.onloadend = () => {
          const result = reader.result as string;
          const base64 = result.split(",")[1];
          if (base64) {
            clientRef.current?.sendVideoFrame(base64);
          }
        };
        reader.readAsDataURL(blob);
      },
      "image/jpeg",
      0.5
    );
  }, []);

  // --- Start session ---
  const startSession = async () => {
    setError(null);
    setPermissionDenied(false);
    setTranscripts([]);

    try {
      // 1. Get camera stream (separate from mic — mic is handled by MicrophoneCapture)
      const cameraStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user" },
      });
      streamRef.current = cameraStream;
      if (videoRef.current) {
        videoRef.current.srcObject = cameraStream;
        // Some mobile browsers need explicit play() even with autoPlay attribute
        try { await videoRef.current.play(); } catch { /* already playing */ }
      }
      setIsCameraOn(true);

      // 2. Initialize audio playback (must be after user gesture)
      const audioPlayback = new AudioPlaybackManager();
      await audioPlayback.initialize();
      audioPlaybackRef.current = audioPlayback;

      // 3. Create Gemini Live client
      const client = new GeminiLiveClient(language, {
        onConnectionStatusChange: (status) => {
          setConnectionStatus(status);
        },
        onAudioChunk: (pcmData) => {
          audioPlaybackRef.current?.playChunk(pcmData);
        },
        onInputTranscription: (text) => {
          if (!text.trim()) return;
          setTranscripts((prev) => {
            const last = prev[prev.length - 1];
            if (last && last.role === "user") {
              // Append to existing user message
              const updated = [...prev];
              updated[updated.length - 1] = {
                ...last,
                text: last.text + text,
              };
              return updated;
            }
            return [...prev, { role: "user", text: text.trim(), timestamp: Date.now() }];
          });
        },
        onOutputTranscription: (text) => {
          if (!text.trim()) return;
          setTranscripts((prev) => {
            const last = prev[prev.length - 1];
            if (last && last.role === "model") {
              // Append to existing model message
              const updated = [...prev];
              updated[updated.length - 1] = {
                ...last,
                text: last.text + text,
              };
              return updated;
            }
            return [...prev, { role: "model", text: text.trim(), timestamp: Date.now() }];
          });
        },
        onTextResponse: (text) => {
          if (!text.trim()) return;
          setTranscripts((prev) => {
            const last = prev[prev.length - 1];
            if (last && last.role === "model") {
              const updated = [...prev];
              updated[updated.length - 1] = {
                ...last,
                text: last.text + text,
              };
              return updated;
            }
            return [...prev, { role: "model", text: text.trim(), timestamp: Date.now() }];
          });
        },
        onTurnComplete: () => {
          // Turn complete — next transcription fragment starts a new bubble
        },
        onInterrupted: () => {
          // User spoke while AI was talking — clear audio buffer for instant interrupt
          audioPlaybackRef.current?.stop();
        },
        onError: (err) => {
          setError(err.message);
        },
      });
      clientRef.current = client;

      // 4. Connect to Vertex AI
      await client.connect();

      // 5. Start frame capture at 1 FPS
      frameIntervalRef.current = setInterval(captureFrame, 1000);

      // 6. Start microphone capture
      const micCapture = new MicrophoneCapture();
      await micCapture.start((pcmBase64) => {
        clientRef.current?.sendAudioChunk(pcmBase64);
      });
      micCaptureRef.current = micCapture;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      if (
        message.includes("Permission denied") ||
        message.includes("NotAllowedError")
      ) {
        setPermissionDenied(true);
        setError("Camera and microphone access is required for live chat.");
      } else {
        setError(message);
      }
      // Cleanup partial state
      stopSession();
    }
  };

  // --- Stop session ---
  const stopSession = () => {
    // Stop frame capture
    if (frameIntervalRef.current) {
      clearInterval(frameIntervalRef.current);
      frameIntervalRef.current = null;
    }

    // Stop mic
    micCaptureRef.current?.stop();
    micCaptureRef.current = null;

    // Disconnect WebSocket
    clientRef.current?.disconnect();
    clientRef.current = null;

    // Stop camera
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsCameraOn(false);

    // Destroy audio playback
    audioPlaybackRef.current?.destroy();
    audioPlaybackRef.current = null;

    setConnectionStatus("disconnected");
    setIsMicMuted(false);
    setIsScreenSharing(false);
  };

  // --- Toggle mic mute ---
  const toggleMic = () => {
    if (micCaptureRef.current) {
      const newMuted = !isMicMuted;
      micCaptureRef.current.muted = newMuted;
      setIsMicMuted(newMuted);
    }
  };

  // --- Toggle screen sharing ---
  const toggleScreenShare = async () => {
    if (!isSessionActive) return;

    if (isScreenSharing) {
      // Switch back to camera
      try {
        const cameraStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user" },
        });
        // Stop old screen share tracks
        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = cameraStream;
        if (videoRef.current) {
          videoRef.current.srcObject = cameraStream;
        }
        setIsScreenSharing(false);
      } catch (err) {
        console.error("[ScreenShare] Failed to switch back to camera:", err);
      }
    } else {
      // Switch to screen share
      try {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
        });
        // Stop old camera tracks
        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = screenStream;
        if (videoRef.current) {
          videoRef.current.srcObject = screenStream;
        }
        setIsScreenSharing(true);

        // Handle user clicking the browser's native "Stop sharing" button
        screenStream.getVideoTracks()[0]?.addEventListener("ended", () => {
          // Automatically switch back to camera
          setIsScreenSharing(false);
          navigator.mediaDevices
            .getUserMedia({ video: { facingMode: "user" } })
            .then((cameraStream) => {
              streamRef.current = cameraStream;
              if (videoRef.current) {
                videoRef.current.srcObject = cameraStream;
              }
            })
            .catch((err) => {
              console.error("[ScreenShare] Failed to restore camera:", err);
            });
        });
      } catch (err) {
        // User cancelled the screen share picker — do nothing
        console.log("[ScreenShare] Cancelled or not supported:", err);
      }
    }
  };

  // --- Switch language ---
  const handleLanguageSwitch = async (lang: LiveLanguage) => {
    if (lang === language) return;
    setLanguage(lang);

    if (clientRef.current && connectionStatus === "connected") {
      setTranscripts([]);
      await clientRef.current.switchLanguage(lang);
    }
  };

  // --- Mobile transcript drag handlers ---
  const handleDragStart = useCallback((clientY: number) => {
    dragStartY.current = clientY;
    dragStartHeight.current = mobileTranscriptHeight;
  }, [mobileTranscriptHeight]);

  const handleDragMove = useCallback((clientY: number) => {
    const deltaY = dragStartY.current - clientY;
    const deltaPercent = (deltaY / window.innerHeight) * 100;
    const newHeight = Math.min(80, Math.max(10, dragStartHeight.current + deltaPercent));
    setMobileTranscriptHeight(newHeight);
  }, []);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    handleDragStart(e.touches[0].clientY);
  }, [handleDragStart]);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    handleDragMove(e.touches[0].clientY);
  }, [handleDragMove]);

  // --- Status indicator ---
  const statusConfig: Record<
    ConnectionStatus,
    { color: string; label: string; pulse: boolean }
  > = {
    disconnected: { color: "bg-slate-400", label: "Offline", pulse: false },
    connecting: { color: "bg-yellow-400", label: "Connecting...", pulse: true },
    connected: { color: "bg-green-400", label: "Live", pulse: true },
    error: { color: "bg-red-400", label: "Error", pulse: false },
  };

  const currentStatus = statusConfig[connectionStatus];

  return (
    <main className="h-screen bg-[#F0F4F8] flex flex-col overflow-hidden">
      {/* Header */}
      <nav className="bg-[#031830] border-b border-blue-900 px-3 md:px-6 py-2 md:py-3 flex items-center justify-between z-50 shadow-md flex-shrink-0">
        <div className="flex items-center gap-2 md:gap-4">
          <Link
            href="/"
            className="p-1.5 text-blue-300 hover:bg-blue-900 hover:text-white rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="hidden md:block">
            <h1 className="text-xl font-bold text-white tracking-tight leading-none">
              DeepL{" "}
              <span className="text-blue-400 font-medium">Live Tutor</span>
            </h1>
            <p className="text-[10px] text-blue-300/80 font-semibold uppercase tracking-wider">
              Visual Vocabulary
            </p>
          </div>
          <h1 className="md:hidden text-lg font-bold text-white">
            Live <span className="text-blue-400">Tutor</span>
          </h1>
        </div>

        <div className="flex items-center gap-2 md:gap-4">
          {/* Language Toggle */}
          <div className="flex items-center bg-blue-900/40 p-1 rounded-lg border border-blue-800/50 shadow-inner">
            <button
              onClick={() => handleLanguageSwitch("en")}
              className={cn(
                "px-3 py-1.5 rounded-md text-xs md:text-sm font-bold transition-all",
                language === "en"
                  ? "bg-blue-600 text-white shadow-sm"
                  : "text-blue-300 hover:text-blue-100 hover:bg-blue-800/50"
              )}
            >
              EN
            </button>
            <button
              onClick={() => handleLanguageSwitch("de")}
              className={cn(
                "px-3 py-1.5 rounded-md text-xs md:text-sm font-bold transition-all",
                language === "de"
                  ? "bg-blue-600 text-white shadow-sm"
                  : "text-blue-300 hover:text-blue-100 hover:bg-blue-800/50"
              )}
            >
              DE
            </button>
          </div>

          {/* Status Indicator */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-blue-900/30 border border-blue-800/50">
            <div className="relative">
              <div
                className={cn("w-2 h-2 rounded-full", currentStatus.color)}
              />
              {currentStatus.pulse && (
                <div
                  className={cn(
                    "absolute inset-0 w-2 h-2 rounded-full animate-ping",
                    currentStatus.color
                  )}
                />
              )}
            </div>
            <span className="text-xs font-bold text-blue-300 hidden sm:inline">
              {currentStatus.label}
            </span>
          </div>
        </div>
      </nav>

      {/* Error Display - overlay on top */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="bg-red-50 border-b border-red-200 text-red-700 px-4 py-2 flex-shrink-0"
            role="alert"
          >
            <strong className="font-bold">Error: </strong>
            <span>{error}</span>
            {permissionDenied && (
              <span className="text-sm ml-2 text-red-600">
                Please allow camera and microphone access.
              </span>
            )}
            <button
              onClick={() => setError(null)}
              className="float-right text-red-400 hover:text-red-600 ml-2"
            >
              &times;
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main content area */}
      <div className="flex-1 flex flex-col min-h-0 relative">
        {/* Video Section — full on mobile, 70% on desktop */}
        <div className="flex-1 md:flex-[7] min-h-0 relative bg-slate-900">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className={cn(
              "w-full h-full object-cover",
              !isCameraOn && "hidden"
            )}
          />
          {/* Hidden canvas for frame capture */}
          <canvas ref={canvasRef} className="hidden" />

          {/* Camera off placeholder */}
          {!isCameraOn && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400 gap-3">
              <VideoOff className="w-16 h-16 opacity-30" />
              <p className="text-sm font-medium">Camera is off</p>
              <p className="text-xs text-slate-500">
                Click &quot;Start Session&quot; to begin
              </p>
              {/* Tips */}
              {connectionStatus === "disconnected" && transcripts.length === 0 && (
                <div className="text-center text-sm text-slate-400 space-y-1 mt-4 max-w-md">
                  <p className="font-medium text-slate-500">How it works</p>
                  <p>
                    Point your camera at objects around you. The AI teacher will
                    describe what it sees with vocabulary and adjectives.
                  </p>
                  <p>
                    Speak to practice your pronunciation — the teacher will respond
                    and correct your grammar.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Live indicator overlay */}
          {connectionStatus === "connected" && (
            <div className="absolute top-4 left-4 flex items-center gap-2">
              <div className="flex items-center gap-2 bg-red-600/90 px-3 py-1 rounded-full">
                <CircleDot className="w-3 h-3 text-white animate-pulse" />
                <span className="text-xs font-bold text-white">LIVE</span>
              </div>
              {isScreenSharing && (
                <div className="flex items-center gap-1.5 bg-purple-600/90 px-3 py-1 rounded-full">
                  <Monitor className="w-3 h-3 text-white" />
                  <span className="text-xs font-bold text-white">Screen</span>
                </div>
              )}
            </div>
          )}

          {/* Language badge */}
          {connectionStatus === "connected" && (
            <div className="absolute top-4 right-4 bg-blue-600/90 px-3 py-1 rounded-full">
              <span className="text-xs font-bold text-white">
                {language === "en" ? "English Teacher" : "Deutschlehrer"}
              </span>
            </div>
          )}

        </div>

        {/* Control Bar — above mobile transcript overlay, at bottom of video on desktop */}
        <div
          className="absolute left-0 right-0 z-30 bg-gradient-to-t from-black/60 to-transparent px-4 py-3 flex items-center justify-center gap-3 bottom-(--ctrl-bottom) md:bottom-[30%]"
          style={{ '--ctrl-bottom': `${mobileTranscriptHeight}vh` } as React.CSSProperties}
        >
          {/* Mic toggle */}
          <button
            onClick={toggleMic}
            disabled={!isSessionActive}
            className={cn(
              "p-3 rounded-2xl font-bold transition-all backdrop-blur-sm",
              !isSessionActive && "opacity-40 cursor-not-allowed bg-white/10",
              isSessionActive && !isMicMuted &&
                "bg-white/20 text-white hover:bg-white/30",
              isSessionActive && isMicMuted &&
                "bg-red-500/80 text-white hover:bg-red-500"
            )}
            title={isMicMuted ? "Unmute microphone" : "Mute microphone"}
          >
            {isMicMuted ? (
              <MicOff className="w-5 h-5" />
            ) : (
              <Mic className="w-5 h-5" />
            )}
          </button>

          {/* Screen share toggle */}
          <button
            onClick={toggleScreenShare}
            disabled={!isSessionActive}
            className={cn(
              "p-3 rounded-2xl font-bold transition-all backdrop-blur-sm",
              !isSessionActive && "opacity-40 cursor-not-allowed bg-white/10",
              isSessionActive && !isScreenSharing &&
                "bg-white/20 text-white hover:bg-white/30",
              isSessionActive && isScreenSharing &&
                "bg-purple-500/80 text-white hover:bg-purple-500"
            )}
            title={isScreenSharing ? "Switch to camera" : "Share screen"}
          >
            {isScreenSharing ? (
              <Camera className="w-5 h-5" />
            ) : (
              <Monitor className="w-5 h-5" />
            )}
          </button>

          {/* Start/Stop button */}
          {!isSessionActive ? (
            <button
              onClick={startSession}
              className="flex items-center gap-2 px-6 py-3 bg-green-600 text-white rounded-2xl font-bold hover:bg-green-700 transition-all shadow-lg"
            >
              <Phone className="w-5 h-5" />
              <span>Start Session</span>
            </button>
          ) : (
            <button
              onClick={stopSession}
              className="flex items-center gap-2 px-6 py-3 bg-red-600 text-white rounded-2xl font-bold hover:bg-red-700 transition-all shadow-lg"
            >
              <PhoneOff className="w-5 h-5" />
              <span>
                {connectionStatus === "connecting"
                  ? "Connecting..."
                  : "End Session"}
              </span>
            </button>
          )}

          {/* Camera indicator */}
          <div
            className={cn(
              "p-3 rounded-2xl backdrop-blur-sm",
              isCameraOn
                ? "bg-blue-500/30 text-white"
                : "bg-white/10 text-white/50"
            )}
            title="Camera"
          >
            {isCameraOn ? (
              <Video className="w-5 h-5" />
            ) : (
              <VideoOff className="w-5 h-5" />
            )}
          </div>
        </div>

        {/* Transcript — Desktop: flex-[3] bottom split | Mobile: draggable overlay */}
        <div
          className={cn(
            "bg-white flex flex-col",
            // Desktop: normal flex split
            "hidden md:flex md:flex-[3] md:min-h-0 md:border-t md:border-slate-200",
          )}
        >
          <div className="px-4 md:px-6 py-2 border-b border-slate-100 flex-shrink-0">
            <h2 className="text-sm font-bold text-slate-700">Transcript</h2>
          </div>
          <div className="flex-1 overflow-y-auto px-4 md:px-6 py-3 space-y-3">
            {transcripts.length === 0 ? (
              <div className="flex items-center justify-center h-full text-slate-400">
                <p className="text-sm">
                  {isSessionActive
                    ? "Listening... Show something to the camera or speak!"
                    : "Start a session to begin your lesson"}
                </p>
              </div>
            ) : (
              transcripts.map((entry, i) => (
                <div
                  key={`${entry.timestamp}-${i}`}
                  className={cn(
                    "flex gap-3 items-start",
                    entry.role === "user" ? "justify-end" : "justify-start"
                  )}
                >
                  {entry.role === "model" && (
                    <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <span className="text-xs font-bold text-blue-600">AI</span>
                    </div>
                  )}
                  <div
                    className={cn(
                      "max-w-[75%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed",
                      entry.role === "user"
                        ? "bg-blue-600 text-white rounded-br-md"
                        : "bg-slate-100 text-slate-800 rounded-bl-md"
                    )}
                  >
                    {entry.text}
                  </div>
                  {entry.role === "user" && (
                    <div className="w-7 h-7 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <span className="text-xs font-bold text-green-600">You</span>
                    </div>
                  )}
                </div>
              ))
            )}
            <div ref={transcriptEndRef} />
          </div>
        </div>

        {/* Mobile transcript overlay — draggable from bottom */}
        <div
          className="md:hidden absolute bottom-0 left-0 right-0 z-20 bg-white rounded-t-2xl shadow-[0_-4px_20px_rgba(0,0,0,0.15)] flex flex-col"
          style={{ height: `${mobileTranscriptHeight}vh` }}
        >
          {/* Drag handle */}
          <div
            className="flex-shrink-0 flex items-center justify-center py-2 cursor-grab active:cursor-grabbing touch-none"
            onTouchStart={onTouchStart}
            onTouchMove={onTouchMove}
          >
            <div className="w-10 h-1 rounded-full bg-slate-300" />
          </div>

          <div className="px-3 pb-1 flex-shrink-0">
            <h2 className="text-xs font-bold text-slate-700">Transcript</h2>
          </div>

          <div className="flex-1 overflow-y-auto px-3 py-2 space-y-2 min-h-0">
            {transcripts.length === 0 ? (
              <div className="flex items-center justify-center h-full text-slate-400">
                <p className="text-xs">
                  {isSessionActive
                    ? "Listening..."
                    : "Start a session to begin"}
                </p>
              </div>
            ) : (
              transcripts.map((entry, i) => (
                <div
                  key={`m-${entry.timestamp}-${i}`}
                  className={cn(
                    "flex gap-2 items-start",
                    entry.role === "user" ? "justify-end" : "justify-start"
                  )}
                >
                  {entry.role === "model" && (
                    <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <span className="text-[10px] font-bold text-blue-600">AI</span>
                    </div>
                  )}
                  <div
                    className={cn(
                      "max-w-[80%] px-3 py-2 rounded-2xl text-xs leading-relaxed",
                      entry.role === "user"
                        ? "bg-blue-600 text-white rounded-br-md"
                        : "bg-slate-100 text-slate-800 rounded-bl-md"
                    )}
                  >
                    {entry.text}
                  </div>
                  {entry.role === "user" && (
                    <div className="w-6 h-6 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <span className="text-[10px] font-bold text-green-600">You</span>
                    </div>
                  )}
                </div>
              ))
            )}
            <div ref={transcriptEndRef} />
          </div>
        </div>
      </div>
    </main>
  );
}
