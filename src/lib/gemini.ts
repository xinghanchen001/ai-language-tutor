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
    let resultText = response.text().trim();

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
