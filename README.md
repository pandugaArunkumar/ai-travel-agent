# ✈️ AI Travel Agent — IBM Granite

An AI-powered travel agent chatbot that helps users plan trips by comparing flights, trains, buses, and road-trip options. Powered by **IBM Granite 4 (granite-4-h-small)** via IBM Watson Machine Learning.

---

## Features

- **Conversational travel planning** — collects starting location, destination, dates, travelers, budget, and preferences
- **Multi-mode comparison** — Flights ✈️ · Trains 🚆 · Buses 🚌 · Car/Self-drive 🚗
- **Structured output** — duration, cost estimate, pros/cons, and a final recommendation
- **Clean chat UI** — markdown rendering, typing indicator, quick-start chips

---

## Quick Start

### 1. Install dependencies
```bash
npm install
```

### 2. Set your IBM API key

Create a `.env` file in the project root (copy from `.env.example`):

```
IBM_API_KEY=<your IBM Cloud API key>
IBM_PROJECT_ID=b07bdd7c-5cb1-4036-ba24-d1dfe1cb6003
IBM_ML_URL=https://us-south.ml.cloud.ibm.com
PORT=3000
```

### 3. Start the server
```bash
npm start
```

### 4. Open in browser
```
http://localhost:3000
```

---

## Project Structure

```
travel-agent/
├── server.js          # Express server + IBM Granite integration
├── public/
│   └── index.html     # Chat UI (self-contained HTML/CSS/JS)
├── .env.example       # Environment variable template
├── package.json
└── README.md
```

---

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/chat` | Send messages, receive Granite response |
| GET  | `/api/health` | Health check |

---

## Notes

- Prices and availability shown by the agent are **indicative estimates only**, not real-time data.
- IAM tokens are cached and automatically refreshed before expiry.
- The model used is `ibm/granite-4-h-small` on IBM Watson Machine Learning (us-south).
