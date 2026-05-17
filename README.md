# IPM Platform — Integrated Personality Modeling

A dialog-native neurochemical personality profiling tool with persistent storage.

## Full Cost Breakdown

| Component | Cost |
|-----------|------|
| **Hosting** — Vercel free tier | $0/mo |
| **Database** — Supabase free tier | $0/mo |
| **LLM** — DeepSeek-V3 | ~$0.005 per profile |
| **Domain** (optional) | $0–12/yr |
| **Total for ~1,000 profiles/month** | **~$5/mo** |

---

## Deploy in 10 Minutes

### Step 1: DeepSeek API Key

1. Go to [platform.deepseek.com](https://platform.deepseek.com)
2. Create account → API Keys → Create new key
3. Top up $2–5

### Step 2: Supabase Database (Free)

1. Go to [supabase.com](https://supabase.com) → Start your project
2. Create a new project (remember your database password)
3. Once created, go to **SQL Editor** → New Query
4. Paste the contents of `supabase-schema.sql` → Run
5. Go to **Settings → API** and copy:
   - Project URL (`https://xxx.supabase.co`)
   - `anon` public key
   - `service_role` secret key
6. Go to **Authentication → Settings** and:
   - Enable email/password sign-in (enabled by default)
   - Optionally disable email confirmation for testing

### Step 3: Push to GitHub

```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/YOUR_USERNAME/ipm-platform.git
git branch -M main
git push -u origin main
```

### Step 4: Deploy to Vercel

1. Go to [vercel.com](https://vercel.com) → Import your repo
2. Add these environment variables:
   - `DEEPSEEK_API_KEY` — your DeepSeek key
   - `NEXT_PUBLIC_SUPABASE_URL` — your Supabase project URL
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` — anon key
   - `SUPABASE_SERVICE_ROLE_KEY` — service role key
3. Click **Deploy**

---

## Run Locally

```bash
npm install
cp .env.example .env.local
# Fill in all 4 keys in .env.local
npm run dev
# Open http://localhost:3000
```

---

## Architecture

```
┌──────────────┐     ┌──────────────────┐     ┌─────────────┐
│   Browser    │────▶│  Vercel Edge API  │────▶│  DeepSeek   │
│  (React UI)  │     │  /api/chat        │     │  API (V3)   │
│              │     │  /api/simulate    │     └─────────────┘
│  Supabase JS │────▶│  /api/profiles    │────▶┌─────────────┐
│  (Auth)      │     │                   │     │  Supabase   │
└──────────────┘     └──────────────────┘     │  PostgreSQL │
                                               │  + Auth     │
                                               └─────────────┘
```

## What Gets Stored

| Table | Purpose |
|-------|---------|
| `profiles` | Completed neurochemical profiles (estimates, archetype, cascades, interventions) |
| `conversations` | Full chat history for each session (enables Bayesian updates) |
| `profile_snapshots` | Point-in-time estimates (tracks how profile evolves with micro-checkins) |

Row Level Security ensures users can only access their own data.

---

## Supabase Free Tier Limits

- 500 MB database storage
- 50,000 monthly active users
- 2 GB file storage
- 5 GB bandwidth
- Unlimited API requests

More than enough for thousands of profiles.

---

## Swapping LLM Providers

Edit `app/api/chat/route.js` and `app/api/simulate/route.js`:

| Provider | Endpoint | Model | Cost |
|----------|----------|-------|------|
| **DeepSeek** (default) | `api.deepseek.com/chat/completions` | `deepseek-chat` | $0.14/$0.28 per M tokens |
| **Groq** (free tier) | `api.groq.com/openai/v1/chat/completions` | `llama-3.1-70b-versatile` | Free (rate limited) |
| **Together AI** | `api.together.xyz/v1/chat/completions` | `meta-llama/Llama-3-70b-chat-hf` | $0.90/M tokens |
| **OpenRouter** | `openrouter.ai/api/v1/chat/completions` | Any model | Varies |

---

## Project Structure

```
ipm-platform/
├── app/
│   ├── api/
│   │   ├── chat/route.js              # LLM proxy (profiling)
│   │   ├── simulate/route.js          # LLM proxy (scenarios)
│   │   └── profiles/
│   │       ├── route.js               # List, save, update profiles
│   │       └── [id]/route.js          # Get single profile + history
│   ├── globals.css
│   ├── layout.jsx
│   └── page.jsx                       # Full app (auth + UI)
├── lib/
│   └── supabase.js                    # Supabase client helper
├── supabase-schema.sql                # Run this in Supabase SQL Editor
├── .env.example
├── .gitignore
├── next.config.js
├── package.json
└── README.md
```
