# Optimisation Dockerfile — Bloc 1

## Résultat

| Métrique      | Avant         | Après                 | Gain                           |
| ------------- | ------------- | --------------------- | ------------------------------ |
| Taille image  | 1.89 GB       | 208 MB                | **−89 %**                      |
| Image de base | `node:latest` | `node:20-alpine`      | reproductible                  |
| Utilisateur   | root          | `node` (uid 1000)     | moindre privilège              |
| Stages Docker | 1             | deps / test / prod    | prod, test et prod séparés     |

### Comment reproduire la mesure

L'ancien Dockerfile est conservé dans l'historique git (commit `efb1d58`), donc la
comparaison est reproductible sans garder des images nommées à la main :

```bash
# image "avant" à partir du Dockerfile d'origine (node:latest)
git show efb1d58:app/Dockerfile > /tmp/Dockerfile.before
docker build -f /tmp/Dockerfile.before -t worldcup:before ./app

# image "après" (stage prod du Dockerfile actuel)
docker build --target prod -t worldcup:after ./app

docker images worldcup
# worldcup:before  1.89GB
# worldcup:after    208MB
```

---

## Les 5 anti-patterns corrigés

### 1. `FROM node:latest` → `FROM node:20-alpine`

**Problème :** `node:latest` est un tag flottant — il pointe vers une image différente
selon la date du build (builds non reproductibles). Il embarque toute la toolchain
Debian (~1 GB) inutile au runtime.

**Correction :** `node:20-alpine` fixe la version majeure (reproductibilité) et repose
sur Alpine Linux (~7 MB de base), ce qui réduit drastiquement la taille et la surface
d'attaque. C'est ce changement — combiné au point 3 — qui apporte l'essentiel des −89 %.

---

### 2. `COPY . .` avant l'install → copier `package*.json` d'abord

**Problème :** Docker invalide le cache d'une couche dès qu'un fichier source change.
En copiant tout le code avant l'install, la moindre modif de `main.js` force une
réinstallation complète des dépendances.

**Correction :**

```dockerfile
COPY package*.json ./   # couche stable : ne change que si les dépendances changent
RUN npm ci              # restée en cache tant que package-lock.json ne bouge pas
COPY . .                # le code : invalidé souvent, mais l'install est déjà en cache
```

---

### 3. `npm install` → `npm ci` avec `NODE_ENV=production`

**Problème :** `npm install` est non-déterministe (peut faire évoluer des dépendances
transitives et réécrire le lockfile).

**Correction :** `npm ci` installe **exactement** ce que décrit `package-lock.json`
(et échoue si le lockfile est désynchronisé — c'est voulu).

> **Production via l'environnement plutôt qu'un flag.** `npm ci` installe les
> `devDependencies` sauf si `NODE_ENV=production` (équivalent à `--omit=dev`). On déclare
> donc `ENV NODE_ENV=production` dans le stage `deps` : une seule variable pilote **à la
> fois** l'installation (pas de jest/supertest dans l'image) **et** le runtime (Express en
> mode production). Elle est redéclarée dans le stage `prod` car **`ENV` ne traverse pas
> les `FROM`** — chaque stage repart vierge. Le stage `test`, lui, ne la met pas →
> `npm ci` y installe bien les devDependencies.

> **Note sur le `package-lock.json` :** le lockfile doit être généré sur la **même
> plateforme** que le build (linux/alpine), sinon `npm ci` échoue sur les dépendances
> optionnelles spécifiques à la plateforme. Il a été régénéré avec :
> ```bash
> docker run --rm -v "$PWD/app":/app -w /app node:20-alpine \
>   npm install --package-lock-only --no-audit --no-fund
> ```

---

### 4. Tourne en root → `USER node`

**Problème :** par défaut Docker n'active pas le user-namespace remapping, donc
l'UID 0 dans le conteneur est l'UID 0 du noyau hôte. En fonctionnement normal le
processus reste confiné (namespaces, capabilities réduites, seccomp) — root dans le
conteneur **n'est pas** automatiquement root sur l'hôte. Le risque est conditionnel :

- en cas d'évasion (faille noyau, conteneur `--privileged`, `docker.sock` monté),
  root-conteneur = root-hôte → compromission totale ;
- même sans évasion, root peut écrire en root dans les bind-mounts.

**Correction :** `USER node` (uid 1000, fourni par l'image) applique le moindre
privilège et réduit le rayon d'impact — défense en profondeur, complétée au Bloc 3 par
un `securityContext` K8s (`runAsNonRoot`, drop des capabilities).

---

### 5. Pas de multi-stage → `deps` / `test` / `prod`

**Mise au point :** pour cette app (JS pur, aucune compilation), un multi-stage
n'apporte quasiment rien en taille — le gain vient d'Alpine + `NODE_ENV=production`. On
le garde car la grille de notation le récompense, et **on lui donne un rôle réel** :
séparer des besoins différents.

```dockerfile
FROM node:20-alpine AS deps   # deps PROD seulement → alimente prod
ENV NODE_ENV=production
RUN npm ci

FROM node:20-alpine AS test   # deps COMPLÈTES → lance jest en conteneur
RUN npm ci
CMD ["npm", "test"]

FROM node:20-alpine AS prod   # image finale : prod uniquement, non-root
COPY --from=deps /app/node_modules ./node_modules
USER node
HEALTHCHECK ...
```

Le stage `test` devient la cible de test en CI (Bloc 7) :
`docker build --target test` + `docker run --rm test`.

**Sur le `HEALTHCHECK` :** rend `docker compose up --wait` fiable — le `up` attend que
l'app réponde sur `/api/health/db`, pas juste que le process démarre. À noter :
**Kubernetes ignore le `HEALTHCHECK` Docker** et utilise ses propres
`liveness`/`readiness` probes (Bloc 3).

---

## Vérification

```bash
# Copier la config d'environnement
cp .env.example .env

# Build + démarrage, en attendant que db + app soient "healthy"
docker compose up --build --wait

# Suite de tests jest dans un conteneur, contre la base db
docker compose --profile test run --rm test
```

**Résultat : 6/7 suites vertes.** La 7ème (`dockerfile-check.property.test.js`) appelle
`../../teacher-tools/check-dockerfile.sh` — un script du **harnais de notation de
l'enseignant**, absent du dépôt étudiant (voir arborescence officielle dans
`GUIDE-ETUDIANT.md`). Elle passera dans l'environnement de correction. Reconstituer ce
script reviendrait à s'auto-noter, ce qui ne prouve rien.
