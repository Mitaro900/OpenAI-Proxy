const express = require("express");
require("dotenv").config();

const app = express();
app.use(express.json({ limit: "256kb" }));

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
if (!OPENAI_API_KEY) {
  throw new Error("OPENAI_API_KEY is missing");
}

const APP_TOKEN = process.env.APP_TOKEN;

if (process.env.NODE_ENV === "development") {
  console.log("DEV MODE");
}

// 헬스 체크 (Cloud Run 확인용)
app.get("/health", (req, res) => {
  res.json({ ok: true });
});

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

    // ---- 2) OpenAI Responses API 호출 ----
    const openaiResponse = await fetch(
      "https://api.openai.com/v1/responses",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: "gpt-3.5-turbo",
          input: [
            npcPrompt
              ? { role: "system", content: npcPrompt }
              : null,
            { role: "user", content: input },
          ].filter(Boolean),
        }),
      }
    );

    const data = await openaiResponse.json();

    if (!openaiResponse.ok) {
      // OpenAI 에러 그대로 전달 (디버깅용)
      return res.status(openaiResponse.status).json(data);
    }

    // ---- 3) 텍스트 안전 추출 ----
    const text =
      data?.output?.[0]?.content?.[0]?.text ??
      data?.output_text ??
      "";

    if (!text) {
      return res.status(500).json({ error: "empty_response" });
    }

    // ---- 4) Unity용 응답 ----
    return res.json({ text });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "server_error" });
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Proxy server listening on :${port}`);
});
