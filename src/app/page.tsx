"use client";

import { useState, useEffect, useRef, Suspense, Fragment } from "react";
import { useSearchParams } from "next/navigation";
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
  Filter,
  ArrowRight,
  Menu,
  X,
  AlertCircle // Added standard icons for mobile menu
} from "lucide-react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { db } from "@/lib/firebase";
import {
  collection,
  addDoc,
  serverTimestamp,
  query,
  orderBy,
  onSnapshot,
  deleteDoc,
  doc,
  getDocs,
  limit,
  startAfter,
  Timestamp
} from "firebase/firestore";
import * as Diff from "diff";
import {
  correctText,
  CorrectionResult,
  chatWithAI,
  ExplanationResult,
  explainText,
} from "@/lib/gemini";
import AnnotatedSentence from "@/components/AnnotatedSentence";
import ReactMarkdown from 'react-markdown';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface CorrectionEntry {
  id: string;
  original: string;
  corrected: string;
  mistakes?: string;
  knowledge?: string;
  language: 'en' | 'de';
  timestamp: Timestamp;
}

interface ExplanationEntry {
  id: string;
  original: string;
  sentences: Array<{
    text: string;
    simplifiedExpression?: string;
    teacherComment?: string;
    annotations: Array<{
      text: string;
      start: number;
      end: number;
      type: 'vocabulary' | 'grammar' | 'idiom' | 'structure';
      explanation: string;
      examples?: string[];
    }>;
  }>;
  language: 'en' | 'de';
  timestamp: Timestamp;
}

interface ChatMessage {
  id?: string;
  role: 'user' | 'model';
  content: string;
  timestamp?: any;
}

declare global {
  interface Window {
    electron?: {
      onClipboardText: (callback: (text: string) => void) => void;
      onClipboardTextExplanation: (callback: (text: string) => void) => void;
      hideWindow: () => void;
    };
  }
}

export default function Home() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#F0F4F8] flex items-center justify-center"><Loader2 className="animate-spin text-blue-500" /></div>}>
      <MainContent />
    </Suspense>
  );
}

