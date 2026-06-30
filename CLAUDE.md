# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Contexte

Projet de soutenance Ynov (noté sur 20) : déployer l'app Node.js + PostgreSQL sur k3s avec haute disponibilité, auto-scaling, self-healing et observabilité. La soutenance est une revue d'ingénierie en direct avec crash-test automatisé par l'enseignant sur l'infra live.

**Blocs réalisés :** Dockerfile optimisé (1→4), cluster k3s, chart Helm complet, observabilité (Prometheus + Grafana + alerting).  
**Restant :** tests de validation à blanc, job créatif, CI/CD (bonus), schéma d'archi, FinOps, répétition démo.

## Contraintes critiques

- **Ne jamais modifier les routes API** (`/`, `/api/health`, `/api/health/db`, `/api/data`, `/api/vote`, `/api/votes/results`, `/metrics`, `/api/compute`, `/api/admin/kill`) — l'enseignant les appelle directement sur l'infra en soutenance.
- **1 test échouera toujours en local** : `dockerfile-check.property.test.js` appelle `../../teacher-tools/check-dockerfile.sh`, un script du harnais enseignant absent du dépôt. C'est attendu ; la suite passe à 6/7.
- **Ne pas régénérer `package-lock.json` sur Mac** : il doit être produit sur `node:20-alpine` (différences de deps optionnelles par plateforme). Si besoin : `docker run --rm -v "$PWD/app":/app -w /app node:20-alpine npm install --package-lock-only`.
