# OpenAI-Proxy
클라이언트(유니티)에서 받은 요청을 OpenAI API에 보내고 받은 응답을 다시 클라이언트로 보내기 위해 설계한 프록시 서버입니다.

# 로컬 실행 방법
npm install
cp .env.example .env
# .env에 OPENAI_API_KEY 입력
node server.js

# 테스트 방법
curl http://localhost:3000/health
curl -X POST http://localhost:3000/chat \
  -H "Content-Type: application/json" \
  -d '{"input":"안녕!","npcPrompt":"너는 친절한 NPC야."}'
  