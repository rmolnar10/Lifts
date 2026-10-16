# WHOOP connector for Claude

A personal [WHOOP MCP server](https://github.com/shashankswe2020-ux/whoop-mcp) (v0.9.1, MIT) on a Hetzner VPS, so Claude on web, iOS and in Projects can read recovery, HRV, sleep, strain and workouts. Read-only, official WHOOP API.

The installer applies `multi-session.patch` on top of upstream. Without it the server's HTTP mode serves only one MCP session per process, so every claude.ai chat after the first fails with "Server already initialized" until a restart.

## Before you run it

1. **WHOOP developer app.** At [developer.whoop.com](https://developer.whoop.com), create an app:
   - Redirect URL: `http://localhost:3000/callback`
   - Scopes: `offline`, `read:recovery`, `read:cycles`, `read:workout`, `read:sleep`, `read:profile`, `read:body_measurement`
   - Keep the Client ID and Client Secret handy.
2. **Hetzner firewall.** If the server has a Cloud Firewall attached, allow inbound TCP 80 and 443.

## Install

SSH into the VPS as root (Termius works from iPhone) and run:

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/rmolnar10/Lifts/main/ops/whoop-mcp/install.sh)
```

The script installs Docker if needed, builds the server, and asks for the Client ID and Secret. It then prints a WHOOP sign-in link.
Open it on your phone and approve. WHOOP then lands on a `http://localhost:3000/callback?...` page that fails to load, which is expected. Copy that address, paste it into the terminal, and the script finishes. It starts the server behind Caddy with a free HTTPS address (`whoop-<your-ip>.sslip.io`) and prints the connector password.

## Add to Claude

claude.ai → Settings → Connectors → Add custom connector:

- Name: `Whoop`
- URL: `https://whoop-<your-ip>.sslip.io/mcp` (printed by the script)
- Advanced settings → OAuth Client ID: `whoop-mcp-connector`, leave the secret empty

Click Connect and enter the connector password on the page that opens. It then works in every Claude chat, the iOS app and Projects.

## Running it

Everything lives in `/opt/whoop-mcp` (`.env` holds secrets, `data/` holds WHOOP tokens).

- Logs: `docker compose -f /opt/whoop-mcp/compose.yaml logs -f`
- Restart: `docker compose -f /opt/whoop-mcp/compose.yaml restart`
- Upgrade to a newer release tag: `WHOOP_MCP_REF=vX.Y.Z bash <(curl -fsSL https://raw.githubusercontent.com/rmolnar10/Lifts/main/ops/whoop-mcp/install.sh)`
- Own domain: set `WHOOP_MCP_DOMAIN=whoop.example.com` (DNS A record to the VPS) and re-run.
- Re-do WHOOP sign-in: delete `/opt/whoop-mcp/data/tokens.json` and re-run.

If ports 80/443 are already used by another proxy on the box, the script stops. In that case, point your proxy at the `whoop-mcp` container on port 3000 instead of using the bundled Caddy.
