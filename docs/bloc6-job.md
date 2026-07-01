# Bloc 6 — Job créatif

## Contexte

La consigne du capstone demande un **Job qui lit les données sportives en base et produit un résultat exploitable** (stats, classement, rapport, notification…). C'est le « job créatif » : un traitement batch, découplé de l'application web, qui ajoute de la valeur métier à partir des données déjà présentes en BDD.

On implémente un **CronJob Kubernetes** qui, à intervalle régulier, lit PostgreSQL et génère un **rapport horodaté** dans trois formats (Markdown, CSV, JSON), stocké sur un **volume persistant**.

> Ce bloc rapporte le **bonus « Job créatif » (+1 pt)** de la grille.

---

## Ce que produit le Job

À chaque exécution, le Job calcule et écrit :

1. **Le classement par groupe** de la phase de groupes (12 groupes A→L) — points, victoires/nuls/défaites, buts pour/contre, différence de buts, triés selon les règles FIFA (points → diff. de buts → buts marqués).
2. **Le palmarès des votes** (pronostics du public) — nombre de votes et pourcentage par équipe, triés.

Trois fichiers sont écrits par exécution, plus une copie `report-latest.md` toujours à jour :

```
/reports/
├── report-2026-06-30T14-00-00-000Z.md     ← lisible à l'œil (tables Markdown)
├── report-2026-06-30T14-00-00-000Z.csv     ← classement à plat (tableur, BI)
├── report-2026-06-30T14-00-00-000Z.json    ← exploitable par une autre app
└── report-latest.md                        ← dernier rapport, accès facile
```

---

## Pourquoi un CronJob (et pas un Deployment ou un endpoint HTTP) ?

