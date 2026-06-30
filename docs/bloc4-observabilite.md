# Bloc 4 — Observabilité

## Contexte

Les blocs précédents ont rendu l'application **disponible** (2 réplicas), **élastique** (HPA) et **résiliente** (probes). Le bloc 4 répond à une autre question : **comment sait-on que tout ça marche vraiment ?** Pendant le crash-test de la soutenance (load test + chaos test en direct), il faut pouvoir *montrer* en temps réel que l'app encaisse la charge, que le HPA scale, et qu'un pod tué redémarre. C'est le rôle de l'observabilité.

On déploie la stack standard de l'écosystème Kubernetes : **Prometheus** (collecte des métriques), **Grafana** (visualisation) et **Alertmanager** (alerting). Le tout via le chart `kube-prometheus-stack`, qui les package ensemble avec le **Prometheus Operator**.

> Exigence de la grille : *Observabilité — Dashboard + métriques + logs centralisés + alerting*. C'est le pilier « Observabilité & FinOps » (2 pts), et surtout le support visuel de toute la démo de crash-test.

---

## Pourquoi cette stack et pas autre chose ?

L'app expose **déjà** un endpoint `/metrics` au format Prometheus (instrumenté dans [app/main.js](../app/main.js) avec `prom-client`). Brancher Prometheus dessus est donc le chemin le plus court — pas de réinstrumentation à faire.

| Choix | Justification |
|-------|---------------|
| **Prometheus** plutôt que pousser vers un SaaS (Datadog, New Relic…) | Pull-based, open source, zéro coût, déjà la cible naturelle du format `/metrics` exposé par l'app. Cohérent avec le rationale « pas de vendor lock-in » du projet. |
| **Grafana** | Standard de fait pour visualiser des métriques Prometheus. Dashboards versionnables en JSON. |
| **Alertmanager** | Inclus dans la stack, gère la déduplication/routage des alertes définies côté Prometheus. |
| **kube-prometheus-stack** (chart unique) | Installe Prometheus + Grafana + Alertmanager + Operator + les CRD en une commande. Évite de câbler 4 composants à la main en 2,5 jours. |

**Pourquoi le Prometheus Operator ?** Il introduit des objets Kubernetes (`ServiceMonitor`, `PrometheusRule`) qui décrivent *quoi scraper* et *quelles alertes* de façon déclarative. Plutôt que d'éditer à la main le fichier `prometheus.yml` monolithique, chaque application déclare sa propre supervision dans son Helm Chart. C'est exactement ce qu'on fait : le chart `worldcup` embarque son `ServiceMonitor` et son `PrometheusRule`.

---

## Architecture

```
                    ┌──────────────────── namespace monitoring ───────────────────┐
                    │                                                              │
  Pods worldcup-app │   ┌────────────┐   scrape /metrics   ┌──────────────┐        │
   (/metrics :3000) │◄──┼ Prometheus ┼─────────────────────┤ ServiceMonitor│ (CRD)  │
        ▲           │   │            │                      └──────────────┘        │
        │           │   │            │   évalue              ┌──────────────┐        │
        │           │   │            ┼──────────────────────┤ PrometheusRule│ (CRD)  │
        │           │   └─────┬──────┘   les règles          └──────────────┘        │
        │           │         │ datasource                                          │
        │           │   ┌─────▼──────┐        alertes   ┌──────────────┐            │
        │           │   │  Grafana   │   ◄──────────────┤ Alertmanager │            │
        │           │   └─────┬──────┘                  └──────────────┘            │
        └───────────┼─────────┼────────────────────────────────────────────────────┘
                    │         │ Ingress Traefik
                    └─────────┼──────────────────► Internet (grafana.<IP>.nip.io)
```

- **Prometheus** découvre les cibles via le `ServiceMonitor`, scrape `/metrics` toutes les 15 s, stocke les séries temporelles.
- **Grafana** lit Prometheus comme datasource et affiche le dashboard.
- **Alertmanager** reçoit les alertes déclenchées par les règles `PrometheusRule`.

---

## 1. Ce que l'app expose déjà

Instrumentation présente dans [app/main.js](../app/main.js) :

