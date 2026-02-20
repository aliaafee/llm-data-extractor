#!/usr/bin/env bash
# install.sh - Clone, build and install llm-data-extractor to /opt/extract-webapp
# and register a systemd service to start the server on boot.
#
# Usage: sudo bash install.sh [options]
#
# Options:
#   --localai-url            LocalAI base URL              (default: http://localhost:8080/v1)
#   --localai-model          Model name to use             (default: gpt-4)
#   --context-size           Context window size in tokens (default: 3000)
#   --prompt-overhead-tokens Reserved tokens for prompts   (default: 1000)
#   --port                   Port the server listens on    (default: 3000)
#   --user                   System user to run the service as (default: extract-webapp)
#
# All options can also be preset via environment variables of the same name.

set -euo pipefail

# ── Defaults ──────────────────────────────────────────────────────────────────
REPO_URL="https://github.com/aliaafee/llm-data-extractor.git"
INSTALL_DIR="/opt/extract-webapp"
SERVICE_NAME="extract-webapp"
SERVICE_USER="${SERVICE_USER:-extract-webapp}"
PORT="${PORT:-3000}"
LOCALAI_BASE_URL="${LOCALAI_BASE_URL:-http://localhost:8080/v1}"
LOCALAI_MODEL="${LOCALAI_MODEL:-gpt-4}"
CONTEXT_SIZE="${CONTEXT_SIZE:-3000}"
PROMPT_OVERHEAD_TOKENS="${PROMPT_OVERHEAD_TOKENS:-1000}"

# ── Argument parsing ──────────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case "$1" in
    --localai-url)            LOCALAI_BASE_URL="$2";        shift 2 ;;
    --localai-model)          LOCALAI_MODEL="$2";           shift 2 ;;
    --context-size)           CONTEXT_SIZE="$2";            shift 2 ;;
    --prompt-overhead-tokens) PROMPT_OVERHEAD_TOKENS="$2";  shift 2 ;;
    --port)                   PORT="$2";                    shift 2 ;;
    --user)                   SERVICE_USER="$2";            shift 2 ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

# ── Helpers ───────────────────────────────────────────────────────────────────
info()  { echo -e "\e[32m[INFO]\e[0m  $*"; }
warn()  { echo -e "\e[33m[WARN]\e[0m  $*"; }
error() { echo -e "\e[31m[ERROR]\e[0m $*" >&2; exit 1; }

require_cmd() { command -v "$1" &>/dev/null || error "'$1' is not installed. Please install it and re-run."; }

# ── Pre-flight checks ─────────────────────────────────────────────────────────
[[ $EUID -eq 0 ]] || error "This script must be run as root (use sudo)."

require_cmd git
require_cmd node
require_cmd npm

NODE_MAJOR=$(node -e "process.stdout.write(process.versions.node.split('.')[0])")
[[ $NODE_MAJOR -ge 18 ]] || error "Node.js 18+ is required (found v$(node -v))."

info "LocalAI configuration (press Enter to accept the default shown in brackets):"
read -rp "  LOCALAI_BASE_URL [${LOCALAI_BASE_URL}]: " _input
[[ -n "$_input" ]] && LOCALAI_BASE_URL="$_input"

read -rp "  LOCALAI_MODEL [${LOCALAI_MODEL}]: " _input
[[ -n "$_input" ]] && LOCALAI_MODEL="$_input"

read -rp "  CONTEXT_SIZE [${CONTEXT_SIZE}]: " _input
[[ -n "$_input" ]] && CONTEXT_SIZE="$_input"

read -rp "  PROMPT_OVERHEAD_TOKENS [${PROMPT_OVERHEAD_TOKENS}]: " _input
[[ -n "$_input" ]] && PROMPT_OVERHEAD_TOKENS="$_input"

# ── Clone into a temp directory ───────────────────────────────────────────────
TMP_DIR=$(mktemp -d)
trap 'rm -rf "$TMP_DIR"' EXIT

info "Cloning $REPO_URL ..."
git clone --depth 1 "$REPO_URL" "$TMP_DIR/repo"

