import { NextResponse } from "next/server";
import { correctText } from "@/lib/gemini";

export async function POST(req: Request) {
  try {
    const { text } = await req.json();

    if (!text || typeof text !== "string") {
      return NextResponse.json({ error: "Text is required" }, { status: 400 });
    }

    const result = await correctText(text);
    return NextResponse.json(result);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal server error";
    console.error("Correct API error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
