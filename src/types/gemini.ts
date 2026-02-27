export interface CorrectionResult {
  corrected: string;
  mistakes: string;
  knowledge: string;
  detectedLanguage: 'en' | 'de';
  original: string;
}

export interface Annotation {
  text: string;
  start: number;
  end: number;
  type: 'vocabulary' | 'grammar' | 'idiom' | 'structure';
  explanation: string;
  examples?: string[];
}

export interface SentenceAnnotation {
  text: string;
  annotations: Annotation[];
  simplifiedExpression?: string;
  teacherComment?: string;
}

export interface ExplanationResult {
  detectedLanguage: 'en' | 'de';
  sentences: SentenceAnnotation[];
}
