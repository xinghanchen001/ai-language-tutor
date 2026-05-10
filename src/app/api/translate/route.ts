import { NextResponse } from "next/server";
import { translateText, type TranslateLang } from "@/lib/gemini";

const ALLOWED_TARGETS = ["en", "de", "zh"] as const;
const ALLOWED_SOURCES = ["en", "de", "zh", "auto"] as const;
type Target = (typeof ALLOWED_TARGETS)[number];

export async function POST(req: Request) {
  try {
    const { text, targetLang, sourceLang } = await req.json();

    if (!text || typeof text !== "string") {
      return NextResponse.json({ error: "Text is required" }, { status: 400 });
    }
    if (text.length > 5000) {
      return NextResponse.json({ error: "Text too long (max 5000 chars)" }, { status: 400 });
    }
    if (!ALLOWED_TARGETS.includes(targetLang)) {
      return NextResponse.json({ error: "Invalid targetLang" }, { status: 400 });
    }
    const src: TranslateLang = ALLOWED_SOURCES.includes(sourceLang) ? sourceLang : "auto";

    const result = await translateText(text, targetLang as Target, src);
    return NextResponse.json(result);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal server error";
    console.error("Translate API error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
