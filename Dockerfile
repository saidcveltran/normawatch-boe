# Imagen base fijada por digest (índice OCI de apify/actor-node:24, consultado el 2026-10-19).
# Para actualizarla, consulta el digest nuevo en el registro y cámbialo aquí.
FROM apify/actor-node:24@sha256:72bc5f3e1c8440f7c4dad6973ea5be28db5b92262a14a3bbcfe3b9a9f12119a2

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund \
    && npm cache clean --force

COPY src ./src
COPY .actor ./.actor

# Node 24 ejecuta TypeScript directamente (eliminación de tipos); no hay paso de compilación.
CMD ["node", "src/main.ts"]
