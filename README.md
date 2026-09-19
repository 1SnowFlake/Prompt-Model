# AI Model Router (Prompt-Model)

An intelligent multi-provider AI Model Router built with **Next.js 16 (App Router & Turbopack)**, **TypeScript**, and **React 19**. Automatically routes prompts to optimal AI models (OpenRouter, Gemini, OpenAI, Claude, DeepSeek, Ollama) based on task intent, cost, and latency.

## 🚀 Features

- **Smart Model Routing**: Evaluates prompt complexity and routes to the most capable or cost-effective model (Fast / Balanced / Powerful / Local).
- **Multi-Provider Support**: OpenRouter, Google Gemini, OpenAI, Anthropic Claude, DeepSeek, and local Ollama.
- **Analytics & Usage Dashboard**: Track token consumption, latency, and cost per model.
- **Persistent Chat History**: Fast history and conversation management.
- **Serverless & Vercel Ready**: Optimized for zero-configuration deployment on Vercel.

---

## 🛠️ Getting Started

### 1. Clone & Install Dependencies

```bash
git clone https://github.com/1SnowFlake/Prompt-Model.git
cd Prompt-Model
npm install
```

### 2. Environment Variables

Copy the `.env.example` template:

```bash
cp .env.example .env.local
```

Add your API keys in `.env.local`:

```env
# OpenRouter Universal API Key (Recommended - unlocks all models)
OPENROUTER_API_KEY=your_openrouter_api_key

# Optional direct provider keys
GEMINI_API_KEY=your_gemini_api_key
OPENAI_API_KEY=your_openai_api_key
ANTHROPIC_API_KEY=your_anthropic_api_key
DEEPSEEK_API_KEY=your_deepseek_api_key
```

### 3. Run Locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## ☁️ Deploying to Vercel

### One-Click Setup:
1. Push this repository to GitHub (`https://github.com/1SnowFlake/Prompt-Model.git`).
2. Go to [Vercel Dashboard](https://vercel.com/dashboard) and click **Add New...** -> **Project**.
3. Import **`Prompt-Model`**.
4. In the **Environment Variables** section, add your `OPENROUTER_API_KEY` (and any other provider keys).
5. Click **Deploy**. Vercel will automatically detect Next.js and build the project with zero extra configuration!

---

## 📦 Scripts

- `npm run dev`: Start Next.js development server
- `npm run build`: Build production bundle
- `npm run start`: Run production server
- `npm run lint`: Run ESLint checks
