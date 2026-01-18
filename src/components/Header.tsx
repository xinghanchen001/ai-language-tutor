import { Menu, X, ClipboardPaste } from "lucide-react";
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
    resetApp
}: HeaderProps) {
    return (
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
                {/* Mode Toggle */}
                <div className="flex items-center bg-blue-900/40 p-1 rounded-lg border border-blue-800/50 flex-1 max-w-md shadow-inner">
                    <button
                        onClick={() => {
                            if (mode !== 'correction') {
                                setMode('correction');
                                onReset?.(); // Trigger reset logic if passed, or handle in parent via setMode effect? 
                                // Parent acts on setMode usually, but precise reset logic was "setInput(''); setOutput(null)..."
                                // Ideally parent handles the side effects of mode change.
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
                                onReset?.();
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
                        resetApp();
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
    );
}
