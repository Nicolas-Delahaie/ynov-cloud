# Déploiement en production

Le repo est cloné sur le serveur dans `/root/<repo>`.

---

## Setup initial (une seule fois)

```bash
cp deploy/.env.example deploy/.env
# Renseigner IMAGE_TAG, DB_PASSWORD, GRAFANA_ADMIN_PASSWORD dans deploy/.env
```

`deploy/.env` est gitignored et n'est jamais touché par git.

---

## Nettoyage avant déploiement

Supprime tout résidu d'ancienne branche (fichiers non-trackés, templates obsolètes) sans toucher `deploy/.env` :

```bash
cd /root/<repo> && git restore . && git clean -fd --exclude=deploy/.env
```

---

## 1. Déploiement depuis main (branche mergée)

```bash
git checkout main && git pull
source deploy/.env
helm upgrade worldcup charts/worldcup \
  --set image.tag=$IMAGE_TAG \
  --set db.password=$DB_PASSWORD
```

---

## 2. Test d'une branche non mergée

`git restore --source` applique les fichiers d'une branche distante sans changer de branche.

```bash
git fetch
git restore --source=origin/<branche> -- charts/ app/
git diff --stat  # vérifier que le delta correspond aux changements attendus
source deploy/.env
helm upgrade worldcup charts/worldcup \
  --set image.tag=$IMAGE_TAG \
  --set db.password=$DB_PASSWORD
# Après validation, remettre propre :
git restore . && git clean -fd --exclude=deploy/.env
```

---

## Stack de monitoring (kube-prometheus-stack)

Les valeurs sont versionnées dans `monitoring/values-kube-prometheus-stack.yaml`.

```bash
# Installation initiale
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm repo update
helm upgrade --install kube-prometheus-stack prometheus-community/kube-prometheus-stack \
  -n monitoring --create-namespace \
  -f monitoring/values-kube-prometheus-stack.yaml \
  --set grafana.adminPassword=$GRAFANA_ADMIN_PASSWORD

# Mise à jour après modification du fichier values
git restore . && git clean -fd --exclude=deploy/.env && git pull
helm upgrade kube-prometheus-stack prometheus-community/kube-prometheus-stack \
  -n monitoring \
  -f monitoring/values-kube-prometheus-stack.yaml \
  --reuse-values
```

Grafana : http://grafana.178.170.25.230.nip.io
