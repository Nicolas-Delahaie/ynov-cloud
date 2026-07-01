# Plan de réalisation — Capstone Coupe du Monde 2026

> Échéance : **2,5 jours** de réalisation + **soutenance 40 min** (revue d'ingénierie en direct, crash-test inclus).
> Stack décidée : **k3s (Kubernetes single-node) sur VPS Ikoula**.

⚠️ **Ne PAS modifier les routes de l'API** (`/`, `/api/health/db`, `/api/data`, `/api/vote`, `/api/votes/results`, `/metrics`, `/api/compute`, `/api/admin/kill`) — elles servent à l'évaluation automatisée.

| Pilier                        | Exigence technique                       | Preuve attendue en soutenance                |
| ----------------------------- | ---------------------------------------- | -------------------------------------------- |
| **Haute disponibilité**       | ≥ 2 réplicas, multi-AZ ou multi-nœud     | L'app reste UP si un pod/instance tombe      |
| **Élasticité**                | Auto-scaling sur CPU                     | Scaling visible sous charge (`/api/compute`) |
| **Résilience / Self-Healing** | Redémarrage auto après crash **< 15 s**  | `/api/admin/kill` → app revient seule        |
| **Observabilité**             | Dashboard + métriques + logs centralisés | Dashboard live pendant le load test          |
| **Sécurité**                  | Pas de credentials en clair dans Git     | Secrets gérés proprement                     |
| **FinOps**                    | Estimation de coût chiffrée              | Tableau de coût mensuel justifié             |

---

## Blocs d'exécution

### Bloc 0 — Environnement & repo `[Jour 6 - matin]`

> ⚠️ À lancer en priorité : la livraison d'un VPS ou la validation d'un compte AWS peut prendre plusieurs heures.

- [x] Récupérer les accès VPS Ikoula, vérifier SSH, OS, RAM/CPU/disque
- [x] Prise en main de l'app en local (`docker-compose up`, tester toutes les routes + `/metrics`)
- [x] Monter le dépôt Git d'équipe + répartition des rôles (voir [Annexe B](#annexe-b--répartition-déquipe))

---

### Bloc 1 — Dockerfile & image `[Jour 6 - après-midi]`

Corriger les **5 anti-patterns** du `app/Dockerfile` actuel :

1. `FROM node:latest` → tag flottant, image lourde et non reproductible → utiliser `node:20-alpine`
2. `COPY . .` avant `npm install` → casse le cache Docker à chaque modif → copier `package*.json` d'abord, puis `npm ci`, puis le code
3. `npm install` → non déterministe → `npm ci --omit=dev`
4. Tourne en root → créer un user non-privilégié (`USER node`)
5. Pas de multi-stage → multi-stage build (deps → runtime) + `HEALTHCHECK`

**Tâches :**

- [x] `app/Dockerfile` optimisé (multi-stage, user non-root, tag fixe, cache layers)
- [x] `app/.dockerignore`
- [x] `OPTIMISATION.md` : les 5 anti-patterns, le pourquoi, et le gain (taille avant/après via `docker images`)
- [x] Vérifier `docker compose up --build --wait` (app + db healthy) + suite jest en conteneur (`docker compose --profile test run --rm --build test`) → 6/7 vertes ; `dockerfile-check` relève du harnais enseignant (`teacher-tools/`, non fourni au dépôt étudiant)

---

### Bloc 2 — Cluster k3s `[Jour 6 - après-midi]`

- [x] Installer **k3s** sur le VPS Ikoula (cluster single-node)

---

### Bloc 3 — Déploiement Helm `[Jour 7 - matin]`

- [x] Build de l'image optimisée, tag versionné, push sur registry (GHCR ou Docker Hub)
- [x] Helm Chart (`charts/worldcup/`) :
  - [x] **Deployment app** : `replicas: 2`, `resources.requests/limits` (CPU obligatoire pour HPA), `liveness` + `readiness` probes (`/api/health/db`), `restartPolicy`
  - [x] **PostgreSQL** : StatefulSet + PVC persistant (ou `bitnami/postgresql`), `init.sql` chargé
  - [x] **Service** (ClusterIP) + **Ingress** (Traefik fourni par k3s) → app accessible sur internet
  - [x] **HPA** : auto-scaling CPU (cible 60 %, min 2 / max 6)
  - [x] **Secrets** K8s pour `DB_PASSWORD` etc. (jamais en clair dans Git)
  - [ ] _(bonus)_ **HTTPS** : cert-manager + Let's Encrypt

---

### Bloc 4 — Observabilité `[Jour 7 - après-midi]`

> Détails, justifications et runbook VPS : [docs/bloc4-observabilite.md](docs/bloc4-observabilite.md)
> Manifests **écrits**, à **déployer/tester sur le VPS** (k3s) — rien ne se valide en local.

- [x] **Prometheus** : `ServiceMonitor` dans le chart (via kube-prometheus-stack) — _écrit_
- [x] **Grafana** : dashboard req/s, latence p95, taux 5xx, CPU, mémoire, nb de pods (ConfigMap auto-importée) — _écrit_
- [x] **Logs** centralisés (`kubectl logs -l app=worldcup-app -f --prefix` ; bonus Loki documenté, non déployé)
- [x] **Alerting** (`PrometheusRule` : app down, taux 5xx élevé, latence p95 dégradée) — _écrit_
- [x] **Déployé + testé sur le VPS** (cible `up=1`, dashboard live, 3 alertes chargées, HA prouvée en kill — voir « Statut de validation » du doc)

---

### Bloc 5 — Validation & tests `[Jour 7 - après-midi]`

À répéter à blanc avant la soutenance :

- [x] **Élasticité** : `hey`/`k6` sur `/api/compute` → voir l'HPA créer des pods (`tests/k6-load-test.js`)
- [x] **Self-healing** : `POST /api/admin/kill` → pod recréé **< 15 s** (`tests/validate.sh selfhealing`)
- [x] **HA** : supprimer un pod → l'autre absorbe le trafic (`tests/validate.sh ha`)

Derniers résultats mesurés : voir [docs/bloc5-validation.md](docs/bloc5-validation.md#résultats).

---

### Bloc 6 — Job créatif `[Jour 8 - matin]`

> Détails et runbook : [docs/bloc6-job.md](docs/bloc6-job.md)

Un traitement qui **lit la BDD** et produit un résultat exploitable.

- [x] Design du Job : markdown explicable à l'oral (docs/bloc6-job.md)
- [x] _(bonus)_ Job fonctionnel : **K8s CronJob** qui calcule le classement par groupe et le palmarès des votes, et génère un rapport (CSV/JSON/Markdown) horodaté dans un PVC — _écrit, à jouer sur le VPS_
  - `app/jobs/report.js` (réutilise l'algo de `/api/standings`) + `cronjob-report.yaml` + `report-pvc.yaml`
  - Alternatives possibles : top des votes → webhook Discord/Slack, export CSV matchs, mini-prédiction de vainqueur

---

### Bloc 7 — CI/CD `[Jour 8 - matin]` _(bonus +1 pt)_

- [x] GitHub Actions : `docker build & push` automatisé sur GHCR à chaque push sur `main` (`.github/workflows/publish-image.yml`, doc dans [docs/publish-image.md](docs/publish-image.md))
- [ ] _(suite possible)_ étape `helm upgrade` (create/update/destroy démontrable)

---

### Bloc 8 — Finitions & soutenance `[Jour 8 - après-midi]`

- [x] **Schéma d'architecture** clair et légendé (Mermaid) — [docs/architecture.md](docs/architecture.md)
- [x] **Estimation de coût chiffrée** (FinOps) — tableau de coût mensuel justifié — [docs/finops.md](docs/finops.md)
- [x] **README** à jour : URL publique + accès dashboards + commande de déploiement
- [x] **Support de soutenance** : README (point d'entrée) → [docs/architecture.md](docs/architecture.md), [docs/finops.md](docs/finops.md), [docs/argumentaire-soutenance.md](docs/argumentaire-soutenance.md)
- [ ] **Répétition de la démo** à blanc : load test + chaos test + chrono self-healing — **à jouer sur le VPS**

---

## Annexe A — Checklist livrables finaux

- [x] `app/Dockerfile` optimisé + `OPTIMISATION.md`
- [x] IaC : Helm Chart (`charts/worldcup/`)
- [x] Image Docker publiée sur un registry
- [x] URL publique fonctionnelle (en tête du README)
- [x] Schéma d'architecture clair et légendé
- [x] Dashboard d'observabilité + alerting
- [x] Estimation de coût chiffrée (FinOps)
- [x] Design du Job (+ Job fonctionnel si bonus)
- [x] README dépôt à jour
- [x] Support de soutenance

---

## Annexe B — Répartition d'équipe

Chacun pilote un axe mais **tout le monde partage l'info** (le jury interroge n'importe qui sur n'importe quoi) :

- **Dev/App** : Dockerfile, image, registry, Job, CI/CD
- **Infra/Plateforme** : cluster, Helm, Ingress, HPA, probes, secrets
- **Observabilité/Soutenance** : Prometheus/Grafana, alerting, schéma d'archi, FinOps, conduite de la démo

---

## Annexe C — Rationale choix plateforme (Kubernetes / k3s)

1. **Contrôle et indépendance** : pas de vendor lock-in AWS, stack 100 % open source (k3s, Helm, Prometheus, Grafana)
2. **Pas besoin de HA géographique** : la résilience au niveau pod suffit pour les exigences du projet
3. **Coût zéro** : le VPS est fourni par YNOV — FinOps = analyse propre du dimensionnement, sans risque de facture surprise
4. **Démo plus percutante** : HPA visible en direct, Prometheus + Grafana plug-and-play (l'app expose déjà `/metrics`), self-healing < 15 s chronométrable
5. **Moins de complexité réseau** : un seul outillage (kubectl/Helm) au lieu de VPC/subnets/SG/IAM à câbler en 2,5 jours

> Point à assumer à l'oral : cluster single-node = pas de HA matérielle multi-nœud. Réponse : multi-pods + probes + explication de comment on passerait multi-node si nécessaire. Le support l'autorise explicitement.
>
> **Ce qui compte le plus (dixit l'enseignant)** : savoir **expliquer et justifier** les choix et répondre aux questions. Même incomplet, valoriser la méthode et ce qui est déployé.
>
> Prioriser ce qui rapporte des points : Archi 5 + Élasticité 4 + Résilience 3 avant le bonus.
