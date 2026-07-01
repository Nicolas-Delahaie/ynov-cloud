# Publier l'image Docker sur GHCR

Deux méthodes : **manuelle** (ci-dessous) ou **automatisée via GitHub Actions** (Bloc 7, voir la section dédiée plus bas).

## Méthode manuelle

### Prérequis

- `GITHUB_TOKEN` renseigné dans `.env` (voir `.env.example`)

### Commandes

```bash
# 1. Login GHCR (nécessite GITHUB_TOKEN depuis .env)
source .env
echo $GITHUB_TOKEN | docker login ghcr.io -u nicolas-delahaie --password-stdin
```

```bash
# 2. Build + push
VERSION=v1.0.0
IMAGE=ghcr.io/nicolas-delahaie/ynov-cloud
VPS_PLATFORM=linux/amd64
docker buildx build --platform $VPS_PLATFORM --target prod -t $IMAGE:$VERSION --push ./app
```

### Après le premier push : rendre le package public

> À faire **une seule fois** — le réglage est persistant pour tous les push suivants.

1. Aller sur [github.com/users/nicolas-delahaie/packages](https://github.com/users/nicolas-delahaie/packages)
2. Cliquer sur le package `ynov-cloud`
3. **Package settings** (colonne de droite) → **Change visibility** → **Public** → confirmer

**Pourquoi ?** k3s doit pouvoir puller l'image sans secret d'authentification configuré dans le cluster. Un package privé nécessiterait un `imagePullSecret` dans chaque déploiement Helm.

---

## Méthode automatisée (CI/CD — Bloc 7)

Workflow : [`.github/workflows/publish-image.yml`](../.github/workflows/publish-image.yml).

À chaque `push` sur `main` touchant `app/**`, GitHub Actions **construit et publie l'image** sur GHCR — mais **uniquement si la version a été incrémentée correctement**.

### Source de vérité : `app/package.json`

La version publiée est lue dans le champ `version` de [`app/package.json`](../app/package.json). L'image est taguée `v<version>` (ex. `v1.1.0`) **et** `latest`.

### Règle de vérification

Le job `version-check` compare la version courante à celle du **commit parent** :

| Situation                                    | Comportement CI                                 |
| -------------------------------------------- | ----------------------------------------------- |
| Version **inchangée**                        | Pas de publication (sortie propre, pas d'image) |
| Version **strictement supérieure** (semver)  | Build + push de l'image                         |
| Version **inférieure ou égale** (régression) | CI rouge — publication bloquée                  |
| Tag `v<version>` **déjà présent sur GHCR**   | CI rouge — incrémente la version                |

La comparaison est faite en semver (`sort -V`), donc `1.10.0 > 1.9.0`.

### Publier une nouvelle version

```bash
# 1. Incrémenter la version (ex. patch)
cd app && npm version patch --no-git-tag-version   # 1.0.0 -> 1.0.1
#   (ou éditer manuellement le champ "version" de app/package.json)

# 2. Commit + push sur main
cd .. && git add app/package.json
git commit -m "release: v1.0.1"
git push origin main
```

La CI prend le relais : vérif d'incrément → build (`target prod`, `linux/amd64`) → push `v1.0.1` + `latest`.

### Authentification

Le workflow utilise le `GITHUB_TOKEN` intégré (permission `packages: write` déclarée dans le fichier). **Deux réglages manuels sont nécessaires une seule fois** :

#### 1. Activer les permissions en écriture sur le dépôt

1. Aller dans **Settings → Actions → General** du dépôt GitHub
2. Section **Workflow permissions** → sélectionner **"Read and write permissions"**
3. Enregistrer

#### 2. Lier le package GHCR au dépôt

> Nécessaire si le package a déjà été créé manuellement (premier push via CLI). Sans ce lien, le `GITHUB_TOKEN` n'a pas accès en écriture au package.

1. Aller sur `github.com/users/nicolas-delahaie/packages/container/ynov-cloud/settings`
2. Section **"Manage Actions access"** → **"Add repository"**
3. Sélectionner `Nicolas-Delahaie/ynov-cloud` → rôle **Write** → confirmer
4. Laisser cochée l'option **"Inherit access from source repository (recommended)"** — les permissions du package suivront automatiquement celles du dépôt sans gestion séparée

Sans ce lien, GitHub Actions retourne `permission_denied: write_package` même avec `packages: write` dans le YAML et les Workflow permissions activées.

> Le `docker login ghcr.io` manuel n'est nécessaire que pour la méthode manuelle (PAT dans `.env`).

### Déclenchement manuel de secours

Le workflow expose aussi `workflow_dispatch` : onglet **Actions** → **Publish image to GHCR** → **Run workflow** (s'exécute sur `main`, mêmes règles de vérification).

> ⚠️ Pense à aligner `charts/worldcup/values.yaml` (`image.tag`) sur la nouvelle version pour que le `helm upgrade` tire bien la dernière image.
