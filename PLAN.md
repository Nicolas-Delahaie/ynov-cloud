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

- [ ] `app/Dockerfile` optimisé (multi-stage, user non-root, tag fixe, cache layers)
- [ ] `app/.dockerignore`
- [ ] `OPTIMISATION.md` : les 5 anti-patterns, le pourquoi, et le gain (taille avant/après via `docker images`)
- [ ] Vérifier que `docker-compose up --build` fonctionne + `npm test` passe (`dockerfile-check.property.test.js`)

---

### Bloc 2 — Cluster k3s `[Jour 6 - après-midi]`

- [x] Installer **k3s** sur le VPS Ikoula (cluster single-node)

---

### Bloc 3 — Déploiement Helm `[Jour 7 - matin]`

- [ ] Build de l'image optimisée, tag versionné, push sur registry (GHCR ou Docker Hub)
- [ ] Helm Chart (`charts/worldcup/`) :
  - [ ] **Deployment app** : `replicas: 2`, `resources.requests/limits` (CPU obligatoire pour HPA), `liveness` + `readiness` probes (`/api/health/db`), `restartPolicy`
  - [ ] **PostgreSQL** : StatefulSet + PVC persistant (ou `bitnami/postgresql`), `init.sql` chargé
  - [ ] **Service** (ClusterIP) + **Ingress** (Traefik fourni par k3s) → app accessible sur internet
  - [ ] **HPA** : auto-scaling CPU (cible 60 %, min 2 / max 6)
  - [ ] **Secrets** K8s pour `DB_PASSWORD` etc. (jamais en clair dans Git)
  - [ ] _(bonus)_ **HTTPS** : cert-manager + Let's Encrypt

---

### Bloc 4 — Observabilité `[Jour 7 - après-midi]`

- [ ] **Prometheus** : scrape `/metrics` de l'app
- [ ] **Grafana** : dashboard avec req/s, latence, CPU, mémoire, nb de pods
- [ ] **Logs** centralisés (au minimum `kubectl logs` agrégés ; bonus : Loki)
- [ ] **Alerting** (Alertmanager : alerte si app down ou CPU élevé)

---

### Bloc 5 — Validation & tests `[Jour 7 - après-midi]`

À répéter à blanc avant la soutenance :

- [ ] **Élasticité** : `hey`/`k6` sur `/api/compute` → voir l'HPA créer des pods
- [ ] **Self-healing** : `POST /api/admin/kill` → pod recréé **< 15 s** (chronométrer)
- [ ] **HA** : supprimer un pod → l'autre absorbe le trafic

---

### Bloc 6 — Job créatif `[Jour 8 - matin]`

Un traitement qui **lit la BDD** et produit un résultat exploitable.

- [ ] Design du Job : diagramme + markdown explicable à l'oral
- [ ] _(bonus)_ Job fonctionnel : **K8s CronJob** qui calcule le classement par groupe et génère un rapport (CSV/JSON/Markdown) horodaté dans un PVC
  - Alternatives : top des votes → webhook Discord/Slack, export CSV matchs, mini-prédiction de vainqueur

---

### Bloc 7 — CI/CD `[Jour 8 - matin]` _(bonus +1 pt)_

- [ ] GitHub Actions : `lint/test` → `docker build & push` → `helm upgrade` (create/update/destroy démontrable)

---

### Bloc 8 — Finitions & soutenance `[Jour 8 - après-midi]`

- [ ] **Schéma d'architecture** clair et légendé (Mermaid / Excalidraw / Draw.io)
- [ ] **Estimation de coût chiffrée** (FinOps) — tableau de coût mensuel justifié
- [ ] **README** à jour : URL publique en tête, accès dashboards, commande de déploiement
- [ ] **Support de soutenance** (format libre)
- [ ] **Répétition de la démo** à blanc : load test + chaos test + chrono self-healing

---

## Annexe A — Checklist livrables finaux

- [ ] `app/Dockerfile` optimisé + `OPTIMISATION.md`
- [ ] IaC : Helm Chart (`charts/worldcup/`)
- [ ] Image Docker publiée sur un registry
- [ ] URL publique fonctionnelle (en tête du README)
- [ ] Schéma d'architecture clair et légendé
- [ ] Dashboard d'observabilité + alerting
- [ ] Estimation de coût chiffrée (FinOps)
- [ ] Design du Job (+ Job fonctionnel si bonus)
- [ ] README dépôt à jour
- [ ] Support de soutenance

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

---

## Annexe D — Structure soutenance (40 min)

| Phase              | Durée  | À préparer                                                   |
| ------------------ | ------ | ------------------------------------------------------------ |
| Présentation orale | 10 min | Schéma d'archi, justification des choix, trade-offs, FinOps  |
| Démo technique     | 10 min | URL publique, déploiement (Helm/CI-CD), métriques, dashboard |
| Crash tests (jury) | 15 min | App qui tient sous charge + revient seule après kill         |

**Ce qui compte le plus (dixit l'enseignant)** : savoir **expliquer et justifier** les choix et répondre aux questions. Même incomplet, valoriser la méthode et ce qui est déployé.

> Prioriser ce qui rapporte des points : Archi 5 + Élasticité 4 + Résilience 3 avant le bonus.
