# Argumentaire — Choix k3s sur VPS

> À utiliser pour répondre aux questions du jury sur les choix techniques.

---

## Arguments forts

### POC → Production
k3s sur VPS est un prototype délibéré pour valider tous les mécanismes K8s (HPA, self-healing, observabilité) dans un environnement entièrement contrôlé. En production à fort trafic, le Helm chart est **identique** — seul le kubeconfig change pour pointer vers EKS multi-AZ. C'est exactement ce que prouve la reproductibilité.

### Reproductibilité
`helm upgrade --install` déploie l'ensemble de la stack en une seule commande sur n'importe quelle infra K8s : VPS, EKS, GKE, AKS. Aucune réécriture nécessaire pour migrer.

### Contrôle total
Accès SSH direct, `kubectl` direct, pas de couche d'abstraction propriétaire. Tout ce qui se passe dans le cluster est visible et auditable en temps réel.

### No vendor lock-in
Aucune dépendance à une API propriétaire AWS (pas de CloudWatch forcé, pas d'ALB Ingress Controller, pas d'IAM à câbler). Les manifests K8s sont standards et portables sur n'importe quel provider.

---

## Point faible à assumer (ne pas esquiver)

Cluster single-node = si le VPS tombe, tout tombe. Réponse préparée :

> *"En production, on passerait sur 3 nœuds minimum pour que etcd ait un quorum, ou on utiliserait EKS multi-AZ. On a priorisé la démonstration des mécanismes K8s dans le temps imparti — et la migration est triviale grâce à la reproductibilité du Helm chart."*

---

## Arguments à ne PAS utiliser

| Argument | Pourquoi invalide |
|---|---|
| "AWS coûtait trop cher" | L'école fournissait 200€ de crédits AWS |
| "Stack 100% open source" | EKS utilise aussi K8s open source — argument faible |

---

## Questions probables du jury

**"Pourquoi pas EKS avec les crédits AWS ?"**
> POC + reproductibilité + contrôle total + no vendor lock-in. EKS aurait été pertinent en prod, pas pour valider les mécanismes en 2,5 jours.

**"C'est quoi le self-healing ?"**
> K8s surveille les pods via les liveness probes. Si un pod crash ou ne répond plus, il est tué et recréé automatiquement en < 15s, sans intervention humaine. On le démontre en direct avec `/api/admin/kill`.

**"Votre HA n'est pas vraiment de la HA si le VPS tombe."**
> Assumé. Notre HA est au niveau pod (≥ 2 réplicas), pas au niveau infrastructure. En prod : multi-nœuds ou EKS multi-AZ. Le périmètre du projet l'autorise explicitement.
