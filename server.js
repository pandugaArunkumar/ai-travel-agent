console.log('🚀 Travel Agent server starting...');

const dotenvResult = require('dotenv').config();
if (dotenvResult.error) {
  console.warn('⚠️  .env not found:', dotenvResult.error.message);
} else {
  console.log('✅ .env loaded');
}

const express = require('express');
const cors    = require('cors');
const fetch   = require('node-fetch');
const path    = require('path');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const IBM_API_KEY    = process.env.IBM_API_KEY;
const IBM_PROJECT_ID = process.env.IBM_PROJECT_ID;
const IBM_ML_URL     = process.env.IBM_ML_URL || 'https://us-south.ml.cloud.ibm.com';
const PORT           = process.env.PORT || 3000;

console.log('   IBM_API_KEY    :', IBM_API_KEY    ? '*** (set)' : '❌ NOT SET');
console.log('   IBM_PROJECT_ID :', IBM_PROJECT_ID || '❌ NOT SET');
console.log('   PORT           :', PORT);

if (!IBM_API_KEY)    { console.error('❌ Missing IBM_API_KEY');    process.exit(1); }
if (!IBM_PROJECT_ID) { console.error('❌ Missing IBM_PROJECT_ID'); process.exit(1); }

// ── IAM token cache ───────────────────────────────────────────────────────────
let cachedToken   = null;
let tokenExpireAt = 0;

async function getIAMToken() {
  if (cachedToken && Date.now() < tokenExpireAt) return cachedToken;
  const res = await fetch('https://iam.cloud.ibm.com/identity/token', {
    method : 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body   : `grant_type=urn:ibm:params:oauth:grant-type:apikey&apikey=${IBM_API_KEY}`,
  });
  if (!res.ok) throw new Error(`IAM token error: ${res.status} ${await res.text()}`);
  const data    = await res.json();
  cachedToken   = data.access_token;
  tokenExpireAt = Date.now() + (data.expires_in - 60) * 1000;
  console.log('✅ IAM token obtained');
  return cachedToken;
}

// ── System prompt ─────────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are a professional AI travel agent with deep knowledge of Indian and international travel routes. You MUST always fill in REAL estimated numbers for duration and cost. Never use placeholder text like "X hr" or "₹X,XXX" — always write actual values like "~1 hr 20 min" or "₹3,500 – ₹9,000".

IMPORTANT: All durations and prices must be realistic estimates based on your knowledge of the actual route. Use Indian Rupees (₹) for Indian routes.

---

TASK 1 — Travel options overview:

When the user asks about a route, output all 4 modes immediately using this format.
Here is a COMPLETE EXAMPLE for Mumbai → Goa. Follow this exact structure and fill in REAL numbers for the actual route asked:

---EXAMPLE START---
## ✈️ Travel Options: Mumbai → Goa

### ✈️ Flight
| | |
|---|---|
| Duration | ~1 hr 10 min |
| Cost | ₹2,500 – ₹9,000 per person |
| Best For | Speed |

**Pros:** Fastest option · No travel fatigue · Multiple daily flights
**Cons:** Expensive · Need to reach airport 2 hr early

---

### 🚆 Train
| | |
|---|---|
| Duration | ~8 – 11 hr |
| Cost | ₹300 – ₹2,200 per person |
| Best For | Budget + scenic Konkan coast views |

**Pros:** Affordable · Scenic · Comfortable sleeper berths
**Cons:** Advance booking needed · Slower than flight

---

### 🚌 Bus
| | |
|---|---|
| Duration | ~12 – 14 hr |
| Cost | ₹600 – ₹1,800 per person |
| Best For | Budget travellers |

**Pros:** Cheapest option · Overnight saves hotel cost · Widely available
**Cons:** Long journey · Road fatigue

---

### 🚗 Self-Drive / Cab
| | |
|---|---|
| Duration | ~9 – 11 hr (via NH66) |
| Cost | ₹4,000 – ₹7,000 (fuel + toll) or ₹6,000 – ₹10,000 cab |
| Best For | Flexibility & groups |

