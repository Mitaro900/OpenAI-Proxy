const express = require("express");
require("dotenv").config();

const app = express();
app.use(express.json({ limit: "256kb" }));

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
if (!OPENAI_API_KEY) {
  throw new Error("OPENAI_API_KEY is missing");
}

const APP_TOKEN = process.env.APP_TOKEN;
const MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini"; // 필요시 env로 변경

if (process.env.NODE_ENV === "development") {
  console.log("DEV MODE");
}

// 헬스 체크 (Cloud Run 확인용)
app.get("/health", (req, res) => {
  res.json({ ok: true });
});

// 모델이 반환해야 하는 JSON 스키마
function jsonGuard() {
  return {
    role: "system",
    content: [
      "You must respond with a SINGLE JSON object only.",
      "No markdown, no code fences, no extra text.",
      'Schema: {"text": string}',
      'The value of "text" must be a natural NPC dialogue line.',
    ].join("\n"),
  };
}

// content(JSON 문자열) -> Unity용 payload로 안전 변환
function safeParseToUnityResponse(content) {
  try {
    const obj = JSON.parse(content);
    const text = typeof obj.text === "string" ? obj.text : "";
    return { text: text || (content ?? "") };
  } catch {
    return { text: content ?? "" };
  }
}

app.post("/chat", async (req, res) => {
  const token = req.header("X-App-Token");
  if (APP_TOKEN && token !== APP_TOKEN) {
    return res.status(401).json({ error: "unauthorized" });
  }

  try {
    const { input, npcPrompt, npcId, playerName="이서준", day=1, location="", memorySummary="" } = req.body ?? {};

    if (!input || typeof input !== "string") {
      return res.status(400).json({ error: "input is required" });
    }
    if (npcPrompt != null && typeof npcPrompt !== "string") {
      return res.status(400).json({ error: "npcPrompt must be a string" });
    }

    const runtimeBlock = [
      "[CURRENT STATE]",
      `npcId: ${npcId ?? ""}`,
      `playerName: ${playerName}`,
      `day: ${day}`,
      `location: ${location}`,
      memorySummary ? `memorySummary: ${memorySummary}` : "",
      "",
      "[PLAYER INPUT]",
      input,
    ].filter(Boolean).join("\n");

    const messages = [
      jsonGuard(),
      ...(npcPrompt ? [{ role: "system", content: npcPrompt }] : []),
      { role: "user", content: runtimeBlock },
    ];

    const openaiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages,
        temperature: 0.4,
        response_format: { type: "json_object" },
        max_tokens: 250,
      }),
    });

    const data = await openaiResponse.json();
    if (!openaiResponse.ok) return res.status(openaiResponse.status).json(data);

    const content = data?.choices?.[0]?.message?.content ?? "";
    if (!content) return res.status(500).json({ error: "empty_response", raw: data });

    const payload = safeParseToUnityResponse(content);
    if (!payload.text) return res.status(500).json({ error: "empty_text_after_parse", raw: content });

    return res.json(payload);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "server_error" });
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Proxy server listening on :${port}`);
});
