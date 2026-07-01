# Présentation soutenance — format avant-vente

> Pitch commercial de la solution : on présente au jury comme à un **client**.
> On vend des **bénéfices** (disponibilité, élasticité, maîtrise des coûts), la
> preuve technique venant en démonstration live. Les docs d'ingénierie restent
> techniques : [Architecture](architecture.md) · [FinOps](finops.md) ·
> [Argumentaire choix k3s](argumentaire-soutenance.md) · [Observabilité](bloc4-observabilite.md).

- **App (démo live)** : http://178.170.25.230.nip.io
- **Dashboard client** : http://grafana.178.170.25.230.nip.io

---

## 1. Déroulé (40 min)

| Phase | Durée | Posture | Contenu |
| --- | --- | --- | --- |
| Pitch avant-vente | 10 min | Commerciale | Besoin client, proposition de valeur, garanties, offre (FinOps) |
| Démo produit | 10 min | Product owner | On montre les bénéfices en action (URL, dashboard, déploiement) |
| Crash-tests jury | 15 min | Preuve / SAV | Le client stresse le produit, il tient et se répare seul |
| Questions | 5 min | Expert | Réponses techniques précises (le jury pioche au hasard) |

**Consigne enseignant** : ce qui compte, c'est **expliquer et justifier**. L'angle
avant-vente sert à structurer le discours autour de la valeur ; la profondeur
technique se prouve en démo et en Q&A.

---

## 2. Pitch avant-vente (10 min)

### 2.1 Le besoin client

