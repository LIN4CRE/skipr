FROM node:20-alpine

# Install ffmpeg
RUN apk add --no-cache ffmpeg

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm install --omit=dev

# Copy application source
COPY . .

ENV PORT=7005
ENV NODE_ENV=production

EXPOSE 7005

CMD ["node", "server.js"]
