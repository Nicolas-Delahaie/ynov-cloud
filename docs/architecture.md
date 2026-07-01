# Architecture

> Schéma de l'infrastructure déployée : VPS Ikoula → cluster k3s single-node →
> app Node.js + PostgreSQL, exposés via Traefik, observés par Prometheus/Grafana.

L'URL publique en tête du [README](../README.md). Tout tourne sur **un seul VPS**
(k3s single-node) — le point faible assumé à l'oral (voir
[argumentaire-soutenance.md](argumentaire-soutenance.md)).

---

## Vue d'ensemble

```mermaid
flowchart TB
    subgraph Internet
        Jury["👤 Jury / utilisateurs<br/>+ crash-test enseignant"]
    end

    subgraph VPS["VPS Ikoula — Debian, amd64, k3s single-node"]
        Traefik["Traefik (Ingress k3s)<br/>:80"]

        subgraph nsDefault["namespace: default"]
            subgraph appDeploy["Deployment worldcup-app (HPA 2→6)"]
                Pod1["Pod app #1<br/>Node.js :3000<br/>/metrics"]
                Pod2["Pod app #2<br/>Node.js :3000<br/>/metrics"]
            end
            SvcApp["Service worldcup-app<br/>ClusterIP :3000"]
            HPA["HPA<br/>cible CPU 60%<br/>min 2 / max 6"]

            subgraph pg["StatefulSet worldcup-postgres"]
                PgPod["Pod PostgreSQL 15<br/>:5432"]
                PVCpg[("PVC données<br/>postgres")]
            end
            SvcPg["Service worldcup-postgres<br/>ClusterIP :5432"]

            Cron["CronJob report<br/>(0 * * * *)"]
            PVCreport[("PVC rapports")]
            Secret["Secret<br/>worldcup-db-secret<br/>(DB_PASSWORD)"]
        end

        subgraph nsMon["namespace: monitoring"]
            Prom["Prometheus<br/>(kube-prometheus-stack)"]
            Graf["Grafana<br/>dashboard WorldCup"]
            SM["ServiceMonitor"]
            PR["PrometheusRule<br/>3 alertes"]
        end
    end

    Jury -->|"HTTP …nip.io"| Traefik
    Jury -->|"HTTP grafana.…nip.io"| Graf
    Traefik --> SvcApp
    SvcApp --> Pod1
    SvcApp --> Pod2
    HPA -.->|"scale 2..6"| Pod2
    Pod1 -->|SQL| SvcPg
    Pod2 -->|SQL| SvcPg
    SvcPg --> PgPod
    PgPod --- PVCpg
    Cron -->|"SQL lecture"| SvcPg
    Cron -->|"ecrit rapport"| PVCreport
    Secret -.->|"DB_PASSWORD"| Pod1
    Secret -.->|"DB_PASSWORD"| Pod2
    Secret -.->|"DB_PASSWORD"| PgPod

    SM -.->|"scrape /metrics"| SvcApp
    Prom --> SM
    Prom --> PR
    Graf -->|PromQL| Prom
```

---

## Flux et composants

| Composant | Rôle | Preuve en soutenance |
| --- | --- | --- |
| **Traefik (Ingress)** | Fourni par k3s, route `…nip.io` → Service app sur `:80` | URL publique répond |
| **Deployment `worldcup-app`** | 2 réplicas Node.js, probes `liveness`/`readiness` sur `/api/health/db` | Kill d'un pod → l'autre absorbe |
| **HPA** | Scale 2→6 pods si CPU moyen > 60 % | Load test `/api/compute` → pods montent |
| **Service (ClusterIP)** | Load-balancing interne entre pods app | — |
| **StatefulSet PostgreSQL** | Base persistante (PVC), init via ConfigMap `init.sql` | `/api/data`, `/api/votes/results` |
| **Secret K8s** | `DB_PASSWORD` injecté par `secretKeyRef` — jamais en clair dans Git | `grep` sur le repo = 0 credential |
| **CronJob report** | Lit la BDD toutes les heures, écrit un rapport horodaté dans un PVC | `docs/bloc6-job.md` |
| **kube-prometheus-stack** | Prometheus scrape `/metrics` via ServiceMonitor, Grafana affiche le dashboard, PrometheusRule porte 3 alertes | Dashboard live pendant le crash-test |

## Sources (single source of truth)

- Chart Helm : [`charts/worldcup/`](../charts/worldcup) — valeurs dans [`values.yaml`](../charts/worldcup/values.yaml)
- Monitoring : [`monitoring/`](../monitoring), doc [bloc4-observabilite.md](bloc4-observabilite.md)
- Déploiement : [deploy-prod.md](deploy-prod.md)
