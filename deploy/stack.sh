#!/usr/bin/env sh
# Run docker compose against one ISMS environment.
#
#   deploy/stack.sh <dev|staging|prod> <compose args…>
#
#   deploy/stack.sh dev     up -d --build
#   deploy/stack.sh staging logs -f app
#   deploy/stack.sh prod    exec postgres psql -U isms -d isms
#   deploy/stack.sh prod    config            # show the fully merged stack
#
# Picks .env.<env> for both interpolation and container env, and layers
# docker-compose.<env>.yml over the shared docker-compose.yml.
set -eu

ENV_NAME="${1:-}"
case "$ENV_NAME" in
  dev|staging|prod) shift ;;
  *)
    echo "usage: deploy/stack.sh <dev|staging|prod> <docker compose args…>" >&2
    exit 64
    ;;
esac

cd "$(dirname "$0")/.."

ENV_FILE=".env.${ENV_NAME}"
if [ ! -f "$ENV_FILE" ]; then
  echo "missing ${ENV_FILE} — copy ${ENV_FILE}.example and fill it in" >&2
  exit 66
fi

exec docker compose \
  --env-file "$ENV_FILE" \
  -f docker-compose.yml \
  -f "docker-compose.${ENV_NAME}.yml" \
  "$@"
