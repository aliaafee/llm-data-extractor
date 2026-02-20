#!/usr/bin/env bash
# install.sh — Deploy llm-data-extractor on a Linux host
# Must be run as root (or with sudo).

set -euo pipefail

# ─── Configuration ────────────────────────────────────────────────────────────
GIT_REPO="https://github.com/aliaafee/llm-data-extractor.git"
INSTALL_DIR="/opt/llm-data-extractor"
APP_USER="llm-extractor"
SERVICE_NAME="llm-data-extractor"
NODE_VERSION="22"
SERVER_PORT="5000"
# ──────────────────────────────────────────────────────────────────────────────

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
info()    { echo -e "${GREEN}[INFO]${NC}  $*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC}  $*"; }
error()   { echo -e "${RED}[ERROR]${NC} $*" >&2; exit 1; }

# ── 0. Root check ──────────────────────────────────────────────────────────────
[[ $EUID -ne 0 ]] && error "This script must be run as root.  Try: sudo $0"

# ── 1. System prerequisites ────────────────────────────────────────────────────
info "Installing system prerequisites (git, curl, build-essential)..."
if command -v apt-get &>/dev/null; then
    apt-get update -qq
    apt-get install -y -qq git curl build-essential python3
elif command -v dnf &>/dev/null; then
    dnf install -y git curl gcc-c++ make python3
elif command -v yum &>/dev/null; then
    yum install -y git curl gcc-c++ make python3
else
    warn "Unknown package manager — make sure git, curl, and build tools are installed."
fi

# ── 2. Create application user ─────────────────────────────────────────────────
if id "$APP_USER" &>/dev/null; then
    info "User '$APP_USER' already exists, skipping creation."
else
    info "Creating system user '$APP_USER'..."
    useradd --system --shell /bin/bash --create-home "$APP_USER"
fi

APP_USER_HOME=$(getent passwd "$APP_USER" | cut -d: -f6)

# ── 3. Install / verify nvm + Node 22 for $APP_USER ───────────────────────────
NVM_DIR="$APP_USER_HOME/.nvm"

install_nvm_for_user() {
    info "Installing nvm for user '$APP_USER'..."
    sudo -u "$APP_USER" bash -c "
        export HOME='$APP_USER_HOME'
        curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
    "
}

if [[ -d "$NVM_DIR" ]]; then
    info "nvm directory found at $NVM_DIR."
else
    install_nvm_for_user
fi

# Load nvm in a subshell as $APP_USER and install / use Node 22
info "Ensuring Node.js $NODE_VERSION is installed via nvm..."
sudo -u "$APP_USER" bash --login -c "
    export NVM_DIR='$NVM_DIR'
    [ -s \"\$NVM_DIR/nvm.sh\" ] && . \"\$NVM_DIR/nvm.sh\"

    if nvm ls '$NODE_VERSION' 2>/dev/null | grep -q 'v$NODE_VERSION'; then
        echo 'Node $NODE_VERSION already installed.'
    else
        nvm install '$NODE_VERSION'
    fi

    nvm alias default '$NODE_VERSION'
    nvm use default
    node --version
    npm --version
"

# Resolve the path to the node/npm binaries installed by nvm
NODE_BIN_PATH=$(sudo -u "$APP_USER" bash --login -c "
    export NVM_DIR='$NVM_DIR'
    [ -s \"\$NVM_DIR/nvm.sh\" ] && . \"\$NVM_DIR/nvm.sh\"
    nvm use '$NODE_VERSION' &>/dev/null
    dirname \$(which node)
")
info "Node binary path: $NODE_BIN_PATH"

# ── 4. Clone / update repository ──────────────────────────────────────────────
if [[ -d "$INSTALL_DIR/.git" ]]; then
    info "Repository already cloned at $INSTALL_DIR, pulling latest changes..."
    sudo -u "$APP_USER" git -C "$INSTALL_DIR" pull --ff-only
else
    info "Cloning repository to $INSTALL_DIR..."
    git clone "$GIT_REPO" "$INSTALL_DIR"
    chown -R "$APP_USER:$APP_USER" "$INSTALL_DIR"
fi

# ── 5. Build client ────────────────────────────────────────────────────────────
info "Installing client dependencies and building..."
sudo -u "$APP_USER" bash --login -c "
    export NVM_DIR='$NVM_DIR'
    [ -s \"\$NVM_DIR/nvm.sh\" ] && . \"\$NVM_DIR/nvm.sh\"
    nvm use '$NODE_VERSION' &>/dev/null

    cd '$INSTALL_DIR/client'
    npm ci --prefer-offline
    npm run build
"

# ── 6. Install server dependencies ────────────────────────────────────────────
info "Installing server dependencies..."
sudo -u "$APP_USER" bash --login -c "
    export NVM_DIR='$NVM_DIR'
    [ -s \"\$NVM_DIR/nvm.sh\" ] && . \"\$NVM_DIR/nvm.sh\"
    nvm use '$NODE_VERSION' &>/dev/null

    cd '$INSTALL_DIR/server'
    npm ci --prefer-offline
"

# Ensure uploads dir has correct ownership and permissions
mkdir -p "$INSTALL_DIR/server/uploads"
chown -R "$APP_USER:$APP_USER" "$INSTALL_DIR"

# ── 7. Create systemd service file ────────────────────────────────────────────
SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}.service"
info "Writing systemd unit file to $SERVICE_FILE..."

cat > "$SERVICE_FILE" <<EOF
[Unit]
Description=LLM Data Extractor Node.js server
Documentation=https://github.com/aliaafee/llm-data-extractor
After=network.target

[Service]
Type=simple
User=${APP_USER}
WorkingDirectory=${INSTALL_DIR}/server
Environment="PATH=${NODE_BIN_PATH}:/usr/local/bin:/usr/bin:/bin"
Environment="NODE_ENV=production"
EnvironmentFile=-${INSTALL_DIR}/server/.env
ExecStart=${NODE_BIN_PATH}/node index.js
Restart=on-failure
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=${SERVICE_NAME}

# Security hardening
NoNewPrivileges=true
ProtectSystem=full
ProtectHome=read-only
ReadWritePaths=${INSTALL_DIR}/server/uploads ${INSTALL_DIR}/server

[Install]
WantedBy=multi-user.target
EOF

# ── 8. Enable and start the service ───────────────────────────────────────────
info "Reloading systemd daemon and enabling service..."
systemctl daemon-reload
systemctl enable "$SERVICE_NAME"

if systemctl is-active --quiet "$SERVICE_NAME"; then
    info "Restarting existing service..."
    systemctl restart "$SERVICE_NAME"
else
    info "Starting service for the first time..."
    systemctl start "$SERVICE_NAME"
fi

# ── 9. Summary ─────────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}═══════════════════════════════════════════════${NC}"
echo -e "${GREEN} Installation complete!${NC}"
echo -e "${GREEN}═══════════════════════════════════════════════${NC}"
echo -e "  Install dir : $INSTALL_DIR"
echo -e "  Service user: $APP_USER"
echo -e "  Service name: $SERVICE_NAME"
echo -e "  Listening on: http://0.0.0.0:$SERVER_PORT"
echo -e "  Service logs: journalctl -u $SERVICE_NAME -f"
echo ""
echo -e "${YELLOW}NOTE:${NC} If the app requires an API key, place a .env file at:"
echo -e "      $INSTALL_DIR/server/.env"
echo -e "      e.g.  OPENAI_API_KEY=sk-..."
echo -e "      Then restart: systemctl restart $SERVICE_NAME"
echo ""
systemctl status "$SERVICE_NAME" --no-pager || true
