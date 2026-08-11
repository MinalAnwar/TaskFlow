# TaskFlow — Deploy Guide

Free stack: **Next.js + Supabase + Vercel**. Takes ~15 minutes.

---

## Step 1 — Supabase (database + auth)

1. Go to [supabase.com](https://supabase.com) → create a free account
2. Click **New project** → give it a name → set a DB password → create
3. Wait ~1 min for it to spin up
4. Go to **SQL Editor** (left sidebar) → paste the entire contents of `supabase-schema.sql` → click **Run**
5. Go to **Project Settings → API**
   - Copy **Project URL** → this is your `NEXT_PUBLIC_SUPABASE_URL`
   - Copy **anon / public key** → this is your `NEXT_PUBLIC_SUPABASE_ANON_KEY`

---

## Step 2 — GitHub

1. Create a new repo on GitHub (can be private)
2. Push this entire folder:
```bash
git init
git add .
git commit -m "init"
git remote add origin https://github.com/YOUR_USERNAME/taskflow.git
git push -u origin main
```

---

## Step 3 — Vercel (free hosting)

1. Go to [vercel.com](https://vercel.com) → sign in with GitHub
2. Click **Add New → Project** → import your `taskflow` repo
3. Under **Environment Variables**, add:
   - `NEXT_PUBLIC_SUPABASE_URL` = your Supabase project URL
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = your Supabase anon key
4. Click **Deploy**

Done! Vercel gives you a live URL like `taskflow-xyz.vercel.app`.

---

## Share with your team

Send anyone the Vercel URL. They click **Sign up**, create an account, and they're in. Everyone sees the same board in real-time.

---

## Run locally

```bash
cp .env.local.example .env.local
# fill in your Supabase keys in .env.local

npm install
npm run dev
# open http://localhost:3000
```

---

## Features

- Login / signup with email + password
- Shared kanban board (To do / In progress / Done)
- Assign tasks to any team member who has signed up
- Priority levels (High / Medium / Low)
- Filter by assignee or priority
- Real-time updates — task moves appear instantly for everyone
- Delete and edit tasks

## Free tier limits

| Service | Free limit |
|---------|-----------|
| Supabase | 500MB DB, 50k auth users, unlimited API calls |
| Vercel | Unlimited deployments, 100GB bandwidth/month |

More than enough for a team.
