import http from "k6/http";
import { check } from "k6";
import { textSummary } from "https://jslib.k6.io/k6-summary/0.0.2/index.js";

const BASE_URL = __ENV.BASE_URL || "http://localhost:3000";

export const options = {
  stages: [
    { duration: "30s", target: 3 },
    { duration: "2m", target: 3 },
    { duration: "30s", target: 0 },
  ],
  thresholds: {
    http_req_failed: ["rate<0.05"],
  },
};

export default function loadTest() {
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
}

export function handleSummary(data) {
  return { stdout: textSummary(data, { indent: "  ", enableColors: true }) };
}
