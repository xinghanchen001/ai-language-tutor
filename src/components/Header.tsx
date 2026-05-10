import Link from "next/link";
import { Menu, X, ClipboardPaste, Video, Languages } from "lucide-react";
import { cn } from "@/lib/utils";

interface HeaderProps {
    mode: 'correction' | 'explanation';
    setMode: (mode: 'correction' | 'explanation') => void;
    isMobileMenuOpen: boolean;
    setIsMobileMenuOpen: (open: boolean) => void;
    autoPasteEnabled: boolean;
    setAutoPasteEnabled: (enabled: boolean) => void;
    resetApp: () => void;
    onReset?: () => void;
}

export default function Header({
    mode,
    setMode,
    isMobileMenuOpen,
    setIsMobileMenuOpen,
    autoPasteEnabled,
    setAutoPasteEnabled,
    resetApp,
    onReset
}: HeaderProps) {
    const handleModeChange = (next: 'correction' | 'explanation') => {
        if (mode !== next) {
            setMode(next);
            onReset?.();
        }
    };

    return (
        <nav
            className="bg-[#031830] border-b border-blue-900 px-3 md:px-6 h-14 md:h-16 flex items-center justify-between sticky top-0 z-50 shadow-md gap-2 md:gap-4"
            style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
        >
            {/* Brand */}
            <div className="flex items-center gap-2 md:gap-3 flex-shrink-0">
                <button
                    onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                    aria-label={isMobileMenuOpen ? "Close menu" : "Open menu"}
                    className="md:hidden w-8 h-8 flex items-center justify-center text-blue-300 hover:bg-blue-900 hover:text-white rounded-lg transition-colors"
                    style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
                >
                    {isMobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
                </button>

                <div className="hidden md:flex items-center gap-2">
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center overflow-hidden flex-shrink-0">
                        <img
                            src="./logo.png"
                            alt="DeepL Corrector"
                            className="w-full h-full object-contain scale-125"
                            style={{ mixBlendMode: 'multiply' } as React.CSSProperties}
                        />
                    </div>
                    <div className="leading-tight">
                        <h1 className="text-base lg:text-lg font-bold text-white tracking-tight">
                            DeepL <span className="text-blue-400 font-medium">Corrector</span>
                        </h1>
                        <p className="hidden lg:block text-[10px] text-blue-300/80 font-semibold uppercase tracking-wider">
                            AI Powered Linguistic Perfection
                        </p>
                    </div>
                </div>
            </div>

            {/* Right cluster */}
            <div
                className="flex items-center gap-1.5 md:gap-2 flex-1 justify-end min-w-0"
                style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
            >
                {/* Mode Toggle: Correct / Explain */}
                <div
                    role="tablist"
                    aria-label="Mode"
                    className="flex items-center bg-blue-900/40 p-0.5 rounded-lg border border-blue-800/50 shadow-inner h-8 flex-shrink min-w-0 max-w-[14rem]"
                >
                    <button
                        role="tab"
                        aria-selected={mode === 'correction'}
                        onClick={() => handleModeChange('correction')}
                        className={cn(
                            "h-7 px-2.5 md:px-4 rounded-md text-xs md:text-sm font-bold transition-all whitespace-nowrap",
                            mode === 'correction'
                                ? "bg-blue-600 text-white shadow-sm"
                                : "text-blue-300 hover:text-blue-100 hover:bg-blue-800/50"
                        )}
                    >
                        Correct
                    </button>
                    <button
                        role="tab"
                        aria-selected={mode === 'explanation'}
                        onClick={() => handleModeChange('explanation')}
                        className={cn(
                            "h-7 px-2.5 md:px-4 rounded-md text-xs md:text-sm font-bold transition-all whitespace-nowrap",
                            mode === 'explanation'
                                ? "bg-blue-600 text-white shadow-sm"
                                : "text-blue-300 hover:text-blue-100 hover:bg-blue-800/50"
                        )}
                    >
                        Explain
                    </button>
                </div>

                {/* Divider */}
                <div className="hidden sm:block w-px h-5 bg-blue-800/60 mx-0.5" aria-hidden="true" />

                {/* Translate */}
                <Link
                    href="/translate"
                    title="Translate"
                    className="h-8 inline-flex items-center gap-1.5 px-2.5 md:px-3 rounded-lg text-xs font-bold bg-purple-500/15 text-purple-300 border border-purple-500/30 hover:bg-purple-500/25 hover:text-purple-200 transition-colors"
                >
                    <Languages className="w-3.5 h-3.5 flex-shrink-0" />
                    <span className="hidden md:inline">Translate</span>
                </Link>

                {/* Live */}
                <Link
                    href="/live"
                    title="Live tutor"
                    className="h-8 inline-flex items-center gap-1.5 px-2.5 md:px-3 rounded-lg text-xs font-bold bg-green-500/15 text-green-300 border border-green-500/30 hover:bg-green-500/25 hover:text-green-200 transition-colors"
                >
                    <Video className="w-3.5 h-3.5 flex-shrink-0" />
                    <span className="hidden md:inline">Live</span>
                </Link>

                {/* Auto Paste (md+) */}
                <button
                    type="button"
                    onClick={() => setAutoPasteEnabled(!autoPasteEnabled)}
                    title={autoPasteEnabled ? "Auto-paste: ON" : "Auto-paste: OFF"}
                    aria-pressed={autoPasteEnabled}
                    className={cn(
                        "hidden md:inline-flex items-center gap-1.5 h-8 px-2.5 lg:px-3 rounded-lg text-xs font-bold transition-colors border",
                        autoPasteEnabled
                            ? "bg-blue-500/20 text-blue-200 border-blue-500/40 hover:bg-blue-500/30"
                            : "bg-transparent text-blue-400/70 border-blue-800/60 hover:text-blue-200 hover:border-blue-700"
                    )}
                >
                    <ClipboardPaste className="w-3.5 h-3.5 flex-shrink-0" />
                    <span className="hidden lg:inline">Auto-Paste</span>
                    <span
                        className={cn(
                            "w-1.5 h-1.5 rounded-full transition-colors",
                            autoPasteEnabled
                                ? "bg-green-400 shadow-[0_0_6px_rgba(74,222,128,0.6)]"
                                : "bg-blue-700"
                        )}
                        aria-hidden="true"
                    />
                </button>

                {/* Close / Reset */}
                <button
                    type="button"
                    onClick={() => {
                        resetApp();
                        if (typeof window !== 'undefined' && window.electron) window.electron.hideWindow();
                    }}
                    title="Close and reset"
                    aria-label="Close and reset"
                    className="w-8 h-8 flex items-center justify-center rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500 hover:text-white transition-colors border border-transparent hover:border-red-500/50"
                >
                    <X className="w-4 h-4" />
                </button>
            </div>
        </nav>
    );
}
