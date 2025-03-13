FROM node:18-slim

# Install dependencies
RUN apt-get update \
    && apt-get install -y \
        chromium \
        fonts-ipafont-gothic \
        fonts-wqy-zenhei \
        fonts-thai-tlwg \
        fonts-kacst \
        fonts-freefont-ttf \
        libxss1 \
        ca-certificates \
        fonts-liberation \
        libasound2 \
        libatk-bridge2.0-0 \
        libatk1.0-0 \
        libc6 \
        libcairo2 \
        libcups2 \
        libdbus-1-3 \
        libexpat1 \
        libfontconfig1 \
        libgbm1 \
        libgcc1 \
        libglib2.0-0 \
        libgtk-3-0 \
        libnspr4 \
        libnss3 \
        libpango-1.0-0 \
        libpangocairo-1.0-0 \
        libstdc++6 \
        libx11-6 \
        libx11-xcb1 \
        libxcb1 \
        libxcomposite1 \
        libxcursor1 \
        libxdamage1 \
        libxext6 \
        libxfixes3 \
        libxi6 \
        libxrandr2 \
        libxrender1 \
        libxss1 \
        libxtst6 \
        lsb-release \
        xdg-utils \
        wget \
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
    chown -R pptruser:pptruser /usr/lib/chromium/extensions

# Create app directory and set it as working directory
WORKDIR /app

# Create a non-root user
RUN groupadd -r pptruser && useradd -r -g pptruser -G audio,video pptruser \
    && mkdir -p /home/pptruser/Downloads \
    && chown -R pptruser:pptruser /home/pptruser

# Copy package files
COPY backend/package*.json ./backend/

# Install backend dependencies
WORKDIR /app/backend
RUN npm install

# Bundle app source
WORKDIR /app
COPY . .

# Give necessary permissions to non-root user
RUN chown -R pptruser:pptruser /app

# Set Puppeteer configuration to use system Chromium
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# Run everything after as non-root user
USER pptruser

WORKDIR /app/backend
EXPOSE 34001

CMD ["node", "server.js"] 