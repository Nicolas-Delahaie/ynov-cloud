<!-- Page 1 -->

Développer
pour le Cloud
Jour 6 à 9 - Capstone
Le 24/06/2026
Animé par Baptiste Michaud
Groupe : M2 - Expert en développement mobile et IOT - 2025 - 2026

---

<!-- Page 2 -->

Capstone
Déploiement Cloud d'une application Web Coupe du Monde 2026

---

<!-- Page 3 -->

Introduction
En vue de la nouvelle Coupe de Monde, la FIFA a missionner votre entreprise pour
moderniser son site internet utilisé pour suivre les résultats sportif du championnat et de
l’héberger dans une solution Cloud ou Cloud-Native capable de s’adapter à la charge.
Votre équipe a été choisit pour:
Déployer une application Node.js + PostgreSQL sur le cloud
Démontrer la haute disponibilité, l’élasticité, la résilience et en bonus l’observabilité de
la platform dans sa version modernisée.
Vous avez 2,5 jours pour réaliser une première version du projet par groupe de 3 max.
Vous présenterez votre solution lors d’une soutenance de 40 minutes

---

<!-- Page 4 -->

Navigateur
Application fournie
Application Express.js (monolithe) + PostgreSQL
Thème : Coupe du Monde 2026 (48 équipes, matchs, votes)
Serveur Web
(port 3000)
Base de
données
DOCKER COMPOSE FOURNI

---

<!-- Page 5 -->

Les routes de l’API
Liste des endpoints :
/
/api/health/db,
/api/data,
/api/vote,
/api/votes/results,
/metrics,
/api/compute, /api/admin/kill
Ne pas modifier les routes (utilisées pour l'évaluation automatisée)
Plus de détails dans le GUIDE-ETUDIANT.md

---

<!-- Page 6 -->

Tester l’application
Lancer docker-compose up --build
Ouvrir la page web localhost:3000/
Vérifier les metrics sur la page localhost:3000/metrics
Appréhender l’application existante avant de vous lancer dans le développement.

---

<!-- Page 7 -->

Missions
Optimiser le Dockerfile
Déployer sur le cloud (AWS ou K8S)
Créer un Job (libre)
Préparer votre soutenance
Les 3 missions

---

<!-- Page 8 -->

Mission 1: Optimiser le Dockerfile
Le Dockerfile fourni est volontairement mauvais (inclus 5 anti-patterns)
Je vous laisse les trouver et corriger le Dockerfile
avant de le déployer dans le Cloud ou sur Kuberenetes
Livrables attendus:
Le Dockerfile optimisé
Un fichier Markdown OPTIMISATION.md expliquant ce que vous avez améliorez
et pourquoi

---

<!-- Page 9 -->

Mission 2: Déployer sur le cloud
Vous pouvez choisir où déployer la solution :
AWS Kubernetes
Compte AWS Free Tier Plan
(à créer)
Ne pas upgrade en Paid Plan
Bien lire les conditions
VPS Ikoula offert par YNOV
Mettre en place un
cluster single-node
avec plusieurs pods
OU
ET Rendre le site accessible sur internet

---

<!-- Page 10 -->

Mission 2: Déployer sur le cloud
Livrables attendus
AWS Kubernetes
Template CloudFormation
Image Docker sur ECR
Application Opérationnel
sur internet*
Monitoring &Alerting
Sécurité mis en place
Helm Chart
Image Docker sur un Registry
Cluster & App Opérationnel
sur internet*
Monitoring & Alerting
Sécurité mis en place
OU
ET une Estimation de coût, BONUS: CI/CD, Job

---

<!-- Page 11 -->

Exigences Techniques
Haute disponibilité : minimum 2 réplicas, multi-AZ ou multi-Noeud
Élasticité : auto-scaling sur CPU
Résilience : redémarrage automatique après crash < 15s
Observabilité : dashboard + métriques + logs centralisés
Sécurité : exemple d’action: pas de credentials en clair dans Git
Lors de la soutenance, on va mettre sous charge votre application
Eteindre des composants etc...

---

<!-- Page 12 -->

Mission 3: Créer un Job de votre choix
Un traitement planifié ou déclenché qui lit la BDD
Exemples : classement automatique, rapport PDF, prédictions ML, notifications, export CSV…
Technologie libre sur la plateforme choisie (AWS ou K8S)
Évalué sur : existence, pertinence, originalité
Livrables attendus
Le design du Job (diagramme, markdown), et être capable de l’expliquer
Bonus: Un job fonctionnel, basé sur évènements ou CRON

---

<!-- Page 13 -->

Critère Points Détails
Soutenance & Maîtrise technique orale6
Qualité de la présentation / démonstration, capacité à
expliquer et justifier ses choix, réponses aux questions
de l'enseignant, recul critique
Choix architecturaux & Design 5
Pertinence de l'architecture choisie, justification des
composants, trade-offs identifiés (coût vs performance vs
complexité), schéma clair
Élasticité & Auto-scaling 4 scaling visible, configuration cohérente
Résilience & Self-Healing 3 downtime < 15s, probes correctes, stratégie de
redémarrage
Observabilité & FinOps 2 Dashboard fonctionnel, alerting, estimation de coût
chiffrée
(BONUS) Job + CI/CD 2 Job fonctionnel, ci/cd fonctionnel (create/update/destroy)
Total 20
Grille de Notation

---

<!-- Page 14 -->

Phase Durée Contenu
Présentation orale 10 min Schéma d'archi, choix
techniques, FinOps
Démo technique 10 min
URL publique, montrer le
déploiement dans AWS /
K8Svos tests de
charge,métriques, pipeline
CI/CD
Crash tests 15 min Load test + chaos test en
live avec l’enseignant
Déroulé de la soutenance

---

<!-- Page 15 -->

Commentaire & Conseils
Ce qui m’importe le plus:
Votre capacité à expliquer vos choix d’architecture & techniques.
Votre capacité à répondre aux questions que je vous poserez.
Si votre application n’est pas totalement fonctionnel, nous nous intéresserons à :
votre méthode de travail
ce que vous aurez réussi à réaliser avant le rendu (ce qui a été déployé, et les
étapes qui manquent)
Répartissez vous le travail mais partagez l’ensemble des informations.
Intéressez vous tôt à l’ouverture de votre environnement AWS ou Ikoula (ou autre si
vous le souhaitez)
La présentation pour la soutenance est libre dans son format (PPT, DOC, MD, PNG...)

---
