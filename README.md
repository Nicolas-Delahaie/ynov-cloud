# ynov-cloud

Application Node.js + PostgreSQL déployée sur Kubernetes (k3s), avec auto-scaling, observabilité et CI/CD.

- **App** : http://178.170.25.230.nip.io
- **Grafana** : http://grafana.178.170.25.230.nip.io

## Démarrage local

```bash
cp .env.example .env
docker compose up --build --wait
```

## Documentation

| Doc                                                        | Contenu                                                    |
| ---------------------------------------------------------- | ---------------------------------------------------------- |
| [PROJECT.md](PROJECT.md)                                   | Énoncé du projet, missions, grille d'évaluation            |
| [docs/deploy-prod.md](docs/deploy-prod.md)                 | Déployer sur le serveur de prod (avec/sans branche mergée) |
| [docs/bloc2-k3s.md](docs/bloc2-k3s.md)                     | Installation et configuration k3s                          |
| [docs/bloc3-helm.md](docs/bloc3-helm.md)                   | Chart Helm — structure et valeurs                          |
| [docs/bloc4-observabilite.md](docs/bloc4-observabilite.md) | Stack Prometheus + Grafana                                 |
| [docs/publish-image.md](docs/publish-image.md)             | Publier l'image Docker sur GHCR                            |
| [docs/GUIDE-ETUDIANT.md](docs/GUIDE-ETUDIANT.md)           | Routes API, variables d'environnement, exemples            |
