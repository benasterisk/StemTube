# Guide de Migration: Ancienne Prod → Nouvelle Prod

## Situation Actuelle

Vous avez déployé le code DEV sur la machine de production, mais vous avez besoin de récupérer:
- ✅ La **vraie base de données utilisateurs** (users, passwords, admin)
- ✅ Les **vrais downloads** (fichiers MP3 originaux)
- ✅ Les **vraies extractions** (stems séparés)

## 🎯 Solution Automatique (Recommandée)

### Étape 1: Configuration

Éditez le script `migrate_from_old_prod.sh` et modifiez ces variables:

```bash
# Ancienne machine de production
OLD_PROD_HOST="user@old-prod-server.com"  # 👈 À MODIFIER
OLD_PROD_PATH="/opt/stemtube/StemTube-dev"  # 👈 À MODIFIER si différent

# Nouvelle machine (actuelle)
NEW_PROD_PATH="/path/to/StemTube-dev"  # 👈 OK si vous êtes ici
```

**Exemples de OLD_PROD_HOST:**
- `root@192.168.1.100` (accès par IP)
- `michael@prod.example.com` (accès par hostname)
- `ubuntu@stemtube-prod` (si défini dans ~/.ssh/config)

### Étape 2: Test de Connexion SSH

Vérifiez que vous pouvez vous connecter à l'ancienne machine:

```bash
ssh user@old-prod-server.com
```

Si ça fonctionne, vous êtes prêt! Sinon, configurez vos clés SSH:

```bash
# Copier votre clé publique vers l'ancienne machine
ssh-copy-id user@old-prod-server.com
```

### Étape 3: Lancement de la Migration

```bash
# Rendre le script exécutable
chmod +x migrate_from_old_prod.sh

# Lancer la migration
./migrate_from_old_prod.sh
```

Le script va:
1. ✅ Sauvegarder vos données DEV actuelles
2. ✅ Télécharger la base de données PROD
3. ✅ Télécharger tous les fichiers audio
4. ✅ Vérifier l'intégrité

**Durée estimée:** 5-60 minutes selon la taille des données.

### Étape 4: Redémarrage

```bash
# Démarrer l'application avec les vraies données PROD
python app.py
```

Testez la connexion avec vos comptes PROD habituels!

---

## 🔧 Solution Manuelle (Alternative)

Si vous préférez contrôler chaque étape manuellement:

### 1. Backup des données actuelles (DEV)

```bash
# Créer un répertoire de backup
mkdir -p ~/stemtube_backup_$(date +%Y%m%d)
cd ~/stemtube_backup_$(date +%Y%m%d)

# Sauvegarder la base DEV
cp /path/to/StemTube-dev/stemtubes.db ./stemtubes_dev.db

# Sauvegarder les fichiers DEV
cp -r /path/to/StemTube-dev/core/downloads ./downloads_dev/
```

### 2. Arrêter l'application

```bash
# Trouver le processus
ps aux | grep "python.*app.py"

# Arrêter proprement
pkill -f "python.*app.py"
```

### 3. Récupérer la base de données PROD

```bash
# Méthode 1: rsync (reprise possible si interruption)
rsync -avzh --progress \
  user@old-prod:/opt/stemtube/StemTube-dev/stemtubes.db \
  /path/to/StemTube-dev/stemtubes.db

# Méthode 2: scp (simple)
scp user@old-prod:/opt/stemtube/StemTube-dev/stemtubes.db \
  /path/to/StemTube-dev/stemtubes.db
```

### 4. Récupérer les fichiers audio PROD

```bash
# Attention: peut être volumineux et long!
rsync -avzh --progress \
  user@old-prod:/opt/stemtube/StemTube-dev/core/downloads/ \
  /path/to/StemTube-dev/core/downloads/
```

**Astuce:** Pour reprendre un transfert interrompu, relancez simplement la même commande rsync.

### 5. Vérifier l'intégrité

```bash
cd /path/to/StemTube-dev

# Vérifier la base de données
sqlite3 stemtubes.db "PRAGMA integrity_check;"
# Doit afficher: ok

# Compter les utilisateurs
sqlite3 stemtubes.db "SELECT COUNT(*) FROM users;"

# Compter les downloads
sqlite3 stemtubes.db "SELECT COUNT(*) FROM global_downloads;"

# Vérifier les fichiers
find core/downloads -name "*.mp3" | wc -l
```

### 6. Ajuster les permissions

```bash
chmod -R u+rw core/downloads
chmod 644 stemtubes.db
```

### 7. Redémarrer

```bash
python app.py
```

---

## 🔍 Vérifications Post-Migration

