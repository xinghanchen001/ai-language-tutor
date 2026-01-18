import { Sparkles, ClipboardPaste, Loader2, Check } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface InputAreaProps {
    input: string;
    setInput: (value: string) => void;
    handleCorrect: (textOverride?: string, modeOverride?: 'correction' | 'explanation') => void;
    loading: boolean;
    showAutoPasteToast: boolean;
    apiKeyMissing: boolean;
    setApiKeyMissing: (missing: boolean) => void;
}

export default function InputArea({
    input,
    setInput,
    handleCorrect,
    loading,
    showAutoPasteToast,
    apiKeyMissing,
    setApiKeyMissing
}: InputAreaProps) {
    return (
        <div className="bg-white rounded-3xl shadow-xl shadow-blue-900/5 border border-white overflow-hidden flex flex-col h-full">
            <div className="p-6 space-y-4 flex-1 flex flex-col">
                <div className="flex items-center justify-between">
                    <label className="text-sm font-bold text-blue-900 flex items-center gap-2">
                        <Sparkles className="w-4 h-4 text-blue-500" />
                        Source Text <span className="text-xs font-normal text-slate-400">(Auto-Detect)</span>
                    </label>
                    <span className="text-xs text-slate-400 font-medium">{input.length} characters</span>
                </div>
                <div className="relative flex-1">
                    <textarea
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        placeholder="Type or paste your text here (English or German)..."
                        className="w-full h-full min-h-[12rem] p-4 text-lg border-none focus:ring-0 placeholder:text-slate-300 resize-none font-medium text-slate-700 bg-slate-50/50 rounded-2xl transition-colors focus:bg-white"
                    />

                    <AnimatePresence>
                        {showAutoPasteToast && (
                            <motion.div
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: 10 }}
                                className="absolute bottom-4 left-4 bg-blue-900/80 backdrop-blur text-white text-xs font-bold px-3 py-1.5 rounded-lg flex items-center gap-2 shadow-lg pointer-events-none"
                            >
                                <ClipboardPaste className="w-3 h-3" />
                                Pasted from clipboard
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
                <div className="flex justify-end pt-2">
                    <button
                        onClick={() => handleCorrect()}
                        disabled={!input.trim() || loading}
                        className={cn(
                            "group relative flex items-center gap-2 px-8 py-4 bg-blue-600 text-white rounded-2xl font-bold transition-all duration-300 shadow-lg shadow-blue-200 hover:shadow-blue-300 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed overflow-hidden w-full md:w-auto justify-center",
                            loading && "pl-6"
                        )}
                    >
                        <AnimatePresence mode="wait">
                            {loading ? (
                                <motion.div
                                    key="loading"
                                    initial={{ opacity: 0, scale: 0.8 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    exit={{ opacity: 0, scale: 0.8 }}
                                    className="flex items-center gap-2"
                                >
                                    <Loader2 className="w-5 h-5 animate-spin" />
                                    Refining...
                                </motion.div>
                            ) : (
                                <motion.div
                                    key="ready"
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -10 }}
                                    className="flex items-center gap-2"
                                >
                                    <Check className="w-5 h-5 group-hover:scale-110 transition-transform" />
                                    Correct Text
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </button>
                </div>
            </div>

            {/* API Key Modal Warning */}
            {apiKeyMissing && (
                <div className="bg-red-50 p-4 border-t border-red-100 flex items-center justify-between">
                    <p className="text-sm text-red-600 font-medium">Gemini API Key missing. Add it to .env to enable AI.</p>
                    <button
                        onClick={() => setApiKeyMissing(false)}
                        className="text-xs bg-red-600 text-white px-3 py-1 rounded-lg hover:bg-red-700 transition-colors"
                    >
                        Dismiss
                    </button>
                </div>
            )}
        </div>
    );
}
