#!/bin/bash
set -euo pipefail

SERVER_NAME="${1:?Usage: wipe-server.sh <server_name> <zomboid_dir>}"
ZOMBOID_DIR="${2:?Usage: wipe-server.sh <server_name> <zomboid_dir>}"

if [[ ! "$SERVER_NAME" =~ ^[A-Za-z0-9_-]{1,80}$ ]]; then
  echo "ERROR: Invalid server name. Use only letters, digits, underscores, or dashes."
  exit 1
fi

if [[ ! -d "$ZOMBOID_DIR" ]]; then
  echo "ERROR: Zomboid directory does not exist: $ZOMBOID_DIR"
  exit 1
fi

SAVES_DIR="$ZOMBOID_DIR/Saves/Multiplayer/$SERVER_NAME"
DB_FILE="$ZOMBOID_DIR/${SERVER_NAME}.db"
LOGS_DIR="$ZOMBOID_DIR/Logs"

echo "Stopping service..."
/usr/bin/systemctl stop project-zomboid.service

echo "Removing world data: $SAVES_DIR"
rm -rf "$SAVES_DIR"

echo "Removing database: $DB_FILE"
rm -f "$DB_FILE"

echo "Clearing logs: $LOGS_DIR"
rm -rf "$LOGS_DIR"/*
mkdir -p "$LOGS_DIR"

echo "Starting service..."
/usr/bin/systemctl start project-zomboid.service

echo "Wipe complete for $SERVER_NAME"