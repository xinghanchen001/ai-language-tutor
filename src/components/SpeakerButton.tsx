"use client";

import { useEffect, useRef, useState } from "react";
import { Volume2, VolumeX, Loader2 } from "lucide-react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

interface SpeakerButtonProps {
    text: string;
    voice?: string;
    size?: "sm" | "md";
    className?: string;
}

export default function SpeakerButton({ text, voice, size = "md", className }: SpeakerButtonProps) {
    const [state, setState] = useState<"idle" | "loading" | "playing">("idle");
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const objectUrlRef = useRef<string | null>(null);

    useEffect(() => {
        return () => {
            if (audioRef.current) {
                audioRef.current.pause();
                audioRef.current = null;
            }
            if (objectUrlRef.current) {
                URL.revokeObjectURL(objectUrlRef.current);
                objectUrlRef.current = null;
            }
        };
    }, []);

    const handleClick = async () => {
        if (state === "playing" && audioRef.current) {
            audioRef.current.pause();
            audioRef.current.currentTime = 0;
            setState("idle");
            return;
        }
        if (state === "loading") return;

        try {
            setState("loading");
            const res = await fetch("/api/tts", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ text, voice }),
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.error || `TTS failed: ${res.status}`);
            }
            const blob = await res.blob();

            if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
            const url = URL.createObjectURL(blob);
            objectUrlRef.current = url;

            const audio = new Audio(url);
            audioRef.current = audio;
            audio.onended = () => setState("idle");
            audio.onerror = () => setState("idle");
            await audio.play();
            setState("playing");
        } catch (e) {
            console.error("[SpeakerButton]", e);
            setState("idle");
        }
    };

    const dimensions = size === "sm" ? "w-7 h-7" : "w-8 h-8";
    const iconSize = size === "sm" ? "w-3.5 h-3.5" : "w-4 h-4";

    return (
        <button
            type="button"
            onClick={handleClick}
            aria-label={state === "playing" ? "Stop pronunciation" : "Listen to pronunciation"}
            disabled={state === "loading"}
            className={cn(
                "flex-shrink-0 rounded-lg flex items-center justify-center transition-colors",
                dimensions,
                state === "playing"
                    ? "bg-blue-100 text-blue-600 hover:bg-blue-200"
                    : "bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-700",
                state === "loading" && "opacity-70 cursor-wait",
                className
            )}
        >
            {state === "loading" ? (
                <Loader2 className={cn(iconSize, "animate-spin")} />
            ) : state === "playing" ? (
                <VolumeX className={iconSize} />
            ) : (
                <Volume2 className={iconSize} />
            )}
        </button>
    );
}
