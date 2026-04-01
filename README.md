# Agent Fluffy Bunny

Agent Fluffy Bunny is a React + Vite frontend with an Express backend that powers a voice-friendly bunny assistant. The app lets users pick a bunny character and costume, chat by text or speech, and hear spoken responses with animated overlay reactions.

## Features

- Character selection with multiple hand-drawn bunny variants
- Costume selection and layer-3 reaction overlays
- Text chat and speech recognition support
- Text-to-speech playback for assistant replies
- Click-anywhere stop behavior while audio is playing
- Voice phrases for starting, stopping, and ending hands-free mode
- Extra assistant actions like opening websites, weather-style follow-ups, note-taking, and hopecore responses
- Static about page for the project team

## Tech Stack

- Frontend: React 19, Vite, Tailwind CSS v4
- Backend: Express, OpenAI Node SDK, dotenv, cors
- Browser APIs: Speech Recognition, Audio playback, Clipboard, window opening

## Project Structure

```text
agent-fluffy-bunny/
├── src/
│   ├── App.jsx          # Main app flow, chat UI, picker logic, voice/audio handling
│   ├── data.js          # Characters, costumes, overlays, phrases, constants
│   ├── style.css        # App styling
│   └── assets/          # Bunny, costume, and reaction artwork
├── server/
│   ├── server.js        # Express API and assistant logic
│   └── package.json     # Backend dependencies
├── about.html           # About page
├── index.html           # Frontend entry HTML
└── package.json         # Frontend dependencies
```

## Prerequisites

- Node.js 18+
- An OpenAI API key

## Setup

Install frontend dependencies:

```bash
npm install
```

Create a frontend `.env` file from [.env.example](/Users/lilywallace/Desktop/agent-fluffy-bunny/.env.example):

```env
VITE_API_BASE_URL=http://localhost:3000
```

Install backend dependencies:

```bash
cd server
npm install
```

Create a backend `.env` file inside [server](/Users/lilywallace/Desktop/agent-fluffy-bunny/server) from [server/.env.example](/Users/lilywallace/Desktop/agent-fluffy-bunny/server/.env.example):

```env
OPENAI_API_KEY=your_openai_api_key_here
PORT=3000
ALLOWED_ORIGINS=http://localhost:5173
RATE_LIMIT_WINDOW_MS=60000
MAX_REQUESTS_PER_WINDOW=15
MAX_DAILY_REQUESTS_PER_IP=15
MAX_MESSAGE_LENGTH=1500
JSON_LIMIT=32kb
```

## Running Locally

Start the backend from the `server` directory:

```bash
npm start
```

The API runs on `http://localhost:3000`.

In a separate terminal, start the frontend from the project root:

```bash
npm run dev
```

Then open the Vite URL shown in the terminal, usually `http://localhost:5173`.

## Build

From the project root:

```bash
npm run build
```

To preview the production frontend build:

```bash
npm run preview
```

## Voice Controls

- Wake phrase: `come in agent fluffy bunny`
- Stop phrase: `stop`
- End conversation phrase: `over and out`

While the bunny is speaking, clicking or tapping anywhere on the screen stops audio playback.

## Notes

- The frontend reads the backend base URL from `VITE_API_BASE_URL` and posts to `${VITE_API_BASE_URL}/chat`.
- Speech recognition depends on browser support for `SpeechRecognition` or `webkitSpeechRecognition`.
- There are currently no automated tests configured in this repo.

## Public Demo Protection

- `OPENAI_API_KEY` stays server-side only and is never sent to the browser.
- `ALLOWED_ORIGINS` lets you restrict which frontend URLs can call the backend. For production, set this to your real deployed frontend URL.
- `MAX_REQUESTS_PER_WINDOW` and `RATE_LIMIT_WINDOW_MS` limit burst traffic per IP.
- `MAX_DAILY_REQUESTS_PER_IP` adds a simple daily per-IP quota for demos.
- `MAX_MESSAGE_LENGTH` and `JSON_LIMIT` reduce oversized or abusive requests.
- For a public presentation, also use a separate OpenAI project/key with its own platform limits and budget alerts.

## Deployment

Frontend:
- Deploy the repo root as a Vite static site.
- Set `VITE_API_BASE_URL` to your public backend URL, for example `https://your-backend.onrender.com`.

Backend:
- Deploy the `server` folder as a Node web service.
- Set `OPENAI_API_KEY` and the rest of the backend environment variables in your host dashboard.
- Set `ALLOWED_ORIGINS` to your real public frontend origin, for example `https://your-frontend.vercel.app`.
