# Configuration SSH pour la Migration

## Objectif

Faciliter la connexion à votre ancienne machine de production en configurant un alias SSH.

## Méthode 1: Fichier ~/.ssh/config (Recommandée)

Cette méthode vous permet de vous connecter simplement avec `ssh old-prod` au lieu de taper l'adresse complète.

### 1. Créer/Éditer le fichier de configuration SSH

```bash
nano ~/.ssh/config
```

### 2. Ajouter cette configuration

```
# Ancienne machine de production StemTube
Host old-prod
    HostName 192.168.1.100         # ← Remplacer par l'IP ou hostname réel
    User root                       # ← Remplacer par votre username
    Port 22                         # ← Changer si SSH n'est pas sur le port 22
    IdentityFile ~/.ssh/id_rsa     # ← Chemin vers votre clé privée (optionnel)
    ServerAliveInterval 60          # Maintient la connexion active
    ServerAliveCountMax 3
```

### 3. Sauvegarder et ajuster les permissions

```bash
# Sauvegarder le fichier (Ctrl+X, puis Y, puis Entrée dans nano)

# Ajuster les permissions (important!)
chmod 600 ~/.ssh/config
```

### 4. Tester la connexion

```bash
# Se connecter avec l'alias
ssh old-prod

# Si ça fonctionne, vous pouvez maintenant utiliser:
# - ssh old-prod
# - rsync -avh old-prod:/path/to/file ./
# - scp old-prod:/path/to/file ./
```

### 5. Mise à jour du script de migration

Une fois l'alias configuré, éditez `migrate_from_old_prod.sh`:

```bash
# Changer cette ligne:
OLD_PROD_HOST="user@old-prod-server.com"

# En:
OLD_PROD_HOST="old-prod"
```

C'est tout! 🎉

---

## Méthode 2: Clés SSH (Si vous n'avez pas encore configuré)

Si vous ne pouvez pas vous connecter par clé SSH, suivez ces étapes:

### 1. Générer une paire de clés (si vous n'en avez pas)

```bash
# Générer une nouvelle clé RSA
ssh-keygen -t rsa -b 4096 -C "votre_email@example.com"

# Appuyer sur Entrée pour accepter l'emplacement par défaut
# (Optionnel) Entrer une passphrase pour plus de sécurité
```

### 2. Copier votre clé publique vers l'ancienne machine

```bash
# Méthode automatique (recommandée)
ssh-copy-id user@old-prod-server.com

# OU Méthode manuelle
cat ~/.ssh/id_rsa.pub | ssh user@old-prod-server.com "mkdir -p ~/.ssh && cat >> ~/.ssh/authorized_keys"
```

### 3. Tester la connexion sans mot de passe

```bash
ssh user@old-prod-server.com
# Devrait se connecter sans demander de mot de passe!
```

---

## Méthode 3: Connexion par mot de passe (Moins sécurisé)

Si vous préférez utiliser un mot de passe, vous pouvez utiliser `sshpass`:

### Installation

```bash
# Ubuntu/Debian
sudo apt-get install sshpass

# macOS
brew install hudochenkov/sshpass/sshpass
```

### Utilisation dans le script

**ATTENTION:** Stocker des mots de passe en clair est dangereux!

```bash
# Créer un fichier sécurisé pour le mot de passe
echo "VotreMotDePasse" > ~/.ssh/old_prod_password
chmod 600 ~/.ssh/old_prod_password

# Utiliser dans les commandes rsync
sshpass -f ~/.ssh/old_prod_password rsync -avh \
  user@old-prod:/path/to/file ./
```

---

## Exemples de Configuration selon votre Environnement

### Exemple 1: Serveur local sur le même réseau

```
Host old-prod
    HostName 192.168.1.100
    User stemtube
    Port 22
```

### Exemple 2: Serveur distant avec domaine

```
Host old-prod
    HostName stemtube-prod.mydomain.com
    User ubuntu
    Port 22
    IdentityFile ~/.ssh/id_rsa
```

### Exemple 3: Serveur derrière un jump host (bastion)

```
Host old-prod
    HostName 10.0.1.50
    User root
    Port 22
    ProxyJump bastion-server.com
```

### Exemple 4: Serveur avec port SSH personnalisé

```
Host old-prod
    HostName prod.example.com
    User admin
    Port 2222                    # SSH sur un port différent
    IdentityFile ~/.ssh/prod_key
```

---

## Résolution de Problèmes

### Erreur: "Permission denied (publickey)"

**Cause:** Votre clé publique n'est pas autorisée sur le serveur.

**Solution:**
```bash
# Vérifier que votre clé est bien présente
ssh-add -l

# Ajouter votre clé si nécessaire
ssh-add ~/.ssh/id_rsa

# Re-copier la clé vers le serveur
ssh-copy-id -i ~/.ssh/id_rsa.pub user@old-prod-server.com
```

### Erreur: "Connection timeout"

**Cause:** Le serveur n'est pas accessible ou le firewall bloque.

**Solution:**
```bash
# Tester la connectivité réseau
ping old-prod-server.com

# Tester si le port SSH est ouvert
telnet old-prod-server.com 22
# OU
nc -zv old-prod-server.com 22

# Si timeout, vérifier:
# 1. Le serveur est allumé
# 2. Le firewall autorise le port 22
# 3. L'adresse IP/hostname est correct
```

### Erreur: "Host key verification failed"

**Cause:** La signature SSH du serveur a changé.

**Solution:**
```bash
# Supprimer l'ancienne signature
ssh-keygen -R old-prod-server.com

# OU éditer manuellement
nano ~/.ssh/known_hosts
# Supprimer la ligne correspondante

# Reconnectez-vous et acceptez la nouvelle signature
ssh user@old-prod-server.com
```

### Erreur: "Bad owner or permissions on ~/.ssh/config"

**Cause:** Permissions trop permissives sur le fichier de configuration.

**Solution:**
```bash
chmod 600 ~/.ssh/config
chmod 700 ~/.ssh
```

---

## Commandes Utiles

### Tester la connexion SSH avec verbose

```bash
ssh -v user@old-prod-server.com
# Affiche tous les détails de la connexion
```

### Lister les clés SSH disponibles

```bash
ls -la ~/.ssh/
# Vous devriez voir: id_rsa (privée) et id_rsa.pub (publique)
```

### Vérifier la configuration SSH

```bash
ssh -G old-prod
# Affiche la configuration complète qui sera utilisée
```

### Copier un fichier rapidement

```bash
# Avec scp
scp old-prod:/chemin/source /chemin/destination

# Avec rsync (meilleur pour les gros fichiers)
rsync -avh --progress old-prod:/chemin/source /chemin/destination
```

---

## Checklist Avant Migration

- [ ] Je peux me connecter à l'ancienne machine: `ssh old-prod`
- [ ] J'ai configuré l'alias SSH dans `~/.ssh/config`
- [ ] J'ai testé `rsync` avec un petit fichier de test
- [ ] J'ai vérifié l'espace disque disponible sur la nouvelle machine
- [ ] J'ai mis à jour `OLD_PROD_HOST` dans `migrate_from_old_prod.sh`
- [ ] J'ai vérifié que l'application est arrêtée
- [ ] J'ai fait un backup de mes données actuelles (au cas où)

Une fois tous ces points validés, lancez:
```bash
./migrate_from_old_prod.sh
```

---

**Astuce Pro:** Une fois la migration terminée et validée, pensez à désactiver l'accès SSH à l'ancienne machine pour des raisons de sécurité!

```bash
# Sur l'ancienne machine
sudo systemctl stop ssh
sudo systemctl disable ssh
```