| Métrique | Type | Usage |
|----------|------|-------|
| `http_requests_total{method,status_code}` | Counter | Calculer le débit (req/s) et le **taux d'erreurs 5xx** |
| `http_request_duration_seconds_bucket{route,le}` | Histogram | Calculer la **latence p95** par `histogram_quantile` |
| `process_*`, `nodejs_*` (default metrics) | Gauge/Counter | CPU, mémoire, event-loop du process Node.js |

Un middleware Express alimente ces métriques à chaque requête, et la route `/metrics` les sert au format texte Prometheus. **On ne touche pas au code** — c'est déjà fait, et les routes ne doivent pas changer (évaluation automatisée).

---

## 2. ServiceMonitor — dire à Prometheus quoi scraper

Fichier : [charts/worldcup/templates/servicemonitor.yaml](../charts/worldcup/templates/servicemonitor.yaml)

```yaml
spec:
  selector:
    matchLabels:
      app: worldcup-app     # cible le Service worldcup-app
  endpoints:
    - port: http            # port NOMMÉ du Service (pas un numéro)
      path: /metrics
      interval: 15s
```

Deux points qui ont nécessité une modif :

- **Le Service doit avoir un port nommé.** Un `ServiceMonitor` référence le port par son nom, pas par son numéro. On a donc ajouté `name: http` au port 3000 du Service ([service.yaml](../charts/worldcup/templates/service.yaml)).
- **Le label `release: kube-prometheus-stack`.** Par défaut, Prometheus (installé par le chart) ne sélectionne que les `ServiceMonitor` portant le label `release` égal au nom de sa release Helm. Sans ce label, le ServiceMonitor existe mais est **ignoré** — piège classique. La valeur est paramétrable via `monitoring.releaseLabel` dans `values.yaml`.

Le tout est conditionné par `monitoring.enabled` : si on déploie le chart sur un cluster sans le Prometheus Operator, les CRD `ServiceMonitor`/`PrometheusRule` n'existent pas et le déploiement échouerait. Le flag permet de désactiver proprement.

---

## 3. PrometheusRule — les alertes

Fichier : [charts/worldcup/templates/prometheusrule.yaml](../charts/worldcup/templates/prometheusrule.yaml)

Trois alertes, directement reliées aux exigences de la grille :

| Alerte | Expression (résumé) | Sévérité | Démontre |
|--------|---------------------|----------|----------|
| `WorldcupAppDown` | `sum(up{job="worldcup-app"}) == 0` pendant 1 min | critical | Détection d'indisponibilité totale |
| `WorldcupHigh5xxRate` | ratio de 5xx > 5 % pendant 2 min | warning | Détection d'erreurs applicatives |
| `WorldcupHighLatencyP95` | p95 > 1 s pendant 2 min | warning | Détection de **saturation** (utile sous charge `/api/compute`) |

**Pourquoi la clause `for:` ?** Elle évite les fausses alertes sur un pic transitoire : la condition doit être vraie *en continu* pendant la durée indiquée avant que l'alerte ne passe en `firing`. Un seul scrape au-dessus du seuil ne déclenche rien.

Les seuils sont paramétrables (`monitoring.alerts.*`) pour pouvoir les abaisser en démo et faire sonner une alerte volontairement.

---

## 4. Dashboard Grafana

Fichier : [monitoring/grafana-dashboard-worldcup.yaml](../monitoring/grafana-dashboard-worldcup.yaml)

Le dashboard est livré en **ConfigMap** portant le label `grafana_dashboard: "1"`. Le sidecar de Grafana (activé par `kube-prometheus-stack`) surveille ces ConfigMap et importe automatiquement le JSON — pas d'import manuel via l'UI, et le dashboard est **versionné dans Git**.

Six panels, calqués sur ce qu'on veut prouver en soutenance :

| Panel | Requête PromQL | Ce qu'on montre |
|-------|----------------|-----------------|
| Requêtes / s | `sum(rate(http_requests_total[1m])) by (status_code)` | Le débit grimpe pendant le load test |
| Latence p95 | `histogram_quantile(0.95, sum(rate(http_request_duration_seconds_bucket[5m])) by (le))` | La latence reste tenue (ou se dégrade → alerte) |
| Taux 5xx | `rate(...5..) / rate(total)` | L'app ne casse pas sous charge |
| Nombre de pods | `count(up{job="worldcup-app"} == 1)` | **Le HPA scale en direct** (2 → 4 → 6) |
| CPU / pod | `rate(container_cpu_usage_seconds_total{pod=~"worldcup-app.*"}[1m])` | La charge CPU qui déclenche le scaling |
| Mémoire / pod | `container_memory_working_set_bytes{...}` | Pas de fuite mémoire |

