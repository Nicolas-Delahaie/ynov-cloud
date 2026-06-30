# Bloc 3 — Déploiement Helm

## Contexte

L'objectif est de déployer l'application Node.js + PostgreSQL sur le cluster k3s via **Helm**, l'outil de packaging Kubernetes. Helm permet de décrire toute l'infrastructure en templates paramétrables, de la déployer en une commande, et de la mettre à jour ou la supprimer proprement — l'équivalent d'un `docker-compose` mais pour Kubernetes, avec gestion des révisions et des rollbacks.

---

## Pourquoi Helm et pas des manifests YAML bruts ?

On aurait pu écrire des fichiers YAML Kubernetes à la main et faire `kubectl apply -f`. Helm apporte trois avantages concrets pour ce projet :

1. **Paramétrage** : un seul `values.yaml` centralise les variables (image, mot de passe, host) — pas besoin d'éditer chaque fichier YAML pour changer l'environnement
2. **Déploiement atomique** : `helm upgrade --install` crée ou met à jour toutes les ressources en une commande, avec historique des révisions
3. **Lisibilité à l'oral** : montrer un Chart structuré en soutenance est plus propre qu'un tas de fichiers YAML

---

## Structure du Chart

```
charts/worldcup/
├── Chart.yaml                    ← métadonnées (nom, version)
├── values.yaml                   ← paramètres par défaut (image, db, HPA...)
├── files/
│   └── init.sql                  ← données initiales chargées en BDD au premier démarrage
└── templates/
    ├── secret.yaml               ← DB_PASSWORD en Secret K8s (jamais en clair dans Git)
    ├── configmap-init-sql.yaml   ← init.sql transformé en ConfigMap pour être monté dans le pod PostgreSQL
    ├── deployment.yaml           ← App Node.js, 2 réplicas, probes, resources
    ├── service.yaml              ← ClusterIP : expose l'app en interne au cluster
    ├── ingress.yaml              ← Traefik : route le trafic HTTP externe vers l'app
    ├── hpa.yaml                  ← HorizontalPodAutoscaler : scaling automatique sur CPU
    ├── postgres-statefulset.yaml ← PostgreSQL avec stockage persistant
    └── postgres-service.yaml     ← Service headless pour que le StatefulSet ait un DNS stable
```

---

## 1. Build et push de l'image

Voir [docs/publish-image.md](publish-image.md) pour la procédure complète. En résumé :

```bash
source .env   # contient GITHUB_TOKEN

docker buildx build --platform linux/amd64 \
  --target prod \
  -t ghcr.io/nicolas-delahaie/ynov-cloud:v1.0.0 \
  --push \
  ./app
```

**Pourquoi `--platform linux/amd64` ?** Le VPS Ikoula tourne sur architecture x86_64 (amd64). Si l'image est buildée sur un Mac Apple Silicon (arm64) sans préciser la plateforme, k3s ne peut pas l'exécuter (`no match for platform in manifest`). Il faut forcer la cible amd64 au moment du build.

**Pourquoi `--target prod` ?** Le Dockerfile est multi-stage (`deps`, `test`, `prod`). Sans cette option, Docker builderait uniquement le dernier stage. Ici on cible explicitement le stage `prod` qui contient l'image finale légère sans devDependencies.

**Important** : le package GHCR doit être **public** (GitHub > Packages > Visibility) pour que k3s puisse puller l'image anonymement, sans `imagePullSecret` configuré dans le cluster.

---

## 2. Gestion des secrets

Le mot de passe PostgreSQL n'est **jamais écrit en clair dans Git**. Il est passé au moment du déploiement via `--set` :

```bash
helm upgrade --install worldcup ./charts/worldcup \
  --set db.password=<MON_MOT_DE_PASSE> \
  --set ingress.host=<IP_OU_DOMAINE_DU_VPS>
```

