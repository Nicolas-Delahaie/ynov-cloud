# Bloc 5 — Validation & tests

> Répéter ces tests à blanc avant la soutenance.
> `APP_URL=http://178.170.25.230.nip.io`

---

## 1. Élasticité — HPA scale-out sous charge

```bash
# Terminal 1 — observer l'HPA
ssh ynov-cloud "while true; do kubectl get hpa worldcup-hpa; sleep 5; done"

# Terminal 2 — observer les pods
ssh ynov-cloud "while true; do kubectl get pods -l app=worldcup-app; sleep 5; done"

# Terminal 3 — load test (4 min, 0→30 VUs)
ssh ynov-cloud "BASE_URL=http://178.170.25.230.nip.io k6 run -" < tests/k6-load-test.js
```

**Comment lire le résultat :**

- Terminal 1 : la colonne `TARGETS` passe au-dessus de `60%/60%` → l'HPA se déclenche
- Terminal 2 : la colonne `READY` augmente (`2/2` → `4/4` → `6/6`) → les pods sont créés et prêts
- Le test est validé quand `REPLICAS` dépasse 2 pendant la charge, puis redescend à 2 après

**Note :** les timeouts k6 sur `/api/compute` sont normaux — Node.js est mono-thread, les 30 VUs saturent avant que les nouveaux pods soient prêts (~30s de délai HPA + ~30s de démarrage).

---

## 2. Self-Healing — Restart automatique < 15 s

```bash
ssh ynov-cloud "APP_URL=http://178.170.25.230.nip.io bash -s selfhealing" < tests/validate.sh
```

**Comment lire le résultat :**

Le script affiche une ligne par seconde pendant l'attente, puis la durée dès que l'app répond :

```text
Pods avant kill :
  worldcup-app-xxx   1/1   Running   ...
  worldcup-app-yyy   1/1   Running   ...

Envoi POST /api/admin/kill...
Attente du retour (max 30s)...
  . 1s
app UP — restart en 1s (1037ms)   ← nombre de secondes écoulées

Pods après restart :
  worldcup-app-xxx   0/1   Error     ...   ← pod crashé, en cours de recréation
  worldcup-app-yyy   1/1   Running   ...   ← pod sain, a absorbé le trafic
```

Le test est validé si `restart en Xs` affiche un chiffre inférieur à 15.
Le pod en `Error` est normal : Kubernetes le recrée automatiquement en arrière-plan.

---

## 3. Haute Disponibilité — Zéro downtime sur suppression de pod

```bash
ssh ynov-cloud "APP_URL=http://178.170.25.230.nip.io bash -s ha" < tests/validate.sh
```

**Comment lire le résultat :**

Le script supprime un pod et envoie une requête par seconde pendant 10s :

```text
Pods avant suppression :
  worldcup-app-xxx   1/1   Running   ...
  worldcup-app-yyy   1/1   Running   ...

Suppression de worldcup-app-xxx...
Disponibilité pendant 10s :
   1s -> 200     ← le second pod répond immédiatement
   2s -> 200
   ...
  10s -> 200

Pods après suppression :
  worldcup-app-zzz   0/1   Running   ...   ← nouveau pod en cours de démarrage
  worldcup-app-yyy   1/1   Running   ...

Résultat : 10/10 requêtes OK
```

Le test est validé si toutes les lignes affichent `200`. Si une ligne affiche `000` ou `503`, Traefik n'a pas eu le temps de retirer le pod de son pool — relancer le test avec `--grace-period=5` à la place de `--grace-period=0`.

**Argument oral :** single-node = si le VPS tombe, tout tombe. En prod on passerait 3 nœuds pour le quorum etcd. Mais au niveau pod (crash, OOMKill, rolling deploy), les 2 réplicas + readiness probes garantissent la continuité.
