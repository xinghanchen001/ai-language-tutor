import { Check, Copy, RotateCcw, BookOpen } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import * as Diff from "diff";
import { cn } from "@/lib/utils";
import AnnotatedSentence from "@/components/AnnotatedSentence";
import { Fragment } from "react";
import { CorrectionResult, ExplanationResult } from "@/lib/gemini";

interface OutputDisplayProps {
    mode: 'correction' | 'explanation';
    output: CorrectionResult | null;
    explanationOutput: ExplanationResult | null;
    copyToClipboard: () => void;
    copied: boolean;
    onRetry: () => void; // For "Try Again" / "Re-generate" if we add that, currently InputArea has the main button.
    // Wait, the "Correction" vs "Explanation" view logic is here.
}

export default function OutputDisplay({
    mode,
    output,
    explanationOutput,
    copyToClipboard,
    copied
}: OutputDisplayProps) {

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

    if (!output && !explanationOutput) return null;

    return (
        <div className="bg-white rounded-3xl shadow-xl shadow-blue-900/5 border border-white overflow-hidden flex flex-col h-full">
            <div className="bg-blue-50/50 p-4 border-b border-blue-100 flex items-center justify-between">
                <label className="text-sm font-bold text-blue-900 flex items-center gap-2">
                    {mode === 'correction' ? (
                        <>
                            <Check className="w-4 h-4 text-green-500" />
                            Optimized Version
                        </>
                    ) : (
                        <>
                            <BookOpen className="w-4 h-4 text-blue-500" />
                            Detailed Explanation
                        </>
                    )}
                </label>
                <div className="flex items-center gap-2">
                    {mode === 'correction' && (
                        <button
                            onClick={copyToClipboard}
                            className="p-2 hover:bg-white rounded-xl text-blue-400 hover:text-blue-600 transition-all active:scale-95"
                            title="Copy to clipboard"
                        >
                            {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                        </button>
                    )}
                </div>
            </div>

            <div className="p-6 overflow-y-auto custom-scrollbar flex-1 relative">
                {mode === 'correction' && output && (
                    <div className="prose prose-slate max-w-none">
                        <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 mb-6 leading-relaxed text-lg">
                            {renderDiff(output.original, output.corrected)}
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="bg-red-50/50 p-5 rounded-2xl border border-red-50">
                                <h3 className="text-xs font-black text-red-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                                    <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
                                    Mistakes Found
                                </h3>
                                <ul className="space-y-2">
                                    {output.mistakes.split('\n').map((mistake, i) => (
                                        <li key={i} className="text-sm text-slate-600 flex gap-2">
                                            <span className="text-red-400 font-bold">•</span>
                                            {mistake.replace(/^- /, '')}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                            <div className="bg-blue-50/50 p-5 rounded-2xl border border-blue-50">
                                <h3 className="text-xs font-black text-blue-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                                    <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                                    Key Improvements
                                </h3>
                                <ul className="space-y-2">
                                    {output.knowledge.split('\n').map((point, i) => (
                                        <li key={i} className="text-sm text-slate-600 flex gap-2">
                                            <span className="text-blue-400 font-bold">•</span>
                                            {point.replace(/^- /, '')}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        </div>
                    </div>
                )}

                {mode === 'explanation' && explanationOutput && (
                    <div className="space-y-6">
                        {explanationOutput.sentences.map((sentence, index) => (
                            <AnnotatedSentence
                                key={index}
                                sentence={sentence.text}
                                annotations={sentence.annotations}
                                sentenceIndex={index}
                                simplifiedExpression={sentence.simplifiedExpression}
                                teacherComment={sentence.teacherComment}
                            />
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
