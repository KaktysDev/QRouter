# QCI OpenRouter

**Unified quantum compute routing.** Authenticate once with Google, vault a card with Stripe, upload quantum source, and route workloads to any supported physical QPU or the Vultr GPU simulator — with a fixed-price quote captured upfront and a 100% refund window while the job is queued.

Built with **Next.js 15 (App Router) · TypeScript · Tailwind CSS 4 · Supabase (Postgres + Auth + Storage) · Stripe**. Designed to deploy on **Vercel**.

---

## How it works

```
Landing (/)  ──Google OAuth──▶  Onboarding (/onboarding)  ──▶  Dashboard (/dashboard)
                                 Stripe Elements card vault        ├─ Get Started
                                 or "Skip and fill this later"     ├─ Submit Task   (upload → quote → Run)
                                                                   ├─ Tasks         (live queue, cancel, results)
                                                                   └─ Settings      (remove billing connection)
```

**The financial state machine** (the core of the platform):

1. **Billing gate** — clicking *Run Task* with no vaulted card halts execution and injects a mandatory payment modal. The server enforces this too (HTTP 402), so it can't be bypassed.
2. **Quote** — the QCI Transpiler estimates gate ops from the uploaded file and produces a fixed quote: provider infrastructure cost + flat Universal Quantum Transpiler Fee. The quote is recomputed **server-side** from the file in storage — the client preview is never trusted.
3. **Upfront capture** — on confirmation, the full quote is captured off-session on the vaulted card and the job enters `queued`.
4. **Cancellation window** — while `queued`, *Cancel Job* drops the vendor ticket and triggers an automatic **100% Stripe refund**.
5. **Processing lockout** — the moment the vendor flips the job to `processing`, the cancel control is wiped from the UI and the transaction is flagged `locked` (non-refundable).
6. **Results** — on `completed`, the result payload lands in a private storage bucket and is served via short-lived signed URLs.

> **Note on vendors:** there is no public sandbox for IBM/Rigetti/IonQ queues, so external vendor behaviour is **simulated** ([src/lib/simulator.ts](src/lib/simulator.ts)) — jobs march through `queued → processing → completed` on wall-clock time while Stripe charges/refunds are fully real (test mode). `SIM_SECONDS_PER_MINUTE` controls the pace (default: one "queue minute" = 2 real seconds, so an 18-minute queue resolves in ~36s). Vultr GPU provisioning has a ready integration point in [src/lib/vultr.ts](src/lib/vultr.ts).

---

## Setup

You need three external services: **Supabase** (database, auth, storage), **Google Cloud** (OAuth identity), and **Stripe** (billing). Do them in this order — Google OAuth needs your Supabase project ref.

### 1 · Supabase

You're on **Supabase Pro** — nothing extra is required for this app, but Pro means your project won't auto-pause, and you can optionally enable *Point-in-Time Recovery* (Project Settings → Add-ons) since this database holds billing audit rows.

