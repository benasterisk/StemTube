# Fix ngrok et FFmpeg pour le service systemd

## Problème

Les applications installées via **snap** (ngrok, FFmpeg) ne fonctionnaient pas lorsqu'elles étaient lancées par le service systemd StemTube.

### Symptômes observés
- **ngrok** : `commande introuvable` dans les logs du service
- **FFmpeg** : `Permission denied` ou `commande introuvable`
- Fonctionnement manuel OK, mais échec via systemd

## Cause racine

Les services systemd ont un **PATH minimal** par défaut qui n'inclut pas `/snap/bin/`. De plus, les applications snap nécessitent des variables d'environnement spécifiques (notamment `HOME`) pour accéder à leurs configurations isolées.

### Détails techniques

1. **PATH limité** : systemd utilise uniquement `/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin`
2. **Isolation snap** : Les applications snap stockent leur config dans `~/snap/app_name/version/.config/`
3. **Variable HOME** : Sans `HOME` correctement défini, snap ne peut pas localiser ses données

## Solution appliquée

### 1. Création de scripts wrapper

Les wrappers dans `/usr/local/bin/` (qui EST dans le PATH systemd) redirigent vers les exécutables snap :

#### Wrapper ngrok
```bash
sudo bash -c 'cat > /usr/local/bin/ngrok << "EOF"
#!/bin/bash
exec /snap/bin/ngrok "$@"
EOF'
sudo chmod +x /usr/local/bin/ngrok
```

#### Wrapper FFmpeg
```bash
sudo bash -c 'cat > /usr/local/bin/ffmpeg << "EOF"
#!/bin/bash
exec /snap/bin/ffmpeg "$@"
EOF'
sudo chmod +x /usr/local/bin/ffmpeg
```

#### Wrapper FFprobe
```bash
sudo bash -c 'cat > /usr/local/bin/ffprobe << "EOF"
#!/bin/bash
exec /snap/bin/ffmpeg.ffprobe "$@"
EOF'
sudo chmod +x /usr/local/bin/ffprobe
```

**Note** : `ffprobe` snap s'appelle `ffmpeg.ffprobe`

### 2. Configuration du service systemd

Modification de `/etc/systemd/system/stemtube.service` pour ajouter la variable `HOME` :

```ini
[Service]
Type=forking
User=michael
Group=michael
WorkingDirectory=/path/to/Documents/Dev/StemTube-dev

# Variables d'environnement critiques
Environment="PATH=/path/to/Documents/Dev/StemTube-dev/venv/bin:/usr/local/bin:/usr/bin:/bin"
Environment="HOME=/path/to"  # ← CRITIQUE pour snap
Environment="PYTHONUNBUFFERED=1"
```

Puis recharger :
```bash
sudo systemctl daemon-reload
sudo systemctl restart stemtube
```

## Vérification

### Tester les wrappers
```bash
# Vérifier que les wrappers existent
ls -la /usr/local/bin/{ngrok,ffmpeg,ffprobe}

# Tester leur fonctionnement
/usr/local/bin/ngrok version
/usr/local/bin/ffmpeg -version
/usr/local/bin/ffprobe -version
```

### Vérifier la configuration ngrok
```bash
# Vérifier que l'authtoken est configuré
ngrok config check

# Doit afficher :
# Valid configuration file at /path/to/snap/ngrok/315/.config/ngrok/ngrok.yml
```

### Tester le service
```bash
# Redémarrer le service
sudo systemctl restart stemtube

# Vérifier que les deux processus tournent
ps aux | grep -E "(python app.py|ngrok)" | grep -v grep

# Devrait afficher :
# michael    XXXXX  ... /snap/ngrok/315/ngrok http --url=...
# michael    XXXXX  ... python app.py

# Vérifier le tunnel ngrok
python3 -c "import requests; r=requests.get('http://localhost:4040/api/tunnels'); print('Tunnel actif:', r.json()['tunnels'][0]['public_url'])"

# Devrait afficher :
# Tunnel actif: https://definite-cockatoo-bold.ngrok-free.app
```

## Pourquoi cette solution fonctionne

### Avantages des wrappers

1. **Compatibilité PATH** : `/usr/local/bin` est dans le PATH systemd par défaut
2. **Transparence** : Les scripts peuvent utiliser `ngrok`, `ffmpeg`, etc. naturellement
3. **Maintenance** : Un seul endroit à modifier si les chemins snap changent
4. **Flexibilité** : Fonctionne pour tous les utilisateurs du système

### Importance de HOME

La variable `HOME` est essentielle pour snap car :
- Snap utilise des répertoires isolés par utilisateur : `~/snap/app_name/`
- Sans HOME, snap cherche dans `/root/snap/` (vide si l'utilisateur du service n'est pas root)
- L'authtoken ngrok est stocké dans `~/snap/ngrok/315/.config/ngrok/ngrok.yml`

## Applications snap courantes nécessitant cette solution

Cette approche fonctionne pour toutes les applications snap lancées via systemd :
- **ngrok** - Tunnel HTTP/TCP
- **ffmpeg** - Traitement vidéo/audio
- **node** - Runtime JavaScript
- **kubectl** - Client Kubernetes
- Et tout autre snap nécessitant PATH ou configuration utilisateur

## Dépannage

### Ngrok affiche "Install your authtoken"
```bash
# Réinstaller l'authtoken
ngrok config add-authtoken VOTRE_TOKEN

# Vérifier la config
ngrok config check
```

### FFmpeg : "Permission denied"
```bash
# Vérifier les permissions du wrapper
ls -la /usr/local/bin/ffmpeg

# Doit afficher : -rwxr-xr-x
# Si non, corriger :
sudo chmod +x /usr/local/bin/ffmpeg
```

### Le service démarre mais ngrok ne tourne pas
```bash
# Vérifier les logs ngrok
tail -50 logs/stemtube_ngrok.log

# Vérifier que HOME est bien défini dans le service
grep HOME /etc/systemd/system/stemtube.service

# Doit afficher : Environment="HOME=/path/to"
```

## Ressources

- [Snap confinement](https://snapcraft.io/docs/snap-confinement)
- [Systemd environment variables](https://www.freedesktop.org/software/systemd/man/systemd.exec.html#Environment)
- [ngrok documentation](https://ngrok.com/docs)

## Historique

- **2025-10-26** : Fix initial appliqué pour ngrok et FFmpeg
- **Problème** : Applications snap invisibles pour systemd
- **Solution** : Wrappers + variable HOME
- **Résultat** : Service 100% fonctionnel avec Flask + ngrok

---

**Note** : Ce document sert de référence pour tout problème similaire avec des applications snap dans des services systemd.
