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

Install backend dependencies:

```bash
cd server
npm install
```

Create a `.env` file inside [server]() with:

```env
OPENAI_API_KEY=your_openai_api_key_here
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

- The frontend currently posts chat requests to `http://localhost:3000/chat` from `src/data.js`.
- Speech recognition depends on browser support for `SpeechRecognition` or `webkitSpeechRecognition`.
- There are currently no automated tests configured in this repo.
