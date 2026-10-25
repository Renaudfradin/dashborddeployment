FROM node:20-alpine

RUN apk add --no-cache openssl

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .
RUN npx prisma generate

EXPOSE 8000

CMD ["sh", "-c", "npx prisma generate && npx prisma migrate deploy && node --watch-path=src src/server.js"]
