# DeepL Corrector - Architecture Documentation

## Overview

DeepL Corrector is a language learning tool that provides **text correction**, **text explanation**, and **real-time live video tutoring** for German/English. It runs as both a **Next.js web app** and an **Electron desktop app** with global shortcuts.

All AI calls go through **Google Cloud Vertex AI** (server-side). No API keys are exposed to the browser. The live tutoring feature uses a **WebSocket proxy on Cloud Run** to connect to the Gemini Multimodal Live API.

---

## Project Structure

```
deepl/
├── doc/                            # Documentation
├── electron/                       # Electron desktop app
│   ├── main.js                     # Main process, shortcuts, loads Vercel URL
│   └── preload.js                  # IPC bridge (contextIsolation)
│
├── public/
│   ├── mic-processor.js            # AudioWorklet: mic capture, downsample to 16kHz PCM
│   └── pcm-processor.js            # AudioWorklet: AI voice playback queue
│
├── src/
│   ├── app/                        # Next.js App Router
│   │   ├── api/                    # Server-side API routes
│   │   │   ├── correct/route.ts    # POST /api/correct
│   │   │   ├── explain/route.ts    # POST /api/explain
│   │   │   ├── chat/route.ts       # POST /api/chat
│   │   │   └── live-token/route.ts # POST /api/live-token (proxy URL + project config)
│   │   ├── page.tsx                # Main page (text correction/explanation)
│   │   ├── live/page.tsx           # Live Tutor page (real-time video chat)
│   │   ├── layout.tsx              # Root layout
│   │   └── globals.css             # Tailwind styles
│   │
│   ├── components/                 # React UI components
│   │   ├── Header.tsx              # App header, mode toggle, Live nav link
│   │   ├── InputArea.tsx           # Text input with auto-paste
│   │   ├── OutputDisplay.tsx       # Correction diff / explanation display
│   │   ├── AnnotatedSentence.tsx   # Word-level annotation highlights
│   │   ├── ChatInterface.tsx       # Follow-up chat with AI
│   │   └── HistorySidebar.tsx      # Past corrections/explanations
│   │
│   ├── lib/
│   │   ├── gemini.ts               # Vertex AI client (SERVER-SIDE ONLY)
│   │   ├── gemini-live.ts          # Gemini Live WebSocket client + MicrophoneCapture
│   │   ├── audio-playback.ts       # AI voice playback (AudioWorklet, 24kHz→native resample)
│   │   ├── api-client.ts           # Client-side fetch wrapper for /api routes
│   │   ├── firebase.ts             # Firebase/Firestore config
│   │   └── utils.ts                # Utility functions
│   │
│   └── types/
│       ├── gemini.ts               # AI response types (shared by server & client)
│       └── index.ts                # Firestore entry types
│
├── .gcloud/                        # GCP service account (gitignored)
│   └── service-account.json
├── .env.local                      # Environment variables (gitignored)
├── vercel.json                     # Vercel config (region: fra1)
├── next.config.ts                  # Next.js config
├── package.json                    # Dependencies & Electron builder config
└── firebase.json                   # Firebase project config
```

---

## Three Core Features

### 1. Text Correction (`/api/correct`)

Corrects grammar, punctuation, and style for German or English text.

**Flow:**
```
User types text → Browser calls POST /api/correct
                → Next.js API route (server-side)
                → Vertex AI gemini-2.0-flash (europe-west4)
                → Returns JSON: { corrected, mistakes, knowledge, detectedLanguage }
                → Browser displays diff + error analysis + knowledge drops
                → Result saved to Firestore
```

**What it returns:**
- `corrected` — The fully corrected text
- `mistakes` — Detailed analysis of each error with explanations
- `knowledge` — Grammar rules, vocabulary nuances, example sentences
- `detectedLanguage` — Auto-detected `"en"` or `"de"`

### 2. Text Explanation (`/api/explain`)

Breaks text into sentences and annotates vocabulary, grammar, idioms, and structure.

