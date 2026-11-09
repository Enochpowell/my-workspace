# AI providers: use any, switch any time

The server has one function that sends a question to "an AI" and streams the answer back. Behind it are
small adapters. **You choose the provider with a setting; nobody needs to edit code to switch.**

| Provider id | Service | Cost | Key goes in `.env` as |
| --- | --- | --- | --- |
| `gemini` | Google Gemini | **free tier** (with limits) | `GEMINI_API_KEY` |
| `groq` | Groq (fast open models) | **free tier** | `GROQ_API_KEY` |
| `openrouter` | OpenRouter (many models, some free) | free models available | `OPENROUTER_API_KEY` |
| `ollama` | Ollama, on **your own computer** | free, private, needs a decent PC | `OLLAMA_MODEL` (no key) |
| `anthropic` | Anthropic Claude | paid | `ANTHROPIC_API_KEY` |
| `openai` | OpenAI | paid | `OPENAI_API_KEY` |

> Free tiers, limits and **model names change often**. Before relying on one, check the provider's own
> page. If a model name stops working, change the matching `*_MODEL` line in `.env`; no code change needed.

## Switching

* **Per person:**  menu → *AI assistant* → pick a provider. Providers that are not set up are greyed out.
  The choice is remembered on that device.
* **For everyone:** set `AI_PROVIDER=gemini` (or another id) in `.env` and restart. This is used when a person
  has not chosen one, or chose one that is not set up.

## Setting each one up

### Google Gemini (free)
1. Sign in at <https://aistudio.google.com/apikey> and create an API key.
2. `.env`: `GEMINI_API_KEY=…` (optionally `GEMINI_MODEL=…`).

### Groq (free tier)
1. Create a key in the Groq console (<https://console.groq.com>).
2. `.env`: `GROQ_API_KEY=…` (optionally `GROQ_MODEL=…`).

### OpenRouter
1. Create a key at <https://openrouter.ai>.
2. `.env`: `OPENROUTER_API_KEY=…`. Models whose name ends in `:free` cost nothing but are rate-limited.

### Ollama (free and private, runs on your computer)
1. Install Ollama from <https://ollama.com> and download a model, for example `ollama pull llama3.2`.
2. `.env`: `OLLAMA_MODEL=llama3.2` (the server talks to `http://localhost:11434/v1`).
3. This only works while the server and Ollama run on the **same machine** (or set `OLLAMA_BASE_URL`).
   It will not work on a normal web host.

### Anthropic Claude / OpenAI (paid)
`ANTHROPIC_API_KEY=…` or `OPENAI_API_KEY=…`. Default models are in `.env.example`.

## Adding another service

* **If it copies OpenAI's format** (many do: Together, Mistral, DeepSeek, LM Studio, vLLM …): add one entry
  to `config.js` (`ai.providers`) and one line to `PROVIDERS` in `server/ai/index.js` pointing at
  `openai`. Done: the same adapter serves it.
* **If its format is different:** copy `server/ai/openai.js`, change the request and how it reads the
  streamed answer, register it in `server/ai/index.js`. Add a fake-server test like those in `tests/ai.test.js`.

## How a question travels

`Ask AI` (browser) → `POST /api/ai/chat` (your server; checks you are signed in; rate limit) → the provider's
API (key added on the server) → streamed back to the browser. The browser never sees a key.
Limits: prompts up to 120,000 characters, 20 questions per minute per person, answers up to
`AI_MAX_OUTPUT_TOKENS` (default 2048).

## Adding or changing a key from inside the app

A platform admin (the first account) can paste an API key in **Settings, AI**: pick the AI, paste the key, press **Save key**.
The key is stored on the server, encrypted, and is never shown again or sent back to the browser. A key saved this way overrides the same key in `.env`. **Remove key** puts back whatever `.env` has.

The encryption secret is the file `data/.keysecret`, created the first time a key is saved. Back it up together with the database. A database backup without it cannot decrypt the saved keys, and you would paste the keys again.

Anyone who is not a platform admin can pick which configured AI they use on their own device, but cannot see or change keys.

## Pictures

The **Images** page makes pictures from a description (**Make a picture**). Pick the service (OpenAI or Gemini, whichever has a key) and the picture model in the box. The model names are suggestions and settings (`OPENAI_IMAGE_MODEL`, `GEMINI_IMAGE_MODEL`) because providers rename image models often, and they were not all re-checked when this was written.

If a picture fails, the real reason from the provider is shown under the button. Common causes: a **free key with no picture quota** (Google's picture models often need billing switched on for the key), an OpenAI organisation that has not been verified for picture models, or a model name that no longer exists. Try another model from the list first.

The picture editor on the same page (crop, rotate, brightness, text, logo) runs in the browser and needs no key.

## Video

**Make a video clip** (Video page, Video generation) uses Google's Veo through the Gemini API. It needs a Gemini key, and Google usually requires **billing switched on** for video. Google describes the current Veo model as making about 8 second clips with sound. Clips take a few minutes and cost money per clip on your Google account. The model is a setting (`GEMINI_VIDEO_MODEL`, default `veo-3.1-generate-preview`) and can be changed in the box. The server starts the job, polls Google until it is done and hands the file to your browser. Jobs are kept in memory for 30 minutes.

The **video editor** (Video page, Video editing) runs entirely in the browser. It cuts, splits, reorders and mutes clips from the Gallery, adds captions in many fonts (system fonts, plus font files you upload and are allowed to use), previews them on a canvas and exports a `.webm` file in real time. It needs no key. WebM plays in browsers and most editors; converting to MP4 needs another tool.

## Longer answers

A request can ask for a longer answer (the website builder asks for up to 12,000 tokens). The server allows up to 16,384 for one request, and the AI you picked must support that much output.

## Many AIs, and your own

Besides the six main AIs, the list includes about twenty more services that speak the same format (Together AI, Fireworks, DeepInfra, Mistral, DeepSeek, xAI, Perplexity, Cerebras, SambaNova, NVIDIA NIM, Hugging Face, Cohere, Qwen, Kimi and others). Each needs its own key. There is no single key for all of them: the closest thing is an aggregator such as OpenRouter, Together AI, DeepInfra or Hugging Face, where one key reaches many models.

In **Settings, AI** a platform admin can also change the **model** of any AI and **Add your own AI**: any service with an OpenAI-style chat endpoint (name, web address, model, key). The built-in web addresses and default model names were written from memory and were not re-checked against each provider's current documentation, so if one fails, check the provider's docs and change the model in Settings.
