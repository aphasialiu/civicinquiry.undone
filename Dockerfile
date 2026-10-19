# 搜尋代理（測試替身）的容器範例。注意：這個檔案「沒有實際建置驗證過」（作者環境沒有 Docker）。
FROM node:22-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY src ./src
COPY server ./server
COPY content-src ./content-src
COPY tsconfig.json ./
ENV PORT=8787
EXPOSE 8787
USER node
CMD ["npx", "tsx", "server/index.ts"]
