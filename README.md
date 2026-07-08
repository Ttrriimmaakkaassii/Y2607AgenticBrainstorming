# Y2607AgenticBrainstorming

Multi-agent LLM discussion platform with WhatsApp-like interface, audio generation, and report creation.

## 🚀 Quick Deploy

See [DEPLOYMENT.md](./DEPLOYMENT.md) for complete deployment instructions.

### One-Step Setup

```bash
# 1. Install dependencies
cd apps/main-app
npm install @supabase/supabase-js

# 2. Deploy to Cloudflare Pages
# Follow the guide in DEPLOYMENT.md
```

## 📁 Project Structure

```
Y2607AgenticBrainstorming/
├── apps/
│   └── main-app/
│       ├── .next/              # Build output
│       ├── packages/
│       │   ├── features/
│       │   │   ├── conversation/     # Chat logic
│       │   │   ├── audio/            # Podcast generation
│       │   │   ├── analytics/        # Reports & mindmaps
│       │   │   └── config/           # Agent configuration
│       │   └── shared/
│       │       ├── api-client/       # Supabase, LLM, TTS
│       │       └── types/            # TypeScript types
│       └── .env.local                # Environment variables
├── packages/
│   └── features/                   # Feature modules
├── docs/
│   └── PLAN.md                     # Design specification
└── DEPLOYMENT.md                   # Deployment guide
```

## 🎯 Features

- ✅ **WhatsApp-like chat interface** with threaded messages
- ✅ **Multi-agent configuration** with custom instructions
- ✅ **Hybrid conversation flows** (FreeFlowing, RoleBased, Sequential)
- ✅ **Feedback system** (Like, Dislike, Clarify buttons)
- ✅ **LocalStorage persistence** (fallback)
- ✅ **Supabase database** (primary storage)
- ✅ **Audio generation** (TTS integration)
- ✅ **Mind map generation** (markmap)
- ✅ **Report generation** (PDF export)
- ✅ **Mobile-responsive** design

## 🚦 Deployment

### Cloudflare Pages

**Why Cloudflare Pages?**
- ✅ Full Next.js 14 App Router support
- ✅ Server Components native support
- ✅ Automatic deployments from GitHub
- ✅ Free tier: 500K requests/month
- ✅ Fast edge network

See [DEPLOYMENT.md](./DEPLOYMENT.md) for step-by-step instructions.

### Manual Build

```bash
cd apps/main-app
npm install
npm run build
npm start
```

## 🗄️ Database

**Table Structure:**
- `conversations` - Stores all conversations
- `agents` - Stores agent configurations
- `messages` - Stores messages and threads

**Schema SQL:** Run in Supabase SQL Editor (see DEPLOYMENT.md)

## 🔧 Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL | `https://ivotsmwlsubvudlrylbf.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key | `sb_publishable_A10nnVHMzto4bB_OcleltA_IVbPHPX9` |

## 🛠️ Development

### Local Development

```bash
cd apps/main-app
npm install
npm run dev
```

Visit: `http://localhost:3000`

### Build for Production

```bash
cd apps/main-app
npm run build
```

Output: `.next/` directory

## 📚 Documentation

- [DEPLOYMENT.md](./DEPLOYMENT.md) - Complete deployment guide
- [PLAN.md](./PLAN.md) - Design specification and implementation plan

## 🎯 Tech Stack

- **Frontend:** Next.js 14, React 18, TypeScript
- **Styling:** Tailwind CSS
- **Database:** Supabase (PostgreSQL)
- **Deployment:** Cloudflare Pages
- **State Management:** React Context
- **Testing:** Vitest, Testing Library, Playwright

## 🚀 Roadmap

See [PLAN.md](./PLAN.md) for complete implementation plan:

- ✅ Phase 1: Core MVP (4-6 weeks)
- ⏳ Phase 2: Advanced Features (3-4 weeks)
- ⏳ Phase 3: Polish & Scale (2-3 weeks)

## 📝 License

MIT License - feel free to use this project for any purpose.

## 🤝 Support

- GitHub: https://github.com/Ttrriimmaakkaassii/Y2607AgenticBrainstorming
- Issues: Create a GitHub issue

---

**Deployed URL:** https://Y2607AgenticBrainstorming.pages.dev

**Status:** 🟢 Ready for Deployment
