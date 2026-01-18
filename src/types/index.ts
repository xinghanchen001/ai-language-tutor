import { Timestamp } from "firebase/firestore";

export interface CorrectionEntry {
    id: string;
    original: string;
    corrected: string;
    mistakes?: string;
    knowledge?: string;
    language: 'en' | 'de';
    timestamp: Timestamp;
}

export interface ExplanationEntry {
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

export interface ChatMessage {
    id?: string;
    role: 'user' | 'model';
    content: string;
    timestamp?: any;
}