**Pros:** Door to door · Stop anywhere · Best for groups of 4+
**Cons:** Driver fatigue · Toll charges

---

## 🏆 Recommendation
For most travellers, the **train** (Konkan Railway) offers the best balance of cost and comfort. If budget is tight, the **overnight bus** saves both money and accommodation. Book flights for the fastest option if time matters.

> ⚠️ *Prices are indicative estimates for 2024. Verify current fares on MakeMyTrip, IRCTC, or official sites before booking.*
---EXAMPLE END---

Now produce the SAME structure with REAL numbers for whatever route the user asks about.

---

TASK 2 — Deep dive when user picks a specific mode:

When user selects a transport mode, provide this deep-dive with REAL details:

## [Mode emoji] [Mode] Deep Dive: [From] → [To]

### 🏢 Top Operators / Services
List 3-5 SPECIFIC real operators, train names, airlines, or bus companies that actually serve this route.

### 🎟️ Booking Guide
| | |
|---|---|
| Best Platform | IRCTC / MakeMyTrip / RedBus / airline website |
| Book In Advance | Specific number of days recommended |
| Best Class / Seat | Specific class name e.g. 3A AC, Sleeper, Volvo AC, IndiGo Economy |
| Avoid | Specific peak dates or times to avoid |

### 🕐 Typical Schedule
List 2-3 real example departure times or frequencies for this route.

### 🎒 What To Carry
- 5-6 specific practical items for this mode and route

### 💡 Insider Tips
- 4-5 specific practical tips for this exact route and mode

> ⚠️ *Schedules and prices are approximate. Always verify on official platforms before travelling.*

---

RULES:
- NEVER output placeholder text like "X hr", "₹X,XXX", "[From]", "[To]", "[List here]". Always use real values.
- Never write long prose paragraphs. Keep everything in the structured format above.
- Never go off-topic or write poetry/motivational content.
- If asked something unrelated to travel, say: "I'm your travel assistant. Ask me about planning a trip!"
- Always respond in English.`;

// ── Chat endpoint — uses IBM /ml/v1/text/chat (chat completions API) ──────────
app.post('/api/chat', async (req, res) => {
  try {
    const { messages } = req.body;
    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'messages array is required' });
    }

    const token = await getIAMToken();

    // Build messages array with system prompt prepended
    const chatMessages = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...messages,
    ];

    const payload = {
      model_id  : 'ibm/granite-4-h-small',
      project_id: IBM_PROJECT_ID,
      messages  : chatMessages,
      parameters: {
        max_tokens        : 1000,
        temperature       : 0.1,
        repetition_penalty: 1.05,
      },
    };

    console.log(`→ IBM ML chat request (${messages.length} turn(s), model: ibm/granite-4-h-small)`);

    const mlRes = await fetch(
      `${IBM_ML_URL}/ml/v1/text/chat?version=2023-05-29`,
      {
        method : 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body   : JSON.stringify(payload),
      }
    );

    if (!mlRes.ok) {
      const errText = await mlRes.text();
      console.error('IBM ML error:', mlRes.status, errText);
      return res.status(mlRes.status).json({ error: `IBM ML API error: ${errText}` });
    }

    const data   = await mlRes.json();
    // Chat API response shape: choices[0].message.content
    const result = (
      data?.choices?.[0]?.message?.content ||
      data?.results?.[0]?.generated_text ||
      ''
    ).trim();

    console.log(`← Reply (${result.length} chars)`);
    return res.json({ reply: result });

  } catch (err) {
    console.error('Server error:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ── Health ────────────────────────────────────────────────────────────────────
app.get('/api/health', (_req, res) =>
  res.json({ status: 'ok', model: 'ibm/granite-4-h-small', api: 'text/chat' })
);

// ── SPA fallback ──────────────────────────────────────────────────────────────
app.get('*', (_req, res) =>
  res.sendFile(path.join(__dirname, 'public', 'index.html'))
);

app.listen(PORT, () =>
  console.log(`\n✈️  Travel Agent ready → http://localhost:${PORT}\n`)
);
