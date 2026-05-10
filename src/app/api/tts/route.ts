import { NextResponse } from "next/server";
import textToSpeech from "@google-cloud/text-to-speech";
import crypto from "crypto";

function getClientOptions() {
  if (process.env.GCP_CREDENTIALS) {
    try {
      const decoded = Buffer.from(process.env.GCP_CREDENTIALS, "base64").toString();
      const credentials = JSON.parse(decoded);
      return { credentials, projectId: credentials.project_id };
    } catch (e) {
      console.error("[TTS] Failed to parse GCP_CREDENTIALS:", e);
      return {};
    }
  }
  return {};
}

const client = new textToSpeech.TextToSpeechClient({
  ...getClientOptions(),
  fallback: true,
});

const cache = new Map<string, Buffer>();
const MAX_CACHE_ENTRIES = 500;

function cacheKey(text: string, voice: string) {
  return crypto.createHash("sha1").update(`${voice}::${text}`).digest("hex");
}

export async function POST(req: Request) {
  try {
    const { text, voice } = await req.json();

    if (!text || typeof text !== "string") {
      return NextResponse.json({ error: "Text is required" }, { status: 400 });
    }
    if (text.length > 2000) {
      return NextResponse.json({ error: "Text too long (max 2000 chars)" }, { status: 400 });
    }

    const voiceName = (typeof voice === "string" && voice) || "en-US-Neural2-F";
    const key = cacheKey(text, voiceName);

    let audio = cache.get(key);
    if (!audio) {
      const [response] = await client.synthesizeSpeech({
        input: { text },
        voice: { languageCode: "en-US", name: voiceName },
        audioConfig: { audioEncoding: "MP3", speakingRate: 0.95 },
      });
      if (!response.audioContent) {
        return NextResponse.json({ error: "No audio returned" }, { status: 500 });
      }
      audio = Buffer.from(response.audioContent as Uint8Array);

      if (cache.size >= MAX_CACHE_ENTRIES) {
        const firstKey = cache.keys().next().value;
        if (firstKey) cache.delete(firstKey);
      }
      cache.set(key, audio);
    }

    return new NextResponse(new Uint8Array(audio), {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "public, max-age=86400",
        "Content-Length": audio.length.toString(),
      },
    });
  } catch (error: unknown) {
    const err = error as { message?: string; code?: number | string; details?: string };
    console.error("TTS API error:", err?.message, "code:", err?.code, "details:", err?.details);
    return NextResponse.json(
      { error: err?.message || "Internal server error", code: err?.code, details: err?.details },
      { status: 500 }
    );
  }
}
