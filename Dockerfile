# Base image: major tag for the scaffold; pin it by digest before release.
FROM apify/actor-node:24

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund \
    && npm cache clean --force

COPY src ./src
COPY .actor ./.actor

# Node 24 runs TypeScript directly (type stripping); no build step.
CMD ["node", "src/main.ts"]
