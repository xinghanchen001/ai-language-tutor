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
      You are an expert linguistic editor and German/English tutor.
      
      Task:
      1. Detect whether the input text is in English or German.
      2. Correct the text for grammar, punctuation, and style.
      3. Analyze the specific mistakes made by the user.
      4. Provide educational "knowledge drops" (grammar rules, vocabulary nuances) relevant to the errors.

      RETURN JSON ONLY. Do not use Markdown code blocks. strict JSON format:
      {
        "detectedLanguage": "en" or "de",
        "corrected": "The fully corrected text",
        "mistakes": "Short concise analysis of 2-3 key errors...",
        "knowledge": "1-2 helpful grammar rules or vocabulary tips..."
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
