# FinOps — Estimation de coût

> Livrable bloc 8 : coût mensuel chiffré et justifié + comparaison avec une
> alternative cloud managée pour appuyer le choix k3s (voir
> [argumentaire-soutenance.md](argumentaire-soutenance.md)).

**Message clé à l'oral** : le VPS est fourni par YNOV, donc **coût réel = 0 € pour
l'équipe**. Le FinOps consiste ici à (1) démontrer que le dimensionnement est
maîtrisé et (2) chiffrer ce que coûterait la même stack en autofinancement,
sur VPS et sur cloud managé, pour justifier le trade-off.

> ⚠️ Hypothèses à confirmer avant l'oral : specs exactes du VPS Ikoula
> (vCPU / RAM / disque) et tarif mensuel. Les valeurs ci-dessous sont des
> ordres de grandeur cohérents avec un VPS ~4 vCPU / 8 Go — à ajuster avec la
> facture réelle.

---

## 1. Dimensionnement de la stack (réservations réelles)

Basé sur [`charts/worldcup/values.yaml`](../charts/worldcup/values.yaml).

| Charge de travail | CPU (requests) | RAM (requests) | Réplicas | CPU total | RAM total |
| --- | --- | --- | --- | --- | --- |
| App Node.js | 100m *(requests)* | 128 Mi *(requests)* | 2 (→ 6 en pic) | 200m (→ 600m) | 256 Mi (→ 768 Mi) |
| PostgreSQL | ~250m *(usage estimé, pas de requests)* | ~256 Mi *(idem)* | 1 | 250m | 256 Mi |
| CronJob report | 50m | 64 Mi | ponctuel | ~0 (horaire) | ~0 |
| kube-prometheus-stack | ~500m *(usage estimé)* | ~1 Go | 1 | 500m | 1 Go |
| k3s + système (Traefik, kubelet…) | ~500m | ~512 Mi | — | 500m | 512 Mi |
| **Total régime nominal** | | | | **~1,45 vCPU** | **~2 Go** |
| **Total en pic HPA (6 pods)** | | | | **~1,85 vCPU** | **~2,5 Go** |

> Note : seule l'app définit des `requests`/`limits`. PostgreSQL, le CronJob et
> la stack de monitoring tournent sans réservation explicite — les chiffres
> ci-dessus sont des empreintes d'usage typiques, utilisées pour dimensionner le
> VPS, pas des réservations K8s.

**Conclusion de dimensionnement** : un VPS **4 vCPU / 8 Go** absorbe le régime
nominal avec ~60 % de marge, et le pic HPA (6 pods) sans saturation. C'est le
bon calibre — ni sous-dimensionné (le HPA pourrait ne pas trouver de CPU), ni
gaspillé.

---

## 2. Coût mensuel — solution retenue (k3s sur VPS)

| Poste | Détail | Coût / mois |
| --- | --- | --- |
| VPS Ikoula (~4 vCPU / 8 Go / 80 Go SSD) | 1 instance, tout-en-un | **~20 €** |
| Nom de domaine | `nip.io` (DNS wildcard gratuit) | 0 € |
| TLS | Let's Encrypt (si cert-manager) | 0 € |
| Registry image | GHCR (public, gratuit) | 0 € |
| CI/CD | GitHub Actions (quota gratuit) | 0 € |
| Observabilité | Prometheus + Grafana self-hosted | 0 € |
| **Total autofinancé** | | **~20 €/mois** |
| **Coût réel équipe (VPS fourni YNOV)** | | **0 €** |

---

## 3. Comparaison — même stack sur AWS EKS (équivalent prod)

Pour objectiver le choix, voici l'ordre de grandeur d'un équivalent managé
multi-AZ (tarifs AWS eu-west-3, à la demande).

| Poste AWS | Équivalent | Coût / mois estimé |
| --- | --- | --- |
| Control plane EKS | 0,10 $/h | ~73 € |
| 2× nœuds `t3.medium` (2 vCPU / 4 Go) | HA multi-AZ | ~55 € |
| RDS PostgreSQL `db.t3.micro` | BDD managée | ~15 € |
| ALB (Ingress) | Load balancer managé | ~18 € |
| EBS + trafic + CloudWatch | Stockage/logs/métriques | ~15 € |
| **Total EKS** | | **~175 €/mois** |

**Écart : ~9× plus cher** que le VPS pour ce périmètre. EKS apporte la HA
matérielle multi-AZ et le managé (moins d'ops), pertinents en production à fort
trafic — pas pour valider les mécanismes K8s en 2,5 jours.

---

## 4. Leviers d'optimisation (à mentionner à l'oral)

- **`requests` calibrés au plus juste** : CPU 100m/pod → le HPA scale finement sans surréserver.
- **`limits` bornées** (500m/256Mi) : un pod en charge (`/api/compute`) ne peut pas affamer le node.
- **Alpine partout** (`node:20-alpine`, `postgres:15-alpine`) : images légères → moins de disque, pull plus rapide.
- **Scale-to-min hors charge** : HPA redescend à 2 pods → pas de CPU payé pour rien.
- **Registry + CI/CD gratuits** (GHCR, GitHub Actions) : 0 € d'outillage.

## 5. Synthèse

| | k3s / VPS (retenu) | EKS multi-AZ |
| --- | --- | --- |
| Coût mensuel | ~20 € (0 € réel) | ~175 € |
| HA | Niveau pod | Niveau infra (multi-AZ) |
| Ops | Manuel (SSH/kubectl) | Managé |
| Pertinence projet | ✅ POC + démo mécanismes | Surdimensionné ici |

> Le choix VPS optimise **coût × pertinence pédagogique**. La reproductibilité du
> chart Helm rend la bascule vers EKS triviale le jour où la HA matérielle
> devient un besoin réel.