**Pourquoi cette approche ?** Les champs `db.password` et `ingress.host` sont vides (`""`) dans `values.yaml` — ils n'ont pas de valeur par défaut utilisable. Cela force à les fournir explicitement via `--set`, et garantit qu'aucun mot de passe ni URL de production ne se retrouve versionné dans Git. En le passant via `--set`, il n'existe que dans le `Secret` Kubernetes côté cluster.

En interne, Kubernetes stocke ce mot de passe dans un objet `Secret` de type `Opaque`. Le pod le consomme via `valueFrom.secretKeyRef` — il n'apparaît jamais en clair dans les manifests déployés. `kubectl get secret worldcup-db-secret -o yaml` affiche une valeur encodée en base64, pas le mot de passe lui-même.

---

## 3. PostgreSQL — StatefulSet + PVC

PostgreSQL est déployé comme un `StatefulSet` (et non un `Deployment`) pour deux raisons :

- **Identité stable** : contrairement à un `Deployment` dont les pods ont des noms aléatoires, un `StatefulSet` garantit que le pod s'appelle toujours `worldcup-postgres-0`. Ça permet de configurer `DB_HOST=worldcup-postgres` de façon fiable — ce nom DNS résout toujours vers le bon pod.
- **PVC persistant** : le `volumeClaimTemplates` crée automatiquement un `PersistentVolumeClaim` de 1 Gi via le `local-path-provisioner` installé par k3s. Les données PostgreSQL survivent aux redémarrages de pod ou de node — sans ça, toutes les données seraient perdues à chaque redémarrage.

On utilise l'image `postgres:15-alpine` : tag mineur stable (pas de mise à jour imprévue de 15 → 16), variante alpine (~50 Mo vs ~400 Mo) — cohérent avec l'approche `node:20-alpine` du Dockerfile.

Le script `init.sql` (48 équipes + résultats de matchs) est monté via un `ConfigMap` dans `/docker-entrypoint-initdb.d/`. PostgreSQL exécute automatiquement tous les fichiers de ce répertoire à la **création initiale** de la base — c'est le mécanisme natif de l'image officielle `postgres`.

---

## 4. Application — Deployment

Points clés du `Deployment` et leur justification :

| Paramètre | Valeur | Pourquoi |
|-----------|--------|----------|
| `replicas` | 2 | Haute disponibilité : si un pod crashe (ex. `/api/admin/kill`), l'autre continue à servir le trafic. Kubernetes recrée automatiquement le pod tombé. |
| `resources.requests.cpu` | 100m | **Obligatoire pour le HPA** : sans `requests.cpu`, le HPA ne peut pas calculer le pourcentage d'utilisation et reste bloqué à `<unknown>`. |
| `resources.limits.cpu` | 500m | Évite qu'un pod en charge (`/api/compute`) monopolise tout le CPU du node et affame les autres pods. |
| `livenessProbe` `/api/health/db` | toutes les 10s | Si la BDD est inaccessible, la probe échoue → Kubernetes redémarre le pod automatiquement. C'est le mécanisme de **self-healing** démontrable en soutenance. |
| `readinessProbe` `/api/health/db` | toutes les 5s | Retire le pod du `Service` tant qu'il n'est pas prêt (ex. au démarrage ou si la BDD est temporairement indisponible). Le trafic n'est routé que vers les pods sains → **zéro downtime** lors des mises à jour. |

La différence entre les deux probes : la `liveness` décide si le pod doit être **tué et redémarré**, la `readiness` décide si le pod doit **recevoir du trafic**. Un pod peut être vivant mais pas encore prêt.

---

## 5. Service ClusterIP

Le `Service` de type `ClusterIP` expose l'app **uniquement à l'intérieur du cluster**, sur le port 3000. Il joue le rôle de load balancer interne : quand l'Ingress envoie une requête à `worldcup-app:3000`, Kubernetes la distribue entre les 2 pods disponibles.

On n'utilise pas de `NodePort` ou `LoadBalancer` directement parce que Traefik (l'Ingress controller) gère déjà l'exposition externe — le Service n'a pas besoin d'être accessible depuis l'extérieur.

---

## 6. Ingress — Traefik