Le panel **nombre de pods** est le plus parlant : pendant le crash-test, on voit la courbe monter en même temps que le CPU, ce qui matérialise l'élasticité.

---

## 5. Logs centralisés

L'exigence minimale (« logs centralisés ») est couverte par les logs structurés que k3s agrège déjà :

```bash
# Logs agrégés des deux pods de l'app, en suivi temps réel
kubectl logs -l app=worldcup-app -f --prefix
```

Le `-l app=worldcup-app` agrège les logs **de tous les réplicas** dans un seul flux, et `--prefix` préfixe chaque ligne par le nom du pod source — suffisant pour la démo.

> **Bonus possible (non déployé)** : ajouter **Loki + Promtail** pour interroger les logs depuis Grafana (mêmes labels que les métriques, corrélation logs/métriques sur un seul écran). Écarté ici pour rester dans le temps imparti et ne pas alourdir le VPS single-node ; mentionné à l'oral comme évolution.

---

## 6. Déploiement (runbook VPS)

> ⚠️ **Tout s'exécute sur le VPS, jamais en local.** Le build d'image (bloc 3), `helm`, `kubectl` et la stack de monitoring tournent sur le serveur Ikoula (k3s single-node, amd64). Une machine de dev sert seulement à éditer/commit le code ; le déploiement et les tests se font en SSH sur le VPS.
>
> ```bash
> # Depuis la machine de dev : pousser le code, puis se connecter au VPS
> git push origin bloc-4
> ssh <user>@<IP>
> cd ~/<repo> && git fetch && git checkout bloc-4 && git pull
> ```

Toutes les commandes ci-dessous sont lancées **dans cette session SSH sur le VPS**.

```bash
# 0. Charger les credentials (git-ignoré, jamais en clair dans Git)
#    Voir deploy/.env.example pour la liste des variables
source deploy/.env

# 1. Ajouter le repo Helm de la communauté Prometheus
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm repo update

# 2. Installer la stack (Prometheus + Grafana + Alertmanager) dans son namespace
helm upgrade --install kube-prometheus-stack \
  prometheus-community/kube-prometheus-stack \
  -n monitoring --create-namespace \
  -f monitoring/values-kube-prometheus-stack.yaml \
  --set grafana.adminPassword="$GRAFANA_ADMIN_PASSWORD"

# 3. Importer le dashboard de l'app
kubectl apply -f monitoring/grafana-dashboard-worldcup.yaml

# 4. Redéployer l'app : le ServiceMonitor + PrometheusRule sont maintenant pris en compte
helm upgrade --install worldcup ./charts/worldcup \
  --set image.tag="$IMAGE_TAG" \
  --set db.password="$DB_PASSWORD"
```

Le nom de release `kube-prometheus-stack` **doit** correspondre à `monitoring.releaseLabel` dans `values.yaml`, sinon Prometheus ignore le ServiceMonitor (voir §2).

### Vérifications (sur le VPS, en terminal)

Ces contrôles ne nécessitent pas de navigateur — ils se lancent directement dans la session SSH.

```bash
# a) Les pods de monitoring sont Running
kubectl -n monitoring get pods

# b) Le ServiceMonitor et la PrometheusRule de l'app existent
kubectl get servicemonitor,prometheusrule -l app=worldcup-app
```

> ⚠️ Le conteneur Prometheus n'embarque **ni `wget` ni `curl`** : on n'interroge pas son API via `kubectl exec`. On ouvre un **port-forward** et on interroge depuis le VPS (qui a `curl` ; sinon `apt install -y curl`).

