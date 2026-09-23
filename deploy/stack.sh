#!/usr/bin/env sh
# Run docker compose against one ISMS environment.
#
#   deploy/stack.sh <sandbox|develop|staging> <compose args…>
#
#   deploy/stack.sh sandbox up -d --build     # containers on this machine
#   deploy/stack.sh develop logs -f app       # deployed: internal testing
#   deploy/stack.sh staging exec postgres psql -U isms -d isms   # deployed: client QA
#   deploy/stack.sh staging config            # show the fully merged stack
#
# Production is not set up yet — see DEPLOYMENT.md.
#
# Picks .env.<env> for both interpolation and container env, and layers
# docker-compose.<env>.yml over the shared docker-compose.yml.
set -eu

ENV_NAME="${1:-}"
case "$ENV_NAME" in
  sandbox|develop|staging) shift ;;
  *)
    echo "usage: deploy/stack.sh <sandbox|develop|staging> <docker compose args…>" >&2
    exit 64
    ;;
esac

cd "$(dirname "$0")/.."

ENV_FILE=".env.${ENV_NAME}"
if [ ! -f "$ENV_FILE" ]; then
  echo "missing ${ENV_FILE} — create it from the \"Environment variables\" table in DEPLOYMENT.md" >&2
  exit 66
fi

exec docker compose \
  --env-file "$ENV_FILE" \
  -f docker-compose.yml \
  -f "docker-compose.${ENV_NAME}.yml" \
  "$@"
