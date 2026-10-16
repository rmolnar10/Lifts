#!/usr/bin/env bash
# Installs a personal WHOOP MCP server (github.com/shashankswe2020-ux/whoop-mcp)
# on a fresh Debian/Ubuntu VPS, behind Caddy with automatic HTTPS, ready to add
# to claude.ai as a custom connector.
#
# Run as root on the VPS:
#   bash <(curl -fsSL https://raw.githubusercontent.com/rmolnar10/Lifts/main/ops/whoop-mcp/install.sh)
#
# Safe to re-run: existing secrets and WHOOP tokens in /opt/whoop-mcp are kept.
# Optional env: WHOOP_MCP_DOMAIN (default whoop-<ip>.sslip.io), WHOOP_MCP_REF.
set -euo pipefail

REF="${WHOOP_MCP_REF:-v0.9.1}"
REPO="https://github.com/shashankswe2020-ux/whoop-mcp.git"
DIR=/opt/whoop-mcp
IMAGE="whoop-mcp:${REF}"
CALLBACK_PORT=3000

say() { printf '\n\033[1m%s\033[0m\n' "$*"; }
die() { printf '\n\033[31mError:\033[0m %s\n' "$*" >&2; exit 1; }
ask() { local _v; read -r -p "$1" _v </dev/tty; printf '%s' "$_v"; }
ask_secret() { local _v; read -r -s -p "$1" _v </dev/tty; echo >&2; printf '%s' "$_v"; }

[ "$(id -u)" -eq 0 ] || die "run this as root (or with sudo)."
command -v apt-get >/dev/null || die "this script expects Debian or Ubuntu."

say "1/6  Installing Docker and tools (skipped if present)"
command -v curl >/dev/null && command -v git >/dev/null && command -v openssl >/dev/null && command -v ss >/dev/null || {
  apt-get update -qq && apt-get install -y -qq curl git openssl ca-certificates iproute2 >/dev/null
}
command -v docker >/dev/null || curl -fsSL https://get.docker.com | sh
docker compose version >/dev/null 2>&1 || die "docker compose plugin missing; install docker-compose-plugin."

mkdir -p "$DIR/data"
chmod 700 "$DIR"
ENV_FILE="$DIR/.env"
[ -f "$ENV_FILE" ] && set -a && . "$ENV_FILE" && set +a

say "2/6  Picking the public address"
if [ -n "${WHOOP_MCP_DOMAIN:-}" ]; then
  DOMAIN="$WHOOP_MCP_DOMAIN"
elif [ -z "${DOMAIN:-}" ]; then
  IP="$(curl -4 -fsS https://api.ipify.org)" || die "could not detect this server's public IPv4."
  DOMAIN="whoop-${IP//./-}.sslip.io"
fi
echo "Server address: https://$DOMAIN"

if ! docker ps --format '{{.Names}}' | grep -qx whoop-mcp-caddy; then
  for p in 80 443 "$CALLBACK_PORT"; do
    if ss -ltnH "( sport = :$p )" | grep -q .; then
      die "port $p is already in use on this server. Free it, or put this behind your existing proxy instead (see README.md next to this script)."
    fi
  done
fi

say "3/6  WHOOP developer app credentials"
if [ -z "${WHOOP_CLIENT_ID:-}" ] || [ -z "${WHOOP_CLIENT_SECRET:-}" ]; then
  echo "From https://developer.whoop.com (redirect URL must be http://localhost:3000/callback)."
  WHOOP_CLIENT_ID="$(ask 'Client ID: ')"
  WHOOP_CLIENT_SECRET="$(ask_secret 'Client Secret (hidden): ')"
  [ -n "$WHOOP_CLIENT_ID" ] && [ -n "$WHOOP_CLIENT_SECRET" ] || die "both values are required."
else
  echo "Reusing credentials saved in $ENV_FILE."
fi
export WHOOP_CLIENT_ID WHOOP_CLIENT_SECRET
MCP_AUTH_TOKEN="${MCP_AUTH_TOKEN:-$(openssl rand -hex 32)}"
MCP_CONNECTOR_PASSWORD="${MCP_CONNECTOR_PASSWORD:-$(openssl rand -base64 18 | tr -d '/+=' | cut -c1-20)}"

umask 077
cat >"$ENV_FILE" <<EOF
DOMAIN=$DOMAIN
WHOOP_CLIENT_ID=$WHOOP_CLIENT_ID
WHOOP_CLIENT_SECRET=$WHOOP_CLIENT_SECRET
MCP_AUTH_TOKEN=$MCP_AUTH_TOKEN
MCP_CONNECTOR_PASSWORD=$MCP_CONNECTOR_PASSWORD
PUBLIC_URL=https://$DOMAIN
ALLOWED_REDIRECT_URIS=https://claude.ai/api/mcp/auth_callback
MCP_ALLOWED_ORIGINS=https://claude.ai
MCP_TRUST_PROXY=1
MCP_TRANSPORT=http
LOG_FORMAT=json
EOF
umask 022