```bash
# Ouvrir le tunnel vers Prometheus (en arrière-plan)
kubectl -n monitoring port-forward svc/kube-prometheus-stack-prometheus 9090:9090 >/tmp/pf.log 2>&1 &
sleep 2

# c) Prometheus scrape bien l'app : la cible doit être "up"=1 (une série par réplica)
#    -G --data-urlencode : curl encode la requête (les {, }, " ne passent pas bruts dans l'URL)
curl -s -G http://localhost:9090/api/v1/query \
  --data-urlencode 'query=up{job="worldcup-app"}' | grep -o '"value":\[[^]]*\]'
#   → attendu : deux séries à la valeur "1"

# d) Les règles d'alerte sont chargées
curl -s 'http://localhost:9090/api/v1/rules' | grep -o '"name":"Worldcup[^"]*"'
#   → attendu : WorldcupAppDown, WorldcupHigh5xxRate, WorldcupHighLatencyP95

# e) Grafana répond (Ingress Traefik), depuis le VPS
curl -sI http://grafana.178.170.25.230.nip.io | head -1   # → HTTP/1.1 200 OK (ou 302 vers /login)

# Fermer le tunnel
kill %1
```

Depuis un poste extérieur (démo), Grafana est sur **http://grafana.178.170.25.230.nip.io** (admin / `$GRAFANA_ADMIN_PASSWORD`).

### Test de la chaîne d'alerte (sur le VPS)

```bash
# Provoquer un crash → on observe le self-healing dans le dashboard ; si les 2 pods
# tombent, l'alerte WorldcupAppDown passe en "firing".
kubectl exec deploy/worldcup-app -- wget -qO- --post-data='' http://localhost:3000/api/admin/kill || true

# Vérifier l'état des alertes (via le même tunnel port-forward que ci-dessus)
kubectl -n monitoring port-forward svc/kube-prometheus-stack-prometheus 9090:9090 >/tmp/pf.log 2>&1 &
sleep 2
curl -s 'http://localhost:9090/api/v1/alerts' | grep -o '"alertname":"[^"]*"'
kill %1
```

Comme pour le mot de passe BDD au bloc 3, le **mot de passe Grafana n'est jamais en clair dans Git** : il est passé via `--set grafana.adminPassword=...` et stocké côté cluster dans un Secret.

### Statut de validation

Déployé et testé en SSH sur le VPS (k3s single-node) :

- [x] `kube-prometheus-stack` installé (`kubectl -n monitoring get pods` tous Running)
- [x] cible `worldcup-app` en `up=1` dans Prometheus (vérif. c)
- [x] dashboard « Worldcup 2026 — App » visible dans Grafana, avec données live
- [x] les 3 alertes chargées : `WorldcupAppDown`, `WorldcupHigh5xxRate`, `WorldcupHighLatencyP95` (vérif. d)
- [x] HA démontrée en live : kill d'un pod (`/api/admin/kill`) → l'app reste UP via le 2ᵉ réplica
- [x] chaîne Alertmanager fonctionnelle (alerte `Watchdog` en firing)

---

## Pièges rencontrés

### ServiceMonitor ignoré par Prometheus
Symptôme : la cible n'apparaît pas dans `/targets`, alors que le `ServiceMonitor` existe (`kubectl get servicemonitor`).

Cause : Prometheus ne sélectionne que les `ServiceMonitor` portant le label `release: <nom-de-release>`. Fix : ajouter ce label (fait via `monitoring.releaseLabel`), et garder le nom de release Helm cohérent.

### Port non nommé
Symptôme : le ServiceMonitor ne scrape rien. Cause : `endpoints.port` attend un **nom** de port, pas un numéro. Fix : nommer le port (`name: http`) dans le Service.

### CRD absentes au déploiement du chart app
Symptôme : `no matches for kind "ServiceMonitor"` au `helm upgrade` du chart worldcup. Cause : la stack de monitoring (qui installe les CRD) n'est pas encore là. Fix : installer `kube-prometheus-stack` **avant** de redéployer l'app — ou laisser `monitoring.enabled=false` le temps de l'installer.

---

## Lien avec la soutenance

| Moment de la démo | Ce que l'observabilité prouve |
|-------------------|-------------------------------|
| Load test (`hey`/`k6` sur `/api/compute`) | Panel CPU monte → panel « nb de pods » passe de 2 à 6 → **élasticité visible** |
| Chaos test (`POST /api/admin/kill`) | Panel « nb de pods » dippe puis remonte < 15 s → **self-healing chronométré** |
| Question jury « et si l'app tombe ? » | Alerte `WorldcupAppDown` en `firing` dans Alertmanager → **détection prouvée** |

C'est le bloc qui transforme « on a configuré du scaling » en « regardez, ça scale, là, maintenant ».
