import { GoogleGenerativeAI } from "@google/generative-ai";

const apiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY || "";
const genAI = new GoogleGenerativeAI(apiKey);

export const model = genAI.getGenerativeModel({
  model: "gemini-2.0-flash"
});


export interface CorrectionResult {
  corrected: string;
  mistakes: string;
  knowledge: string;
  detectedLanguage: 'en' | 'de';
}

export async function correctText(text: string): Promise<CorrectionResult> {
  if (!apiKey) {
    throw new Error("Gemini API Key is missing. Please add NEXT_PUBLIC_GEMINI_API_KEY to your .env file.");
  }

  console.log(`Attempting correction with auto-detection...`);

  try {
    const prompt = `
      You are a world-class linguistic expert and language tutor (German/English).
      
      Your Goal:
      Korrigiere die Ausdrücke, die ich falsch verwendet habe und die Grammatik, die ich falsch verwendet habe. Es wird zusätzliche Beispiele und Kenntnisse liefern, um ein tieferes Verständnis der Sprachkonzepte zu ermöglichen. Das GPT wird einen einfachen und direkten Ansatz beibehalten und sein Feedback mit relevanten Beispielen anreichern, die helfen, die sprachlichen Punkte zu klären und zu erklären. Ziel ist es, die Lernerfahrung zu verbessern, indem es den Nutzern ermöglicht, die Nuancen der deutschen Sprache durch praktische Veranschaulichung zu begreifen.

      Task:
      1. Detect whether the input text is in English or German.
      2. Correct the text for grammar, punctuation, and style.
      3. Analyze the specific mistakes (grammar, vocabulary, false friends). Explain WHY it is wrong.
      4. Provide "Knowledge Drops":
         - Relevant grammar rules.
         - Vocabulary nuances.
         - **Important**: Provide 2-3 full sentence examples for each key correction or rule to demonstrate correct usage.

      Language Rule: 
      - If detected language is German -> Output all analysis/feedback in German.
      - If detected language is English -> Output all analysis/feedback in English.

      Formatting Instructions:
      - Use **Markdown** for all text.
      - Use **bold** for key terms or rules.
      - Use \`code blocks\` (backticks) for all examples, quoted text, or specific words being corrected. This is crucial for UI rendering. 
      - Use bullet points (-) for lists.
      - **CRITICAL**: Use double newlines (\n\n) to separate different errors or knowledge points.

      RETURN JSON ONLY. Do not use Markdown code blocks for the JSON itself. strict JSON format:
      {
        "detectedLanguage": "en" or "de",
        "corrected": "The fully corrected text",
        "mistakes": "Detailed analysis. Use **bold** and \`examples\`.",
        "knowledge": "Deep dive. Use **bold** for rules and \`examples\` for sentences."
      }

      Text to correct: "${text}"
    `;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const responseText = response.text();

    if (typeof responseText !== 'string') {
      throw new Error("Gemini returned non-string response");
    }

    let resultText = responseText.trim();

    // Cleanup if Gemini wraps in markdown code blocks
    if (resultText.startsWith("```json")) {
      resultText = resultText.replace(/^```json/, "").replace(/```$/, "").trim();
    } else if (resultText.startsWith("```")) {
      resultText = resultText.replace(/^```/, "").replace(/```$/, "").trim();
    }

    const parsed = JSON.parse(resultText) as CorrectionResult;
    console.log("Correction successful!");
    return parsed;
  } catch (error) {
    console.error("Gemini Error:", error);
    throw error;
  }
}

