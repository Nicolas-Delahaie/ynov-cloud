# Bloc 2 — Installation du cluster k3s

## Contexte

Cluster Kubernetes single-node installé sur le VPS Ikoula sous **Debian (kernel 6.12.94-1)**.

---

## Installation

k3s s'installe en une seule commande via son script officiel :

```bash
curl -sfL https://get.k3s.io | sh -
```

k3s embarque tout le nécessaire : API server, scheduler, kubelet, Traefik (Ingress controller) et une distribution légère de kubectl.

---

## Configuration de kubectl sans sudo

Par défaut, le kubeconfig de k3s est accessible uniquement en root (`/etc/rancher/k3s/k3s.yaml`). On le copie dans le home de l'utilisateur :

```bash
mkdir -p ~/.kube
sudo cp /etc/rancher/k3s/k3s.yaml ~/.kube/config
sudo chown $USER:$USER ~/.kube/config
echo 'export KUBECONFIG=~/.kube/config' >> ~/.bashrc
source ~/.bashrc
```

---

## Vérification

```bash
kubectl get nodes
kubectl get pods -A
```

### Résultat obtenu (`kubectl get pods -A`)

| Namespace   | Pod                                      | Ready | Status    |
| ----------- | ---------------------------------------- | ----- | --------- |
| kube-system | coredns-8db54c48d-r6cnn                  | 1/1   | Running   |
| kube-system | helm-install-traefik-crd-7ttpz           | 0/1   | Completed |
| kube-system | helm-install-traefik-nqtmv               | 0/1   | Completed |
| kube-system | local-path-provisioner-5d9d9885bc-kr2fh  | 1/1   | Running   |
| kube-system | metrics-server-786d997795-vg9mg          | 1/1   | Running   |
| kube-system | svclb-traefik-a1fb851f-94k82             | 2/2   | Running   |
| kube-system | traefik-9bcdbbd9-n6pl2                   | 1/1   | Running   |

---

## Composants déployés et rôle

| Composant                | Rôle |
| ------------------------ | ---- |
| **coredns**              | DNS interne du cluster — résolution des noms de services entre pods |
| **traefik**              | Ingress controller — expose les services vers l'extérieur via HTTP/HTTPS |
| **metrics-server**       | Collecte les métriques CPU/mémoire des pods — requis pour que le HPA fonctionne |
| **local-path-provisioner** | Gestion du stockage local (PersistentVolumes) — utilisé pour le PVC PostgreSQL |
| **svclb-traefik**        | ServiceLB fourni par k3s pour exposer Traefik sur l'IP publique du VPS |
| **helm-install-\***      | Jobs one-shot lancés par k3s pour installer Traefik via Helm au démarrage (status `Completed` = normal) |

---

## Ce que ça apporte pour la suite

- **Traefik** est prêt à router le trafic entrant vers l'app via un `Ingress`
- **metrics-server** permet au HPA de scaler les pods sur la CPU (`/api/compute`)
- **local-path-provisioner** permet de créer des PVC pour PostgreSQL sans configuration supplémentaire
