# Cloudflare Pages Deployment Guide

## 🚀 Quick Start

This guide will help you deploy the Y2607AgenticBrainstorming project to **Cloudflare Pages** with **Supabase** integration.

---

## 📋 Prerequisites

- ✅ Supabase project created (https://supabase.com/dashboard/project/ivotsmwlsubvudlrylbf)
- ✅ API keys obtained
- ✅ GitHub repository created (https://github.com/Ttrriimmaakkaassii/Y2607AgenticBrainstorming)
- ✅ Node.js 18+ installed

---

## 🔧 Step 1: Install Dependencies

```bash
cd apps/main-app
npm install @supabase/supabase-js
npm install -D @types/supabase-js
```

---

## 🗄️ Step 2: Create Supabase Database

1. Go to: https://supabase.com/dashboard/project/ivotsmwlsubvudlrylbf/sql/new
2. Run the following SQL:

```sql
-- Create conversations table
CREATE TABLE conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agents JSONB NOT NULL,
  threads JSONB NOT NULL,
  messages JSONB NOT NULL,
  settings JSONB NOT NULL,
  flow VARCHAR(50) NOT NULL DEFAULT 'FreeFlowing',
  status VARCHAR(50) NOT NULL DEFAULT 'idle',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create agents table
CREATE TABLE agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  role VARCHAR(255) NOT NULL,
  instructions TEXT NOT NULL,
  llm_config JSONB NOT NULL,
  voice_config JSONB NOT NULL,
  color VARCHAR(7) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create messages table
CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
  thread_id UUID,
  agent_id UUID REFERENCES agents(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  timestamp BIGINT NOT NULL,
  feedback VARCHAR(20),
  phase VARCHAR(50),
  exchange INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes
CREATE INDEX idx_conversations_updated_at ON conversations(updated_at DESC);
CREATE INDEX idx_messages_conversation_id ON messages(conversation_id);
CREATE INDEX idx_messages_thread_id ON messages(thread_id);

-- Enable Row Level Security
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- Create public read policies
CREATE POLICY "Public read access for conversations"
  ON conversations FOR SELECT
  USING (true);

CREATE POLICY "Public create access for conversations"
  ON conversations FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Public update access for conversations"
  ON conversations FOR UPDATE
  USING (true);

CREATE POLICY "Public delete access for conversations"
  ON conversations FOR DELETE
  USING (true);

-- Create public read policies for agents
CREATE POLICY "Public read access for agents"
  ON agents FOR SELECT
  USING (true);

CREATE POLICY "Public create access for agents"
  ON agents FOR INSERT
  WITH CHECK (true);

-- Create public read policies for messages
CREATE POLICY "Public read access for messages"
  ON messages FOR SELECT
  USING (true);

CREATE POLICY "Public create access for messages"
  ON messages FOR INSERT
  WITH CHECK (true);
```

3. Click **Run** to execute the SQL.

---

## 📝 Step 3: Verify Files

All required files are created:
- ✅ `packages/shared/api-client/supabase-client.ts`
- ✅ `packages/features/conversation/services/state-persistence.ts`
- ✅ `apps/main-app/next.config.js`
- ✅ `.env.local` with Supabase keys

---

## 🌐 Step 4: Deploy to Cloudflare Pages

### Option A: Via GitHub (Recommended)

1. **Push all files to GitHub:**
   ```bash
   cd monorepo/apps/main-app
   git add .
   git commit -m "feat: add Supabase integration with Cloudflare Pages"
   git push origin master
   ```

2. **Go to Cloudflare Dashboard:**
   - URL: https://dash.cloudflare.com
   - Navigate to: **Workers & Pages** → **Create a project**

3. **Connect to GitHub:**
   - Click **Connect to Git**
   - Select repository: **Y2607AgenticBrainstorming**
   - Click **Begin setup**

4. **Configure Build Settings:**
   ```
   Build command: cd apps/main-app && npm install && npm run build
   Build output directory: apps/main-app/.next
   ```

5. **Add Environment Variables:**
   - Variable: `NEXT_PUBLIC_SUPABASE_URL`
     - Value: `https://ivotsmwlsubvudlrylbf.supabase.co`
   - Variable: `NEXT_PUBLIC_SUPABASE_ANON_KEY`
     - Value: `sb_publishable_A10nnVHMzto4bB_OcleltA_IVbPHPX9`
   - Click **Add variable**

6. **Deploy:**
   - Click **Save and Deploy**
   - Wait for build to complete (~2 minutes)
   - Get your deployment URL: `https://Y2607AgenticBrainstorming.pages.dev`

### Option B: Via Wrangler CLI

```bash
cd monorepo/apps/main-app

# Install Wrangler CLI
npm install -g wrangler

# Login to Cloudflare
wrangler login

# Create Pages project
wrangler pages project create Y2607AgenticBrainstorming \
  --production-branch master \
  --compatibility-date="2024-04-01"

# Deploy
wrangler pages deploy .next --project-name=Y2607AgenticBrainstorming
```

---

## ✅ Step 5: Verify Deployment

1. **Visit your deployment URL:**
   ```
   https://Y2607AgenticBrainstorming.pages.dev
   ```

2. **Test the application:**
   - ✅ Chat interface loads
   - ✅ No console errors
   - ✅ Supabase connection successful
   - ✅ Environment variables working

3. **Test database:**
   ```bash
   # In browser console, run:
   window.supabase.auth.getUser()
   ```

4. **Check Cloudflare logs:**
   - Dashboard: **Workers & Pages** → **Y2607AgenticBrainstorming** → **Real-time Logs**

---

## 🔍 Step 6: Troubleshooting

### Common Issues

**Issue 1: Build fails**
- Solution: Check Node.js version (`node --version` should be 18+)
- Solution: Run `npm install` before building

**Issue 2: Supabase connection errors**
- Solution: Verify environment variables are set
- Solution: Check Row Level Security policies are enabled

**Issue 3: Database not connected**
- Solution: Run the SQL schema again
- Solution: Check browser console for Supabase connection errors

**Issue 4: Environment variables not working**
- Solution: Check Cloudflare dashboard for environment variables
- Solution: Re-deploy after adding variables

---

## 📊 Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                  Cloudflare Pages                       │
│  (Next.js 14 - Server + Client Components)              │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│              Next.js (Frontend)                          │
│  - Chat Interface                                        │
│  - State Management                                     │
│  - Supabase Client                                      │
└─────────────────────────────────────────────────────────┘
                          │
          ┌───────────────┴───────────────┐
          ▼                               ▼
┌───────────────────────┐        ┌───────────────────────┐
│  LocalStorage          │        │  Supabase             │
│  (Fallback)            │        │  - conversations      │
│  - Fast                │        │  - agents             │
│  - Offline support     │        │  - messages           │
└───────────────────────┘        └───────────────────────┘
```

---

## 📈 Next Steps

1. ✅ Test the application
2. ✅ Add more features (audio generation, reports)
3. ✅ Add authentication (optional)
4. ✅ Set up custom domain (optional)

---

## 🎉 Success!

Your Y2607AgenticBrainstorming project is now live at:
**https://Y2607AgenticBrainstorming.pages.dev**

---

## 🔗 Useful Links

- **Supabase Dashboard:** https://supabase.com/dashboard/project/ivotsmwlsubvudlrylbf
- **Cloudflare Dashboard:** https://dash.cloudflare.com
- **GitHub Repo:** https://github.com/Ttrriimmaakkaassii/Y2607AgenticBrainstorming

---

## 📞 Support

If you encounter issues:
1. Check the **Troubleshooting** section above
2. Review **Cloudflare Logs** in dashboard
3. Check **Supabase Logs** in dashboard
4. Look at browser **Console** for errors

---

**Ready to deploy?** Run `git push origin master` to start! 🚀
