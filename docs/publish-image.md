# Publier l'image Docker sur GHCR

## Prérequis

- `GITHUB_TOKEN` renseigné dans `.env` (voir `.env.example`)

## Commandes

```bash
# 1. Login GHCR (nécessite GITHUB_TOKEN depuis .env)
source .env
echo $GITHUB_TOKEN | docker login ghcr.io -u nicolas-delahaie --password-stdin
```

```bash
# 2. Build + tag
VERSION=v1.0.0
IMAGE=ghcr.io/nicolas-delahaie/ynov-cloud
docker build --target prod -t $IMAGE:$VERSION ./app

# 3. Push
docker push $IMAGE:$VERSION
```

## Après le premier push : rendre le package public

> À faire **une seule fois** — le réglage est persistant pour tous les push suivants.

1. Aller sur [github.com/users/nicolas-delahaie/packages](https://github.com/users/nicolas-delahaie/packages)
2. Cliquer sur le package `ynov-cloud`
3. **Package settings** (colonne de droite) → **Change visibility** → **Public** → confirmer

**Pourquoi ?** k3s doit pouvoir puller l'image sans secret d'authentification configuré dans le cluster. Un package privé nécessiterait un `imagePullSecret` dans chaque déploiement Helm.