say "4/6  Building the server image ($REF)"
if ! docker image inspect "$IMAGE" >/dev/null 2>&1; then
  rm -rf "$DIR/src"
  git clone -q --depth 1 --branch "$REF" "$REPO" "$DIR/src"
  docker build -q -t "$IMAGE" "$DIR/src" >/dev/null
fi
chown -R 1000:1000 "$DIR/data"
chmod 700 "$DIR/data"

say "5/6  Signing in to WHOOP (one time)"
if [ -s "$DIR/data/tokens.json" ]; then
  echo "WHOOP tokens already present, skipping sign-in."
else
  LOG="$(mktemp)"
  docker rm -f whoop-mcp-login >/dev/null 2>&1 || true
  docker run -d --name whoop-mcp-login --network host \
    -e WHOOP_CLIENT_ID -e WHOOP_CLIENT_SECRET \
    -v "$DIR/data:/home/node/.whoop-mcp" \
    "$IMAGE" node dist/index.js setup --client=claude-code --verify --telemetry=off >/dev/null
  AUTH_URL=""
  for _ in $(seq 1 30); do
    AUTH_URL="$(docker logs whoop-mcp-login 2>&1 | grep -o 'https://api\.prod\.whoop\.com/oauth/oauth2/auth[^[:space:]]*' | head -1 || true)"
    [ -n "$AUTH_URL" ] && break
    sleep 1
  done
  [ -n "$AUTH_URL" ] || { docker logs whoop-mcp-login 2>&1 | grep -v -i secret | tail -20; docker rm -f whoop-mcp-login >/dev/null; die "sign-in did not start."; }

  cat <<EOF

Open this link on your phone or computer and approve access:

$AUTH_URL

WHOOP will then send you to a page starting with http://localhost:3000/callback
that fails to load. That is expected. Copy that page's full address from the
address bar and paste it below.

EOF
  CB="$(ask 'Paste the localhost address: ')"
  case "$CB" in
    http://localhost:3000/callback\?*|http://127.0.0.1:3000/callback\?*) ;;
    *) docker rm -f whoop-mcp-login >/dev/null; die "that doesn't look like the http://localhost:3000/callback?... address. Re-run the script to try again." ;;
  esac
  CB="http://127.0.0.1:3000/callback?${CB#*\?}"
  curl -fsS -o /dev/null "$CB" || true
  STATUS="$(docker wait whoop-mcp-login)"
  docker logs whoop-mcp-login >"$LOG" 2>&1 || true
  docker rm whoop-mcp-login >/dev/null
  if [ "$STATUS" != "0" ] || [ ! -s "$DIR/data/tokens.json" ]; then
    grep -v -i -E 'secret|claude mcp add' "$LOG" | tail -20
    rm -f "$LOG"
    die "WHOOP sign-in failed (see above). Check the client ID/secret and redirect URL, then re-run."
  fi
  grep -o "Profile OK.*" "$LOG" | head -1 || true
  rm -f "$LOG"
  echo "WHOOP sign-in worked."
fi

say "6/6  Starting the server and HTTPS proxy"
cat >"$DIR/Caddyfile" <<EOF
$DOMAIN {
	encode gzip
	reverse_proxy whoop-mcp:3000 {
		flush_interval -1
	}
}
EOF
cat >"$DIR/compose.yaml" <<EOF
services:
  whoop-mcp:
    image: $IMAGE
    container_name: whoop-mcp
    restart: unless-stopped
    env_file: .env
    volumes:
      - ./data:/home/node/.whoop-mcp
  caddy:
    image: caddy:2
    container_name: whoop-mcp-caddy
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy_data:/data
    depends_on:
      - whoop-mcp
volumes:
  caddy_data:
EOF
docker compose -f "$DIR/compose.yaml" --project-directory "$DIR" up -d --remove-orphans >/dev/null

echo "Waiting for HTTPS certificate..."
OK=""
for _ in $(seq 1 45); do
  if curl -fsS "https://$DOMAIN/health" 2>/dev/null | grep -q '"ok"'; then OK=1; break; fi
  sleep 2
done
[ -n "$OK" ] || die "server started but https://$DOMAIN/health is not answering. Check that ports 80 and 443 are open in the Hetzner firewall, then run: docker compose -f $DIR/compose.yaml logs"

cat <<EOF

Done. Add it in claude.ai:
  Settings > Connectors > Add custom connector
  Name:  Whoop
  URL:   https://$DOMAIN/mcp
  Advanced settings > OAuth Client ID:  whoop-mcp-connector
  (leave OAuth Client Secret empty)

When it asks you to authorize, enter this connector password:
  $MCP_CONNECTOR_PASSWORD

It is also saved in $ENV_FILE. To update later, re-run this script with
WHOOP_MCP_REF set to a newer release tag.
EOF