function MainContent() {
  const searchParams = useSearchParams();

  const [input, setInput] = useState("");
  const [output, setOutput] = useState<CorrectionResult | null>(null);
  const [explanationOutput, setExplanationOutput] = useState<ExplanationResult | null>(null);
  const [mode, setMode] = useState<'correction' | 'explanation'>('explanation');
  const [languageFilter, setLanguageFilter] = useState<'all' | 'en' | 'de'>('all');
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [history, setHistory] = useState<(CorrectionEntry | ExplanationEntry)[]>([]);
  const [apiKeyMissing, setApiKeyMissing] = useState(false);
  const [autoPasteEnabled, setAutoPasteEnabled] = useState(false);
  const [showAutoPasteToast, setShowAutoPasteToast] = useState(false);
  const [lastVisible, setLastVisible] = useState<any>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Chat State
  const [currentCorrectionId, setCurrentCorrectionId] = useState<string | null>(null);
  const [currentOriginalText, setCurrentOriginalText] = useState<string>("");
  const [chatInput, setChatInput] = useState("");
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [isChatLoading, setIsChatLoading] = useState(false);
  const chatBottomRef = useRef<HTMLDivElement>(null);

  // Check for URL parameters on mount
  useEffect(() => {
    const textParam = searchParams.get('text');
    const modeParam = searchParams.get('mode');

    if (textParam) {
      const decodedText = decodeURIComponent(textParam);
      setInput(decodedText);

      const targetMode = (modeParam === 'explanation' ? 'explanation' : 'correction');
      setMode(targetMode);

      // Trigger AI immediately
      handleCorrect(decodedText, targetMode);
    }
  }, [searchParams]);

  // ... (existing useEffects + fetchHistory + handleCorrect logic) ...




  // Auto-scroll chat
  useEffect(() => {
    if (chatBottomRef.current) {
      chatBottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatMessages]);

  // Load chat messages when correction ID changes
  useEffect(() => {
    if (!currentCorrectionId) {
      setChatMessages([]);
      return;
    }

    const q = query(
      collection(db, "corrections", currentCorrectionId, "messages"),
      orderBy("timestamp", "asc")
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const messages = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as ChatMessage[];
      setChatMessages(messages);
    });

    return () => unsubscribe();
  }, [currentCorrectionId]);

  // Filter history based on selected language
  const filteredHistory = history.filter(item =>
    languageFilter === 'all' || item.language === languageFilter
  );

  useEffect(() => {
    const handleFocus = async () => {
      // In Electron, we rely on shortcuts (IPC events) only, avoiding conflicts with clipboard content
      if (typeof window !== 'undefined' && window.electron) return;

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

  // Handle Electron Clipboard Events for Correction Mode (Cmd+Option+C)
  useEffect(() => {
    if (typeof window !== 'undefined' && window.electron) {
      window.electron.onClipboardText((text) => {
        if (text) {
          setMode('correction');
          setInput(text);
          handleCorrect(text, 'correction');
        }
      });
    }
  }, []);

  // Handle Electron Clipboard Events for Explanation Mode (Cmd+Option+E)
  useEffect(() => {
    if (typeof window !== 'undefined' && window.electron?.onClipboardTextExplanation) {
      window.electron.onClipboardTextExplanation((text) => {
        if (text) {
          setMode('explanation');
          setInput(text);
          handleCorrect(text, 'explanation');
        }
      });
    }
  }, []);

  // Removed the useEffect that auto-triggered on input/mode change
  // [x] Implement PWA Support (Manifest & Meta Tags)
  // [x] Expand Header Toggle to fill available space
  // [ ] Hide Header Logo and Text on Mobile
  const fetchHistory = async (isFirstPage = false) => {
    if (loadingMore || (!hasMore && !isFirstPage)) return;

    setLoadingMore(true);
    try {
      const collectionName = mode === 'correction' ? 'corrections' : 'explanations';
      let q = query(
        collection(db, collectionName),
        orderBy("timestamp", "desc"),
        limit(15)
      );

      if (!isFirstPage && lastVisible) {
        q = query(q, startAfter(lastVisible));
      }

      const snapshot = await getDocs(q);
      const entries = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as (CorrectionEntry | ExplanationEntry)[];

      if (isFirstPage) {
        setHistory(entries);
      } else {
        setHistory(prev => [...prev, ...entries]);
      }

      setLastVisible(snapshot.docs[snapshot.docs.length - 1]);
      setHasMore(snapshot.docs.length === 15);
    } catch (error) {
      console.error("Error fetching history:", error);
    } finally {
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    fetchHistory(true);
  }, [mode]); // Refetch when mode changes

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
    if (scrollHeight - scrollTop <= clientHeight + 50) {
      fetchHistory();
    }
  };

  const handleCorrect = async (textOverride?: string, modeOverride?: 'correction' | 'explanation') => {
    const textToProcess = textOverride ?? input;
    const modeToUse = modeOverride ?? mode;

    if (typeof textToProcess !== 'string' || !textToProcess.trim() || loading) return;

    setLoading(true);
    setApiKeyMissing(false);
    setOutput(null);
    setExplanationOutput(null);
    setChatMessages([]);
    setCurrentCorrectionId(null);
    setErrorMessage(null);

    try {
      if (modeToUse === 'correction') {
        const result = await correctText(textToProcess);
        setOutput(result);
        setCurrentOriginalText(textToProcess);

        // Save to Firebase Corrections
        try {
          const docRef = await addDoc(collection(db, "corrections"), {
            original: textToProcess,
            corrected: result.corrected,
            mistakes: result.mistakes,
            knowledge: result.knowledge,
            language: result.detectedLanguage,
            timestamp: Timestamp.now()
          });
          setCurrentCorrectionId(docRef.id);

          const newEntry: CorrectionEntry = {
            id: docRef.id,
            original: textToProcess,
            corrected: result.corrected,
            mistakes: result.mistakes,
            knowledge: result.knowledge,
            language: result.detectedLanguage,
            timestamp: Timestamp.now()
          };
          setHistory(prev => [newEntry, ...prev]);
        } catch (e) {
          console.error("Firebase Error:", e);
        }
      } else {
        // Explanation Mode
        const result = await explainText(textToProcess);
        setExplanationOutput(result);
        setCurrentOriginalText(textToProcess);

        // Save to Firebase Explanations
        try {
          const docRef = await addDoc(collection(db, "explanations"), {
            original: textToProcess,
            sentences: result.sentences,
            language: result.detectedLanguage,
            timestamp: Timestamp.now()
          });
          setCurrentCorrectionId(docRef.id); // Re-using ID state for chat binding if needed

          const newEntry: ExplanationEntry = {
            id: docRef.id,
            original: textToProcess,
            sentences: result.sentences,
            language: result.detectedLanguage,
            timestamp: Timestamp.now()
          };
          setHistory(prev => [newEntry, ...prev]);
        } catch (e) {
          console.error("Firebase Error:", e);
        }
      }
    } catch (error: any) {
      console.error("Processing error:", error);
      if (error.message.includes("API Key is missing")) {
        setApiKeyMissing(true);
      } else {
        setErrorMessage(error.message || "An unexpected error occurred. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  const loadHistoryItem = (item: CorrectionEntry | ExplanationEntry) => {
    setInput(item.original);

    if ('corrected' in item) {
      // It's a correction
      setMode('correction'); // Switch mode if needed
      setOutput({
        corrected: item.corrected,
        mistakes: item.mistakes || "No analysis available.",
        knowledge: item.knowledge || "No specific knowledge points available.",
        detectedLanguage: item.language
      });
      setExplanationOutput(null);
    } else {
      // It's an explanation
      setMode('explanation');
      setExplanationOutput({
        detectedLanguage: item.language,
        sentences: item.sentences
      });
      setOutput(null);
    }

    setCurrentOriginalText(item.original);
    setCurrentCorrectionId(item.id);
  };

  const handleSendMessage = async () => {
    if (!chatInput.trim() || !currentCorrectionId || (!output && !explanationOutput)) return;

    const userMsgText = chatInput.trim();
    setChatInput("");
    setIsChatLoading(true);

    try {
      // 1. Save User Message
      await addDoc(collection(db, "corrections", currentCorrectionId, "messages"), {
        role: 'user',
        content: userMsgText,
        timestamp: serverTimestamp()
      });

      // 2. Call AI
      // Convert current chat messages to minimal history for AI context
      const apiHistory = chatMessages.map(m => ({ role: m.role, content: m.content }));

      const currentContext = mode === 'correction' ? output! : explanationOutput!;
      const aiResponseText = await chatWithAI(currentContext, apiHistory, userMsgText, currentOriginalText);

      // 3. Save AI Message
      await addDoc(collection(db, "corrections", currentCorrectionId, "messages"), {
        role: 'model',
        content: aiResponseText,
        timestamp: serverTimestamp()
      });

    } catch (e) {
      console.error("Chat Error:", e);
      alert("Failed to send message");
    } finally {
      setIsChatLoading(false);
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
      const collectionName = mode === 'correction' ? 'corrections' : 'explanations';
      await deleteDoc(doc(db, collectionName, id));
      // Optimistically remove from UI
      setHistory(prev => prev.filter(item => item.id !== id));
      // If the deleted item was the currently selected one, clear output/chat
      if (currentCorrectionId === id) {
        setOutput(null);
        setExplanationOutput(null);
        setCurrentCorrectionId(null);
        setChatMessages([]);
        setInput("");
      }
    } catch (error) {
      console.error("Delete error:", error);
    }
  };


  // RENDER
  return (
    <main className="min-h-screen bg-[#F0F4F8] selection:bg-blue-100 flex flex-col">
      {/* Header */}
      <nav
        className="bg-[#031830] border-b border-blue-900 px-3 md:px-6 py-2 md:py-4 flex items-center justify-between sticky top-0 z-50 shadow-md"
        style={{ WebkitAppRegion: 'drag' } as any}
      >
        <div className="flex items-center gap-2 md:gap-4">
          {/* Mobile Menu Button */}
          <button
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="md:hidden p-1.5 text-blue-300 hover:bg-blue-900 hover:text-white rounded-lg transition-colors"
            style={{ WebkitAppRegion: 'no-drag' } as any}
          >
            {isMobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>

          <div className="hidden md:flex w-10 h-10 bg-transparent rounded-xl items-center justify-center overflow-hidden">
            <img
              src="./logo.png"
              alt="DeepL Corrector Logo"
              className="w-full h-full object-contain scale-125"
              style={{ mixBlendMode: 'multiply' } as any}
            />
          </div>
          <div className="hidden md:block">
            <h1 className="text-xl font-bold text-white tracking-tight leading-none">DeepL <span className="text-blue-400 font-medium">Corrector</span></h1>
            <p className="text-[10px] text-blue-300/80 font-semibold uppercase tracking-wider block">AI Powered Linguistic Perfection</p>
          </div>
        </div>

        <div className="flex items-center gap-2 md:gap-4 flex-1 justify-end ml-0 md:ml-8">
          {/* Mode Toggle (Visible on desktop, condensed on mobile?) */}
          <div className="flex items-center bg-blue-900/40 p-1 rounded-lg border border-blue-800/50 flex-1 max-w-md shadow-inner">
            <button
              onClick={() => {
                if (mode !== 'correction') {
                  setMode('correction');
                  setInput('');
                  setOutput(null);
                  setExplanationOutput(null);
                  setChatMessages([]);
                  setCurrentCorrectionId(null);
                  setErrorMessage(null);
                }
              }}
              className={cn(
                "px-2 md:px-3 py-1.5 rounded-md text-xs md:text-sm font-bold transition-all flex-1 text-center whitespace-nowrap",
                mode === 'correction'
                  ? "bg-blue-600 text-white shadow-sm"
                  : "text-blue-300 hover:text-blue-100 hover:bg-blue-800/50"
              )}
              style={{ WebkitAppRegion: 'no-drag' } as any}
            >
              Correct
            </button>
            <button
              onClick={() => {
                if (mode !== 'explanation') {
                  setMode('explanation');
                  setInput('');
                  setOutput(null);
                  setExplanationOutput(null);
                  setChatMessages([]);
                  setCurrentCorrectionId(null);
                  setErrorMessage(null);
                }
              }}
              className={cn(
                "px-2 md:px-3 py-1.5 rounded-md text-xs md:text-sm font-bold transition-all flex-1 text-center whitespace-nowrap",
                mode === 'explanation'
                  ? "bg-blue-600 text-white shadow-sm"
                  : "text-blue-300 hover:text-blue-100 hover:bg-blue-800/50"
              )}
              style={{ WebkitAppRegion: 'no-drag' } as any}
            >
              Explain
            </button>
          </div>

          {/* Auto Paste (Desktop Only) */}
          <button
            onClick={() => setAutoPasteEnabled(!autoPasteEnabled)}
            className={cn(
              "hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all border",
              autoPasteEnabled
                ? "bg-blue-500/20 text-blue-300 border-blue-500/30"
                : "bg-blue-900/30 text-blue-400 border-blue-800/50 hover:border-blue-700 hover:text-blue-200"
            )}
            style={{ WebkitAppRegion: 'no-drag' } as any}
          >
            <ClipboardPaste className="w-3.5 h-3.5" />
            <span className="hidden lg:inline">Auto-Paste</span>
            <div className={cn(
              "w-2 h-2 rounded-full transition-colors",
              autoPasteEnabled ? "bg-green-400 shadow-[0_0_8px_rgba(74,222,128,0.5)]" : "bg-blue-800"
            )} />
          </button>

          {/* Close/Reset Button */}
          <button
            onClick={() => {
              setInput("");
              setOutput(null);
              if (typeof window !== 'undefined' && window.electron) window.electron.hideWindow();
            }}
            className="w-8 h-8 flex items-center justify-center rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500 hover:text-white transition-all border border-transparent hover:border-red-500/50"
            style={{ WebkitAppRegion: 'no-drag' } as any}
            title="Close and Reset"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </nav>

      <div className="flex relative flex-1 overflow-hidden">
        {/* Sidebar History (Desktop: Fixed, Mobile: Drawer) */}

        {/* Mobile Filter Backdrop */}
        <AnimatePresence>
          {isMobileMenuOpen && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsMobileMenuOpen(false)}
              className="fixed inset-0 bg-slate-900/20 backdrop-blur-sm z-30 md:hidden"
            />
          )}
        </AnimatePresence>

        <aside className={cn(
          "fixed inset-y-0 left-0 bg-white border-r border-blue-100 flex flex-col z-40 transition-transform duration-300 ease-in-out md:translate-x-0 md:static md:w-80 md:h-[calc(100vh-73px)] shadow-2xl md:shadow-none",
          isMobileMenuOpen ? "translate-x-0 w-[85vw]" : "-translate-x-full w-80"
        )}>
          <div className="p-4 md:p-6 border-b border-blue-50 bg-white z-10 sticky top-0 space-y-4 pt- safe-top"> {/* Handle safe area */}
            <div className="flex items-center justify-between">
              {/* Same header content... */}
              <h2 className="text-lg font-bold text-blue-900 flex items-center gap-2">
                <History className="w-5 h-5 text-blue-400" />
                History
              </h2>
              <button onClick={() => setIsMobileMenuOpen(false)} className="md:hidden p-1 text-slate-400"><X className="w-5 h-5" /></button>
            </div>
            {/* Language Filter Logic (Same) */}
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
                  {lang === 'all' ? 'All' : lang === 'en' ? 'En' : 'De'}
                </button>
              ))}
            </div>
          </div>

          <div
            className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar"
            onScroll={handleScroll}
          >
            {/* Same History List Rendering */}
            <AnimatePresence initial={false} mode="popLayout">
              {filteredHistory.map((item) => (
                <motion.div
                  key={item.id}
                  layout
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  onClick={() => {
                    loadHistoryItem(item);
                    setIsMobileMenuOpen(false); // Close menu on select
                  }}
                  className="group bg-blue-50/50 p-4 rounded-2xl border border-transparent hover:border-blue-200 hover:bg-white transition-all cursor-pointer relative"
                >
                  {/* ... item content ... */}
                  <div className="flex items-center gap-2 mb-2">
                    <span className={cn(
                      "text-[10px] font-black uppercase px-1.5 py-0.5 rounded",
                      item.language === 'en' ? "text-purple-600 bg-purple-100" : "text-blue-600 bg-blue-100"
                    )}>
                      {item.language}
                    </span>
                    <span className={cn(
                      "text-[10px] font-bold uppercase px-1.5 py-0.5 rounded",
                      'corrected' in item ? "text-green-600 bg-green-50" : "text-orange-600 bg-orange-50"
                    )}>
                      {'corrected' in item ? '✓ Corrected' : '📖 Explained'}
                    </span>
                    <span className="text-[10px] text-slate-400 font-medium">
                      {item.timestamp?.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <p className="text-sm text-slate-600 font-medium line-clamp-2 leading-relaxed">
                    {'corrected' in item ? item.corrected : item.original}
                  </p>

                  <button
                    onClick={(e) => deleteHistoryItem(item.id, e)}
                    className="absolute top-4 right-4 text-slate-300 hover:text-red-500 md:opacity-0 group-hover:opacity-100 transition-opacity" // Show visible on mobile (no hover)
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </motion.div>
              ))}
            </AnimatePresence>
            {/* ... Loaders ... */}
          </div>
        </aside>



        {/* Main Content Area */}
        <div className="flex-1 w-full min-h-[calc(100vh-73px)]">
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

                {/* General Error Message */}
                {errorMessage && (
                  <div className="bg-red-50 p-4 border-t border-red-100 flex items-center justify-between">
                    <p className="text-sm text-red-600 font-medium flex items-center gap-2">
                      <AlertCircle className="w-4 h-4" />
                      {errorMessage}
                    </p>
                    <button
                      onClick={() => setErrorMessage(null)}
                      className="text-xs bg-red-600 text-white px-3 py-1 rounded-lg hover:bg-red-700 transition-colors"
                    >
                      Dismiss
                    </button>
                  </div>
                )}
              </div>

              {/* Output Section */}
              {(output || explanationOutput) && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  layout
                  className="grid gap-6"
                >
                  {/* Optimized Version - Only Show in Correction Mode */}
                  {mode === 'correction' && output && (
                    <div className="bg-white rounded-3xl shadow-xl shadow-blue-900/5 border border-white overflow-hidden flex flex-col h-full">
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
                    </div>
                  )}

                  {/* Analysis Cards */}
                  <div className="grid gap-4 grid-cols-1">
                    {mode === 'explanation' ? (
                      /* Explanation Mode: Show annotated sentences */
                      <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100">
                        <div className="flex items-center gap-3 mb-6">
                          <div className="w-10 h-10 rounded-2xl bg-blue-50 flex items-center justify-center text-blue-500">
                            <BookOpen className="w-5 h-5" />
                          </div>
                          <div>
                            <h3 className="font-bold text-slate-800">Text Analysis</h3>
                            <p className="text-xs text-slate-400 font-medium">Click highlighted parts to learn more</p>
                          </div>
                        </div>
                        {explanationOutput?.sentences?.map((sentence, idx) => (
                          <AnnotatedSentence
                            key={idx}
                            sentence={sentence.text}
                            annotations={sentence.annotations}
                            sentenceIndex={idx}
                            simplifiedExpression={sentence.simplifiedExpression}
                            teacherComment={sentence.teacherComment}
                          />
                        ))}
                      </div>
                    ) : (
                      /* Correction Mode: Show mistakes card */
                      <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.1 }}
                        className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100"
                      >
                        <div className="flex items-center gap-3 mb-4">
                          <div className="w-10 h-10 rounded-2xl bg-red-50 flex items-center justify-center text-red-500">
                            <AlertTriangle className="w-5 h-5" />
                          </div>
                          <div>
                            <h3 className="font-bold text-slate-800">Key Improvements</h3>
                            <p className="text-xs text-slate-400 font-medium">Grammar & Style Fixes</p>
                          </div>
                        </div>
                        <div className="prose prose-sm prose-gray max-w-none text-slate-700">
                          <ReactMarkdown
                            components={{
                              strong: ({ children }) => <span className="font-bold text-slate-900">{children}</span>
                            }}
                          >
                            {output?.mistakes || ""}
                          </ReactMarkdown>
                        </div>
                      </motion.div>
                    )}

                    {/* Knowledge Drops (Correction Mode Only) */}
                    {mode === 'correction' && (
                      <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.2 }}
                        className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100"
                      >
                        <div className="flex items-center gap-3 mb-4">
                          <div className="w-10 h-10 rounded-2xl bg-indigo-50 flex items-center justify-center text-indigo-500">
                            <Sparkles className="w-5 h-5" />
                          </div>
                          <div>
                            <h3 className="font-bold text-slate-800">Knowledge Drops</h3>
                            <p className="text-xs text-slate-400 font-medium">Learn & Remember</p>
                          </div>
                        </div>
                        <div className="prose prose-sm prose-gray max-w-none text-slate-700">
                          <ReactMarkdown
                            components={{
                              strong: ({ children }) => <span className="font-bold text-slate-900">{children}</span>
                            }}
                          >
                            {output?.knowledge || ""}
                          </ReactMarkdown>
                        </div>
                      </motion.div>
                    )}

                  </div>
                </motion.div>
              )}
            </div>

            {/* Chat Section */}
            {(output || explanationOutput) && currentCorrectionId && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="flex flex-col gap-4"
              >
                {/* Messages Area - Only show if there are messages */}
                {chatMessages.length > 0 && (
                  <div className="flex-1 space-y-4">
                    {chatMessages.map((msg) => (
                      <div
                        key={msg.id || Math.random().toString()}
                        className={cn(
                          "flex w-full",
                          msg.role === 'user' ? "justify-end" : "justify-start"
                        )}
                      >
                        <div className={cn(
                          "max-w-[80%] rounded-2xl px-4 py-3 text-sm font-medium leading-relaxed shadow-sm",
                          msg.role === 'user'
                            ? "bg-blue-600 text-white rounded-br-none"
                            : "bg-white text-slate-700 border border-slate-100 rounded-bl-none"
                        )}>
                          <ReactMarkdown
                            components={{
                              code: ({ children }) => <span className={cn("font-mono text-xs px-1 py-0.5 rounded mx-1", msg.role === 'user' ? "bg-blue-500 text-blue-100" : "bg-slate-100 text-slate-600")}>{children}</span>
                            }}
                          >
                            {msg.content}
                          </ReactMarkdown>
                        </div>
                      </div>
                    ))}

                    {isChatLoading && (
                      <div className="flex justify-start">
                        <div className="bg-white px-4 py-3 rounded-2xl rounded-bl-none border border-slate-100 shadow-sm flex items-center gap-2">
                          <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
                          <span className="text-xs text-slate-400 font-medium">Thinking...</span>
                        </div>
                      </div>
                    )}
                    <div ref={chatBottomRef} />
                  </div>
                )}

                {/* Input Area - Island Style */}
                <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-2">
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      handleSendMessage();
                    }}
                    className="flex items-center gap-2"
                  >
                    <input
                      type="text"
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      placeholder={chatMessages.length === 0 ? "Ask a follow-up question..." : "Type your question..."}
                      className="flex-1 bg-transparent border-none px-4 py-2 text-sm font-medium text-slate-700 focus:ring-0 placeholder:text-slate-400"
                    />
                    <button
                      type="submit"
                      disabled={!chatInput.trim() || isChatLoading}
                      className="w-8 h-8 flex items-center justify-center rounded-xl bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isChatLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
                    </button>
                  </form>
                </div>
              </motion.div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
