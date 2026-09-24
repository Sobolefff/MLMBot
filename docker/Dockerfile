FROM node:20-slim

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json* ./
RUN npm install --omit=dev --no-audit --no-fund

COPY . .

RUN npx playwright install --with-deps chromium

ENV NODE_ENV=production
EXPOSE 3000

CMD ["node", "src/index.js"]
