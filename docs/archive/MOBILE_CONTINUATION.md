# 🔄 CONTINUATION - Interface Mobile StemTube

**Date**: 2025-01-05
**Contexte**: Migration Windows → Ubuntu WSL
**Objectif**: Finaliser interface mobile avec 4 stems indépendants synchronisés

---

## 🚨 PROBLÈME ACTUEL

**Erreur de syntaxe JavaScript** dans `static/js/mobile-app.js` ligne 63

```javascript
// ERREUR LIGNE 60-63
initSocket() {
    this.socket = io();
    this.socket.on('connect', () => {
        console.log('[Socket] Connected');
    })  // ← MANQUE });

// Calculate effective volume based on mute/solo
getEffectiveVolume(stemName) {  // ← LIGNE 63: fonction hors classe
```

**Cause**: Script Python `fix-mobile-stems.py` a mal inséré `getEffectiveVolume()` au mauvais endroit (dans constructor au lieu d'après `applyMixerState()`)

---

## ✅ CE QUI EST DÉJÀ FAIT

### 1. **Corrections Fonctionnelles (5/6 terminées)**

| Correction | Statut | Détails |
|------------|--------|---------|
| ✅ Volume/Pan iOS | **FAIT** | Web Audio API + GainNode/StereoPanner |
| ✅ Boutons Solo/Mute | **FAIT** | Texte "MUTE"/"SOLO" + logique complète |
| ✅ Timeline Chords | **FAIT** | Grille horizontale + barres mesure + playhead |
| ✅ Génération Lyrics | **FAIT** | Bouton connecté API `/api/extractions/<id>/lyrics/generate` |
| ⚠️ **Chargement 4 stems** | **95%** | Code écrit, erreur syntaxe à corriger |
| ⏳ Pitch/Tempo | **70%** | SoundTouch intégré, sliders connectés |

### 2. **Architecture Implémentée**

**Nouveaux objets dans constructor**:
```javascript
this.stemBuffers = {};    // { vocals: {buffer, duration}, ... }
this.stemGains = {};      // { vocals: GainNode, ... }
this.stemPans = {};       // { vocals: StereoPannerNode, ... }
this.stemSources = {};    // { vocals: AudioBufferSourceNode, ... }
this.playbackStartTime = 0;
```

**Nouvelles fonctions**:
- ✅ `loadStemsForIOS()` - Charge 4 stems via `fetch()` + `decodeAudioData()`
- ✅ `playPlayback()` - Démarre tous les stems EXACTEMENT au même moment
- ✅ `pausePlayback()` - Stoppe tous les sources
- ✅ `startTimeUpdate()` - Utilise `audioContext.currentTime` pour synchro
- ⚠️ `getEffectiveVolume()` - **À DÉPLACER** (mal placée)

---

## 🔧 TÂCHES À ACCOMPLIR (Ubuntu)

### ✅ **TÂCHE 1: Corriger erreur syntaxe (5 min)**

**Fichier**: `static/js/mobile-app.js`

#### Étape 1.1: Fermer `initSocket()` proprement

```bash
# Ligne ~60-70, chercher:
grep -n "initSocket()" static/js/mobile-app.js

# Corriger (ajouter }; manquant après socket.on):
```

**AVANT** (ligne 60-63):
```javascript
initSocket() {
    this.socket = io();
    this.socket.on('connect', () => {
        console.log('[Socket] Connected');
    })  // ← ERREUR: manque });
```

**APRÈS**:
```javascript
initSocket() {
    this.socket = io();
    this.socket.on('connect', () => {
        console.log('[Socket] Connected');
    });  // ← CORRIGÉ

    this.socket.on('download_complete', (data) => {
        console.log('[Socket] Download complete:', data);
        this.loadLibrary();
    });

    this.socket.on('extraction_complete', (data) => {
        console.log('[Socket] Extraction complete:', data);
        this.loadLibrary();
    });
}
```

#### Étape 1.2: Supprimer `getEffectiveVolume()` mal placée

```bash
# Trouver la ligne où elle est MAL placée (ligne ~63-78)
grep -n "getEffectiveVolume" static/js/mobile-app.js

# Supprimer les lignes 63-78 (environ)
# Utilise Edit tool pour supprimer cette section
```

#### Étape 1.3: Ajouter `getEffectiveVolume()` au BON endroit

```bash
# Chercher applyMixerState() (ligne ~650-660)
grep -n "applyMixerState()" static/js/mobile-app.js
```

**Ajouter APRÈS `applyMixerState()}` (vers ligne 660)**:

```javascript
applyMixerState() {
    Object.keys(this.tracks).forEach(stemName => {
        if (this.stemGains[stemName]) {
            const effectiveVolume = this.getEffectiveVolume(stemName);
            this.stemGains[stemName].gain.value = effectiveVolume;
        }
    });
}

// ← AJOUTER ICI
getEffectiveVolume(stemName) {
    const track = this.tracks[stemName];
    if (!track) return 0;

    // Check if muted
    if (track.muted) return 0;

    // Check solo logic
    const hasSolo = Object.values(this.tracks).some(t => t.solo);
    if (hasSolo && !track.solo) return 0;

    return track.volume;
}
```

#### Étape 1.4: Vérifier syntaxe

```bash
node --check static/js/mobile-app.js
# Doit retourner: (rien) = succès
```

---

### ✅ **TÂCHE 2: Initialiser variables dans constructor (3 min)**

**Fichier**: `static/js/mobile-app.js`

```bash
grep -n "constructor()" static/js/mobile-app.js
```

**Vérifier que ces variables EXISTENT** (lignes ~30-35):

```javascript
// Pitch/Tempo control state
this.currentPitchSemitones = 0;
this.currentTempo = 1.0;
this.soundTouchNode = null;
this.useFallbackPitchTempo = false;

// Stem buffers and nodes
this.stemBuffers = {};
this.stemGains = {};
this.stemPans = {};
this.stemSources = {};
this.playbackStartTime = 0;
```

**Si manquant**, ajouter après `this.animationFrame = null;` (ligne ~30)

---

### ✅ **TÂCHE 3: Tester chargement des stems (10 min)**

```bash
cd /home/michael/StemTube-dev
source venv/bin/activate
python app.py
```

**Sur mobile** (`http://localhost:5011/mobile`):

1. **Ouvrir console navigateur** (Chrome/Safari DevTools)
2. **Cliquer sur un item** avec "Stems Available"
3. **Vérifier console**:

```javascript
// ✅ DOIT AFFICHER:
[Mixer] Loading 4 separate stems with Web Audio API
[Mixer] Parsed stems_paths: {vocals: "...", drums: "...", ...}
[Mixer] Loading vocals from /api/stream-audio?file_path=...
[Mixer] ✓ vocals loaded: 234.50s
[Mixer] ✓ drums loaded: 234.50s
[Mixer] ✓ bass loaded: 234.50s
[Mixer] ✓ other loaded: 234.50s
[Mixer] All stems loaded, duration: 234.50s
```

**Si erreurs**:
- ❌ `Failed to load`: Vérifier chemins stems dans DB (`stems_paths` JSON)
- ❌ `No stems paths found`: Item n'a pas de stems extraits
- ❌ `AudioContext suspended`: Toucher écran une fois (iOS)

---

### ✅ **TÂCHE 4: Tester synchronisation lecture (10 min)**

**Test 1: Lecture basique**

1. **Cliquer Play**
2. **Vérifier console**:

```javascript
// ✅ DOIT AFFICHER:
[Audio] Playing from 0.00s
```

3. **Écouter** - Les 4 stems doivent jouer **PARFAITEMENT synchronisés**

**Test 2: Pause/Resume**

1. **Pause** après 10 secondes
2. **Resume** - Doit reprendre exactement au même endroit
3. **Console**:

```javascript
[Audio] Paused
[Audio] Playing from 10.23s  // ← Position exacte
```

**Test 3: Seek (barre de progression)**

1. **Cliquer** sur barre progression à 50%
2. **Play** - Tous les stems doivent démarrer synchronisés à 50%

---

### ✅ **TÂCHE 5: Tester contrôles indépendants (15 min)**

#### Test Volume indépendant

**Pour CHAQUE stem** (vocals, drums, bass, other):

1. **Slider Volume à 50%**
2. **Console doit afficher**:
   ```javascript
   [Audio] vocals volume: 0.50 (effective: 0.50)
   ```
3. **Vérifier audio** - Seulement ce stem baisse de volume

#### Test Mute

1. **Cliquer "MUTE"** sur vocals
2. **Console**:
   ```javascript
   [Audio] vocals volume: 1.00 (effective: 0.00)
   ```
3. **Vérifier** - Vocals muettes, autres stems jouent

#### Test Solo

1. **Cliquer "SOLO"** sur drums
2. **Console**:
   ```javascript
   [Audio] vocals volume: 1.00 (effective: 0.00)
   [Audio] drums volume: 1.00 (effective: 1.00)
   [Audio] bass volume: 1.00 (effective: 0.00)
   [Audio] other volume: 1.00 (effective: 0.00)
   ```
3. **Vérifier** - Seulement drums audible

#### Test Pan

1. **Slider Pan à -100** (gauche) pour vocals
2. **Console**:
   ```javascript
   [Audio] vocals pan: -1.00
   ```
3. **Vérifier écouteurs** - Vocals à gauche uniquement

---

### ⏳ **TÂCHE 6: Finaliser Pitch/Tempo (optionnel - 20 min)**

**État actuel**: Sliders connectés, SoundTouch chargé, mais peut ne pas fonctionner sans AudioWorklet.

#### Test Pitch

1. **Slider Key à +3**
2. **Console doit afficher**:
   ```javascript
   [Audio] Pitch shift: 3 semitones (ratio: 1.189)
   // OU si fallback:
   [Audio] AudioWorklet not supported, using playbackRate fallback
   [Audio] Fallback pitch via playbackRate: 1.189
   ```

#### Si AudioWorklet non supporté

**Alternative simple** - Utiliser `playbackRate` (change pitch ET tempo ensemble):

```javascript
// Dans applyPitchShift() - ligne ~1230
applyPitchShift(semitones) {
    const pitchRatio = Math.pow(2, semitones / 12);

    // Simple fallback
    if (this.audioElement) {
        this.audioElement.playbackRate = pitchRatio * (this.currentTempo || 1.0);
    }
}
```

---

## 📝 COMMANDES UTILES (Ubuntu)

### Édition fichiers

```bash
cd /home/michael/StemTube-dev

# Vérifier syntaxe
node --check static/js/mobile-app.js

# Chercher une fonction
grep -n "function_name" static/js/mobile-app.js

# Voir lignes spécifiques
sed -n '60,80p' static/js/mobile-app.js

# Backup avant modification
cp static/js/mobile-app.js static/js/mobile-app.js.backup-$(date +%Y%m%d-%H%M)
```

### Test app

```bash
# Activer venv
source venv/bin/activate

# Lancer app
python app.py

# Tester sur mobile
# http://localhost:5011/mobile
```

### Debug console mobile

**Chrome Android**:
1. PC: `chrome://inspect`
2. Connect USB
3. Inspect device

**Safari iOS**:
1. iPhone: Réglages → Safari → Avancé → Inspecteur Web
2. Mac: Safari → Développement → [iPhone] → localhost

---

## 🐛 PROBLÈMES CONNUS & SOLUTIONS

### Problème 1: "No audio available"

**Cause**: `stems_paths` non parsé ou vide

**Solution**:
```javascript
// Vérifier dans loadStemsForIOS ligne ~500
console.log('[DEBUG] stems_paths raw:', data.stems_paths);
console.log('[DEBUG] stems_paths parsed:', stemsPaths);
```

### Problème 2: "Failed to decode audio data"

**Cause**: Fichier stem corrompu ou format non supporté

**Solution**:
```bash
# Vérifier fichiers stems existent
ls -lh "core/downloads/*/stems/*.mp3"

# Tester un stem manuellement
ffmpeg -i core/downloads/.../vocals.mp3 -t 5 test.mp3
```

### Problème 3: Désynchronisation stems

**Cause**: Utilise `HTMLAudioElement.play()` au lieu de `AudioBufferSourceNode.start()`

**Solution**: Code déjà corrigé, vérifie que `playPlayback()` utilise bien:
```javascript
sourceNode.start(when, offset);  // ✅ Correct
// PAS:
audio.play();  // ❌ Désynchronisation
```

### Problème 4: "AudioContext suspended"

**Cause**: iOS bloque audio sans interaction utilisateur

**Solution**: Toucher écran une fois, `unlockAudio()` se déclenche automatiquement

---

## 📊 CHECKLIST FINALE

### Syntaxe & Code

- [ ] `node --check static/js/mobile-app.js` → OK
- [ ] `getEffectiveVolume()` placée après `applyMixerState()`
- [ ] `initSocket()` fermée avec `});`
- [ ] Variables `stemBuffers`, `stemGains`, `stemPans` initialisées dans constructor

### Fonctionnement

- [ ] Console: "All stems loaded, duration: XXs"
- [ ] Play → Lecture synchronisée des 4 stems
- [ ] Pause → Arrêt propre
- [ ] Resume → Reprise à la bonne position
- [ ] Seek → Navigation dans timeline

### Contrôles Indépendants

- [ ] Volume vocals → Change seulement vocals
- [ ] Mute drums → Mute seulement drums
- [ ] Solo bass → Seulement bass audible
- [ ] Pan other → Panning stéréo fonctionne

### Interface

- [ ] Timeline Chords avec playhead rouge
- [ ] Boutons "MUTE" / "SOLO" (texte, pas icônes)
- [ ] Generate Lyrics fonctionne
- [ ] Onglets Mix/Chords/Lyrics switchent

### Multi-plateformes

- [ ] **Android**: Tout fonctionne
- [ ] **iOS**: Tout fonctionne (après touch écran)
- [ ] **Desktop mobile view**: Tout fonctionne

---

## 🎯 PRIORITÉS

### **PRIORITÉ 1 (CRITIQUE)** - Corriger syntaxe

→ Tâche 1 (5 min) - Sans ça, rien ne marche

### **PRIORITÉ 2 (IMPORTANT)** - Tester chargement

→ Tâches 3-4 (20 min) - Vérifier que les stems se chargent et jouent

### **PRIORITÉ 3 (IMPORTANT)** - Tester contrôles

→ Tâche 5 (15 min) - Vérifier Volume/Mute/Solo/Pan indépendants

### **PRIORITÉ 4 (OPTIONNEL)** - Pitch/Tempo

→ Tâche 6 (20 min) - Peut être fait plus tard

---

## 💾 FICHIERS MODIFIÉS

```
static/js/mobile-app.js          ← Principal (erreur syntaxe ligne 63)
static/css/mobile-style.css      ← OK (Timeline, boutons)
templates/mobile-index.html      ← OK
fix-mobile-stems.py              ← Script Python (déjà exécuté)
```

## 📚 BACKUPS DISPONIBLES

```
static/js/mobile-app.js.backup   ← Avant script Python
```

---

## 🚀 DÉMARRAGE RAPIDE (Ubuntu)

```bash
# 1. Ouvrir VSCode ou vim
code /home/michael/StemTube-dev/static/js/mobile-app.js

# 2. Corriger ligne ~60-70 (fermer initSocket)
# 3. Supprimer getEffectiveVolume ligne ~63-78
# 4. Ajouter getEffectiveVolume après applyMixerState (~660)

# 5. Vérifier
node --check static/js/mobile-app.js

# 6. Tester
source venv/bin/activate
python app.py
# → http://localhost:5011/mobile
```

---

## 📞 AIDE SUPPLÉMENTAIRE

Si bloqué, vérifie:

1. **Console navigateur** - Toutes les erreurs JS y apparaissent
2. **Console Python** - Erreurs serveur (404, 500)
3. **Ce fichier** - Toutes les étapes détaillées

**Fichier de référence complet**:
- `CLAUDE.md` - Architecture complète desktop
- `MOBILE_SETUP.md` - Documentation mobile (si existe)
- Ce fichier - Continuation des travaux

---

**Bon courage ! 🎵**

_Dernière mise à jour: 2025-01-05 - Conversation sauvegardée depuis Windows → Ubuntu WSL_
