---
marp: true
theme: default
paginate: true
size: 16:9
header: "WorldCup 2026 — Plateforme haute disponibilité"
footer: "Ynov Cloud · k3s / Helm · Soutenance"
style: |
  section { font-size: 26px; }
  h1 { color: #1a3c5e; }
  h2 { color: #2563eb; }
  table { font-size: 22px; }
  section.lead { text-align: center; }
  section.lead h1 { font-size: 52px; }
  .big { font-size: 40px; font-weight: 700; color: #2563eb; }
---

<!-- _class: lead -->

# WorldCup 2026
## Une plateforme web qui **ne tombe pas**, **encaisse les pics** et **maîtrise son budget**

Node.js + PostgreSQL sur Kubernetes (k3s)

*Soutenance — revue d'ingénierie & crash-test live*

---

## Le besoin client

Une audience mondiale, imprévisible, avec des **pics violents** pendant les matchs.

> « Je ne peux pas me permettre que le site tombe en plein match…
> …ni payer une infra surdimensionnée le reste du temps. »

Trois exigences non négociables :

<span class="big">Disponibilité · Élasticité · Budget maîtrisé</span>

---

## Notre proposition de valeur

| Ce que veut le client | Ce qu'on garantit |
| --- | --- |
| « Mon site ne tombe pas » | Service continu même si un composant lâche |
| « Il se répare tout seul » | Retour en service **< 15 s**, sans intervention |
| « Il encaisse les pics » | Capacité **x3 automatique** pendant la charge |
| « Je vois ce qui se passe » | Dashboard temps réel + alertes |
| « Je maîtrise mon budget » | **~20 €/mois**, transparent |
| « Mes données sont protégées » | Zéro secret exposé |

---

## L'architecture en un coup d'œil

```text
Internet ──▶ Traefik ──▶ [ App pod x2..6 ] ──▶ PostgreSQL (PVC)
                            ▲   HPA 2→6           ▲
                            │                     │ Secret (DB_PASSWORD)
             Prometheus ── scrape /metrics        │
                            │                  CronJob rapport
                         Grafana (dashboard client)
```

- **Traefik** expose l'app sur Internet
- **2 → 6 pods** applicatifs auto-scalés (HPA)
- **PostgreSQL** persistant + **Secrets** chiffrés
- **Prometheus + Grafana** : observabilité temps réel

> Schéma détaillé et légendé (Mermaid) : `docs/architecture.md`

---

## Garantie n°1 — Haute disponibilité

**Promesse : perte d'un composant = 0 interruption.**

- ≥ 2 réplicas en permanence, load-balancés
- Sondes `liveness` / `readiness` sur `/api/health/db`

**Preuve live :** on supprime un pod → le trafic continue, **aucun 5xx**.

```bash
kubectl delete pod <pod-app>
# curl en boucle → reste 200
```

---

## Garantie n°2 — Self-healing < 15 s

**Promesse : ça crashe, ça repart tout seul.**

- Kubernetes surveille chaque pod
- Crash détecté → pod tué et recréé automatiquement

**Preuve live, chronométrée :**

```bash
time curl http://…/api/admin/kill
# pod Terminating → Running  en < 15 s
```

<span class="big">Aucune intervention humaine.</span>

---

## Garantie n°3 — Élasticité automatique

**Promesse : la capacité suit la charge, à la hausse comme à la baisse.**

- HPA scale **2 → 6 pods** dès que le CPU dépasse **60 %**
- Redescend à 2 hors charge → **pas de sur-facturation**

**Preuve live :** load test sur `/api/compute` → les pods montent à l'écran.

```bash
hey -z 60s -c 50 http://…/api/compute
watch kubectl get hpa,pods
```

---

## Garantie n°4 — Observabilité

**Promesse : vous savez en permanence ce qui se passe.**

Dashboard client : **req/s · latence p95 · taux 5xx · CPU · nombre de pods**

- Prometheus scrape `/metrics` toutes les 15 s
- **3 alertes** : app down, 5xx élevé, latence dégradée

> Le panel « nombre de pods » rend l'élasticité et le self-healing **visibles**.

---

## Sécurité & industrialisation

- **Secrets Kubernetes** : `DB_PASSWORD` injecté par référence — **0 credential dans Git**
- **Livraison en 1 commande**, reproductible sur n'importe quel cluster :

```bash
helm upgrade worldcup charts/worldcup \
  --set image.tag=$IMAGE_TAG --set db.password=$DB_PASSWORD
```

- **CI/CD** : chaque push sur `main` → build & push automatiques de l'image (GHCR)

---

## L'offre — FinOps

| | **Notre solution (k3s)** | Cloud managé (EKS) |
| --- | --- | --- |
| **Prix / mois** | **~20 €** | ~175 € |
| Disponibilité | Niveau applicatif | Niveau infra (multi-AZ) |
| Mise en service | 1 commande | Idem, plus lourde |
| Pertinence ici | ✅ Le bon calibre | Surdimensionné |

<span class="big">Budget ÷ 9 — même package Helm.</span>

*Détail chiffré : `docs/finops.md`*

---

## Évolutivité — POC aujourd'hui, prod demain

- Aujourd'hui : **1 cluster k3s**, tous les mécanismes K8s validés
- Demain, si la charge l'exige : **multi-nœuds** ou **EKS multi-AZ**

> **Aucune réécriture** : on change le kubeconfig, le chart Helm est identique.

Le point faible assumé (single-node) devient un choix de **calibrage**, pas une limite technique.

---

<!-- _class: lead -->

# Démo & crash-test

**On vous laisse stresser le produit.**

Charge · Kill · Suppression de pod

→ Il tient. Il se répare. Vous le voyez sur le dashboard.

http://178.170.25.230.nip.io

---

<!-- _class: lead -->

# Merci

**Disponible · Élastique · Observable · Maîtrisé**

Questions ?

*Docs techniques : architecture.md · finops.md · argumentaire-soutenance.md*
