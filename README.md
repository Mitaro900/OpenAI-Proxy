# OpenAI-Proxy
클라이언트(유니티)에서 받은 요청을 OpenAI API에 보내고 받은 응답을 다시 클라이언트로 보내기 위해 설계한 프록시 서버입니다.

# 로컬 실행 방법
PowerShell을 실행하시고 다음 순서대로 명령을 입력하세요.

npm install \
cp .env.example .env

생성한 .env에 OPENAI_API_KEY와 APP_TOKEN을 입력하시고, 다음 명령을 실행하세요.

npm start

# 테스트 방법
curl.exe http://localhost:8080/health \
curl.exe -X POST http://localhost:8080/chat -H "Content-Type: application/json" -H "X-App-Token: 여기에 앱 토큰 입력" --% -d "{\"input\":\"안녕!\",\"npcPrompt\":\"너는 친절한 NPC야.\"}"