Traefik est déjà installé et exposé sur l'IP publique du VPS par k3s (via un `ServiceLB`). L'`Ingress` lui indique comment router les requêtes entrantes :

```
Internet → :80 → Traefik → Service worldcup-app:3000 → Pod
```

On utilise `nip.io` comme hostname : `178.170.25.230.nip.io` résout automatiquement vers `178.170.25.230` sans avoir besoin de configurer un DNS. C'est un service public (wildcard DNS) pratique pour les démos et environnements de test.

```yaml
annotations:
  traefik.ingress.kubernetes.io/router.entrypoints: web
```

Cette annotation précise à Traefik d'utiliser l'entrypoint `web` (port 80). Sans elle, Traefik pourrait ignorer la règle si son comportement par défaut est configuré différemment.

---

## 7. HPA — Auto-scaling CPU

```yaml
minReplicas: 2
maxReplicas: 6
averageUtilization: 60  # % CPU
```

Le `HorizontalPodAutoscaler` interroge le `metrics-server` (installé par k3s) toutes les 15 secondes pour connaître la consommation CPU moyenne des pods. Si elle dépasse 60 %, il augmente le nombre de réplicas ; si elle redescend, il les réduit — sans jamais passer sous 2 ni dépasser 6.

**Pourquoi 60 % ?** C'est un seuil classique : assez bas pour que le scaling se déclenche avant saturation complète, assez haut pour ne pas scaler pour rien. La route `/api/compute` sature le CPU à ~100 % pendant 2-3 secondes — quelques appels parallèles suffisent à dépasser 60 % et déclencher le scaling en direct.

**Lien avec `resources.requests.cpu`** : le HPA calcule `utilisation_actuelle / requests.cpu * 100`. Sans `requests.cpu` défini, le calcul est impossible → le HPA affiche `<unknown>` et ne scale pas.

---

## 8. Déploiement sur le cluster

```bash
# Depuis le VPS, dans le repo cloné (branche bloc-3)
helm upgrade --install worldcup ./charts/worldcup \
  --set db.password=<MOT_DE_PASSE> \
  --set ingress.host=178.170.25.230.nip.io

# Vérifier l'état des ressources
kubectl get pods
kubectl get svc
kubectl get ingress
kubectl get hpa
```

`helm upgrade --install` est idempotent : si la release n'existe pas, elle est créée ; si elle existe déjà, elle est mise à jour. C'est la commande standard pour CI/CD — pas besoin de distinguer premier déploiement et mise à jour.

---

## Pièges rencontrés

### Image GHCR privée
k3s ne peut pas puller une image privée sans `imagePullSecret` configuré dans le cluster. Symptôme : `401 Unauthorized`.

Solution : passer le package en **public** sur GitHub → Packages → Package settings → Change visibility → Public.

### Mauvaise architecture de l'image
L'image buildée sur Mac Apple Silicon est `linux/arm64`. Le VPS Ikoula est `linux/amd64`. Symptôme : `no match for platform in manifest: not found`.

Fix — rebuilder en ciblant explicitement amd64 :
```bash
docker buildx build --platform linux/amd64 \
  --target prod \
  -t ghcr.io/nicolas-delahaie/ynov-cloud:v1.0.0 \
  --push \
  ./app
```

Après un nouveau push, vider le cache containerd de k3s (namespace `k8s.io`, pas le namespace par défaut) avant de recréer les pods :
```bash
ctr -n k8s.io images rm ghcr.io/nicolas-delahaie/ynov-cloud:v1.0.0
kubectl delete pods -l app=worldcup-app
```

---

## Résultat final

App accessible sur **http://178.170.25.230.nip.io**

```
NAME                          READY   STATUS    RESTARTS
worldcup-app-xxx              1/1     Running   0
worldcup-app-yyy              1/1     Running   0
worldcup-postgres-0           1/1     Running   0
```

```
kubectl get hpa
NAME           REFERENCE                 TARGETS   MINPODS   MAXPODS   REPLICAS
worldcup-hpa   Deployment/worldcup-app   5%/60%    2         6         2
```
