# Bloc 3 — Déploiement Helm

## Contexte

Déploiement de l'application Node.js + PostgreSQL sur le cluster k3s via un Helm Chart maison.

---

## Structure du Chart

```
charts/worldcup/
├── Chart.yaml
├── values.yaml
├── files/
│   └── init.sql              ← chargé dans la BDD au premier démarrage
└── templates/
    ├── secret.yaml            ← DB_PASSWORD en Secret K8s (jamais en clair dans Git)
    ├── configmap-init-sql.yaml
    ├── deployment.yaml        ← App Node.js, 2 réplicas, probes, resources
    ├── service.yaml           ← ClusterIP port 3000
    ├── ingress.yaml           ← Traefik → app accessible depuis l'extérieur
    ├── hpa.yaml               ← Auto-scaling CPU (60%, min 2 / max 6)
    ├── postgres-statefulset.yaml ← PostgreSQL + PVC persistant
    └── postgres-service.yaml  ← Headless service pour le StatefulSet
```

---

## 1. Build et push de l'image

Voir [docs/publish-image.md](publish-image.md) pour la procédure complète. En résumé :

```bash
source .env   # contient GITHUB_TOKEN

docker build --target prod -t ghcr.io/nicolas-delahaie/ynov-cloud:v1.0.0 ./app
echo $GITHUB_TOKEN | docker login ghcr.io -u nicolas-delahaie --password-stdin
docker push ghcr.io/nicolas-delahaie/ynov-cloud:v1.0.0
```

**Important** : le package GHCR doit être **public** (GitHub > Packages > Visibility) pour que k3s puisse puller l'image sans `imagePullSecret`.

---

## 2. Gestion des secrets

Le mot de passe PostgreSQL n'est **jamais écrit en clair dans Git**. Il est passé au moment du déploiement via `--set` :

```bash
helm upgrade --install worldcup ./charts/worldcup \
  --set db.password=<MON_MOT_DE_PASSE> \
  --set ingress.host=<IP_OU_DOMAINE_DU_VPS>
```

En interne, Kubernetes stocke ce mot de passe dans un `Secret` de type `Opaque`. Le pod le consomme via `valueFrom.secretKeyRef` — il n'apparaît jamais en variable d'environnement lisible dans le manifest déployé.

---

## 3. PostgreSQL — StatefulSet + PVC

PostgreSQL est déployé comme un `StatefulSet` (et non un `Deployment`) pour deux raisons :
- **Identité stable** : le pod a toujours le même nom DNS (`worldcup-postgres-0`), ce qui simplifie la config `DB_HOST`
- **PVC persistant** : le `volumeClaimTemplates` crée automatiquement un PVC de 1 Gi via le `local-path-provisioner` de k3s — les données survivent aux redémarrages de pod

Le script `init.sql` (48 équipes + matchs) est monté via un `ConfigMap` dans `/docker-entrypoint-initdb.d/` — PostgreSQL l'exécute automatiquement à la création de la base.

---

## 4. Application — Deployment

Points clés du `Deployment` :

| Paramètre | Valeur | Justification |
|-----------|--------|---------------|
| `replicas` | 2 | Haute disponibilité : si un pod tombe, l'autre continue |
| `resources.requests.cpu` | 100m | Obligatoire pour que le HPA puisse calculer le % CPU |
| `resources.limits.cpu` | 500m | Évite qu'un pod monopolise le node |
| `livenessProbe` `/api/health/db` | toutes les 10s | Redémarre le pod si la BDD est inaccessible |
| `readinessProbe` `/api/health/db` | toutes les 5s | Retire le pod du Service si pas prêt (zero downtime) |

---

## 5. Ingress — Traefik

Traefik est déjà installé par k3s. L'`Ingress` dirige le trafic HTTP entrant vers le `Service` `worldcup-app` sur le port 3000.

```yaml
annotations:
  traefik.ingress.kubernetes.io/router.entrypoints: web
```

Pour accéder à l'app : `http://<IP_VPS>` (si le DNS pointe sur le VPS) ou en ajoutant l'IP dans `/etc/hosts`.

---

## 6. HPA — Auto-scaling CPU

```yaml
minReplicas: 2
maxReplicas: 6
averageUtilization: 60  # % CPU
```

Le HPA surveille la consommation CPU des pods. Si la moyenne dépasse 60 %, il crée de nouveaux pods (jusqu'à 6). La route `/api/compute` déclenche une saturation CPU de 2-3s — idéale pour provoquer le scaling en soutenance.

**Prérequis** : `metrics-server` doit être `Running` (c'est le cas depuis le Bloc 2).

---

## 7. Déploiement sur le cluster

```bash
# Depuis le VPS, dans le repo cloné
helm upgrade --install worldcup ./charts/worldcup \
  --set db.password=<MOT_DE_PASSE> \
  --set ingress.host=<IP_OU_DOMAINE>

# Vérifier
kubectl get pods
kubectl get svc
kubectl get ingress
kubectl get hpa
```

---

## Vérifications attendues

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
