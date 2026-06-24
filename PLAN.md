# 🗺️ Plan de réalisation — Capstone Coupe du Monde 2026

> Document de pilotage du projet. Basé sur le `README.md`, le `docs/GUIDE-ETUDIANT.md` et le support de cours (DPLC J6→J9).
> Échéance : **2,5 jours** de réalisation puis **soutenance de 40 min** (revue d'ingénierie en direct, crash-test inclus).

---

## 0. Rappel de l'objectif

Migrer/moderniser une application **Express.js (monolithe) + PostgreSQL** (thème CdM 2026 : 48 équipes, matchs, votes) vers une plateforme cloud capable de démontrer :

| Pilier | Exigence technique | Preuve attendue en soutenance |
|--------|--------------------|-------------------------------|
| **Haute disponibilité** | ≥ 2 réplicas, multi-AZ ou multi-nœud | L'app reste UP si un pod/instance tombe |
| **Élasticité** | Auto-scaling sur CPU | Scaling visible sous charge (`/api/compute`) |
| **Résilience / Self-Healing** | Redémarrage auto après crash **< 15 s** | `/api/admin/kill` → app revient seule |
| **Observabilité** | Dashboard + métriques + logs centralisés | Dashboard live pendant le load test |
| **Sécurité** | Pas de credentials en clair dans Git | Secrets gérés proprement |
| **FinOps** | Estimation de coût chiffrée | Tableau de coût mensuel justifié |

⚠️ **Ne PAS modifier les routes de l'API** (`/`, `/api/health/db`, `/api/data`, `/api/vote`, `/api/votes/results`, `/metrics`, `/api/compute`, `/api/admin/kill`) — elles servent à l'évaluation automatisée.

---

## 1. Tâche n°0 (à lancer AUJOURD'HUI) — Ouvrir l'environnement

Le support insiste : *« Intéressez-vous tôt à l'ouverture de votre environnement AWS ou Ikoula »*. La validation d'un compte AWS (carte bancaire, vérification) ou la livraison d'un VPS peut prendre plusieurs heures.

- [ ] Récupérer les accès VPS auprès d'YNOV, vérifier l'accès SSH, l'OS et les ressources (RAM/CPU/disque).
- [ ] Mettre en place le dépôt Git d'équipe + répartition des rôles (voir §6).

---

## 2. Choix de plateforme : Kubernetes (k3s) sur VPS Ikoula

**Décision prise : Kubernetes.** Raisons principales :

1. **Contrôle et indépendance** : pas de vendor lock-in AWS, stack 100 % open source (k3s, Helm, Prometheus, Grafana).
2. **Pas besoin de HA géographique** : le projet ne requiert pas de haute disponibilité multi-zone — la résilience au niveau pod suffit pour répondre aux exigences.
3. **Coût zéro** : le VPS est fourni par YNOV — aucun risque de facture surprise, FinOps = analyse propre du dimensionnement.
4. **Démo plus percutante** : HPA visible en direct, Prometheus + Grafana plug-and-play (l'app expose déjà `/metrics`), self-healing < 15 s chronométrable.
5. **Moins de complexité réseau** : un seul outillage (kubectl/Helm) au lieu de VPC/subnets/SG/IAM à câbler en 2,5 jours.

> Seul point à assumer à l'oral : cluster single-node = pas de HA matérielle multi-nœud. Réponse : multi-pods + probes + explication de comment on passerait multi-node si nécessaire. Le support l'autorise explicitement.

---

## 3. Plan par mission (option Kubernetes)

### Mission 1 — Optimiser le Dockerfile *(indépendant de la plateforme, à faire en premier)*

Le `app/Dockerfile` actuel contient **5 anti-patterns** à corriger :

1. `FROM node:latest` → tag flottant, image lourde **et** non reproductible → utiliser un tag fixe **slim/alpine** (ex. `node:20-alpine`).
2. `COPY . .` **avant** `npm install` → casse le cache Docker à chaque modif de code → copier `package*.json` d'abord, `npm ci`, puis le code. + ajouter un **`.dockerignore`**.
3. `npm install` → non déterministe → `npm ci --omit=dev` (lockfile + sans devDeps).
4. **Tourne en root** → créer un user non-privilégié (`USER node`) → exigence sécurité.
5. **Pas de multi-stage / image finale lourde** → multi-stage build (deps → runtime), image finale minimale ; + `HEALTHCHECK` optionnel.

**Livrables** :
- [ ] `app/Dockerfile` optimisé
- [ ] `app/.dockerignore`
- [ ] `OPTIMISATION.md` (les 5 anti-patterns, le pourquoi, et le gain : taille avant/après via `docker images`)
- [ ] Vérifier que `docker-compose up --build` fonctionne toujours + `npm test` passe (il y a un `dockerfile-check.property.test.js`)

### Mission 2 — Déployer sur Kubernetes

**a. Build & publication de l'image**
- [ ] Build de l'image optimisée, tag versionné, push sur un registry (GHCR/Docker Hub).

**b. Cluster**
- [ ] Installer **k3s** sur le VPS Ikoula (cluster single-node léger).

**c. Helm Chart** (`charts/worldcup/`) avec :
- [ ] **Deployment app** : `replicas: 2` (HA mini), `resources.requests/limits` (CPU obligatoire pour HPA), `liveness` + `readiness` probes (sur `/api/health` ou `/`), `restartPolicy`.
- [ ] **PostgreSQL** : StatefulSet + PVC persistant (ou Helm bitnami/postgresql), `init.sql` chargé.
- [ ] **Service** (ClusterIP) + **Ingress** (Traefik fourni par k3s) → app accessible sur internet.
- [ ] **HPA** : auto-scaling sur CPU (ex. cible 60 %, min 2 / max 6).
- [ ] **Secrets** K8s pour `DB_PASSWORD` etc. (jamais en clair dans Git → exigence sécurité).
- [ ] **HTTPS** (bonus) : cert-manager + Let's Encrypt.

**d. Observabilité**
- [ ] Prometheus (scrape `/metrics`) + Grafana avec un **dashboard** (req/s, latence, CPU, mémoire, nb de pods).
- [ ] Logs centralisés (au minimum `kubectl logs` agrégés ; bonus : Loki).
- [ ] **Alerting** (ex. Alertmanager : alerte si app down ou CPU élevé).

**e. Validation des exigences** (à répéter pour la démo)
- [ ] **Élasticité** : `hey`/`k6` sur `/api/compute` → voir l'HPA créer des pods.
- [ ] **Self-healing** : `POST /api/admin/kill` → pod recréé **< 15 s** (chronométrer).
- [ ] **HA** : supprimer un pod → l'autre absorbe le trafic.

**Livrables** : Helm Chart, image sur registry, URL publique, dashboard, secrets gérés.

### Mission 3 — Job créatif (bonus, +1 pt)

Un traitement qui **lit la BDD** et produit un résultat exploitable. Idées triées par rapport effort/originalité :

- **Recommandé** : **K8s CronJob** qui calcule le **classement par groupe** (la logique `/api/standings` existe déjà comme référence) et génère un **rapport** (CSV/JSON/Markdown) horodaté, stocké dans un PVC.
- Alternatives : top des votes → notification (webhook Discord/Slack), export CSV des matchs, mini-prédiction de vainqueur.

**Livrables** : design du Job (diagramme + markdown, explicable à l'oral) ; **bonus** : Job réellement fonctionnel (CronJob ou event-based).

### Bonus — CI/CD (+1 pt)

- [ ] GitHub Actions : `lint/test` → `docker build & push` → `helm upgrade` (create/update/destroy démontrable).

---

## 4. Livrables finaux (checklist de rendu)

- [ ] `app/Dockerfile` optimisé + `OPTIMISATION.md`
- [ ] IaC : **Helm Chart**
- [ ] Image Docker publiée sur un registry
- [ ] **URL publique** fonctionnelle (en tête du README du dépôt)
- [ ] **Schéma d'architecture** clair et légendé (Mermaid/Excalidraw/Draw.io)
- [ ] Dashboard d'observabilité + alerting
- [ ] **Estimation de coût chiffrée** (FinOps)
- [ ] Design du Job (+ Job fonctionnel si bonus)
- [ ] README dépôt à jour (URL, accès dashboards, comment déployer)
- [ ] Support de soutenance (format libre)

---

## 5. Rétroplanning sur 2,5 jours

| Phase | Tâches |
|-------|--------|
| **Jour 6 (matin)** | Tâche n°0 (ouverture env + repo), prise en main app en local (`docker-compose up`, tester routes & `/metrics`) |
| **Jour 6 (après-midi)** | Mission 1 (Dockerfile + `.dockerignore` + `OPTIMISATION.md`), push image sur registry, install k3s |
| **Jour 7 (matin)** | Helm Chart : Deployment + Service + Ingress + Postgres + Secrets → app accessible sur internet |
| **Jour 7 (après-midi)** | HPA + probes, Prometheus + Grafana + dashboard, premiers load/crash tests |
| **Jour 8 (matin)** | Alerting, Job créatif, (bonus) CI/CD, HTTPS, durcissement sécurité |
| **Jour 8 (après-midi)** | Schéma d'archi, FinOps chiffré, README, **répétition de la démo** (load test + chaos test à blanc + chrono self-healing) |

> Garder une **marge tampon** : prioriser ce qui rapporte des points (Archi 5 + Élasticité 4 + Résilience 3 avant le bonus).

---

## 6. Répartition d'équipe (3 max)

Chacun pilote un axe mais **tout le monde partage l'info** (le jury interroge n'importe qui sur n'importe quoi) :

- **Dev/App** : Dockerfile, image, registry, Job, CI/CD.
- **Infra/Plateforme** : cluster, Helm, Ingress, HPA, probes, secrets.
- **Observabilité/Soutenance** : Prometheus/Grafana, alerting, schéma d'archi, FinOps, conduite de la démo.

---

## 7. Préparation soutenance (40 min)

| Phase | Durée | À préparer |
|-------|-------|-----------|
| Présentation orale | 10 min | Schéma d'archi, justification des choix, trade-offs, FinOps |
| Démo technique | 10 min | URL publique, déploiement (Helm/CI-CD), métriques, dashboard |
| Crash tests (jury) | 15 min | App qui tient sous charge + revient seule après kill |

**Ce qui compte le plus (dixit l'enseignant)** : savoir **expliquer et justifier** les choix, et répondre aux questions. Même incomplet, valoriser la méthode et ce qui est déployé.
