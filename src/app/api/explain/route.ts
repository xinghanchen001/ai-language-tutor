import { NextResponse } from "next/server";
import { explainText } from "@/lib/gemini";

export async function POST(req: Request) {
  try {
    const { text } = await req.json();

    if (!text || typeof text !== "string") {
      return NextResponse.json({ error: "Text is required" }, { status: 400 });
    }

    const result = await explainText(text);
    return NextResponse.json(result);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal server error";
    console.error("Explain API error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
