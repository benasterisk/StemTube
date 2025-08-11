# Instructions de Debug pour le Problème de Déduplication

## Modifications Effectuées

J'ai ajouté des logs de debug détaillés dans tout le système pour tracer exactement où et comment les video_id sont manipulés :

### 1. Backend API (`app.py:688-695`)
```
[API DEBUG] Received video_id: 'xxxxx' (length: x)
[API DEBUG] Request data: {...}
[API DEBUG] REJECTED: ... (si l'ID est invalide)
```

### 2. Backend AIOTube Client (`core/aiotube_client.py:144,202`)
```
[AIOTUBE DEBUG] Processing video_id: 'xxxxx' (length: x)
[AIOTUBE DEBUG] Returning video_id: 'xxxxx' with title: 'xxxxx...'
```

### 3. Frontend JavaScript (`static/js/app.js:533,465-470`)
```
[FRONTEND DEBUG] Sending video_id: 'xxxxx' (length: x)
[FRONTEND DEBUG] Invalid video ID found: ... (si invalide)
[FRONTEND DEBUG] Extracted valid videoId: xxxxx for title: xxxxx
```

## Comment Tester

### 1. Démarrer l'Application
```bash
python app.py
```

### 2. Tenter de Télécharger la Vidéo Problématique
1. Aller sur http://localhost:5011
2. Se connecter en tant qu'administrateur
3. Essayer de télécharger : `https://youtu.be/YSUoSxafl6g`

### 3. Surveiller les Logs

#### Dans la Console du Serveur
Vous devriez voir des messages comme :
```
[AIOTUBE DEBUG] Processing video_id: 'YSUoSxafl6g' (length: 11)
[AIOTUBE DEBUG] Returning video_id: 'YSUoSxafl6g' with title: 'Raphaël - Caravane...'
[API DEBUG] Received video_id: 'YSUoSxafl6g' (length: 11)
[API DEBUG] Request data: {'video_id': 'YSUoSxafl6g', 'title': '...', ...}
```

#### Dans la Console du Navigateur (F12)
Vous devriez voir :
```
[FRONTEND DEBUG] Extracted valid videoId: YSUoSxafl6g for title: Raphaël - Caravane
[FRONTEND DEBUG] Sending video_id: 'YSUoSxafl6g' (length: 11)
```

## Que Chercher

### ✅ Comportement Normal
- Tous les video_id sont de longueur 11
- Les IDs correspondent à `YSUoSxafl6g` pour cette URL
- Pas de messages de rejet ou d'erreur

### ❌ Comportement Anormal
- Des video_id de longueur différente de 11
- Des IDs comme `xHJoY0oSD` (9 caractères) 
- Messages de rejet avec `[API DEBUG] REJECTED:`
- Messages d'invalidité avec `[FRONTEND DEBUG] Invalid video ID found:`

## Scénarios Possibles

### Scénario A : IDs Corrects Partout
Si tous les logs montrent `YSUoSxafl6g`, alors :
- Le problème n'est plus présent
- La validation fonctionne
- Il pourrait y avoir eu des données anciennes corrompues déjà nettoyées

### Scénario B : ID Corrompu dans AIOTube
Si vous voyez :
```
[AIOTUBE DEBUG] Processing video_id: 'xHJoY0oSD' (length: 9)
```
Alors le problème vient de la bibliothèque aiotube qui retourne de mauvais IDs.

### Scénario C : ID Corrompu dans l'API  
Si AIOTube est correct mais l'API reçoit un mauvais ID :
```
[AIOTUBE DEBUG] Processing video_id: 'YSUoSxafl6g' (length: 11)
[API DEBUG] Received video_id: 'xHJoY0oSD' (length: 9)
```
Alors le problème est dans la transmission entre frontend et backend.

### Scénario D : ID Corrompu dans le Frontend
Si le frontend extrait mal l'ID :
```
[FRONTEND DEBUG] Invalid video ID found: 'xHJoY0oSD' (length: 9)
```
Alors le problème est dans l'extraction côté navigateur.

## Actions de Debug Supplémentaires

Si le problème persiste :

### 1. Vérifier la Base de Données en Temps Réel
```bash
python3 debug_video_ids.py
```

### 2. Tester l'Extraction d'URL Directement
Essayer dans la console du navigateur :
```javascript
// Test l'extraction d'URL
const testUrl = "https://youtu.be/YSUoSxafl6g";
const extracted = extractVideoId(testUrl);
console.log(`Extracted: '${extracted}' (length: ${extracted ? extracted.length : 0})`);
```

### 3. Vérifier le Cache de Recherche
Si le problème persiste, il pourrait y avoir un cache corrompu dans aiotube_client.

## Résolution Attendue

Avec la validation ajoutée :
- Les IDs invalides sont **rejetés** avant d'atteindre la base de données
- Les utilisateurs voient des messages d'erreur clairs
- La déduplication fonctionne avec des IDs valides uniquement

## Prochaines Étapes

1. **Tester avec les logs activés**
2. **Identifier où l'ID se corrompt** (si c'est encore le cas)
3. **Corriger la source du problème**
4. **Retirer les logs de debug** une fois le problème résolu