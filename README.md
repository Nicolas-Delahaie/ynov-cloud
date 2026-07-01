# WorldCup 2026 — Plateforme haute disponibilité

Application **Node.js + PostgreSQL** déployée sur **Kubernetes (k3s)** avec haute
disponibilité, auto-scaling, self-healing, observabilité et CI/CD.

| Service                               | URL                                  |
| ------------------------------------- | ------------------------------------ |
| 🌍 **Application**                    | http://178.170.25.230.nip.io         |
| 📊 **Grafana** (dashboard + alerting) | http://grafana.178.170.25.230.nip.io |

> Ce README est un point d'entrée : chaque sujet (architecture, coûts, preuves
> live, choix techniques) est détaillé dans son fichier dédié sous `docs/`,
> lié depuis la section correspondante.

## Sommaire

- [WorldCup 2026 — Plateforme haute disponibilité](#worldcup-2026--plateforme-haute-disponibilité)
  - [Sommaire](#sommaire)
  - [Ce qu'on livre](#ce-quon-livre)
  - [Architecture](#architecture)
  - [Garanties \& preuves live](#garanties--preuves-live)
  - [Sécurité](#sécurité)
  - [Coût (FinOps)](#coût-finops)
  - [Déploiement](#déploiement)
  - [Démarrage local](#démarrage-local)
  - [Documentation détaillée](#documentation-détaillée)

---

## Ce qu'on livre

| Besoin client                  | Garantie                              | Traduction technique                          |
| ------------------------------ | ------------------------------------- | --------------------------------------------- |
| « Mon site ne tombe pas »      | Service continu si un composant lâche | ≥ 2 réplicas + probes, Service load-balancé   |
| « Il se répare tout seul »     | Retour en service **< 15 s**          | Self-healing K8s (liveness probe)             |
| « Il encaisse les pics »       | Capacité **x3 automatique**           | Auto-scaling HPA 2→6 sur CPU                  |
| « Je vois ce qui se passe »    | Dashboard temps réel + alertes        | Prometheus + Grafana + 3 alertes              |
| « Je maîtrise mon budget »     | **~20 €/mois**, transparent           | Dimensionnement calibré, 9× moins cher qu'EKS |
| « Mes données sont protégées » | Aucun secret exposé                   | Secrets K8s, 0 credential dans Git            |

**Stack :** Docker (multi-stage, non-root) · k3s single-node · Helm · Traefik
(Ingress) · PostgreSQL (StatefulSet + PVC) · HPA · kube-prometheus-stack ·
GitHub Actions (build & push GHCR).

---

## Architecture

k3s single-node sur VPS Ikoula : Traefik (Ingress) → Service → 2 pods app
(HPA 2→6) → PostgreSQL (StatefulSet + PVC), le tout observé par
Prometheus/Grafana.

Schéma complet, flux et composants : [docs/architecture.md](docs/architecture.md).

---

## Garanties & preuves live

- **Haute disponibilité, self-healing, élasticité** : commandes et lecture des
  résultats → [docs/bloc5-validation.md](docs/bloc5-validation.md)
- **Observabilité** : dashboard Grafana (req/s, latence p95, 5xx, CPU, nombre
  de pods) + 3 alertes → [docs/bloc4-observabilite.md](docs/bloc4-observabilite.md)

---

## Sécurité

- `DB_PASSWORD` en **Secret K8s** injecté par `secretKeyRef` — **jamais en clair dans Git**.
- Vérifiable : `grep -ri password charts/ app/` → uniquement des `secretKeyRef`.
- Image Docker **multi-stage**, exécutée en **user non-root** (voir [OPTIMISATION.md](OPTIMISATION.md)).

---

## Coût (FinOps)

~20 €/mois (0 € réel, VPS fourni par YNOV), soit environ 9× moins cher qu'un
équivalent EKS multi-AZ pour ce périmètre. Dimensionnement chiffré, hypothèses
et comparaison détaillée : [docs/finops.md](docs/finops.md).

---

## Déploiement

Sur le VPS (k3s), en une commande :

```bash
source deploy/.env   # IMAGE_TAG, DB_PASSWORD, GRAFANA_ADMIN_PASSWORD
helm upgrade worldcup charts/worldcup \
  --set image.tag=$IMAGE_TAG \
  --set db.password=$DB_PASSWORD
```

**CI/CD :** chaque push sur `main` build et pousse l'image sur GHCR
(GitHub Actions). Procédure complète (branche non mergée, stack monitoring) :
[docs/deploy-prod.md](docs/deploy-prod.md).

---

## Démarrage local

```bash
cp .env.example .env
docker compose up --build --wait
```

---

## Documentation détaillée

> Non nécessaire pendant la présentation — pour approfondir un point.

| Doc                                                                | Contenu                                              |
| ------------------------------------------------------------------ | ---------------------------------------------------- |
| [docs/architecture.md](docs/architecture.md)                       | Schéma d'architecture + flux et composants           |
| [docs/finops.md](docs/finops.md)                                   | Estimation de coût + comparaison EKS                 |
| [docs/argumentaire-soutenance.md](docs/argumentaire-soutenance.md) | Justification du choix k3s, réponses au jury         |
| [docs/deploy-prod.md](docs/deploy-prod.md)                         | Déploiement prod (avec/sans branche mergée)          |
| [docs/bloc2-k3s.md](docs/bloc2-k3s.md)                             | Installation et configuration k3s                    |
| [docs/bloc3-helm.md](docs/bloc3-helm.md)                           | Chart Helm — structure et valeurs                    |
| [docs/bloc4-observabilite.md](docs/bloc4-observabilite.md)         | Stack Prometheus + Grafana                           |
| [docs/bloc5-validation.md](docs/bloc5-validation.md)               | Runbook de validation (élasticité, self-healing, HA) |
| [docs/bloc6-job.md](docs/bloc6-job.md)                             | Job créatif (CronJob rapport)                        |
| [docs/publish-image.md](docs/publish-image.md)                     | Publier l'image Docker sur GHCR                      |
| [docs/GUIDE-ETUDIANT.md](docs/GUIDE-ETUDIANT.md)                   | Routes API, variables d'environnement                |
| [PROJECT.md](PROJECT.md)                                           | Énoncé du projet, grille d'évaluation                |
