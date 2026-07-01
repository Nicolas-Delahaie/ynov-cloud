# ynov-cloud

Application Node.js + PostgreSQL déployée sur Kubernetes (k3s), avec auto-scaling, observabilité et CI/CD.

## Accès

| Service | URL |
| --- | --- |
| **Application** | http://178.170.25.230.nip.io |
| **Grafana** (dashboard + alerting) | http://grafana.178.170.25.230.nip.io |

## Déploiement (VPS k3s)

```bash
source deploy/.env   # IMAGE_TAG, DB_PASSWORD, GRAFANA_ADMIN_PASSWORD
helm upgrade worldcup charts/worldcup \
  --set image.tag=$IMAGE_TAG \
  --set db.password=$DB_PASSWORD
```

Procédure complète (branche non mergée, monitoring) : [docs/deploy-prod.md](docs/deploy-prod.md).

## Démarrage local

```bash
cp .env.example .env
docker compose up --build --wait
```

## Documentation

| Doc                                                        | Contenu                                                    |
| ---------------------------------------------------------- | ---------------------------------------------------------- |
| [PROJECT.md](PROJECT.md)                                   | Énoncé du projet, missions, grille d'évaluation            |
| [docs/architecture.md](docs/architecture.md)               | Schéma d'architecture (Mermaid) + flux et composants       |
| [docs/finops.md](docs/finops.md)                           | Estimation de coût chiffrée (FinOps) + comparaison EKS     |
| [docs/soutenance.md](docs/soutenance.md)                   | Présentation soutenance (format avant-vente) + crash-tests |
| [docs/argumentaire-soutenance.md](docs/argumentaire-soutenance.md) | Justification du choix k3s, réponses au jury      |
| [docs/deploy-prod.md](docs/deploy-prod.md)                 | Déployer sur le serveur de prod (avec/sans branche mergée) |
| [docs/bloc2-k3s.md](docs/bloc2-k3s.md)                     | Installation et configuration k3s                          |
| [docs/bloc3-helm.md](docs/bloc3-helm.md)                   | Chart Helm — structure et valeurs                          |
| [docs/bloc4-observabilite.md](docs/bloc4-observabilite.md) | Stack Prometheus + Grafana                                 |
| [docs/bloc6-job.md](docs/bloc6-job.md)                     | Job créatif (CronJob rapport)                              |
| [docs/publish-image.md](docs/publish-image.md)             | Publier l'image Docker sur GHCR                            |
| [docs/GUIDE-ETUDIANT.md](docs/GUIDE-ETUDIANT.md)           | Routes API, variables d'environnement, exemples            |
