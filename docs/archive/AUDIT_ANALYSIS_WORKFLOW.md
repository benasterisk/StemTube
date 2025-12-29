# 🔍 AUDIT COMPLET DU WORKFLOW D'ANALYSE AUDIO

**Date:** 2025-10-10
**Objectif:** Nettoyer et clarifier le workflow d'analyse (chords, BPM, key, structure, lyrics)

---

## 📊 ÉTAT ACTUEL (Ce qui fonctionne)

### ✅ Modules installés et fonctionnels

1. **Madmom 0.17.dev0** (recompilé depuis sources)
   - CNN Chord Recognition (CRF)
   - RNN Beat Tracking
   - Location: `/opt/stemtube/StemTube-dev/venv/lib/python3.12/site-packages/madmom/`
   - Modèles: 26 MB (beats, chords, chroma, key, notes, onsets, downbeats)

2. **MSAF 0.1.80** (Music Structure Analysis Framework)
   - Algorithmes: Foote, OLDA, SF, C-NMF, etc.
   - Détection de frontières (boundaries)
   - **MAIS:** Pas de labeling sémantique

3. **faster-whisper** (Whisper optimisé)
   - Détection de paroles
   - Modèles: base, small, medium, large-v3
   - GPU/CPU support

4. **librosa + soundfile + scipy**
   - Feature extraction
   - BPM/Key detection basique

---

## 🔄 WORKFLOW ACTUEL (download_manager.py lignes 598-697)

### Étapes après téléchargement audio :

```python
# 1. Analyse BPM/Key (lignes 600-608)
analysis_results = self.analyze_audio_with_librosa(item.file_path)
# → detected_bpm, detected_key, analysis_confidence

# 2. Détection d'accords (lignes 610-632)
from .chord_detector import analyze_audio_file
chords_data, beat_offset = analyze_audio_file(
    item.file_path,
    bpm=item.detected_bpm,
    detected_key=item.detected_key,
    use_madmom=True
)

# 3. Détection de structure (lignes 634-654)
from .advanced_structure_detector import detect_song_structure_advanced
structure_data = detect_song_structure_advanced(
    item.file_path,
    bpm=item.detected_bpm,
    use_msaf=True  # Utilise MSAF pour boundaries
)

# 4. Détection de paroles (lignes 656-681)
from .lyrics_detector import detect_song_lyrics
lyrics_data = detect_song_lyrics(
    item.file_path,
    model_size="large-v3",
    language=None,
    use_gpu=use_gpu
)

# 5. Sauvegarde en DB (lignes 683-697)
from .downloads_db import update_download_analysis
update_download_analysis(
    item.video_id,
    item.detected_bpm,
    item.detected_key,
    item.analysis_confidence,
    chords_data,
    beat_offset,
    structure_data,
    lyrics_data
)
```

---

## 🚨 PROBLÈMES IDENTIFIÉS

### 1. **Structure : pipeline unifié (résolu)**

Les anciens détecteurs (`advanced_structure_detector.py`, `ssm_structure_detector.py`, `multimodal_structure_analyzer.py`) ont été supprimés.

- ✅ Pipeline unique : `core/msaf_structure_detector.py`
- ✅ `download_manager.py` appelle directement `detect_song_structure_msaf()`
- ✅ Moins de maintenance, comportement prévisible

### 2. **Labels MSAF peu parlants**

**Constat :** MSAF renvoie souvent des labels génériques (`A`, `B`, `C`).

**Amélioration possible :** Mapper les lettres vers `Section 1`, `Section 2`, ou proposer une table de correspondance personnalisable.

### 3. **Détection Whisper peut échouer**

**Problème potentiel (ligne 680) :**
```python
lyrics_data = None  # Si exception
```

**Pas de détection GPU correcte**, peut planter si CUDA mal configuré

### 4. **Détecteurs de chords multiples**

**Fichiers :**
- `chord_detector.py` (interface principale)
- `madmom_chord_detector.py` (Madmom CRF)
- `hybrid_chord_detector.py` (Madmom beats + librosa chroma)

**Actuellement utilisé :** `chord_detector.py` avec `use_madmom=True`
**Superflu :** `hybrid_chord_detector.py` (pas utilisé)

---

## ✅ CE QUI FONCTIONNE BIEN (À GARDER)

1. **BPM/Key detection** (`analyze_audio_with_librosa`) ✅
   - Autocorrelation BPM
   - Chroma-based key detection
   - Fonctionne sans librosa/numba (Windows-compatible)

