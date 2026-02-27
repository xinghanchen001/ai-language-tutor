import { NextResponse } from "next/server";
import { chatWithAI } from "@/lib/gemini";

export async function POST(req: Request) {
  try {
    const { context, history, message, originalText } = await req.json();

    if (!context || !message || !originalText) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const result = await chatWithAI(context, history || [], message, originalText);
    return NextResponse.json({ response: result });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal server error";
    console.error("Chat API error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
