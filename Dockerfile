FROM caddy:2-alpine

# Copy Caddyfile config
COPY Caddyfile /etc/caddy/Caddyfile

# Copy web assets to the Caddy root serving directory
COPY index.html /usr/share/caddy/
COPY style.css /usr/share/caddy/
COPY app.js /usr/share/caddy/
COPY i18n.js /usr/share/caddy/
COPY manifest.json /usr/share/caddy/
COPY sw.js /usr/share/caddy/
COPY icon.svg /usr/share/caddy/
COPY icon-192.png /usr/share/caddy/
COPY icon-512.png /usr/share/caddy/
COPY apple-touch-icon.png /usr/share/caddy/
COPY apple-touch-icon-167.png /usr/share/caddy/
COPY fonts/ /usr/share/caddy/fonts/

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO /dev/null http://localhost:80/ || exit 1

# Expose HTTP and HTTPS ports
EXPOSE 80
EXPOSE 443
