const express = require("express");
const cors = require("cors"); // WebGL 빌드 및 교차 출처 통신 대비
require("dotenv").config();

const app = express();

// 1. CORS 및 JSON 파싱 미들웨어 설정
app.use(cors());
app.use(express.json({ limit: "256kb" }));

// 2. 환경변수 검증
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
if (!OPENAI_API_KEY) {
  throw new Error("OPENAI_API_KEY is missing");
}

const APP_TOKEN = process.env.APP_TOKEN;
const MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

if (process.env.NODE_ENV === "development") {
  console.log("DEV MODE");
}

// 3. 헬스 체크 엔드포인트 (GCP Cloud Run의 정상 구동 확인용)
app.get("/health", (req, res) => {
  res.json({ ok: true });
});

app.post("/chat", async (req, res) => {
  // 4. 앱 토큰 보안 검증
  const token = req.header("X-App-Token");
  if (APP_TOKEN && token !== APP_TOKEN) {
    return res.status(401).json({ error: "unauthorized" });
  }

  try {
    const { 
      input, 
      npcPrompt, 
      npcId, 
      playerName = "이서준", 
      day = 1, 
      location = "", 
      memorySummary = "" 
    } = req.body ?? {};

    // 유효성 검사
    if (!input || typeof input !== "string") {
      return res.status(400).json({ error: "input is required" });
    }
    if (npcPrompt != null && typeof npcPrompt !== "string") {
      return res.status(400).json({ error: "npcPrompt must be a string" });
    }

    // OpenAI에 보낼 유저 입력 블록 조립
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
      ...(npcPrompt ? [{ role: "system", content: npcPrompt }] : []),
      { role: "user", content: runtimeBlock },
    ];

    // 5. 타임아웃 처리를 위한 AbortController 설정 (15초)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    // 6. OpenAI API 호출 (Structured Outputs 적용)
    const openaiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages,
        temperature: 0.4,
        max_tokens: 250,
        // response_format을 통해 무조건 {"text": "..."} 형태로 응답하도록 강제
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "npc_dialogue_response",
            strict: true,
            schema: {
              type: "object",
              properties: {
                text: { 
                  type: "string", 
                  description: "The natural NPC dialogue line responding to the player." 
                }
              },
              required: ["text"],
              additionalProperties: false
            }
          }
        },
      }),
    });

    // 타임아웃 타이머 해제
    clearTimeout(timeoutId);

    const data = await openaiResponse.json();
    if (!openaiResponse.ok) return res.status(openaiResponse.status).json(data);

    // 7. 결과 추출 및 유니티용 페이로드 반환
    // Structured Outputs 덕분에 별도의 복잡한 문자열 파싱 예외처리가 필요 없어집니다.
    const contentString = data?.choices?.[0]?.message?.content ?? "";
    if (!contentString) return res.status(500).json({ error: "empty_response", raw: data });

    const parsedJson = JSON.parse(contentString);
    return res.json({ text: parsedJson.text });

  } catch (err) {
    // 타임아웃 발생 시 에러 처리
    if (err.name === 'AbortError') {
      console.error("OpenAI API request timed out.");
      return res.status(504).json({ error: "openai_timeout" });
    }

    console.error("Server Error:", err);
    return res.status(500).json({ error: "server_error" });
  }
});

// 8. 포트 설정 (GCP Cloud Run은 process.env.PORT를 사용합니다)
const port = process.env.PORT || 8080;
app.listen(port, '0.0.0.0', () => {
  console.log(`Proxy server listening on :${port}`);
});