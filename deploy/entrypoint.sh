#!/bin/sh
# Container entrypoint shared by the `app` and `migrator` services.
# Waits until the Postgres named in DATABASE_URL accepts TCP connections,
# then execs whatever command the service defines. Migrations are NOT run
# here — the `migrator` service does that once per deploy (see compose files).
set -eu

DB_WAIT_TIMEOUT="${DB_WAIT_TIMEOUT:-60}"

if [ -n "${DATABASE_URL:-}" ]; then
  echo "[isms] waiting for database (timeout ${DB_WAIT_TIMEOUT}s)…"
  i=0
  until node -e '
    const u = new URL(process.env.DATABASE_URL);
    const net = require("net");
    const s = net.connect(Number(u.port || 5432), u.hostname, () => { s.end(); process.exit(0); });
    s.on("error", () => process.exit(1));
    setTimeout(() => process.exit(1), 2000);
  '; do
    i=$((i + 1))
    if [ "$i" -ge "$DB_WAIT_TIMEOUT" ]; then
      echo "[isms] database not reachable after ${DB_WAIT_TIMEOUT}s" >&2
      exit 1
    fi
    sleep 1
  done
  echo "[isms] database is reachable"
fi

exec "$@"
