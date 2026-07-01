/**
 * Test d'élasticité — Bloc 5
 *
 * But : saturer le CPU des pods app pour déclencher l'HPA et observer
 * la création de nouveaux pods (min 2 → jusqu'à 6).
 *
 * Prérequis :
 *   brew install k6            # macOS
 *   apt install k6             # Debian/Ubuntu
 *
 * Usage :
 *   BASE_URL=http://<IP>.nip.io k6 run tests/k6-load-test.js
 *
 * Surveiller en parallèle :
 *   watch -n5 kubectl get hpa worldcup-hpa
 *   watch -n5 kubectl get pods -l app=worldcup-app
 */

import http from "k6/http";
import { check, sleep } from "k6";
import { textSummary } from "https://jslib.k6.io/k6-summary/0.0.2/index.js";

const BASE_URL = __ENV.BASE_URL || "http://localhost:3000";

export const options = {
  stages: [
    // Montée progressive : 0 → 30 VUs sur 1 min (déclenche HPA)
    { duration: "1m", target: 30 },
    // Maintien de la charge : 2 min pour que l'HPA ait le temps de scaler
    { duration: "2m", target: 30 },
    // Descente douce : vérifier le scale-down
    { duration: "1m", target: 0 },
  ],
  thresholds: {
    // 95 % des requêtes doivent répondre (pas de SLA strict sur la latence
    // car /api/compute est intentionnellement lent 2-3 s)
    http_req_failed: ["rate<0.05"],
  },
};

export default function () {
  const res = http.get(`${BASE_URL}/api/compute`, { timeout: "15s" });

  check(res, {
    "status 200": (r) => r.status === 200,
    "contient result": (r) => {
      try {
        return JSON.parse(r.body).result > 0;
      } catch {
        return false;
      }
    },
  });

  // Pas de sleep : on veut saturer le CPU en continu
}

export function handleSummary(data) {
  return { stdout: textSummary(data, { indent: "  ", enableColors: true }) };
}