**Flow:**
```
User types text → Browser calls POST /api/explain
                → Next.js API route (server-side)
                → Vertex AI gemini-2.0-flash (europe-west4)
                → Returns JSON: { sentences[], detectedLanguage }
                → Browser renders interactive word-level annotations
                → Result saved to Firestore
```

**What each sentence contains:**
- `annotations[]` — Highlighted words/phrases with type, position, and explanation
- `simplifiedExpression` — Simpler way to say the same thing
- `teacherComment` — Teacher's summary of key difficulties

### 3. Follow-up Chat (`/api/chat`)

After a correction or explanation, users can ask follow-up questions about grammar rules, vocabulary, etc.

### 4. Live Video Tutor (`/live`)

Real-time video chat with a Gemini AI language teacher. The AI sees what the user shows via camera, hears them speak, and responds with voice + text transcripts. It describes objects with vocabulary/adjectives and corrects grammar, vocabulary, and pronunciation.

**Model:** `gemini-live-2.5-flash-native-audio` (Gemini Multimodal Live API)

**Flow:**
```
Browser (/live)
  ├── POST /api/live-token → gets proxy URL + project config
  ├── WebSocket → hx-core Cloud Run proxy → Vertex AI Multimodal Live API
  ├── Camera frames: 1 FPS, 640x480 JPEG (quality 0.5) → sent as base64
  ├── Mic audio: 16kHz mono Int16 PCM → sent as base64 (via AudioWorklet)
  └── AI audio: 24kHz Int16 PCM → resampled to native rate → AudioWorklet playback
```

**Architecture (WebSocket proxy):**
```
Browser                    Cloud Run (europe-west3)          Vertex AI (us-central1)
┌──────────┐  WebSocket    ┌─────────────────────┐  WebSocket  ┌───────────────────────┐
│ /live    │──────────────→│ hx-core proxy       │────────────→│ Gemini Live API       │
│ page.tsx │←──────────────│ (FastAPI + uvicorn)  │←────────────│ BidiGenerateContent   │
│          │  audio/video  │ Adds Authorization   │  audio/text │ gemini-live-2.5-flash │
└──────────┘   + text      │ header from IAM      │             │ -native-audio         │
                           └─────────────────────┘             └───────────────────────┘
```

**Why a WebSocket proxy?** Browsers cannot set custom headers (like `Authorization: Bearer`) on WebSocket connections. The hx-core Cloud Run service acts as a transparent proxy, adding the GCP auth token to the upstream Vertex AI WebSocket.

**Key components:**

| Component | File | Purpose |
|-----------|------|---------|
| Live page | `src/app/live/page.tsx` | UI: camera preview, controls, transcript |
| WebSocket client | `src/lib/gemini-live.ts` | `GeminiLiveClient` + `MicrophoneCapture` classes |
| Audio playback | `src/lib/audio-playback.ts` | `AudioPlaybackManager` — AI voice via AudioWorklet |
| Mic processor | `public/mic-processor.js` | AudioWorklet: downsample native→16kHz, Float32→Int16 |
| PCM processor | `public/pcm-processor.js` | AudioWorklet: queued playback of AI voice chunks |
| Config endpoint | `src/app/api/live-token/route.ts` | Returns proxy URL, project ID, location |

**Features:**
- EN/DE language toggle (reconnects session with new system prompt)
- Mic mute/unmute
- Screen sharing (desktop/Android only — not supported on iOS)
- Camera flip (front/rear)
- Barge-in: user can interrupt AI mid-speech (audio buffer clears instantly)
- Input + output transcription (word-by-word streaming)
- Auto-reconnect with exponential backoff (max 3 retries)
- Mobile: draggable transcript overlay (touch drag to resize 10-80vh)
- Responsive layout: 70/30 video/transcript split on desktop, overlay on mobile

---

## Google AI Studio → Vertex AI Migration

### Before (Google AI Studio)

```
Browser → @google/generative-ai SDK → generativelanguage.googleapis.com
           ↑
     API key exposed in client JS (NEXT_PUBLIC_GEMINI_API_KEY)
```