export async function chatWithAI(context: CorrectionResult | ExplanationResult, history: { role: 'user' | 'model', content: string }[], userMessage: string, originalText: string) {
  if (!apiKey) {
    throw new Error("Gemini API Key is missing.");
  }

  const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

  const isCorrection = 'corrected' in context;

  // For explanations, create a summary from sentences
  const explanationSummary = isCorrection
    ? ''
    : (context as ExplanationResult).sentences
      .map(s => s.annotations.map(a => `${a.text}: ${a.explanation}`).join('; '))
      .join(' | ');

  const systemPrompt = `
    You are a helpful language tutor assisting a user who just had their text ${isCorrection ? 'corrected' : 'analyzed'}.
    
    Context:
    - Original Text: "${originalText}"
    ${isCorrection
      ? `- Corrected Text: "${(context as CorrectionResult).corrected}"\n- Analysis: ${(context as CorrectionResult).mistakes}`
      : `- Annotations: ${explanationSummary}`
    }
    
    Your Goal:
    Answer the user's follow-up questions about the ${isCorrection ? 'correction' : 'explanation'}, grammar rules, or vocabulary.
    Be concise, helpful, and use the detected language of the context (${context.detectedLanguage === 'de' ? 'German' : 'English'}).
    
    Formatting:
    - Use Markdown.
    - Keep answers relatively short unless asked for detailed explanations.
  `;

  const chat = model.startChat({
    history: [
      {
        role: "user",
        parts: [{ text: systemPrompt }],
      },
      {
        role: "model",
        parts: [{ text: `Understood. I am ready to answer questions about this specific correction in ${context.detectedLanguage === 'de' ? 'German' : 'English'}.` }],
      },
      ...history.map(msg => ({
        role: msg.role,
        parts: [{ text: msg.content }],
      })),
    ],
  });

  const result = await chat.sendMessage(userMessage);
  const response = await result.response;
  return response.text();
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

export async function explainText(text: string): Promise<ExplanationResult> {
  if (!apiKey) {
    throw new Error("Gemini API Key is missing.");
  }

  console.log(`Attempting explanation...`);

  try {
    const prompt = `
      You are a world-class language tutor (German/English) who explains complex language in simple, clear terms.
      
      Your Goal:
      Split the input text into sentences and identify parts that need explanation in each sentence.
      
      IMPORTANT Rules:
      - Split text into individual sentences
      - For each sentence, identify 2-4 key parts that need explanation (vocabulary, grammar, idioms, structure)
      - Use SIMPLE, everyday language in explanations
      - Avoid heavy linguistic terminology
      - Focus on PRACTICAL understanding

      Task:
      1. Detect whether the input text is in English or German
      2. Split the text into sentences
      3. For each sentence, identify parts to explain:
         - **vocabulary**: Difficult or interesting words
         - **grammar**: Verb tenses, cases, sentence patterns
         - **idiom**: Idiomatic expressions or phrases
         - **structure**: Unusual word order or sentence construction
      4. For each annotation, provide:
         - The exact text to highlight
         - Character position (start and end) within that sentence
         - Type (vocabulary/grammar/idiom/structure)
         - Clear, simple explanation
         - **IMPORTANT**: For vocabulary and idiom types, you MUST provide at least 2 practical examples
         - For grammar and structure types, examples are optional but recommended
      5. For each sentence, also provide:
         - **simplifiedExpression**: Rewrite the sentence in a simpler, easier way (optional, only if the sentence is complex)
         - **teacherComment**: Like a teacher, summarize the key difficulties and important points to note about this sentence
      6. **Language Rule**: 
         - If detected language is German → Output explanations in German
         - If detected language is English → Output explanations in English

      CRITICAL: Return positions relative to each sentence, not the entire text.
      
      RETURN JSON ONLY (no markdown code blocks):
      {
        "detectedLanguage": "en" or "de",
        "sentences": [
          {
            "text": "The full sentence text.",
            "simplifiedExpression": "A simpler way to say the same thing (optional)",
            "teacherComment": "Teacher's summary of key difficulties and points to note",
            "annotations": [
              {
                "text": "word or phrase to highlight",
                "start": 10,
                "end": 25,
                "type": "vocabulary",
                "explanation": "Simple explanation",
                "examples": ["Example 1", "Example 2"]
              }
            ]
          }
        ]
      }

      Text to explain: "${text}"
    `;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const responseText = response.text();

    if (typeof responseText !== 'string') {
      throw new Error("Gemini returned non-string response");
    }

    let resultText = responseText.trim();

    // Cleanup json markdown
    if (resultText.startsWith("```json")) {
      resultText = resultText.replace(/^```json/, "").replace(/```$/, "").trim();
    } else if (resultText.startsWith("```")) {
      resultText = resultText.replace(/^```/, "").replace(/```$/, "").trim();
    }

    const parsed = JSON.parse(resultText) as ExplanationResult;
    console.log("Explanation successful!");
    return parsed;
  } catch (error) {
    console.error("Gemini Explain Error:", error);
    throw error;
  }
}
