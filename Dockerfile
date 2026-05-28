# 1. Node.js 공식 이미지 사용
FROM node:18-alpine

# 2. 컨테이너 내부 작업 디렉토리 설정
WORKDIR /usr/src/app

# 3. 의존성 파일 복사 및 설치
COPY package*.json ./
RUN npm install --only=production

# 4. 나머지 소스 코드 복사
COPY . .

# 5. Cloud Run이 사용할 포트 개방
EXPOSE 8080

# 6. 서버 실행 명령어
CMD [ "node", "server.js" ] # 본인의 메인 서버 파일명으로 변경하세요 (예: app.js)