| Option                         | Pourquoi pas / pourquoi                                                              |
| ------------------------------ | ----------------------------------------------------------------------------------- |
| Route HTTP dans l'app          | Mélange charge web et batch ; pas de déclenchement programmé ; pas d'historique     |
| Deployment qui tourne en boucle | Gaspille des ressources entre deux exécutions (le rapport ne change qu'au fil des matchs) |
| **CronJob** ✅                  | Modèle natif K8s pour le batch planifié : éphémère, isolé, historisé, sans coût à vide |

Un CronJob est l'objet Kubernetes **conçu pour ça** : il crée un Job (donc un pod) selon une planification cron, le pod s'exécute jusqu'au bout puis disparaît. Zéro ressource consommée entre deux runs.

---

## Choix d'implémentation : réutiliser l'image de l'app

Le script du Job ([app/jobs/report.js](../app/jobs/report.js)) est ajouté **dans le code de l'application** et tourne avec **la même image Docker** que l'app web. Le CronJob change juste la commande de démarrage :

```yaml
command: ["node", "jobs/report.js"]   # au lieu de ["node", "main.js"]
```

**Avantages :**

- **Aucune image supplémentaire** à builder, versionner et publier — une seule source de vérité.
- **Mêmes dépendances** : le client `pg` est déjà présent, pas de duplication.
- **Cohérence métier** : le calcul du classement réutilise **exactement le même algorithme** que la route `GET /api/standings` de l'app (même barème, même tri). Le rapport ne peut pas diverger de ce qu'affiche le site.

Le script est **autonome** : il n'importe pas `main.js` (pour ne pas démarrer le serveur Express), il ouvre son propre pool PostgreSQL, fait son travail, puis `process.exit(0)` en cas de succès / `exit(1)` en cas d'échec — sémantique attendue par Kubernetes pour marquer le Job réussi ou échoué.

---

## Les ressources Kubernetes

Deux templates Helm ajoutés au chart, activables par `job.enabled` :

### 1. PersistentVolumeClaim — [charts/worldcup/templates/report-pvc.yaml](../charts/worldcup/templates/report-pvc.yaml)

```yaml
kind: PersistentVolumeClaim
metadata:
  name: worldcup-reports
spec:
  accessModes: [ReadWriteOnce]
  resources:
    requests:
      storage: 1Gi
```

Stocke les rapports **en dehors du cycle de vie des pods** : le pod du Job disparaît après chaque run, mais les fichiers restent. On accumule ainsi un historique des rapports.

### 2. CronJob — [charts/worldcup/templates/cronjob-report.yaml](../charts/worldcup/templates/cronjob-report.yaml)

Points clés du manifeste :

| Réglage                          | Valeur          | Pourquoi                                                                 |
| -------------------------------- | --------------- | ------------------------------------------------------------------------ |
| `schedule`                       | `0 * * * *`     | Toutes les heures (paramétrable via `values.yaml`)                       |
| `concurrencyPolicy: Forbid`      |                 | Pas deux rapports en parallèle si un run déborde                         |
| `restartPolicy: Never`           |                 | Un run qui échoue n'est pas relancé dans le même pod                     |
| `backoffLimit: 2`                |                 | Au plus 2 nouvelles tentatives en cas d'échec                           |
| `successfulJobsHistoryLimit: 3`  |                 | Garde les 3 derniers pods réussis (pour consulter les logs)             |
| `failedJobsHistoryLimit: 1`      |                 | Garde le dernier pod en échec pour debug                                |
| `resources`                      | 50m CPU / 64Mi  | Job léger : il lit quelques tables et écrit 3 petits fichiers           |

Le mot de passe BDD est injecté depuis le **Secret K8s** `worldcup-db-secret` (le même que l'app) — jamais en clair, conformément à l'exigence sécurité.

---

## Paramétrage (values.yaml)

```yaml
job:
  enabled: true
  schedule: "0 * * * *"   # cron : toutes les heures
  storage: 1Gi            # taille du PVC des rapports
```

Désactivable d'un `--set job.enabled=false` si on ne veut pas du CronJob.

---

## Déploiement & test sur le VPS (k3s)

> Comme pour les blocs 3 et 4, le chart se déploie sur le cluster k3s du VPS Ikoula.

```bash
# 1. (Si le script report.js vient d'être ajouté) rebuild + push de l'image
docker buildx build --platform linux/amd64 --target prod \
  -t ghcr.io/nicolas-delahaie/ynov-cloud:v1.0.0 --push ./app

# 2. Déployer / mettre à jour le chart (le CronJob + le PVC apparaissent)
helm upgrade --install worldcup ./charts/worldcup \
  --set ingress.host=<IP>.nip.io \
  --set db.password=<MOT_DE_PASSE>

# 3. Vérifier que le CronJob est créé
kubectl get cronjob worldcup-report
kubectl get pvc worldcup-reports
```

### Déclencher une exécution immédiate (sans attendre l'heure pleine)

```bash
# Crée un Job ponctuel à partir du CronJob
kubectl create job --from=cronjob/worldcup-report report-manual

# Suivre les logs
kubectl logs -l component=report -f
# → [report] 48 équipes, 12 groupes, N votes traités
# → [report] Rapports écrits dans /reports/ : ...
# → [report] Terminé avec succès
```

### Lire le rapport généré

Le pod du Job étant terminé, on monte le PVC dans un pod jetable pour lire les fichiers :

```bash
kubectl run reader --rm -it --image=busybox --restart=Never \
  --overrides='{"spec":{"containers":[{"name":"reader","image":"busybox","command":["sh"],"stdin":true,"tty":true,"volumeMounts":[{"name":"r","mountPath":"/reports"}]}],"volumes":[{"name":"r","persistentVolumeClaim":{"claimName":"worldcup-reports"}}]}}'

# Dans le shell :
cat /reports/report-latest.md
ls -l /reports/
```

---

## Exemple de rapport (extrait Markdown)

```markdown
# 🏆 Rapport Coupe du Monde 2026

*Généré le 2026-06-30T14:00:00.000Z par le CronJob worldcup-report*

## Classement par groupe (phase de groupes)

### Groupe A
| # | Équipe        | J | G | N | P | BP | BC | Diff | Pts |
|---|---------------|---|---|---|---|----|----|------|-----|
| 1 | Mexico        | 2 | 2 | 0 | 0 | 3  | 0  | +3   | **6** |
| 2 | South Korea   | 2 | 1 | 0 | 1 | 2  | 2  | 0    | **3** |
| 3 | Czech Republic| 2 | 0 | 1 | 1 | 2  | 3  | -1   | **1** |
| 4 | South Africa  | 2 | 0 | 1 | 1 | 1  | 3  | -2   | **1** |

## Palmarès des votes (pronostics du public)
| # | Équipe   | Votes | %     |
|---|----------|-------|-------|
| 1 | France   | 12    | 40.0% |
| 2 | Brazil   | 9     | 30.0% |
```

---

## Idées d'évolution (à mentionner à l'oral)

Le Job est volontairement simple et extensible. Pistes citées dans le PLAN :

- **Notification** : poster le classement sur un webhook Discord/Slack à chaque run.
- **Prédiction** : croiser classement réel et votes pour une mini-prédiction de vainqueur.
- **Export BI** : le CSV est déjà directement importable dans un tableur / Grafana.

---

## Statut de validation

| Élément                                                        | Statut    |
| ------------------------------------------------------------- | --------- |
| Script `app/jobs/report.js` (lecture BDD, 3 formats)          | ✅ Écrit  |
| Template CronJob + PVC dans le chart Helm                     | ✅ Écrit  |
| Paramétrage `values.yaml` (`job.*`)                           | ✅ Écrit  |
| Réutilisation de l'algorithme de classement de l'app          | ✅ Fait   |
| Secret BDD injecté (pas de credential en clair)               | ✅ Fait   |
| Déploiement + exécution réelle sur le VPS k3s                 | ⏳ À jouer sur le cluster |

> Comme pour le bloc 4, les manifestes sont **écrits et prêts** ; l'exécution réelle se fait sur le VPS (`kubectl create job --from=cronjob/...`) et se vérifie via les logs du pod + lecture du PVC.
