# Publier l'image Docker sur GHCR

## Prérequis

- `GITHUB_TOKEN` renseigné dans `.env` (voir `.env.template`)

## Commandes

```bash
source .env

VERSION=v1.0.0
IMAGE=ghcr.io/nicolas-delahaie/ynov-cloud

# 1. Build + tag
docker build --target prod -t $IMAGE:$VERSION ./app

# 2. Login GHCR
echo $GITHUB_TOKEN | docker login ghcr.io -u nicolas-delahaie --password-stdin

# 3. Push
docker push $IMAGE:$VERSION
```

## Important

Le package GHCR doit être **public** (réglage dans GitHub > Packages > Visibility) pour que k3s puisse puller l'image sans configurer de secret dans le cluster.
