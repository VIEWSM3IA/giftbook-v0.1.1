#!/usr/bin/env bash
set -euo pipefail
PG_BIN=${PG_BIN:-/usr/lib/postgresql/17/bin}
GIFTBOOK_PG_DATA=${GIFTBOOK_PG_DATA:-$HOME/.local/share/giftbook-v01-postgres}
mkdir -p "$GIFTBOOK_PG_DATA"
if [ ! -f "$GIFTBOOK_PG_DATA/PG_VERSION" ]; then
  "$PG_BIN/initdb" -D "$GIFTBOOK_PG_DATA" --auth-local=trust --auth-host=trust --username=giftbook >/dev/null
fi
if ! "$PG_BIN/pg_ctl" -D "$GIFTBOOK_PG_DATA" status >/dev/null 2>&1; then
  "$PG_BIN/pg_ctl" -D "$GIFTBOOK_PG_DATA" -l "$GIFTBOOK_PG_DATA/server.log" -o "-h 127.0.0.1 -p 55437 -k $GIFTBOOK_PG_DATA" start
fi
if ! "$PG_BIN/psql" -h 127.0.0.1 -p 55437 -U giftbook -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='giftbook'" | rg -q 1; then
  "$PG_BIN/createdb" -h 127.0.0.1 -p 55437 -U giftbook giftbook
fi
