#!/usr/bin/env bash
# Roll one ISMS environment forward to a published image, with health-gated
# rollback. Used by .github/workflows/deploy.yml over SSH, and safe to run by
# hand on the server:
#
#   deploy/release.sh staging ghcr.io/pixelcare-consulting/isms:sha-<40 hex>
#   deploy/release.sh prod    ghcr.io/pixelcare-consulting/isms:v1.4.0
#
# Steps: pull image → ensure postgres up → run migrator → recreate app →
# wait for the Docker HEALTHCHECK → on failure, restore the previous image.
set -euo pipefail

ENV_NAME="${1:?usage: deploy/release.sh <staging|prod|dev> <image>}"
NEW_IMAGE="${2:?usage: deploy/release.sh <staging|prod|dev> <image>}"
HEALTH_ATTEMPTS="${HEALTH_ATTEMPTS:-45}"   # × 2s

cd "$(dirname "$0")/.."
STACK="deploy/stack.sh ${ENV_NAME}"

app_container() { $STACK ps -q app 2>/dev/null | head -n1; }

wait_for_health() {
  local cid status
  for _ in $(seq 1 "$HEALTH_ATTEMPTS"); do
    cid="$(app_container)"
    if [ -n "$cid" ]; then
      status="$(docker inspect --format '{{.State.Health.Status}}' "$cid" 2>/dev/null || true)"
      case "$status" in
        healthy)   return 0 ;;
        unhealthy) return 1 ;;
      esac
    fi
    sleep 2
  done
  return 1
}

previous_image=""
if cid="$(app_container)" && [ -n "$cid" ]; then
  previous_image="$(docker inspect --format '{{.Config.Image}}' "$cid" 2>/dev/null || true)"
fi

echo "[release] ${ENV_NAME}: ${previous_image:-<none>} → ${NEW_IMAGE}"
export APP_IMAGE="$NEW_IMAGE"

$STACK pull --quiet app
$STACK up -d postgres
$STACK run --rm migrator
$STACK up -d --no-deps app

if wait_for_health; then
  $STACK up -d --remove-orphans            # bring cron / backup sidecars in line
  echo "[release] ${ENV_NAME} healthy on ${NEW_IMAGE}"
  exit 0
fi

echo "[release] new image failed its health check" >&2
$STACK logs --tail=100 app || true

if [ -n "$previous_image" ] && [ "$previous_image" != "$NEW_IMAGE" ]; then
  echo "[release] rolling back to ${previous_image}" >&2
  export APP_IMAGE="$previous_image"
  $STACK up -d --no-deps app
  if wait_for_health; then
    echo "[release] rollback healthy" >&2
  else
    echo "[release] rollback image is NOT healthy either" >&2
    $STACK logs --tail=100 app || true
  fi
else
  echo "[release] no previous image available for rollback" >&2
fi
exit 1
