"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { Annotation } from "@/lib/gemini";
import { BookOpen, Lightbulb, Sparkles, MessageSquare } from "lucide-react";

function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

interface AnnotatedSentenceProps {
    sentence: string;
    annotations: Annotation[];
    sentenceIndex: number;
    simplifiedExpression?: string;
    teacherComment?: string;
}

function getAnnotationColor(type: Annotation['type']) {
    const colors = {
        vocabulary: 'bg-orange-100 hover:bg-orange-200 border-b-2 border-orange-400',
        grammar: 'bg-blue-100 hover:bg-blue-200 border-b-2 border-blue-400',
        idiom: 'bg-green-100 hover:bg-green-200 border-b-2 border-green-400',
        structure: 'bg-purple-100 hover:bg-purple-200 border-b-2 border-purple-400'
    };
    return colors[type];
}

function getAnnotationIcon(type: Annotation['type']) {
    const icons = {
        vocabulary: <BookOpen className="w-4 h-4" />,
        grammar: <Sparkles className="w-4 h-4" />,
        idiom: <MessageSquare className="w-4 h-4" />,
        structure: <Lightbulb className="w-4 h-4" />
    };
    return icons[type];
}

function getAnnotationLabel(type: Annotation['type']) {
    const labels = {
        vocabulary: 'Vocabulary',
        grammar: 'Grammar',
        idiom: 'Idiom',
        structure: 'Structure'
    };
    return labels[type];
}

function renderAnnotatedText(
    text: string,
    annotations: Annotation[],
    onAnnotationClick: (index: number) => void
) {
    if (!annotations || annotations.length === 0) {
        return <span>{text}</span>;
    }

    const sorted = [...annotations].sort((a, b) => a.start - b.start);
    const parts: React.ReactElement[] = [];
    let lastIndex = 0;

    sorted.forEach((annotation, idx) => {
        if (annotation.start > lastIndex) {
            parts.push(
                <span key={`text-${idx}`}>{text.slice(lastIndex, annotation.start)}</span>
            );
        }

        parts.push(
            <mark
                key={`annotation-${idx}`}
                onClick={() => onAnnotationClick(idx)}
                className={cn(
                    "cursor-pointer rounded-sm px-0.5 transition-all",
                    getAnnotationColor(annotation.type)
                )}
            >
                {text.slice(annotation.start, annotation.end)}
            </mark>
        );

        lastIndex = annotation.end;
    });

    if (lastIndex < text.length) {
        parts.push(<span key="text-end">{text.slice(lastIndex)}</span>);
    }

    return <>{parts}</>;
}

export default function AnnotatedSentence({
    sentence,
    annotations,
    sentenceIndex,
    simplifiedExpression,
    teacherComment
}: AnnotatedSentenceProps) {
    const [expandedAnnotation, setExpandedAnnotation] = useState<number | null>(null);

    const handleAnnotationClick = (index: number) => {
        setExpandedAnnotation(expandedAnnotation === index ? null : index);
    };

    return (
        <div className="mb-6">
            <div className="text-lg leading-relaxed text-slate-700 font-medium">
                {renderAnnotatedText(sentence, annotations, handleAnnotationClick)}
            </div>

            <AnimatePresence>
                {expandedAnnotation !== null && annotations[expandedAnnotation] && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                    >
                        <div className="mt-3 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-2xl p-5 border border-blue-100 shadow-sm">
                            <div className="flex items-center gap-2 mb-3">
                                <div className={cn(
                                    "w-8 h-8 rounded-lg flex items-center justify-center",
                                    annotations[expandedAnnotation].type === 'vocabulary' && "bg-orange-100 text-orange-600",
                                    annotations[expandedAnnotation].type === 'grammar' && "bg-blue-100 text-blue-600",
                                    annotations[expandedAnnotation].type === 'idiom' && "bg-green-100 text-green-600",
                                    annotations[expandedAnnotation].type === 'structure' && "bg-purple-100 text-purple-600"
                                )}>
                                    {getAnnotationIcon(annotations[expandedAnnotation].type)}
                                </div>
                                <div>
                                    <h4 className="font-bold text-slate-800 text-sm">
                                        "{annotations[expandedAnnotation].text}"
                                    </h4>
                                    <p className="text-xs text-slate-500">
                                        {getAnnotationLabel(annotations[expandedAnnotation].type)}
                                    </p>
                                </div>
                            </div>

                            <p className="text-sm text-slate-700 leading-relaxed mb-3">
                                {annotations[expandedAnnotation].explanation}
                            </p>

                            {annotations[expandedAnnotation].examples && annotations[expandedAnnotation].examples!.length > 0 && (
                                <div className="mt-3 pt-3 border-t border-blue-200">
                                    <p className="text-xs font-bold text-slate-600 mb-2">Examples:</p>
                                    <ul className="space-y-1">
                                        {annotations[expandedAnnotation].examples!.map((example, idx) => (
                                            <li key={idx} className="text-sm text-slate-600 flex items-start gap-2">
                                                <span className="text-blue-400 mt-0.5">•</span>
                                                <span className="flex-1">{example}</span>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Simplified Expression */}
            {simplifiedExpression && (
                <div className="mt-3 bg-green-50 rounded-xl p-4 border border-green-100">
                    <p className="text-xs font-bold text-green-700 mb-2">💡 Simpler way to say it:</p>
                    <p className="text-sm text-green-800 leading-relaxed italic">
                        {simplifiedExpression}
                    </p>
                </div>
            )}

            {/* Teacher Comment */}
            {teacherComment && (
                <div className="mt-3 bg-amber-50 rounded-xl p-4 border border-amber-100">
                    <p className="text-xs font-bold text-amber-700 mb-2">👨‍🏫 Teacher's Note:</p>
                    <p className="text-sm text-amber-800 leading-relaxed">
                        {teacherComment}
                    </p>
                </div>
            )}
        </div>
    );
}
