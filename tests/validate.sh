#!/usr/bin/env bash
# Usage: APP_URL=http://... ./tests/validate.sh selfhealing|ha
set -euo pipefail

APP_URL="${APP_URL:-http://178.170.25.230.nip.io}"

selfhealing() {
  curl -sf "$APP_URL/api/health/db" > /dev/null

  echo "Pods avant kill :"
  kubectl get pods -l app=worldcup-app

  echo -e "\nEnvoi POST /api/admin/kill..."
  START=$(date +%s%N)
  curl -sf -X POST "$APP_URL/api/admin/kill" > /dev/null 2>&1 || true

  echo "Attente du retour (max 30s)..."
  for i in $(seq 1 30); do
    sleep 1
    if curl -sf --max-time 2 "$APP_URL/api/health/db" > /dev/null 2>&1; then
      ELAPSED=$(( ($(date +%s%N) - START) / 1000000 ))
      echo "app UP — restart en ${i}s (${ELAPSED}ms)"
      break
    fi
    echo "  . ${i}s"
  done

  kubectl get pods -l app=worldcup-app
}

ha() {
  echo "Pods avant suppression :"
  kubectl get pods -l app=worldcup-app

  POD=$(kubectl get pods -l app=worldcup-app -o jsonpath='{.items[0].metadata.name}')
  echo -e "\nSuppression de $POD..."
  kubectl delete pod "$POD" --grace-period=0 &

  echo "Disponibilité pendant 10s :"
  OK=0
  for i in $(seq 1 10); do
    sleep 1
    STATUS=$(curl -sf --max-time 2 -o /dev/null -w "%{http_code}" "$APP_URL/api/health/db" 2>/dev/null || echo 000)
    [ "$STATUS" = "200" ] && OK=$((OK+1))
    printf "  %2ds -> %s\n" "$i" "$STATUS"
  done
  wait

  echo -e "\nPods après suppression :"
  kubectl get pods -l app=worldcup-app
  echo "Résultat : ${OK}/10 requêtes OK"
}

case "${1:-}" in
  selfhealing) selfhealing ;;
  ha) ha ;;
  *) echo "Usage: $0 selfhealing|ha" ; exit 1 ;;
esac
