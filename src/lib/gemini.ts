import { VertexAI } from "@google-cloud/vertexai";
import type { CorrectionResult, ExplanationResult } from "@/types/gemini";

const projectId = process.env.GCP_PROJECT_ID || "";
const location = process.env.GCP_LOCATION || "europe-west3";
const modelName = process.env.VERTEX_AI_MODEL || "gemini-2.5-flash";

// Support both:
// - Local/Electron: GOOGLE_APPLICATION_CREDENTIALS file
// - Vercel: GCP_CREDENTIALS env var (base64-encoded service account JSON)
function getAuthOptions() {
  if (process.env.GCP_CREDENTIALS) {
    try {
      const decoded = Buffer.from(process.env.GCP_CREDENTIALS, "base64").toString();
      const credentials = JSON.parse(decoded);
      console.log(`[Vertex AI] Using GCP_CREDENTIALS env var (client: ${credentials.client_email})`);
      return { credentials };
    } catch (e) {
      console.error("[Vertex AI] Failed to parse GCP_CREDENTIALS:", e);
      return {};
    }
  }
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    console.log(`[Vertex AI] Using GOOGLE_APPLICATION_CREDENTIALS file: ${process.env.GOOGLE_APPLICATION_CREDENTIALS}`);
  } else {
    console.warn("[Vertex AI] No credentials found. Set GCP_CREDENTIALS (Vercel) or GOOGLE_APPLICATION_CREDENTIALS (local).");
  }
  return {};
}

const googleAuthOptions = getAuthOptions();

const vertexAI = new VertexAI({ project: projectId, location, googleAuthOptions });

const model = vertexAI.getGenerativeModel({
  model: modelName,
  generationConfig: { responseMimeType: "application/json" },
});

// Model without JSON mode for chat (returns markdown)
const chatModel = vertexAI.getGenerativeModel({ model: modelName });

// Helper for retry logic
async function retryWithBackoff<T>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000
): Promise<T> {
  let lastError: unknown;

  for (let i = 0; i < maxRetries; i++) {
    try {
      return await operation();
    } catch (error: unknown) {
      lastError = error;

      const message = error instanceof Error ? error.message : String(error);
      const isRetryable = message.includes('429') || message.includes('503');

      if (!isRetryable || i === maxRetries - 1) {
        throw error;
      }

      const delay = baseDelay * Math.pow(2, i);
      console.log(`Vertex AI error, retrying in ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

export async function correctText(text: string): Promise<CorrectionResult> {
  if (!projectId) {
    throw new Error("GCP_PROJECT_ID is missing. Please add it to your .env.local file.");
  }

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
    - **CRITICAL**: Use double newlines (\\n\\n) to separate different errors or knowledge points.

    RETURN JSON ONLY. Do not use Markdown code blocks for the JSON itself. strict JSON format:
    {
      "detectedLanguage": "en" or "de",
      "corrected": "The fully corrected text",
      "mistakes": "Detailed analysis. Use **bold** and \`examples\`.",
      "knowledge": "Deep dive. Use **bold** for rules and \`examples\` for sentences."
    }

    Text to correct: "${text}"
  `;

  const responseText = await retryWithBackoff(async () => {
    const result = await model.generateContent(prompt);
    const response = result.response;
    if (!response.candidates?.[0]?.content?.parts?.[0]?.text) {
      throw new Error("Empty response from Vertex AI");
    }
    return response.candidates[0].content.parts[0].text;
  });

  const parsed = JSON.parse(responseText) as CorrectionResult;
  parsed.original = text;
  return parsed;
}

export async function explainText(text: string): Promise<ExplanationResult> {
  if (!projectId) {
    throw new Error("GCP_PROJECT_ID is missing.");
  }

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

  const responseText = await retryWithBackoff(async () => {
    const result = await model.generateContent(prompt);
    const response = result.response;
    if (!response.candidates?.[0]?.content?.parts?.[0]?.text) {
      throw new Error("Empty response from Vertex AI");
    }
    return response.candidates[0].content.parts[0].text;
  });

  const parsed = JSON.parse(responseText) as ExplanationResult;
  return parsed;
}

export async function chatWithAI(
  context: CorrectionResult | ExplanationResult,
  history: { role: 'user' | 'model', content: string }[],
  userMessage: string,
  originalText: string
): Promise<string> {
  if (!projectId) {
    throw new Error("GCP_PROJECT_ID is missing.");
  }

  const isCorrection = 'corrected' in context;

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

  // Build chat contents for Vertex AI multi-turn
  const contents = [
    { role: "user" as const, parts: [{ text: systemPrompt }] },
    { role: "model" as const, parts: [{ text: `Understood. I am ready to answer questions about this specific correction in ${context.detectedLanguage === 'de' ? 'German' : 'English'}.` }] },
    ...history.map(msg => ({
      role: msg.role === 'model' ? 'model' as const : 'user' as const,
      parts: [{ text: msg.content }],
    })),
    { role: "user" as const, parts: [{ text: userMessage }] },
  ];

  const responseText = await retryWithBackoff(async () => {
    const result = await chatModel.generateContent({ contents });
    const response = result.response;
    if (!response.candidates?.[0]?.content?.parts?.[0]?.text) {
      throw new Error("Empty response from Vertex AI");
    }
    return response.candidates[0].content.parts[0].text;
  });

  return responseText;
}
