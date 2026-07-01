# Bloc 5 — Validation & tests

> Répéter ces tests à blanc avant la soutenance.
> `APP_URL=http://178.170.25.230.nip.io`

---

## 1. Élasticité — HPA scale-out sous charge

```bash
# Ouvrir Grafana dans le navigateur (rafraîchissement 5 s)
# http://grafana.178.170.25.230.nip.io/d/worldcup-app/worldcup-2026-app?refresh=5s&from=now-10m&to=now
# → panels "CPU par pod" et "Nombre de pods" montrent la montée en temps réel

# Lancer le load test (3 min, 0→3 VUs)
BASE_URL=http://178.170.25.230.nip.io k6 run tests/k6-load-test.js
```

**Comment lire le résultat :**

- Grafana panel "CPU par pod" : dépasse 60 % → l'HPA se déclenche
- Grafana panel "Nombre de pods" : monte de 2 à 6 en ~1-2 min
- Le test est validé quand le nombre de pods dépasse 2 pendant la charge, puis redescend à 2 après

**Note :** 3 VUs suffisent car `/api/compute` est CPU-intensif et le VPS est single-node 2 cœurs. Le mécanisme HPA est identique quelle que soit la charge.

---

## 2. Self-Healing — Restart automatique < 15 s

```bash
ssh ynov-cloud "APP_URL=http://178.170.25.230.nip.io bash -s selfhealing" < tests/validate.sh
```

**Comment lire le résultat :**

Le script tue un pod, puis affiche `restart en Xs` dès que l'app répond à nouveau.

- Validé si `Xs` < 15
- Le pod affiché en `Error` juste après est normal : Kubernetes le recrée automatiquement

---

## 3. Haute Disponibilité — Zéro downtime sur suppression de pod

```bash
ssh ynov-cloud "APP_URL=http://178.170.25.230.nip.io bash -s ha" < tests/validate.sh
```

**Comment lire le résultat :**

Le script supprime un pod et envoie une requête par seconde pendant 10s.

- Validé si toutes les lignes affichent `200` (`Résultat : 10/10 requêtes OK`)
- Si une ligne affiche `000` ou `503` : Traefik n'a pas eu le temps de retirer le pod de son pool — relancer avec `--grace-period=5` à la place de `--grace-period=0`

**Argument oral :** single-node = si le VPS tombe, tout tombe. En prod on passerait 3 nœuds pour le quorum etcd. Mais au niveau pod (crash, OOMKill, rolling deploy), les 2 réplicas + readiness probes garantissent la continuité.
