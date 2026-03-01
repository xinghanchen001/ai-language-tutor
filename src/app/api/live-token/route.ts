import { NextResponse } from "next/server";

/**
 * Returns the hx-core Cloud Run proxy WebSocket URL and project config.
 * The proxy handles Vertex AI auth — no API keys are sent to the client.
 */
export async function POST() {
  try {
    const proxyBaseUrl = process.env.LIVE_PROXY_URL;

    if (!proxyBaseUrl) {
      throw new Error(
        "LIVE_PROXY_URL is not set. Set it to your hx-core Cloud Run WebSocket endpoint, e.g. wss://hx-core-xxxxx-ew.a.run.app/v1/live-proxy"
      );
    }

    return NextResponse.json({
      proxyUrl: proxyBaseUrl,
      projectId: process.env.GCP_PROJECT_ID || "",
      location: process.env.LIVE_PROXY_LOCATION || "us-central1",
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Configuration error";
    console.error("Live config error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
