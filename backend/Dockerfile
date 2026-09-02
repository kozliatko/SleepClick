FROM node:24-alpine

WORKDIR /app

# No dependencies to install — the server uses only the Node standard library
# (node:http, node:crypto, node:sqlite).
COPY package.json server.js db.js admin.js admin-web.js admin.html ./

RUN mkdir -p /data && chown -R node:node /data /app
USER node

ENV PORT=8080 \
    DB_PATH=/data/sleepclick.db

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:8080/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
