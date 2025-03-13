FROM node:18-slim

# Install dependencies for Puppeteer and FFmpeg
RUN apt-get update && apt-get install -y \
    ffmpeg \
    chromium \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libatspi2.0-0 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libgbm1 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libx11-xcb1 \
    libxcb-dri3-0 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxrandr2 \
    xdg-utils \
    wget \
    gnupg \
    ca-certificates \
    curl \
    unzip \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Download uBlock Origin
RUN mkdir -p /usr/lib/chromium/extensions && \
    wget -O /usr/lib/chromium/extensions/ublock.zip https://github.com/gorhill/uBlock/releases/download/1.55.0/uBlock0_1.55.0.chromium.zip && \
    cd /usr/lib/chromium/extensions && \
    unzip ublock.zip && \
    rm ublock.zip && \
    chown -R node:node /usr/lib/chromium/extensions

# Create app directory
WORKDIR /app

# Install app dependencies
COPY package*.json ./
RUN npm install

# Bundle app source
COPY . .

# Create data directory and set permissions
RUN mkdir -p /app/data && \
    chown -R node:node /app && \
    chown -R node:node /home/node

# Switch to non-root user
USER node

# Set Node.js environment
ENV NODE_ENV=production
ENV NODE_OPTIONS="--max-old-space-size=2048"

# Set Puppeteer configuration to use system Chromium
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# Expose port
EXPOSE 34001

# Start the application
CMD ["npm", "start"] 