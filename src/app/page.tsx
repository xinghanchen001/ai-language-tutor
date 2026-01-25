"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
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
import {
  correctText,
  CorrectionResult,
  chatWithAI,
  ExplanationResult,
  explainText,
} from "@/lib/gemini";
import { cn } from "@/lib/utils";
import { CorrectionEntry, ExplanationEntry, ChatMessage } from "@/types";

// Components
import Header from "@/components/Header";
import HistorySidebar from "@/components/HistorySidebar";
import InputArea from "@/components/InputArea";
import OutputDisplay from "@/components/OutputDisplay";
import ChatInterface from "@/components/ChatInterface";

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

  // Handle Electron Clipboard Events
  useEffect(() => {
    const handleFocus = async () => {
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

  useEffect(() => {
    if (typeof window !== 'undefined' && window.electron) {
      window.electron.onClipboardText((text) => {
        if (text) {
          setMode('correction');
          setInput(text);
          handleCorrect(text, 'correction');
        }
      });
      if (window.electron.onClipboardTextExplanation) {
        window.electron.onClipboardTextExplanation((text) => {
          if (text) {
            setMode('explanation');
            setInput(text);
            handleCorrect(text, 'explanation');
          }
        });
      }
    }
  }, []);

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
  }, [mode]);

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
          setCurrentCorrectionId(docRef.id);

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
      setMode('correction');
      setOutput({
        corrected: item.corrected,
        mistakes: item.mistakes || "No analysis available.",
        knowledge: item.knowledge || "No specific knowledge points available.",
        detectedLanguage: item.language,
        original: item.original
      });
      setExplanationOutput(null);
    } else {
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
      await addDoc(collection(db, "corrections", currentCorrectionId, "messages"), {
        role: 'user',
        content: userMsgText,
        timestamp: serverTimestamp()
      });

      const apiHistory = chatMessages.map(m => ({ role: m.role, content: m.content }));
      const currentContext = mode === 'correction' ? output! : explanationOutput!;

      // Adaptation needed: chatWithAI expects proper context type.
      // Current implementation in lib/gemini handles ExplanationResult? 
      // Let's assume chatWithAI is generic enough or I'll check it. 
      // Existing code passed currentContext (output | explanationOutput).

      const aiResponseText = await chatWithAI(currentContext, apiHistory, userMsgText, currentOriginalText);

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

  const deleteHistoryItem = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const collectionName = mode === 'correction' ? 'corrections' : 'explanations';
      await deleteDoc(doc(db, collectionName, id));
      setHistory(prev => prev.filter(item => item.id !== id));
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

  const resetApp = () => {
    setInput("");
    setOutput(null);
    setExplanationOutput(null);
    setChatMessages([]);
    setCurrentCorrectionId(null);
    setErrorMessage(null);
  }

  return (
    <main className="min-h-screen bg-[#F0F4F8] selection:bg-blue-100 flex flex-col">
      <Header
        mode={mode}
        setMode={setMode}
        isMobileMenuOpen={isMobileMenuOpen}
        setIsMobileMenuOpen={setIsMobileMenuOpen}
        autoPasteEnabled={autoPasteEnabled}
        setAutoPasteEnabled={setAutoPasteEnabled}
        resetApp={resetApp}
      />

      <div className="flex relative flex-1 overflow-hidden">
        <HistorySidebar
          isOpen={isMobileMenuOpen}
          onClose={() => setIsMobileMenuOpen(false)}
          history={history}
          loadHistory={fetchHistory}
          loadHistoryItem={loadHistoryItem}
          deleteHistoryItem={deleteHistoryItem}
          languageFilter={languageFilter}
          setLanguageFilter={setLanguageFilter}
          loadingMore={loadingMore}
          hasMore={hasMore}
        />

        <div className="flex-1 w-full min-h-[calc(100vh-73px)]">
          <div className="max-w-6xl mx-auto px-4 md:px-8 py-10 space-y-8">
            <div className={cn(
              "grid grid-cols-1 gap-6 transition-all duration-300",
              (output || explanationOutput) ? "md:grid-cols-2" : "md:grid-cols-1"
            )}>
              <div className="order-2 md:order-1 h-full">
                <InputArea
                  input={input}
                  setInput={setInput}
                  handleCorrect={handleCorrect}
                  loading={loading}
                  showAutoPasteToast={showAutoPasteToast}
                  apiKeyMissing={apiKeyMissing}
                  setApiKeyMissing={setApiKeyMissing}
                />
              </div>

              <div className="order-1 md:order-2 h-full">
                <OutputDisplay
                  mode={mode}
                  output={output}
                  explanationOutput={explanationOutput}
                  copyToClipboard={copyToClipboard}
                  copied={copied}
                  onRetry={() => handleCorrect()}
                />
              </div>
            </div>

            {(output || explanationOutput) && (
              <ChatInterface
                messages={chatMessages}
                input={chatInput}
                setInput={setChatInput}
                sendMessage={handleSendMessage}
                loading={isChatLoading}
                disabled={!currentCorrectionId}
              />
            )}
            {errorMessage && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded relative" role="alert">
                <strong className="font-bold">Error: </strong>
                <span className="block sm:inline">{errorMessage}</span>
                <span className="absolute top-0 bottom-0 right-0 px-4 py-3" onClick={() => setErrorMessage(null)}>
                  <svg className="fill-current h-6 w-6 text-red-500" role="button" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><title>Close</title><path d="M14.348 14.849a1.2 1.2 0 0 1-1.697 0L10 11.819l-2.651 3.029a1.2 1.2 0 1 1-1.697-1.697l2.758-3.15-2.759-3.152a1.2 1.2 0 1 1 1.697-1.697L10 8.183l2.651-3.031a1.2 1.2 0 1 1 1.697 1.697l-2.758 3.152 2.758 3.15a1.2 1.2 0 0 1 0 1.698z" /></svg>
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
