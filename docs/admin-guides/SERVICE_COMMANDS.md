# StemTube Service - Commandes systemctl

Le service StemTube est maintenant installé et configuré avec systemd.

## Commandes disponibles

### Démarrer le service
```bash
sudo systemctl start stemtube
```

### Arrêter le service
```bash
sudo systemctl stop stemtube
```

### Redémarrer le service
```bash
sudo systemctl restart stemtube
```

### Voir le statut du service
```bash
systemctl status stemtube
```

### Activer le démarrage automatique au boot
```bash
sudo systemctl enable stemtube
```
*(Déjà activé par défaut)*

### Désactiver le démarrage automatique
```bash
sudo systemctl disable stemtube
```

## Voir les logs

### Logs en temps réel
```bash
journalctl -u stemtube -f
```

### Derniers 50 logs
```bash
journalctl -u stemtube -n 50
```

### Logs depuis aujourd'hui
```bash
journalctl -u stemtube --since today
```

### Logs de la dernière heure
```bash
journalctl -u stemtube --since "1 hour ago"
```

## Fichiers de logs supplémentaires

Le service génère également des logs dans le répertoire `logs/` :
- `logs/stemtube_app.log` - Logs de l'application Flask
- `logs/stemtube_ngrok.log` - Logs du tunnel ngrok
- `logs/stemtube_stop.log` - Logs d'arrêt du service
- `logs/stemtube.log` - Logs principaux de l'application
- `logs/stemtube_errors.log` - Erreurs uniquement
- `logs/stemtube_processing.log` - Logs de traitement audio

## Informations du service

- **Nom du service**: `stemtube.service`
- **Fichier de configuration**: `/etc/systemd/system/stemtube.service`
- **Utilisateur**: `michael`
- **Répertoire de travail**: `/path/to/StemTube-dev`
- **Port Flask**: `5011`
- **Tunnel ngrok**: `https://definite-cockatoo-bold.ngrok-free.app`
- **Wrapper scripts**: `/usr/local/bin/ngrok`, `/usr/local/bin/ffmpeg`, `/usr/local/bin/ffprobe`

## Ce que fait le service

Le service StemTube lance automatiquement :
1. **Flask application** - Serveur web sur le port 5011
2. **Ngrok tunnel** - Exposition publique via ngrok

## Redémarrage automatique

Le service est configuré pour redémarrer automatiquement en cas d'échec :
- **Politique**: `Restart=on-failure`
- **Délai**: 10 secondes entre les tentatives
- **Timeout démarrage**: 60 secondes
- **Timeout arrêt**: 30 secondes

## Vérification rapide

Pour vérifier que tout fonctionne :
```bash
# Statut du service
systemctl status stemtube

# Processus en cours
ps aux | grep -E "(python app.py|ngrok)" | grep -v grep

# Fichiers PID
cat stemtube_app.pid stemtube_ngrok.pid

# Vérifier le tunnel ngrok
python3 -c "import requests; r=requests.get('http://localhost:4040/api/tunnels'); print('Tunnel:', r.json()['tunnels'][0]['public_url'])"
```

## Dépannage

### Le service ne démarre pas
```bash
# Voir les logs d'erreur
journalctl -u stemtube -n 50 --no-pager

# Vérifier les permissions des scripts
ls -la start_service.sh stop_service.sh

# Tester le script manuellement
./start_service.sh
```

### Le service ne s'arrête pas correctement
```bash
# Forcer l'arrêt
sudo systemctl kill stemtube

# Nettoyer les processus orphelins
pkill -f "python app.py"
pkill -f "ngrok http.*5011"
```

### Recharger la configuration après modification
```bash
sudo systemctl daemon-reload
sudo systemctl restart stemtube
```

### Ngrok ne se lance pas
Si ngrok ne démarre pas dans le service :
```bash
# Vérifier que le wrapper existe
ls -la /usr/local/bin/ngrok

# Vérifier l'authtoken ngrok
/snap/bin/ngrok config check

# Tester ngrok manuellement
/usr/local/bin/ngrok http 5011

# Vérifier les logs ngrok
tail -50 logs/stemtube_ngrok.log

# Si le wrapper n'existe pas, le recréer
sudo bash -c 'cat > /usr/local/bin/ngrok << "EOF"
#!/bin/bash
exec /snap/bin/ngrok "$@"
EOF'
sudo chmod +x /usr/local/bin/ngrok
```

### FFmpeg ne fonctionne pas
Si vous avez des erreurs liées à FFmpeg :
```bash
# Vérifier les wrappers
ls -la /usr/local/bin/ffmpeg /usr/local/bin/ffprobe

# Tester FFmpeg
/usr/local/bin/ffmpeg -version
/usr/local/bin/ffprobe -version

# Recréer les wrappers si nécessaire
sudo bash -c 'cat > /usr/local/bin/ffmpeg << "EOF"
#!/bin/bash
exec /snap/bin/ffmpeg "$@"
EOF'

sudo bash -c 'cat > /usr/local/bin/ffprobe << "EOF"
#!/bin/bash
exec /snap/bin/ffmpeg.ffprobe "$@"
EOF'

sudo chmod +x /usr/local/bin/ffmpeg /usr/local/bin/ffprobe
```

## Configuration avancée

Pour modifier la configuration du service, éditez :
```bash
sudo nano /etc/systemd/system/stemtube.service
```

Puis rechargez :
```bash
sudo systemctl daemon-reload
sudo systemctl restart stemtube
```