1. Go to [supabase.com/dashboard](https://supabase.com/dashboard) → **New project** (pick your Pro org). Choose a strong DB password and a region close to your Vercel deployment region.
2. Once provisioned, open **SQL Editor**, paste the entire contents of [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql), and click **Run**. This creates:
   - `profiles`, `jobs`, `billing_transactions` tables with Row Level Security,
   - a trigger that auto-creates a profile row on signup,
   - two **private** storage buckets: `job-files` (uploads) and `job-results` (outputs), with per-user folder policies.

   *(Alternatively, with the Supabase CLI: `supabase link --project-ref <your-ref>` then `supabase db push`.)*
3. Collect your keys — **Project Settings → API**:
   - Project URL → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon` `public` key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` `secret` key → `SUPABASE_SERVICE_ROLE_KEY` ⚠️ server-only, never expose to the browser or commit it.
4. **Authentication → URL Configuration**:
   - **Site URL**: `http://localhost:3000` for now (switch to your Vercel URL after deploying — step 5).
   - **Redirect URLs**: add both
     - `http://localhost:3000/**`
     - `https://your-app.vercel.app/**` (once you know it)

### 2 · Google Cloud (OAuth)

Google sign-in is brokered by Supabase Auth, so the redirect URI points at **Supabase**, not your app.

1. Go to [console.cloud.google.com](https://console.cloud.google.com) → project picker → **New Project** (e.g. `qci-openrouter`).
2. **APIs & Services → OAuth consent screen** (Google Auth Platform → Branding):
   - User type: **External**.
   - App name, support email, developer contact — fill in and save.
   - Scopes: the defaults are enough (`openid`, `email`, `profile`) — no extra scopes needed.
   - While in **Testing** mode only listed test users can sign in — add your own email(s) under *Test users*, or click **Publish app** to allow anyone.
3. **APIs & Services → Credentials → Create Credentials → OAuth client ID**:
   - Application type: **Web application**.
   - **Authorized JavaScript origins**:
     - `http://localhost:3000`
     - `https://your-app.vercel.app` (add after deploying)
     - `https://<your-project-ref>.supabase.co`
   - **Authorized redirect URIs** (this is the important one):
     - `https://<your-project-ref>.supabase.co/auth/v1/callback`

     Find `<your-project-ref>` in your Supabase project URL, or copy the exact callback URL shown in Supabase's Google provider panel (next step).
   - Create, then copy the **Client ID** and **Client secret**.
4. Back in Supabase: **Authentication → Sign In / Providers → Google** → toggle **Enable**, paste the Client ID and Client secret, save.

That's it — the app's "Continue with Google" button calls `supabase.auth.signInWithOAuth({ provider: "google" })` and lands on `/auth/callback`, which routes new users to `/onboarding` and returning users to `/dashboard`.

### 3 · Stripe

Use **Test mode** until you're ready to charge real cards (toggle top-right in the Stripe dashboard).

1. Go to [dashboard.stripe.com](https://dashboard.stripe.com) → **Developers → API keys**:
   - Publishable key (`pk_test_...`) → `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
   - Secret key (`sk_test_...`) → `STRIPE_SECRET_KEY`
2. **Webhook** (keeps the DB consistent if refunds/setup events happen outside the app — e.g. a refund issued from the Stripe dashboard):
   - **Production:** Developers → Webhooks → **Add endpoint** → URL: `https://your-app.vercel.app/api/stripe/webhook` → select events:
     - `setup_intent.succeeded`
     - `charge.refunded`
     - `payment_intent.payment_failed`
   - Copy the **Signing secret** (`whsec_...`) → `STRIPE_WEBHOOK_SECRET`.
   - **Local dev:** use the [Stripe CLI](https://stripe.com/docs/stripe-cli):
     ```bash
     stripe listen --forward-to localhost:3000/api/stripe/webhook
     ```
     and put the `whsec_...` it prints into `.env.local`.
3. **Testing cards:** in test mode use `4242 4242 4242 4242`, any future expiry, any CVC, any ZIP. Card vaulting (SetupIntent), off-session captures (PaymentIntent) and refunds all show up under **Payments** in the dashboard so you can watch the state machine work.

> No Stripe Products/Prices are needed — quotes are computed per job and charged as one-off PaymentIntents against the customer's vaulted card.

### 4 · Run locally

```bash
cp .env.example .env.local   # fill in the values from steps 1–3
npm install
npm run dev                  # http://localhost:3000
```

Full loop to verify: **Launch Console** → Google sign-in → onboarding (vault `4242...` card, or hit *Skip and fill this later* and get intercepted by the payment gate on your first Run) → **Submit Task** → drop any `.qasm`/`.py`/`.json` file → pick a backend → **Run Task** → watch it in **Tasks**: cancel one while `queued` (refund appears in Stripe), let another reach `processing` (cancel button disappears, transaction locks) and then `completed` (**Fetch Result** downloads the measurement counts JSON).

### 5 · Deploy to Vercel

1. Push this folder to GitHub, then in [vercel.com](https://vercel.com) → **Add New → Project** → import the repo. Next.js is auto-detected; no build settings to change.
2. In the import screen (or later under **Settings → Environment Variables**), add:

   | Variable | Value |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | from Supabase step 3 |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | from Supabase step 3 |
   | `SUPABASE_SERVICE_ROLE_KEY` | from Supabase step 3 (keep secret) |
   | `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | from Stripe step 1 |
   | `STRIPE_SECRET_KEY` | from Stripe step 1 |
   | `STRIPE_WEBHOOK_SECRET` | from Stripe step 2 (production endpoint) |
   | `NEXT_PUBLIC_SITE_URL` | `https://your-app.vercel.app` |
   | `SIM_SECONDS_PER_MINUTE` | `2` (optional) |

3. Deploy, note your production URL, then close the loop:
   - **Supabase** → Authentication → URL Configuration: set **Site URL** to the Vercel URL and make sure `https://your-app.vercel.app/**` is in Redirect URLs.
   - **Google Cloud** → your OAuth client: add the Vercel URL to *Authorized JavaScript origins*.
   - **Stripe** → create/point the webhook endpoint at `https://your-app.vercel.app/api/stripe/webhook` and set that endpoint's signing secret in Vercel.
4. Redeploy if you changed env vars after the first build.

---

## Project structure

```
supabase/migrations/0001_init.sql   Schema, RLS, signup trigger, storage buckets
src/
  middleware.ts                     Session refresh + auth gate for /dashboard, /onboarding
  app/
    page.tsx                        Landing — pulse-animated "Launch Console" → Google OAuth modal
    auth/callback/route.ts          OAuth code exchange → /onboarding or /dashboard
    onboarding/                     Glass billing-intake card + "Skip and fill this later"
    dashboard/                      Shell + tabs (Get Started / Submit Task / Tasks / Settings)
    api/
      stripe/setup-intent/          Create Stripe customer + SetupIntent for card vaulting
      stripe/webhook/               Signature-verified consistency backstop
      billing/complete/             Verify SetupIntent, pin default card, mark billing complete
      billing/remove/               Detach all payment methods ("Remove Billing Connection")
      jobs/                         GET: list + advance queue · POST: gate → quote → capture → queue
      jobs/[id]/cancel/             Refund + cancel (refused with 409 once processing)
      jobs/[id]/result/             Signed URL for the result payload
  components/                       LoginModal, BillingSetupForm (Stripe Elements), PaymentModal
  lib/
    providers.ts                    Hardware catalog + server-authoritative cost model
    simulator.ts                    Simulated vendor queue lifecycle + result generation
    vultr.ts                        Vultr GPU provisioning integration point (stub)
    stripe.ts · supabase/*          Lazy service clients (browser / server / admin)
```

## Going live with real hardware

- Replace [src/lib/simulator.ts](src/lib/simulator.ts) with real vendor queue polling/webhooks (IBM Quantum, Rigetti QCS, IonQ Cloud APIs) — the Stripe capture/refund/lockout logic is vendor-agnostic and stays as-is.
- Wire [src/lib/vultr.ts](src/lib/vultr.ts) to provision GPU instances (`VULTR_API_KEY`) running cuQuantum/Qiskit Aer for the simulator backend.
- Switch Stripe to live keys and re-create the webhook endpoint in live mode.