**Problems:**
- API key visible in browser DevTools (security risk)
- Free tier rate limits (15 RPM) caused 429 errors
- Key could be abused by anyone inspecting the page

### After (Vertex AI) — Current

```
Browser → fetch('/api/correct') → Next.js API Route (server-side)
                                    → @google-cloud/vertexai SDK
                                    → Vertex AI API (europe-west4)
                                    ↑
                              Service account auth (IAM)
                              No API key in browser
```

**What changed:**

| Aspect | Before | After |
|--------|--------|-------|
| SDK | `@google/generative-ai` | `@google-cloud/vertexai` |
| Auth | API key (client-side) | Service account (server-side) |
| Endpoint | `generativelanguage.googleapis.com` | Vertex AI (`europe-west4`) |
| Model | `gemini-1.5-flash` | `gemini-2.0-flash` |
| API calls | Browser → Google directly | Browser → API route → Vertex AI |
| Rate limits | Free tier (15 RPM) | Billing-based (no free tier cap) |
| Key exposure | Yes (NEXT_PUBLIC_) | No (server-side only) |

**Google AI Studio is completely replaced.** The `@google/generative-ai` package has been uninstalled. All AI calls now go through `@google-cloud/vertexai`.

---

## How Vertex AI Connects

### Authentication

Vertex AI uses **GCP service account** authentication, not API keys. The code supports two auth methods depending on the environment:

| Environment | Auth Method | How |
|-------------|-------------|-----|
| **Local dev** | Service account file | `GOOGLE_APPLICATION_CREDENTIALS=.gcloud/service-account.json` |
| **Vercel** | Base64-encoded credentials | `GCP_CREDENTIALS` env var (see Vercel section below) |
| **Cloud Run** | Automatic IAM | No credentials needed — metadata server handles it |

### Local Environment (.env.local)

```
# Vertex AI (text correction/explanation)
GCP_PROJECT_ID=hx-core-488120
GCP_LOCATION=europe-west4
VERTEX_AI_MODEL=gemini-2.0-flash
GOOGLE_APPLICATION_CREDENTIALS=.gcloud/service-account.json

# Live Tutor (WebSocket proxy)
LIVE_PROXY_URL=wss://hx-core-xxxxx.europe-west3.run.app/v1/live-proxy
LIVE_PROXY_LOCATION=us-central1
```

The service account JSON file is shared with the hx-core project (symlinked).

### Initialization (src/lib/gemini.ts)

```typescript
// Vercel: use base64-encoded credentials from env var
// Local: use GOOGLE_APPLICATION_CREDENTIALS file
const googleAuthOptions = process.env.GCP_CREDENTIALS
  ? { credentials: JSON.parse(Buffer.from(process.env.GCP_CREDENTIALS, "base64").toString()) }
  : {};

const vertexAI = new VertexAI({ project: projectId, location, googleAuthOptions });

// JSON mode for structured responses (correction & explanation)
const model = vertexAI.getGenerativeModel({
  model: modelName,
  generationConfig: { responseMimeType: "application/json" },
});

// Standard mode for chat (returns markdown)
const chatModel = vertexAI.getGenerativeModel({ model: modelName });
```

Two model instances:
- `model` with `responseMimeType: "application/json"` — forces valid JSON output for correction/explanation
- `chatModel` without JSON mode — returns markdown for follow-up chat

---

## Vercel Deployment

The web app is hosted on **Vercel** at: https://ai-language-tutor-six.vercel.app/

### Architecture

```
                  Vercel (fra1)                     Google Cloud
                    ┌─────────────────────┐         ┌─────────────────────────┐
                    │                     │         │                         │
Browser ── HTTPS ──→│  Next.js (Vercel)   │── SDK ─→│  Vertex AI              │
                    │  ├── Static pages   │         │  gemini-2.0-flash       │
                    │  ├── /live page     │         │  (europe-west4)         │
                    │  └── API routes     │         └─────────────────────────┘
                    │     (serverless)    │
                    └────────┬────────────┘         ┌─────────────────────────┐
                             │                      │                         │
Browser ── WebSocket ───────────────────────────────│  hx-core Cloud Run      │
                             │                      │  (europe-west3)         │
                    GCP_CREDENTIALS env var          │  ↕ Vertex AI Live API   │
                    (base64-encoded service account) └─────────────────────────┘
```

