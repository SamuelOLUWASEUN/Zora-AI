# Zora

**Privacy-First AI Concierge** — Google/Kaggle AI Agents Capstone Hackathon

> Your AI concierge runs on on-device context. Contacts, notes, and personal data
> never leave the browser session. The AI processes *intent* server-side — never raw personal data.

---

## Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 14 (App Router, TypeScript) |
| AI (default) | Groq — `llama-3.3-70b-versatile` |
| AI (fallback) | Gemini 2.5 Flash |
| Rate Limiting | Upstash Redis — sliding window, per IP |
| Database | Supabase + Postgres RLS |
| Voice | Web Speech API (`webkitSpeechRecognition`) |
| Auth | Supabase Auth (SSR) |

---

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Set up environment variables
cp .env.example .env.local
# Fill in your keys in .env.local

# 3. Run Supabase SQL schema
# Copy the SQL from lib/supabase.ts and run it in your Supabase SQL editor

# 4. Start dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `AI_PROVIDER` | Yes | `groq` or `gemini` |
| `GROQ_API_KEY` | If Groq | From console.groq.com |
| `GEMINI_API_KEY` | If Gemini | From aistudio.google.com |
| `UPSTASH_REDIS_REST_URL` | Yes | From console.upstash.com |
| `UPSTASH_REDIS_REST_TOKEN` | Yes | From console.upstash.com |
| `SUPABASE_URL` | Yes | From supabase.com project settings |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | From supabase.com project settings |
| `DEV_USER_ID` | Dev only | Replace with real `auth.uid()` in production |

**Security rule:** No private key ever has a `NEXT_PUBLIC_` prefix. All credentials stay server-side.

---

## Architecture

```
shieldvault/
├── app/
│   ├── api/
│   │   ├── agent/route.ts      ← AI handler (rate limited, provider-agnostic)
│   │   └── contacts/route.ts   ← Contact CRUD (Supabase RLS isolated)
│   ├── globals.css
│   ├── layout.tsx
│   └── page.tsx
├── components/
│   ├── ChatInterface.tsx        ← Core UI (voice, lockdown, dialer, torch)
│   └── ContactImporter.tsx     ← Picker API + manual modal fallback
├── lib/
│   ├── ai.ts                   ← Groq/Gemini abstraction (swap with one env var)
│   ├── intent.ts               ← Client-side regex intent detection
│   ├── ratelimit.ts            ← Upstash sliding window
│   └── supabase.ts             ← Server-only Supabase client + SQL schema
└── types/
    └── index.ts                ← Shared TypeScript interfaces
```

---

## Core Features

### 1. Voice → Intent Pipeline
- Hold mic button to record
- `interimResults: true` streams partial speech as italic monospace ticker in real-time
- `isFinal` locks text into textarea and fires to backend
- Full error handling for `not-allowed`, `no-speech`, `network`

### 2. Contacts + Dialer
- Say "Call [name]" → client detects intent → queries `/api/contacts`
- Bottom-sheet dial confirmation overlay before any `tel:` redirect
- Contact Importer: Android Picker API where supported, manual form everywhere else

### 3. Lockdown Mode
- Toggle in header → red border + banner across entire UI
- Any input short-circuits before fetch: static security message fires, no LLM call made
- Visual state: shell outlined in red, lockdown banner pulses

### 4. Torch / Screen Flash
- Tries `getUserMedia` + `applyConstraints({ torch: true })`
- Catches silently if rejected → full-viewport white flash for 3 seconds
- Amber notice strip: "Hardware torch overridden by browser policy"

### 5. AI Provider Switch
- One env var: `AI_PROVIDER=groq|gemini`
- Zero code changes needed to switch providers
- Both providers share identical system prompt and response shape

---

## Rate Limiting

- 20 requests per 60 seconds per IP (sliding window)
- Returns `429` with `Retry-After` header on breach
- Upstash Redis — no cold start latency

---

## Database Security

All tables enforce Postgres RLS:
```sql
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id)
```
User A cannot read, write, or delete User B's data under any circumstance.

---

## Deployment (Vercel)

```bash
# Deploy
vercel --prod

# Set environment variables in Vercel dashboard
# (Project Settings → Environment Variables)
# Never use the CLI for secrets — use the dashboard
```

---

## Git Workflow

```bash
git init
git add .
git commit -m "feat: Zora Phase 1"
git remote add origin https://github.com/SamuelOLUWASEUN/shieldvault.git
git push -f origin main
```
