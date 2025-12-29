# faster-whisper Setup Guide

## Overview

**faster-whisper** est utilisé dans StemTube pour la transcription automatique des paroles (karaoke/lyrics). C'est une implémentation optimisée d'OpenAI Whisper utilisant CTranslate2 pour des performances 4x plus rapides.

## Installation

### Automatique (Recommandé)

Le script `setup_dependencies.py` installe automatiquement faster-whisper et ses dépendances :

```bash
python setup_dependencies.py
```

Le script :
1. ✓ Détecte la présence d'un GPU NVIDIA
2. ✓ Installe faster-whisper depuis requirements.txt
3. ✓ Installe cuDNN pour le support GPU (si GPU disponible)
4. ✓ Vérifie que faster-whisper fonctionne

### Manuelle

Si vous devez installer manuellement :

```bash
# Activer le venv
source venv/bin/activate  # Linux/Mac
# ou
venv\Scripts\activate     # Windows

# Installer faster-whisper et dépendances
pip install faster-whisper>=1.0.0
pip install ctranslate2>=4.0.0
pip install av>=10.0.0
pip install huggingface-hub>=0.13.0
pip install tokenizers>=0.13.0
pip install onnxruntime>=1.14.0

# Pour GPU: installer cuDNN
pip install nvidia-cudnn-cu11
```

## Dépendances

### Core Dependencies (requirements.txt)

```
faster-whisper>=1.0.0     # Package principal
ctranslate2>=4.0.0        # Backend d'inférence optimisé
av>=10.0.0                # Décodage audio/vidéo (PyAV)
huggingface-hub>=0.13.0   # Téléchargement des modèles
tokenizers>=0.13.0        # Tokenization du texte
onnxruntime>=1.14.0       # Runtime pour certains modèles
```

### GPU Dependencies (optionnel)

```
nvidia-cudnn-cu11         # NVIDIA cuDNN pour accélération GPU
```

**Note**: cuDNN est installé automatiquement par `setup_dependencies.py` si un GPU NVIDIA est détecté.

## Configuration GPU

### Vérifier le support GPU

```bash
./venv/bin/python -c "
from faster_whisper import WhisperModel
try:
    model = WhisperModel('tiny', device='cuda', compute_type='float16')
    print('✓ GPU mode available')
except Exception as e:
    print(f'✗ GPU mode not available: {e}')
"
```

### Variables d'environnement

Le script `start_service.sh` configure automatiquement le chemin cuDNN :

```bash
export LD_LIBRARY_PATH="$VENV_SITE_PACKAGES/nvidia/cudnn/lib:$LD_LIBRARY_PATH"
```

Ceci est nécessaire pour que faster-whisper trouve les bibliothèques cuDNN.

## Utilisation dans StemTube

### Code Example

```python
from core.lyrics_detector import LyricsDetector

# Initialiser le détecteur (GPU auto-détecté)
detector = LyricsDetector()

# Transcrire un fichier audio
audio_path = "path/to/audio.mp3"
lyrics_data = detector.transcribe_audio(
    audio_path,
    model_size="medium",  # tiny, base, small, medium, large, large-v3
    language="en"         # ou None pour auto-détection
)

# Format du résultat
# [
#   {
#     "start": 0.0,
#     "end": 2.5,
#     "text": "Lyric line text",
#     "words": [
#       {"start": 0.0, "end": 0.5, "word": "Lyric"},
#       {"start": 0.6, "end": 1.2, "word": "line"}
#     ]
#   },
#   ...
# ]
```

### Modèles disponibles

| Modèle    | Taille | Mémoire GPU | Vitesse | Précision |
|-----------|--------|-------------|---------|-----------|
| tiny      | 39M    | ~1GB        | ~32x    | ★★☆☆☆     |
| base      | 74M    | ~1GB        | ~16x    | ★★★☆☆     |
| small     | 244M   | ~2GB        | ~6x     | ★★★★☆     |
| medium    | 769M   | ~5GB        | ~2x     | ★★★★★     |
| large-v2  | 1550M  | ~10GB       | ~1x     | ★★★★★★    |
| large-v3  | 1550M  | ~10GB       | ~1x     | ★★★★★★    |

**Recommandé pour production**: `medium` (bon équilibre précision/performance)