# ── Build the React client ────────────────────────────────────────────────────
info "Installing client dependencies ..."
npm --prefix "$TMP_DIR/repo/extract-webapp/client" ci --silent

info "Building client (output → server/public) ..."
npm --prefix "$TMP_DIR/repo/extract-webapp/client" run build

# ── Install server dependencies ───────────────────────────────────────────────
info "Installing server dependencies ..."
npm --prefix "$TMP_DIR/repo/extract-webapp/server" ci --omit=dev --silent

# ── Create install directory and copy files ───────────────────────────────────
info "Installing to $INSTALL_DIR ..."
mkdir -p "$INSTALL_DIR"

# Copy server directory (includes built public/ from Vite)
cp -a "$TMP_DIR/repo/extract-webapp/server/." "$INSTALL_DIR/"

# Ensure runtime directories exist
mkdir -p "$INSTALL_DIR/uploads"

# ── Write .env file ───────────────────────────────────────────────────────────
ENV_FILE="$INSTALL_DIR/.env"
if [[ -f "$ENV_FILE" ]]; then
  warn ".env already exists at $ENV_FILE — skipping overwrite. Edit it manually if needed."
else
  info "Writing $ENV_FILE ..."
  cat > "$ENV_FILE" <<EOF
# LLM Data Extractor – server configuration
LOCALAI_BASE_URL=${LOCALAI_BASE_URL}
LOCALAI_MODEL=${LOCALAI_MODEL}
CONTEXT_SIZE=${CONTEXT_SIZE}
PROMPT_OVERHEAD_TOKENS=${PROMPT_OVERHEAD_TOKENS}
PORT=${PORT}
EOF
fi

# ── Create dedicated system user (if it doesn't exist) ───────────────────────
if ! id -u "$SERVICE_USER" &>/dev/null; then
  info "Creating system user '$SERVICE_USER' ..."
  useradd --system --no-create-home --shell /usr/sbin/nologin "$SERVICE_USER"
fi

# ── Fix ownership ─────────────────────────────────────────────────────────────
chown -R "$SERVICE_USER:$SERVICE_USER" "$INSTALL_DIR"
chmod 750 "$INSTALL_DIR"
chmod 640 "$ENV_FILE"   # protect the API key

# ── Write systemd unit file ───────────────────────────────────────────────────
UNIT_FILE="/etc/systemd/system/${SERVICE_NAME}.service"
info "Writing systemd unit $UNIT_FILE ..."

cat > "$UNIT_FILE" <<EOF
[Unit]
Description=LLM Data Extractor Web Application
After=network.target

[Service]
Type=simple
User=${SERVICE_USER}
Group=${SERVICE_USER}
WorkingDirectory=${INSTALL_DIR}
EnvironmentFile=${INSTALL_DIR}/.env
ExecStart=$(command -v node) ${INSTALL_DIR}/index.js
Restart=on-failure
RestartSec=5
# Harden the service
NoNewPrivileges=true
ProtectSystem=full
PrivateTmp=true
# Allow writes only inside the install dir
ReadWritePaths=${INSTALL_DIR}

[Install]
WantedBy=multi-user.target
EOF

# ── Enable and start the service ──────────────────────────────────────────────
info "Reloading systemd and enabling $SERVICE_NAME ..."
systemctl daemon-reload
systemctl enable "${SERVICE_NAME}.service"
systemctl restart "${SERVICE_NAME}.service"

# ── Done ──────────────────────────────────────────────────────────────────────
info "------------------------------------------------------------"
info "Installation complete!"
info "  App directory : $INSTALL_DIR"
info "  Service name  : $SERVICE_NAME"
info "  Listening on  : http://0.0.0.0:${PORT}"
info ""
info "Useful commands:"
info "  systemctl status  $SERVICE_NAME"
info "  systemctl stop    $SERVICE_NAME"
info "  journalctl -u     $SERVICE_NAME -f"
info ""
info "To change LocalAI settings or port, edit $ENV_FILE"
info "then run: systemctl restart $SERVICE_NAME"
info "------------------------------------------------------------"