Une fois l'application redémarrée, vérifiez:

### 1. Connexion Admin
- Allez sur http://localhost:5011
- Connectez-vous avec votre compte admin PROD habituel
- ✅ Si ça fonctionne → la base est bonne!

### 2. Liste des Utilisateurs
- Allez dans l'onglet "Users Administration"
- Vérifiez que tous vos utilisateurs PROD sont présents

### 3. Downloads et Extractions
- Vérifiez l'onglet "Downloads"
- Vérifiez l'onglet "Extractions"
- ✅ Les listes doivent correspondre à votre ancienne PROD

### 4. Mixer
- Ouvrez une extraction dans le mixer
- Vérifiez que les stems se chargent correctement
- ✅ L'audio doit fonctionner sans erreur 404

### 5. Library (si activée)
- Vérifiez que la bibliothèque globale affiche tout le contenu

---

## 🚨 Résolution de Problèmes

### Erreur: "Connection refused" lors du SSH

**Cause:** SSH non accessible ou firewall bloqué.

**Solution:**
```bash
# Vérifier que le SSH fonctionne
ssh -v user@old-prod-server.com

# Si timeout, vérifier le firewall
ping old-prod-server.com
```

### Erreur: "Permission denied" lors du rsync

**Cause:** Droits d'accès insuffisants sur l'ancienne machine.

**Solution:**
```bash
# Se connecter avec sudo si nécessaire
ssh user@old-prod-server.com "sudo chmod -R +r /opt/stemtube/StemTube-dev"
```

### Erreur: "No space left on device"

**Cause:** Pas assez d'espace disque.

**Solution:**
```bash
# Vérifier l'espace disponible
df -h /path/to/StemTube-dev

# Libérer de l'espace si nécessaire
# Supprimer les vieux logs, tmp files, etc.
```

### La base est corrompue après transfert

**Cause:** Transfert interrompu.

**Solution:**
```bash
# Restaurer le backup et recommencer
cp ~/stemtube_backup_*/stemtubes_dev.db /path/to/StemTube-dev/stemtubes.db

# Retélécharger avec rsync (vérifie l'intégrité)
rsync -avzh --progress --checksum \
  user@old-prod:/opt/stemtube/StemTube-dev/stemtubes.db \
  /path/to/StemTube-dev/stemtubes.db
```

### Les stems ne se chargent pas dans le mixer (404)

**Cause:** Les chemins de fichiers sont incorrects en base.

**Solution:**
```bash
# Vérifier les chemins dans la base
sqlite3 stemtubes.db "SELECT id, title, stems_paths FROM global_downloads WHERE extracted=1 LIMIT 5;"

# Si les chemins sont absolus et incorrects, il faudra les corriger
# Exemple de requête de correction (À ADAPTER):
sqlite3 stemtubes.db "UPDATE global_downloads SET stems_paths = REPLACE(stems_paths, '/old/path/', '/new/path/');"
```

---

## 📊 Statistiques de Taille Typiques

Pour estimer la durée du transfert:

| Élément | Taille Typique | Durée Transfert (100 Mbps) |
|---------|----------------|----------------------------|
| Base de données | 10-100 MB | < 1 minute |
| 1 Download MP3 | 5-15 MB | 1-2 secondes |
| 1 Extraction (4 stems) | 20-60 MB | 5-10 secondes |
| 100 songs + extractions | 5-10 GB | 10-20 minutes |
| 1000 songs + extractions | 50-100 GB | 1-3 heures |

**Conseil:** Lancez le transfert pendant la nuit si vous avez beaucoup de données!

---

## 🔐 Sécurité

### Backup avant migration

**IMPORTANT:** Le script fait un backup automatique, mais par précaution:

```bash
# Backup manuel complet
tar -czf stemtube_backup_$(date +%Y%m%d).tar.gz \
  stemtubes.db \
  core/downloads/
```

### Conserver l'ancienne machine

**Ne supprimez PAS l'ancienne machine immédiatement!**

Attendez au moins 1 semaine après la migration pour être sûr que tout fonctionne.

---

## 📞 Support

Si vous rencontrez des problèmes:

1. Consultez les logs: `tail -f logs/app.log`
2. Vérifiez l'intégrité de la base: `sqlite3 stemtubes.db "PRAGMA integrity_check;"`
3. Vérifiez les fichiers: `find core/downloads -name "*.mp3" | head -20`

En cas de problème grave, restaurez le backup:
```bash
cp ~/stemtube_backup_*/stemtubes_dev.db ./stemtubes.db
```

---

**Dernière mise à jour:** 2025-10-28