> « Vous avez une application web à fort enjeu (pic d'audience Coupe du Monde).
> Vous ne pouvez pas vous permettre qu'elle tombe pendant un match, ni payer une
> infra surdimensionnée le reste du temps. »

Trois exigences business : **rester disponible**, **encaisser les pics**,
**maîtriser le budget**.

### 2.2 Notre proposition de valeur

| Bénéfice client | Ce qu'on garantit | Comment (traduction technique) |
| --- | --- | --- |
| **« Mon site ne tombe pas »** | Service continu même si un composant lâche | ≥ 2 réplicas + probes, load-balancing Service |
| **« Il se répare tout seul »** | Retour en service **< 15 s** sans intervention | Self-healing K8s (liveness probe) |
| **« Il encaisse les pics »** | Montée en charge automatique pendant les matchs | Auto-scaling HPA 2→6 pods sur CPU |
| **« Je vois ce qui se passe »** | Tableau de bord temps réel + alertes | Prometheus + Grafana + 3 alertes |
| **« Je maîtrise mon budget »** | ~20 €/mois, transparent et optimisé | Dimensionnement calibré, 9× moins cher qu'EKS |
| **« Mes données sont protégées »** | Aucun secret exposé | Secrets K8s, 0 credential dans Git |

### 2.3 Nos garanties (le « SLA » qu'on met sur la table)

- **Disponibilité** : perte d'un pod → 0 interruption (démontré en live).
- **Résilience** : crash → reprise **< 15 s**, chronométrée devant vous.
- **Élasticité** : charge x10 → capacité x3 automatique, puis retour au minimum (pas de sur-facturation).
- **Transparence** : dashboard client accessible en permanence.

### 2.4 L'offre (FinOps commercial)

| | Notre solution (k3s) | Alternative cloud managé (EKS) |
| --- | --- | --- |
| **Prix mensuel** | **~20 €** | ~175 € |
| Disponibilité | Niveau applicatif | Niveau infra (multi-AZ) |
| Mise en service | 1 commande, reproductible | Idem, plus lourde |
| **Positionnement** | **Le bon calibre pour ce périmètre** | Pertinent à grande échelle |

> Argument de clôture : *« Même solution logicielle, budget divisé par 9. Et le
> jour où vous grossissez, on bascule sur du multi-AZ sans réécrire une ligne —
> c'est le même package Helm. »* Détail chiffré : [finops.md](finops.md).

---

## 3. Démo produit (10 min) — montrer la valeur, pas la tuyauterie

| # | Bénéfice démontré | Ce qu'on montre |
| --- | --- | --- |
| 1 | « Le produit est en ligne » | http://178.170.25.230.nip.io + routes clés |
| 2 | « Livraison en 1 commande » | `helm upgrade worldcup charts/worldcup --set image.tag=$IMAGE_TAG --set db.password=$DB_PASSWORD` |
| 3 | « Mises à jour automatisées » | CI/CD GitHub Actions → build & push GHCR sur push `main` |
| 4 | « Pilotage temps réel » | Dashboard Grafana (req/s, latence p95, 5xx, CPU, **nb de pods**) |
| 5 | « Traitement métier automatisé » | Rapport horodaté généré par le CronJob ([bloc6-job.md](bloc6-job.md)) |

> Garder Grafana projeté en permanence : le panel **nb de pods** rend l'élasticité
> et le self-healing *visibles* pour le client.

---

## 4. Annexe technique — commandes crash-test (SSH sur le VPS)

Support de la phase « le jury stresse le produit ». Chaque test = une garantie prouvée.

### 4.1 Élasticité (load test → HPA scale up)

```bash
watch -n 2 kubectl get hpa,pods -l app=worldcup-app          # terminal 1
hey -z 60s -c 50 http://178.170.25.230.nip.io/api/compute    # terminal 2
```

**Preuve** : CPU moyen > 60 % → 2 pods deviennent 6 ; retour à 2 après la charge.

### 4.2 Self-healing (chrono < 15 s)

```bash
kubectl get pods -l app=worldcup-app -w                       # terminal 1
time curl -s http://178.170.25.230.nip.io/api/admin/kill      # terminal 2
```

**Preuve** : pod `Terminating` → nouveau pod `Running` **< 15 s**, sans coupure.

### 4.3 Haute dispo (un pod down, l'autre absorbe)

```bash
kubectl delete pod <un-pod-app>
while true; do curl -s -o /dev/null -w "%{http_code}\n" http://178.170.25.230.nip.io/api/health/db; sleep 0.5; done
```

**Preuve** : le curl reste en `200`, aucun `5xx`.

### 4.4 Alerting (bonus — faire sonner une alerte)

Abaisser un seuil (`monitoring.alerts.error5xxRatio` / `latencyP95Seconds`), générer la condition → alerte `firing`. Voir [bloc4-observabilite.md](bloc4-observabilite.md).

---

## 5. Checklist de répétition à blanc (avant le jour J)

- [ ] URL publique répond (app + toutes les routes API)
- [ ] Grafana accessible, dashboard peuplé (données live)
- [ ] Load test `/api/compute` → HPA scale 2→6 **observé**
- [ ] `/api/admin/kill` → pod recréé, **chrono < 15 s noté**
- [ ] `kubectl delete pod` → 0 `5xx` côté curl
- [ ] `helm upgrade` rejoué sans erreur (déploiement reproductible)
- [ ] CI/CD : un push déclenche bien build & push GHCR
- [ ] `grep -ri password charts/ app/` → aucun secret en clair (que des `secretKeyRef`)
- [ ] Job créatif : rapport présent dans le PVC
- [ ] Chaque membre sait répondre sur **n'importe quel** pilier (le jury pioche au hasard)

---

## 6. Questions du jury — réponses préparées

Détail dans [argumentaire-soutenance.md](argumentaire-soutenance.md). Points d'appui rapides :

| Question | Réponse courte |
| --- | --- |
| Pourquoi pas EKS avec les crédits ? | POC + reproductibilité + contrôle ; EKS surdimensionné en 2,5 j. |
| Et si le VPS tombe ? | Assumé : HA niveau pod. Prod = 3 nœuds (quorum etcd) ou EKS multi-AZ, **même chart**. |
| Comment marche l'auto-scaling ? | HPA lit metrics-server, compare au `requests.cpu`, cible 60 %, scale 2→6. |
| Où sont les secrets ? | Secret K8s injecté par `secretKeyRef` ; rien en clair dans Git. |
| Combien ça coûte ? | ~20 €/mois (0 € réel), vs ~175 € EKS. |
