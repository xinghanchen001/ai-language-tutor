"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { ArrowLeftRight, Copy, Check, Loader2, X, ArrowLeft, Video, Languages } from "lucide-react";
import { cn } from "@/lib/utils";
import SpeakerButton from "@/components/SpeakerButton";

type Lang = "en" | "de" | "zh";
type SourceLang = Lang | "auto";

const LANG_LABEL: Record<Lang, string> = {
    en: "English",
    de: "German",
    zh: "Chinese",
};

const LANG_FLAG: Record<Lang, string> = {
    en: "🇬🇧",
    de: "🇩🇪",
    zh: "🇨🇳",
};

const TTS_VOICE: Record<Lang, string> = {
    en: "en-US-Neural2-F",
    de: "de-DE-Neural2-F",
    zh: "cmn-CN-Wavenet-A",
};

export default function TranslatePage() {
    const [input, setInput] = useState("");
    const [output, setOutput] = useState("");
    const [sourceLang, setSourceLang] = useState<SourceLang>("auto");
    const [targetLang, setTargetLang] = useState<Lang>("en");
    const [detectedLang, setDetectedLang] = useState<Lang | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);
    const debounceRef = useRef<NodeJS.Timeout | null>(null);

    const translate = async (text: string, src: SourceLang, tgt: Lang) => {
        if (!text.trim()) {
            setOutput("");
            setDetectedLang(null);
            setError(null);
            return;
        }
        setIsLoading(true);
        setError(null);
        try {
            const res = await fetch("/api/translate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ text, sourceLang: src, targetLang: tgt }),
            });
            if (!res.ok) {
                const body = await res.json().catch(() => ({}));
                throw new Error(body.error || `Translation failed: ${res.status}`);
            }
            const data = await res.json();
            setOutput(data.translation || "");
            setDetectedLang(data.detectedSourceLang as Lang);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Translation failed");
            setOutput("");
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => {
            translate(input, sourceLang, targetLang);
        }, 600);
        return () => {
            if (debounceRef.current) clearTimeout(debounceRef.current);
        };
    }, [input, sourceLang, targetLang]);

    const handleSwap = () => {
        const detected = detectedLang;
        const newSource: Lang = sourceLang === "auto" ? (detected ?? "en") : sourceLang;
        const newTarget: Lang = newSource === targetLang ? (detected ?? "en") : targetLang;
        setSourceLang(targetLang);
        setTargetLang(newSource);
        setInput(output);
        setOutput(input);
        setDetectedLang(null);
        if (newTarget) {
            // noop — included to silence unused var lint when types collapse
        }
    };

    const handleCopy = async () => {
        if (!output) return;
        try {
            await navigator.clipboard.writeText(output);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
        } catch {
            // ignore
        }
    };

    const sourceOptions: { value: SourceLang; label: string }[] = [
        { value: "auto", label: detectedLang ? `Auto (${LANG_LABEL[detectedLang]})` : "Auto-detect" },
        { value: "en", label: `🇬🇧 ${LANG_LABEL.en}` },
        { value: "de", label: `🇩🇪 ${LANG_LABEL.de}` },
        { value: "zh", label: `🇨🇳 ${LANG_LABEL.zh}` },
    ];

    return (
        <div className="min-h-screen bg-slate-50">
            {/* Header */}
            <nav className="bg-[#031830] border-b border-blue-900 px-3 md:px-6 h-14 md:h-16 flex items-center justify-between sticky top-0 z-50 shadow-md gap-2 md:gap-4">
                <div className="flex items-center gap-2 md:gap-3 flex-shrink-0 min-w-0">
                    <Link
                        href="/"
                        title="Back to Correct / Explain"
                        aria-label="Back to home"
                        className="w-8 h-8 flex items-center justify-center text-blue-300 hover:bg-blue-900 hover:text-white rounded-lg transition-colors flex-shrink-0"
                    >
                        <ArrowLeft className="w-5 h-5" />
                    </Link>
                    <div className="flex items-center gap-2 min-w-0">
                        <div className="w-9 h-9 hidden md:flex rounded-xl items-center justify-center bg-purple-500/15 border border-purple-500/30 flex-shrink-0">
                            <Languages className="w-4 h-4 text-purple-300" />
                        </div>
                        <h1 className="text-base md:text-lg font-bold text-white tracking-tight truncate">
                            Translate
                        </h1>
                    </div>
                </div>

                <div className="flex items-center gap-1.5 md:gap-2 flex-shrink-0">
                    <Link
                        href="/"
                        title="Correct / Explain"
                        className="h-8 inline-flex items-center gap-1.5 px-2.5 md:px-3 rounded-lg text-xs font-bold bg-blue-500/15 text-blue-300 border border-blue-500/30 hover:bg-blue-500/25 hover:text-blue-200 transition-colors"
                    >
                        <ArrowLeft className="w-3.5 h-3.5 flex-shrink-0 md:hidden" />
                        <span className="hidden md:inline">Correct / Explain</span>
                        <span className="md:hidden">Home</span>
                    </Link>

                    <Link
                        href="/live"
                        title="Live tutor"
                        className="h-8 inline-flex items-center gap-1.5 px-2.5 md:px-3 rounded-lg text-xs font-bold bg-green-500/15 text-green-300 border border-green-500/30 hover:bg-green-500/25 hover:text-green-200 transition-colors"
                    >
                        <Video className="w-3.5 h-3.5 flex-shrink-0" />
                        <span className="hidden md:inline">Live</span>
                    </Link>
                </div>
            </nav>

            <div className="max-w-6xl mx-auto p-3 md:p-6">
                {/* Language selectors */}
                <div className="flex items-end gap-2 mb-3 md:mb-4">
                    <div className="flex-1 min-w-0">
                        <label className="block text-[10px] md:text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">
                            From
                        </label>
                        <select
                            value={sourceLang}
                            onChange={(e) => setSourceLang(e.target.value as SourceLang)}
                            aria-label="Source language"
                            className="w-full h-10 px-3 bg-white border border-slate-200 rounded-lg text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent appearance-none truncate"
                        >
                            {sourceOptions.map((o) => (
                                <option key={o.value} value={o.value}>
                                    {o.label}
                                </option>
                            ))}
                        </select>
                    </div>

                    <button
                        type="button"
                        onClick={handleSwap}
                        disabled={sourceLang === "auto" && !detectedLang}
                        aria-label="Swap languages"
                        title="Swap languages"
                        className="flex-shrink-0 w-10 h-10 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-slate-500 hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                        <ArrowLeftRight className="w-4 h-4" />
                    </button>

                    <div className="flex-1 min-w-0">
                        <label className="block text-[10px] md:text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">
                            To
                        </label>
                        <select
                            value={targetLang}
                            onChange={(e) => setTargetLang(e.target.value as Lang)}
                            aria-label="Target language"
                            className="w-full h-10 px-3 bg-white border border-slate-200 rounded-lg text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent appearance-none truncate"
                        >
                            <option value="en">🇬🇧 {LANG_LABEL.en}</option>
                            <option value="de">🇩🇪 {LANG_LABEL.de}</option>
                            <option value="zh">🇨🇳 {LANG_LABEL.zh}</option>
                        </select>
                    </div>
                </div>

                {/* Input + Output */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Input */}
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
                        <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
                            <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">
                                {sourceLang === "auto" && detectedLang
                                    ? `Detected: ${LANG_FLAG[detectedLang]} ${LANG_LABEL[detectedLang]}`
                                    : sourceLang === "auto"
                                        ? "Source text"
                                        : `${LANG_FLAG[sourceLang]} ${LANG_LABEL[sourceLang]}`}
                            </span>
                            <div className="flex items-center gap-1">
                                {input && sourceLang !== "auto" && (
                                    <SpeakerButton
                                        text={input}
                                        voice={TTS_VOICE[sourceLang as Lang]}
                                        size="sm"
                                    />
                                )}
                                {input && sourceLang === "auto" && detectedLang && (
                                    <SpeakerButton
                                        text={input}
                                        voice={TTS_VOICE[detectedLang]}
                                        size="sm"
                                    />
                                )}
                                {input && (
                                    <button
                                        type="button"
                                        onClick={() => setInput("")}
                                        aria-label="Clear input"
                                        className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
                                    >
                                        <X className="w-4 h-4" />
                                    </button>
                                )}
                            </div>
                        </div>
                        <textarea
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            placeholder="Type or paste text to translate..."
                            maxLength={5000}
                            className="flex-1 w-full p-4 text-lg leading-relaxed text-slate-700 resize-none focus:outline-none min-h-[260px] md:min-h-[400px]"
                        />
                        <div className="px-4 py-2 border-t border-slate-100 text-xs text-slate-400 text-right">
                            {input.length} / 5000
                        </div>
                    </div>

                    {/* Output */}
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
                        <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
                            <span className="text-xs font-bold text-slate-500 uppercase tracking-wide flex items-center gap-2">
                                {LANG_FLAG[targetLang]} {LANG_LABEL[targetLang]}
                                {isLoading && (
                                    <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-500" />
                                )}
                            </span>
                            <div className="flex items-center gap-1">
                                {output && (
                                    <SpeakerButton
                                        text={output}
                                        voice={TTS_VOICE[targetLang]}
                                        size="sm"
                                    />
                                )}
                                {output && (
                                    <button
                                        type="button"
                                        onClick={handleCopy}
                                        aria-label="Copy translation"
                                        className={cn(
                                            "w-7 h-7 rounded-lg flex items-center justify-center transition-colors",
                                            copied
                                                ? "bg-green-100 text-green-600"
                                                : "text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                                        )}
                                    >
                                        {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                                    </button>
                                )}
                            </div>
                        </div>
                        <div className="flex-1 p-4 text-lg leading-relaxed text-slate-700 whitespace-pre-wrap min-h-[260px] md:min-h-[400px]">
                            {error ? (
                                <span className="text-red-500 text-sm">{error}</span>
                            ) : output ? (
                                output
                            ) : (
                                <span className="text-slate-400">Translation will appear here...</span>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
