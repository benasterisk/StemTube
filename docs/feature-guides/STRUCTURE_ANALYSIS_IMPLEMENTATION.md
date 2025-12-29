# Music Structure Analysis – Simplified MSAF Implementation

**Date :** 2025-10-27  
**Statut :** ✅ Actif  
**Version :** 2.0

---

## 🎯 Objectif

Revenir à une détection de structure **simple et fiable** en s’appuyant exclusivement sur **MSAF (Music Structure Analysis Framework)**. Toutes les tentatives précédentes (SSM multi-caractéristiques, fusion multimodale, labeling avancé) ont été retirées pour privilégier la stabilité et la maintenabilité.

---

## ✅ Travail Réalisé

### 1. Nettoyage drastique

- Suppression des anciens modules expérimentaux :  
  `core/ssm_structure_detector.py`, `core/multimodal_structure_analyzer.py`, `core/advanced_structure_detector.py`  
- Suppression des scripts de test associés :  
  `test_ssm_structure.py`, `test_multimodal_structure.py`

### 2. Nouveau module unique

`core/msaf_structure_detector.py`

```python
sections = detect_song_structure_msaf(
    audio_path,
    boundaries_id="foote",
    labels_id="fmc2d"
)
```

- Utilise `msaf.process` pour récupérer directement frontières + labels.  
- Génère des sections `{start, end, label, confidence}` (confidence figée à `1.0`).  
- Conservation des labels MSAF si disponibles, fallback `Section N` sinon.

### 3. Intégration pipeline

Dans `core/download_manager.py` :  
le bloc *structure* appelle uniquement `detect_song_structure_msaf`.  
Les logs affichent désormais `Détection de la structure avec MSAF...`.

### 4. Dépendances

`requirements.txt` :
```text
msaf>=0.1.90
```
MSAF gère automatiquement ses dépendances (librosa, scikit-learn, joblib, etc.).

---

## 🧪 Validation

```
source venv/bin/activate
python - <<'PY'
from core.msaf_structure_detector import detect_song_structure_msaf
sections = detect_song_structure_msaf("core/downloads/.../audio/song.mp3")
print(sections)
PY
```

Si `msaf` est absent, un message explicite est loggé (`pip install msaf`).  
En cas d’échec MSAF (fichier invalide, format exotique), `structure_data` reste `NULL`.

---

## 📂 Données stockées

Colonne `structure_data` (table `global_downloads`) :
```json
[
  {"start": 0.0, "end": 18.2, "label": "Intro", "confidence": 1.0},
  {"start": 18.2, "end": 45.6, "label": "A", "confidence": 1.0}
]
```

Les libellés exacts proviennent de l’algorithme `labels_id` choisi.

---

## ⚙️ Paramètres recommandés

| Paramètre       | Valeur défaut | Description                                     |
|-----------------|---------------|-------------------------------------------------|
| `boundaries_id` | `foote`       | Détection via kernel checkerboard (robuste)     |
| `labels_id`     | `fmc2d`       | Clustering répétition/contraste générique       |

Variantes utiles :
- `boundaries_id="cnmf"` pour les titres très répétitifs.  
- `labels_id="olda"` (two-level) pour distinguer grandes sections vs transitions.

---

## 📋 Résumé des bénéfices

1. **Simplicité** : un seul module lisible, zéro heuristique additionnelle.  
2. **Fiabilité** : repose sur un framework MIR éprouvé et maintenu.  
3. **Maintenance facile** : moins de dépendances maison ➜ moins de débogage.

---

## 🔜 Prochaines pistes (optionnel)

- Ajouter un mapping configurable `label -> nom lisible` (ex. `A` ➜ `Couplet`).  
- Proposer un fallback `librosa` si MSAF indisponible.  
- Exposer un script CLI léger (`python tools/print_structure.py <file>`).

---

🎵 **Conclusion** : La détection de structure StemTube est désormais basée uniquement sur MSAF, offrant un comportement prévisible et des résultats cohérents sans la complexité des solutions précédentes.*** End Patch
