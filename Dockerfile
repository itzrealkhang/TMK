FROM node:18-slim

RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

RUN pip3 install yt-dlp --break-system-packages || pip3 install yt-dlp

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .

RUN mkdir -p downloads uploads
RUN chmod 755 downloads uploads

EXPOSE 3000

CMD ["node", "index.js"]