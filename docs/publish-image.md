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
