# Serveur en ligne MCS Gestion
FROM node:22-alpine
WORKDIR /app
COPY server ./server
COPY web ./web
COPY package.json ./
ENV PORT=4800 DATA_DIR=/data NODE_ENV=production
VOLUME /data
EXPOSE 4800
CMD ["node", "server/index.js"]