## Performance

### GPU vs CPU

| Configuration           | Temps (3min audio) |
|------------------------|-------------------|
| CPU (8 cores)          | ~60-120 secondes  |
| GPU (NVIDIA RTX)       | ~10-30 secondes   |

**Speedup GPU**: 4-8x plus rapide que CPU

### Optimisations

1. **Compute Type GPU**:
   - `float16`: Plus rapide, précision légèrement réduite (recommandé)
   - `int8_float16`: Encore plus rapide, précision un peu plus réduite
   - `float32`: Maximum de précision, plus lent

2. **Compute Type CPU**:
   - `int8`: Recommandé pour CPU (bon équilibre)
   - `float32`: Maximum de précision, plus lent

3. **VAD (Voice Activity Detection)**:
   - Activé par défaut dans StemTube
   - Filtre les segments sans voix (améliore la précision)

## Dépannage

### Erreur: "Could not load library libcudnn"

**Solution**: Vérifier que cuDNN est installé et que LD_LIBRARY_PATH est configuré

```bash
# Vérifier l'installation
pip list | grep cudnn

# Devrait afficher:
# nvidia-cudnn-cu11  9.x.x.xx

# Vérifier le chemin
ls venv/lib/python3.12/site-packages/nvidia/cudnn/lib/

# Devrait contenir: libcudnn*.so*
```

Si absent, réinstaller :
```bash
pip install --force-reinstall nvidia-cudnn-cu11
```

### Erreur: "CUDA out of memory"

**Solutions**:
1. Utiliser un modèle plus petit (`tiny`, `base`, `small`)
2. Réduire le compute_type (essayer `int8_float16`)
3. Fallback sur CPU:
   ```python
   model = WhisperModel('medium', device='cpu', compute_type='int8')
   ```

### Le GPU n'est pas utilisé

**Vérifications**:
```bash
# 1. Vérifier CUDA
nvidia-smi

# 2. Vérifier PyTorch CUDA
python -c "import torch; print(torch.cuda.is_available())"

# 3. Vérifier faster-whisper
python -c "from faster_whisper import WhisperModel; m = WhisperModel('tiny', device='cuda'); print('OK')"
```

### Performance lente même avec GPU

**Causes possibles**:
1. Premier run: Le modèle doit être téléchargé (~769MB pour medium)
2. Cache de modèle non utilisé: Vérifier `~/.cache/huggingface/hub/`
3. GPU sous-utilisé: Monitorer avec `nvidia-smi -l 1` pendant la transcription

## Stockage des modèles

Les modèles sont téléchargés et cachés dans :
```
~/.cache/huggingface/hub/models--guillaumekln--faster-whisper-{model_size}/
```

### Pré-télécharger les modèles

```python
from faster_whisper import WhisperModel

# Télécharger sans instancier
for model_size in ["tiny", "base", "small", "medium"]:
    print(f"Downloading {model_size}...")
    WhisperModel(model_size, device="cpu")
    print(f"✓ {model_size} cached")
```

## Intégration avec StemTube

### Workflow automatique

1. **Téléchargement audio** → `DownloadManager.download_audio()`
2. **Détection lyrics automatique** → `LyricsDetector.transcribe_audio()`
3. **Stockage en BDD** → `global_downloads.lyrics_data` (JSON)
4. **Affichage mixer** → `karaoke-display.js` (synchronisation playback)

### Configuration dans app.py

```python
# core/config.json
{
    "use_gpu_for_extraction": true  # Contrôle aussi faster-whisper GPU
}
```

## Ressources

- [GitHub faster-whisper](https://github.com/guillaumekln/faster-whisper)
- [CTranslate2](https://github.com/OpenNMT/CTranslate2)
- [OpenAI Whisper](https://github.com/openai/whisper)
- [Hugging Face Models](https://huggingface.co/guillaumekln)

## Version installée

```bash
./venv/bin/pip show faster-whisper
```

**Version actuelle**: 1.2.0
**Dernière vérification**: 2025-10-26

---

**Note**: faster-whisper est un composant optionnel mais recommandé pour la fonctionnalité karaoke de StemTube. L'application fonctionne sans, mais la transcription automatique des paroles ne sera pas disponible.
