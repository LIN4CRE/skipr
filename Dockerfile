FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

ENV PORT=7005
ENV DISABLE_TUNNEL=true
ENV NODE_ENV=production

EXPOSE 7005

CMD ["node", "server.js"]