### Vercel Environment Variables

Set these in **Vercel Dashboard → Settings → Environment Variables**:

| Variable | Value | Notes |
|----------|-------|-------|
| `GCP_PROJECT_ID` | `hx-core-488120` | GCP project ID |
| `GCP_LOCATION` | `europe-west4` | Vertex AI region (Netherlands) |
| `VERTEX_AI_MODEL` | `gemini-2.0-flash` | Model name |
| `GCP_CREDENTIALS` | `(base64 string)` | Service account JSON, base64-encoded |
| `LIVE_PROXY_URL` | `wss://hx-core-xxxxx.europe-west3.run.app/v1/live-proxy` | hx-core Cloud Run WebSocket proxy |
| `LIVE_PROXY_LOCATION` | `us-central1` | Vertex AI region for Live API |

**How to generate `GCP_CREDENTIALS`:**

```bash
base64 -i .gcloud/service-account.json | tr -d '\n'
```

Copy the output and paste it as the `GCP_CREDENTIALS` value in Vercel.

**Important:** Do NOT set `GOOGLE_APPLICATION_CREDENTIALS` on Vercel — there is no file system to read from. The `GCP_CREDENTIALS` env var is decoded in code and passed directly to the SDK.

---

## Electron Desktop App

The app also runs as a macOS desktop app via Electron.

### How It Works

| Mode | Behavior |
|------|----------|
| **Dev** (`npm run dev` + `npm run electron`) | Electron loads `http://localhost:3000` from Next.js dev server |
| **Production** (`npm run dist`) | Electron loads `https://ai-language-tutor-six.vercel.app` (remote Vercel) |

In production, the Electron app is a thin shell — it just opens the Vercel-hosted web app with native macOS shortcuts. No local server, no bundled credentials, no API keys.

### Global Shortcuts (macOS)

| Shortcut | Action |
|----------|--------|
| `Option+Command+C` | Copy selected text → open app → auto-correct |
| `Option+Command+E` | Copy selected text → open app → auto-explain |

---

## Data Flow Summary

### Text Correction / Explanation
```
┌─────────────┐     fetch()      ┌──────────────────┐     SDK      ┌────────────┐
│   Browser    │ ──────────────→ │  API Routes       │ ──────────→ │ Vertex AI  │
│   (React)    │ ←────────────── │  (Next.js server) │ ←────────── │ (GCP)      │
│              │     JSON        │                    │   JSON      │            │
└──────┬───────┘                 └──────────────────┘              └────────────┘
       │
       │ Firestore SDK
       ▼
┌─────────────┐
│  Firebase    │
│  Firestore   │  (history storage)
└─────────────┘
```

### Live Video Tutor
```
┌─────────────┐   WebSocket     ┌──────────────────┐  WebSocket   ┌──────────────┐
│   Browser    │ ──────────────→│  hx-core proxy   │────────────→ │ Vertex AI    │
│   /live page │ ←──────────────│  (Cloud Run)     │←──────────── │ Gemini Live  │
│              │  audio/video   │  + Auth header   │  audio/text  │ API          │
│              │  + transcript  │                  │              │              │
└──────────────┘                └──────────────────┘              └──────────────┘
       │
       │ POST /api/live-token
       ▼
┌──────────────────┐
│  Next.js API     │  (returns proxy URL + project config)
│  (Vercel)        │
└──────────────────┘
```

- **Browser** only talks to `/api/*` routes, Firebase, and the hx-core WebSocket proxy
- **API routes** handle all Vertex AI communication server-side
- **WebSocket proxy** adds auth headers that browsers cannot set
- **No credentials** are exposed to the client