2. **Chord detection** (`chord_detector.py` → `madmom_chord_detector.py`) ✅
   - Madmom CRF professional
   - Beat offset tracking
   - 24 chords (12 major + 12 minor)

3. **Sauvegarde DB** (`update_download_analysis`) ✅
   - Champs: `detected_bpm`, `detected_key`, `chords_data`, `beat_offset`, `structure_data`, `lyrics_data`

---

## 🎯 PLAN DE NETTOYAGE PROPOSÉ

### Phase 1: Pipeline retenu

- ✅ Option unique : MSAF simple (`core/msaf_structure_detector.py`)
- ✅ Pas de fusion accords/paroles, pas de SSM
- ➡️ Labels bruts fournis par MSAF (souvent `A`, `B`, `C`)

### Phase 2: Nettoyage effectué

- ❌ `hybrid_chord_detector.py` (toujours inutile, mais laissé pour archive)
- ❌ `advanced_structure_detector.py`, `ssm_structure_detector.py`, `multimodal_structure_analyzer.py` supprimés
- ✅ `download_manager.py` appelle directement `detect_song_structure_msaf()`

### Phase 3: Améliorations potentielles

- Mapper les labels MSAF (`A`, `B`, `C`) vers `Section 1`, `Section 2`, etc.
- Exposer un script CLI pour imprimer la structure rapidement
- Ajouter un fallback librosa si MSAF indisponible

### Phase 4: Tester Whisper/GPU

**Problème potentiel:** CUDA mal configuré pour Whisper
**Solution:** Ajouter fallback CPU automatique

```python
# Dans lyrics_detector.py
try:
    model = WhisperModel(model_size, device="cuda" if use_gpu else "cpu")
except Exception as e:
    logger.warning(f"GPU failed, falling back to CPU: {e}")
    model = WhisperModel(model_size, device="cpu")
```

---

## 📋 CHECKLIST DE VÉRIFICATION

- [ ] Vérifier une analyse complète (download → MSAF → DB)
- [ ] Contrôler l'affichage timeline dans le mixer
- [ ] Mapper les labels MSAF si nécessaire (optionnel)
- [ ] Tester le fallback CPU de Whisper (GPU débranché)

---

## 🎵 TRANSMISSION AU MIXER (À VÉRIFIER)

### Données transmises :

```python
# Dans app.py (route /mixer)
EXTRACTION_INFO = {
    'video_id': video_id,
    'title': title,
    'detected_bpm': detected_bpm,
    'detected_key': detected_key,
    'chords_data': chords_data,
    'beat_offset': beat_offset,
    'structure_data': structure_data,
    'lyrics_data': lyrics_data,
    'stems': [...]
}
```

### Mixer JavaScript :

```javascript
// static/js/mixer/core.js
const chordsData = EXTRACTION_INFO.chords_data;
const bpm = EXTRACTION_INFO.detected_bpm;
const key = EXTRACTION_INFO.detected_key;
const structure = EXTRACTION_INFO.structure_data;

// Pitch/Tempo calibrés sur ces valeurs
simplePitchTempo.setOriginalBPM(bpm);
chordDisplay.setChords(chordsData, key);
```

**À VÉRIFIER:** Que `structure_data` est bien affiché quelque part dans l'UI

---

## 💡 DÉCISIONS À PRENDRE

1. **Labeling structure**
   - Par défaut: conserver labels MSAF (`A`, `B`, `C`)
   - Optionnel: mapper vers `Section 1`, `Section 2`, etc.

2. **Structure analyzer**
   - ✅ Décision prise: MSAF unique (plus de multimodal)

3. **Whisper: quel modèle ?**
   - Actuel: `large-v3` (très lourd, ~3GB)
   - Alternative: `medium` (1.5GB, plus rapide)
   - **Recommandation:** Proposer un paramètre dans la config

---

## 📝 NOTES FINALES

**Conclusion:** Pipeline simplifié : MSAF unique, plus de redondance.
**Objectif court terme:** Option de mapping des labels + vérification UI.
**Timeline estimée:** 1h pour mapping + tests (si nécessaire).

**Points à confirmer avec l'utilisateur:**
1. Souhaite-t-il un mapping automatique des labels (`A`, `B`, `C` → `Section N`)?
2. Faut-il proposer un script CLI pour inspecter la structure ?
3. Doit-on exposer un paramètre de choix de modèle Whisper (medium vs large) ?
