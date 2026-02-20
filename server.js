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
      'Schema: {"text": string, "choices": [{"id": string, "label": string}] }',
      'If no choices are needed, set "choices" to an empty array.',
      'Choice.id must be either:',
      '- "quest_step:<questId>:<stepId>" for quest step request, or',
      '- a short string like "talk_normal" for normal dialogue choices.',
    ].join("\n"),
  };
}

// content(JSON 문자열) -> Unity용 payload로 안전 변환
function safeParseToUnityResponse(content) {
  try {
    const obj = JSON.parse(content);

    const text = typeof obj.text === "string" ? obj.text : "";
    const rawChoices = Array.isArray(obj.choices) ? obj.choices : [];

    const choices = rawChoices
      .filter(
        (c) =>
          c &&
          typeof c === "object" &&
          typeof c.id === "string" &&
          typeof c.label === "string"
      )
      .map((c) => ({ id: c.id, label: c.label }));

    // text가 비었으면 content를 text로 대체(최후 방어)
    return {
      text: text || (content ?? ""),
      choices,
    };
  } catch {
    // JSON이 깨졌으면 content를 그대로 text로 사용
    return { text: content ?? "", choices: [] };
  }
}

app.post("/chat", async (req, res) => {
  const token = req.header("X-App-Token");
  if (APP_TOKEN && token !== APP_TOKEN) {
    return res.status(401).json({ error: "unauthorized" });
  }

  try {
    const { input, npcPrompt } = req.body ?? {};

    // ---- 1) 입력 검증 ----
    if (!input || typeof input !== "string") {
      return res.status(400).json({ error: "input is required" });
    }
    if (npcPrompt != null && typeof npcPrompt !== "string") {
      return res.status(400).json({ error: "npcPrompt must be a string" });
    }

    // ---- 2) OpenAI API 호출 ----
    const messages = [
      jsonGuard(),
      ...(npcPrompt ? [{ role: "system", content: npcPrompt }] : []),
      { role: "user", content: input },
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
        temperature: 0.7,
        // JSON 모드(가능하면 켜는 게 안정적)
        response_format: { type: "json_object" },
      }),
    });

    const data = await openaiResponse.json();

    if (!openaiResponse.ok) {
      // OpenAI 에러 그대로 전달 (디버깅용)
      return res.status(openaiResponse.status).json(data);
    }

    // 3) 모델 출력 content 추출
    const content = data?.choices?.[0]?.message?.content ?? "";
    if (!content) {
      return res.status(500).json({ error: "empty_response", raw: data });
    }

    // 4) Unity용 {text, choices}로 변환하여 반환
    const payload = safeParseToUnityResponse(content);
    if (!payload.text) {
      return res.status(500).json({ error: "empty_text_after_parse", raw: content });
    }

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
