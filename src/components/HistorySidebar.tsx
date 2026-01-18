import { History, X, Trash2, Loader2 } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { CorrectionEntry, ExplanationEntry } from "@/types";
import React from "react";

interface HistorySidebarProps {
    isOpen: boolean;
    onClose: () => void;
    history: (CorrectionEntry | ExplanationEntry)[];
    loadHistory: () => void;
    loadHistoryItem: (item: CorrectionEntry | ExplanationEntry) => void;
    deleteHistoryItem: (id: string, e: React.MouseEvent) => void;
    languageFilter: 'all' | 'en' | 'de';
    setLanguageFilter: (lang: 'all' | 'en' | 'de') => void;
    loadingMore: boolean;
    hasMore: boolean;
}

export default function HistorySidebar({
    isOpen,
    onClose,
    history,
    loadHistory,
    loadHistoryItem,
    deleteHistoryItem,
    languageFilter,
    setLanguageFilter,
    loadingMore,
    hasMore
}: HistorySidebarProps) {

    const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
        const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
        if (scrollHeight - scrollTop <= clientHeight + 50) {
            loadHistory();
        }
    };

    // Logic to filter history locally for display (since parent passes full list? Or filtered list? 
    // Page.tsx logic was: "const filteredHistory = history.filter(...)". 
    // We should prob accept filteredHistory from parent OR filter here. 
    // The plan said "history" as prop. Let's filter here for simplicity or assume parent provides filtered one?
    // Let's filter here to match page.tsx logic "const filteredHistory = history.filter..."
    // Wait, if parent passes "history" which is all history, we need to filter.

    const filteredHistory = history.filter(item =>
        languageFilter === 'all' || item.language === languageFilter
    );

    return (
        <>
            {/* Mobile Filter Backdrop */}
            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="fixed inset-0 bg-slate-900/20 backdrop-blur-sm z-30 md:hidden"
                    />
                )}
            </AnimatePresence>

            <aside className={cn(
                "fixed inset-y-0 left-0 bg-white border-r border-blue-100 flex flex-col z-40 transition-transform duration-300 ease-in-out md:translate-x-0 md:static md:w-80 md:h-[calc(100vh-73px)] shadow-2xl md:shadow-none",
                isOpen ? "translate-x-0 w-[85vw]" : "-translate-x-full w-80"
            )}>
                <div className="p-4 md:p-6 border-b border-blue-50 bg-white z-10 sticky top-0 space-y-4 pt- safe-top">
                    <div className="flex items-center justify-between">
                        <h2 className="text-lg font-bold text-blue-900 flex items-center gap-2">
                            <History className="w-5 h-5 text-blue-400" />
                            History
                        </h2>
                        <button onClick={onClose} className="md:hidden p-1 text-slate-400"><X className="w-5 h-5" /></button>
                    </div>

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
                                    onClose();
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
                                    className="absolute top-4 right-4 text-slate-300 hover:text-red-500 md:opacity-0 group-hover:opacity-100 transition-opacity"
                                >
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            </motion.div>
                        ))}
                    </AnimatePresence>

                    {loadingMore && (
                        <div className="flex justify-center py-4">
                            <Loader2 className="w-5 h-5 text-blue-400 animate-spin" />
                        </div>
                    )}

                    {!hasMore && filteredHistory.length > 0 && (
                        <div className="text-center py-4 text-xs text-slate-300 font-medium uppercase tracking-widest">
                            End of History
                        </div>
                    )}
                </div>
            </aside>
        </>
    );
}
