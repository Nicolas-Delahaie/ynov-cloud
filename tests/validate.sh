#!/usr/bin/env bash
# Usage: APP_URL=http://... ./tests/validate.sh selfhealing|ha
set -euo pipefail

APP_URL="${APP_URL:-http://178.170.25.230.nip.io}"

selfhealing() {
  curl -sf "$APP_URL/api/health/db" > /dev/null

  echo "=== SELF-HEALING — état avant kill ==="
  kubectl get pods -l app=worldcup-app

  echo ""
  echo "Envoi POST /api/admin/kill..."
  START=$(date +%s%N)
  curl -sf -X POST "$APP_URL/api/admin/kill" > /dev/null 2>&1 || true

  RECOVERED=0
  for i in $(seq 1 30); do
    sleep 1
    if curl -sf --max-time 2 "$APP_URL/api/health/db" > /dev/null 2>&1; then
      ELAPSED=$(( ($(date +%s%N) - START) / 1000000 ))
      RECOVERED=1
      echo ""
      if [ "$i" -le 15 ]; then
        echo "PASS — app UP en ${i}s (${ELAPSED}ms) — critere < 15s respecte"
      else
        echo "FAIL — app UP en ${i}s (${ELAPSED}ms) — critere < 15s non respecte"
      fi
      break
    fi
    printf "  . %2ds\n" "$i"
  done

  [ "$RECOVERED" -eq 0 ] && echo "FAIL — app n'a pas repondu en 30s"

  echo ""
  echo "=== Etat immediat (pod en Error attendu) ==="
  kubectl get pods -l app=worldcup-app

  echo ""
  echo "Attente de la recuperation complete du pod (max 30s)..."
  kubectl wait --for=condition=Ready pod -l app=worldcup-app --timeout=30s

  echo ""
  echo "=== Etat apres recuperation ==="
  kubectl get pods -l app=worldcup-app
}

ha() {
  echo "=== HAUTE DISPONIBILITE — etat avant suppression ==="
  kubectl get pods -l app=worldcup-app

  POD=$(kubectl get pods -l app=worldcup-app -o jsonpath='{.items[0].metadata.name}')
  if [ -z "$POD" ]; then
    echo "FAIL — aucun pod trouve avec le label app=worldcup-app"
    exit 1
  fi

  echo ""
  echo "Suppression de $POD..."
  kubectl delete pod "$POD" --grace-period=0 &

  echo ""
  echo "Disponibilite pendant 10s :"
  OK=0
  for i in $(seq 1 10); do
    sleep 1
    STATUS=$(curl -sf --max-time 2 -o /dev/null -w "%{http_code}" "$APP_URL/api/health/db" 2>/dev/null || echo 000)
    [ "$STATUS" = "200" ] && OK=$((OK+1))
    printf "  %2ds -> %s\n" "$i" "$STATUS"
  done
  wait

  echo ""
  echo "=== Pods apres suppression ==="
  kubectl get pods -l app=worldcup-app

  echo ""
  if [ "$OK" -eq 10 ]; then
    echo "PASS — ${OK}/10 requetes OK — zero downtime"
  else
    echo "FAIL — ${OK}/10 requetes OK"
  fi
}

case "${1:-}" in
  selfhealing) selfhealing ;;
  ha) ha ;;
  *)
    echo "Usage: $0 selfhealing|ha"
    exit 1
    ;;
esac
