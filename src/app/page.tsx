"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Send,
  RotateCcw,
  Copy,
  Check,
  History,
  Trash2,
  Languages,
  Sparkles,
  Loader2,
  ClipboardPaste,
  BookOpen,
  AlertTriangle,
  Filter
} from "lucide-react";
import { db } from "@/lib/firebase";
import { collection, addDoc, query, orderBy, onSnapshot, limit, Timestamp, deleteDoc, doc } from "firebase/firestore";
import { correctText, type CorrectionResult } from "@/lib/gemini";
import * as Diff from "diff";
import { Fragment } from "react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface CorrectionEntry {
  id: string;
  original: string;
  corrected: string;
  mistakes?: string; // Optional for backward compatibility
  knowledge?: string; // Optional for backward compatibility
  language: 'en' | 'de';
  timestamp: Timestamp;
}

export default function Home() {
  const [input, setInput] = useState("");
  const [output, setOutput] = useState<CorrectionResult | null>(null);
  const [languageFilter, setLanguageFilter] = useState<'all' | 'en' | 'de'>('all');
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [history, setHistory] = useState<CorrectionEntry[]>([]);
  const [apiKeyMissing, setApiKeyMissing] = useState(false);
  const [autoPasteEnabled, setAutoPasteEnabled] = useState(false);
  const [showAutoPasteToast, setShowAutoPasteToast] = useState(false);

  // Filter history based on selected language
  const filteredHistory = history.filter(item =>
    languageFilter === 'all' || item.language === languageFilter
  );

  useEffect(() => {
    const handleFocus = async () => {
      if (!autoPasteEnabled) return;

      try {
        const text = await navigator.clipboard.readText();
        if (text && text !== input) {
          setInput(text);
          setShowAutoPasteToast(true);
          setTimeout(() => setShowAutoPasteToast(false), 3000);
        }
      } catch (err) {
        console.error('Failed to read clipboard:', err);
      }
    };

    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [autoPasteEnabled, input]);

  useEffect(() => {
    const q = query(
      collection(db, "corrections"),
      orderBy("timestamp", "desc"),
      limit(20) // Increased limit to ensure enough items after filtering
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const entries = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as CorrectionEntry[];
      setHistory(entries);
    });

    return () => unsubscribe();
  }, []);

  const handleCorrect = async () => {
    if (!input.trim() || loading) return;

    setLoading(true);
    setApiKeyMissing(false);
    try {
      const result = await correctText(input); // Auto-detect language
      setOutput(result);

      // Save to Firebase
      await addDoc(collection(db, "corrections"), {
        original: input,
        corrected: result.corrected,
        mistakes: result.mistakes,
        knowledge: result.knowledge,
        language: result.detectedLanguage, // Save detected language
        timestamp: Timestamp.now()
      });
    } catch (error: any) {
      console.error("Correction error:", error);
      if (error.message.includes("API Key is missing")) {
        setApiKeyMissing(true);
      }
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = () => {
    if (!output) return;
    navigator.clipboard.writeText(output.corrected);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const renderDiff = (original: string, corrected: string) => {
    const diff = Diff.diffWords(original, corrected);
    return diff.map((part, index) => (
      <Fragment key={index}>
        {part.added ? (
          <span className="text-green-600 bg-green-50 font-bold underline decoration-2 decoration-green-400 underline-offset-2 mx-0.5 px-0.5 rounded">
            {part.value}
          </span>
        ) : part.removed ? (
          <span className="text-red-400 line-through decoration-red-400/50 decoration-2 mx-0.5 opacity-70">
            {part.value}
          </span>
        ) : (
          <span className="text-slate-700">{part.value}</span>
        )}
      </Fragment>
    ));
  };

  const deleteHistoryItem = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await deleteDoc(doc(db, "corrections", id));
    } catch (error) {
      console.error("Delete error:", error);
    }
  };

  return (
    <main className="min-h-screen bg-[#F0F4F8] selection:bg-blue-100">
      {/* Header */}
      <nav className="bg-white border-b border-blue-100 px-6 py-4 flex items-center justify-between sticky top-0 z-50 shadow-sm">
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-200">
            <Languages className="text-white w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-blue-900 tracking-tight">DeepL <span className="text-blue-500 font-medium">Corrector</span></h1>
            <p className="text-[10px] text-blue-400 font-semibold uppercase tracking-wider">AI Powered Linguistic Perfection</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <button
            onClick={() => setAutoPasteEnabled(!autoPasteEnabled)}
            className={cn(
              "flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all border",
              autoPasteEnabled
                ? "bg-blue-100 text-blue-700 border-blue-200"
                : "bg-white text-slate-500 border-slate-200 hover:border-blue-200 hover:text-blue-500"
            )}
          >
            <ClipboardPaste className="w-3.5 h-3.5" />
            Auto-Paste
            <div className={cn(
              "w-2 h-2 rounded-full transition-colors",
              autoPasteEnabled ? "bg-green-500" : "bg-slate-300"
            )} />
          </button>


        </div>
      </nav>

      <div className="flex pt-[73px]"> {/* Offset for fixed navbar height */}

        {/* Fixed Left Sidebar / History */}
        <aside className="w-80 h-[calc(100vh-73px)] fixed left-0 top-[73px] bg-white border-r border-blue-100 flex flex-col z-40 shadow-[4px_0_24px_-12px_rgba(0,0,0,0.1)]">
          <div className="p-6 border-b border-blue-50 bg-white z-10 sticky top-0 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-blue-900 flex items-center gap-2">
                <History className="w-5 h-5 text-blue-400" />
                History
              </h2>
              <span className="text-[10px] bg-blue-50 text-blue-500 px-2 py-1 rounded-full font-bold uppercase tracking-wider">
                Recent
              </span>
            </div>

            {/* Language Filter Toggle */}
            <div className="flex bg-slate-50 p-1 rounded-xl border border-slate-100 w-full">
              {(['all', 'en', 'de'] as const).map((lang) => (
                <button
                  key={lang}
                  onClick={() => setLanguageFilter(lang)}
                  className={cn(
                    "flex-1 py-1.5 rounded-lg text-xs font-bold transition-all duration-200 capitalize",
                    languageFilter === lang
                      ? "bg-white text-blue-600 shadow-sm border border-blue-50"
                      : "text-slate-400 hover:text-slate-600"
                  )}
                >
                  {lang === 'all' ? 'All' : lang === 'en' ? 'English' : 'German'}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
            <AnimatePresence initial={false} mode="popLayout">
              {filteredHistory.map((item) => (
                <motion.div
                  key={item.id}
                  layout
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  onClick={() => {
                    setInput(item.original);
                    setOutput({
                      corrected: item.corrected,
                      mistakes: item.mistakes || "No analysis available for this legacy or simple correction.",
                      knowledge: item.knowledge || "No specific knowledge points available.",
                      detectedLanguage: item.language
                    });
                    // Removed legacy setLanguage call as it's now auto-detected
                  }}
                  className="group bg-blue-50/50 p-4 rounded-2xl border border-transparent hover:border-blue-200 hover:bg-white transition-all cursor-pointer relative"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <span className={cn(
                      "text-[10px] font-black uppercase px-1.5 py-0.5 rounded",
                      item.language === 'en' ? "text-purple-600 bg-purple-100" : "text-blue-600 bg-blue-100"
                    )}>
                      {item.language}
                    </span>
                    <span className="text-[10px] text-slate-400 font-medium">
                      {item.timestamp?.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <p className="text-sm text-slate-600 font-medium line-clamp-2 leading-relaxed">
                    {item.corrected}
                  </p>

                  <button
                    onClick={(e) => deleteHistoryItem(item.id, e)}
                    className="absolute top-4 right-4 text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </motion.div>
              ))}
            </AnimatePresence>

            {filteredHistory.length === 0 && (
              <div className="h-full flex flex-col items-center justify-center text-center p-8 opacity-40 min-h-[200px]">
                <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mb-4">
                  <Filter className="w-8 h-8 text-blue-200" />
                </div>
                <p className="text-sm font-medium text-blue-900">
                  {languageFilter === 'all'
                    ? "Your history will appear here"
                    : `No ${languageFilter === 'en' ? 'English' : 'German'} items found`}
                </p>
              </div>
            )}
          </div>
        </aside>

        {/* Main Content Area */}
        <div className="flex-1 ml-80 min-h-[calc(100vh-73px)]">
          <div className="max-w-6xl mx-auto px-8 py-10 space-y-8">

            {/* Input & Output Comparison Grid */}
            <div className={cn(
              "grid grid-cols-1 gap-6 transition-all duration-300",
              output ? "md:grid-cols-2" : "md:grid-cols-1"
            )}>

              {/* Input Column */}
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
                      onClick={handleCorrect}
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
                {apiKeyMissing ? (
                  <div className="bg-red-50 p-4 border-t border-red-100 flex items-center justify-between">
                    <p className="text-sm text-red-600 font-medium">Gemini API Key missing. Add it to .env to enable AI.</p>
                    <button
                      onClick={() => setApiKeyMissing(false)}
                      className="text-xs bg-red-600 text-white px-3 py-1 rounded-lg hover:bg-red-700 transition-colors"
                    >
                      Dismiss
                    </button>
                  </div>
                ) : null}
              </div>

              {/* Output Column (Optimized Version) */}
              {output && (
                <motion.div
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="bg-white rounded-3xl shadow-xl shadow-blue-900/5 border border-white overflow-hidden flex flex-col h-full"
                >
                  <div className="p-6 border-b border-blue-50 bg-blue-50/30 flex items-center justify-between">
                    <label className="text-sm font-bold text-blue-900 flex items-center gap-2">
                      <Check className="w-4 h-4 text-green-500" />
                      Optimized Version
                    </label>
                    <button
                      onClick={copyToClipboard}
                      className="flex items-center gap-1.5 text-xs font-bold text-blue-600 bg-white px-3 py-1.5 rounded-lg border border-blue-100 shadow-sm hover:bg-blue-600 hover:text-white transition-all uppercase tracking-wider"
                    >
                      {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                      {copied ? "Copied" : "Copy"}
                    </button>
                  </div>
                  <div className="p-6 text-lg leading-relaxed flex-1 custom-scrollbar overflow-y-auto max-h-[500px]">
                    {renderDiff(input, output.corrected)}
                  </div>
                </motion.div>
              )}
            </div>

            {/* Analysis & Knowledge Grid (Below Comparison) */}
            {output && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

                {/* Card 2: Mistakes Analysis */}
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 }}
                  className="bg-red-50/50 rounded-3xl border border-red-100 p-6 space-y-3"
                >
                  <div className="flex items-center gap-2 text-red-700 font-bold text-sm">
                    <AlertTriangle className="w-4 h-4" />
                    Mistake Analysis
                  </div>
                  <p className="text-sm text-slate-700 leading-relaxed font-medium">
                    {output.mistakes}
                  </p>
                </motion.div>

                {/* Card 3: Knowledge Drop */}
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                  className="bg-indigo-50/50 rounded-3xl border border-indigo-100 p-6 space-y-3"
                >
                  <div className="flex items-center gap-2 text-indigo-700 font-bold text-sm">
                    <BookOpen className="w-4 h-4" />
                    Knowledge Drop
                  </div>
                  <p className="text-sm text-slate-700 leading-relaxed font-medium">
                    {output.knowledge}
                  </p>
                </motion.div>

              </div>
            )}

          </div>
        </div>
      </div>
    </main>
  );
}

