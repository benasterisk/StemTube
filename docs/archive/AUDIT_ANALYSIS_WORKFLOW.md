# 🔍 COMPLETE AUDIO ANALYSIS WORKFLOW AUDIT

**Date:** 2025-10-10
**Goal:** Clean up and clarify the analysis workflow (chords, BPM, key, structure, lyrics)

---

## 📊 CURRENT STATE (What works)

### ✅ Installed and working modules

1. **Madmom 0.17.dev0** (rebuilt from source)
   - CNN Chord Recognition (CRF)
   - RNN Beat Tracking
   - Location: `/opt/stemtube/StemTube-dev/venv/lib/python3.12/site-packages/madmom/`
   - Models: 26 MB (beats, chords, chroma, key, notes, onsets, downbeats)

2. **MSAF 0.1.80** (Music Structure Analysis Framework)
   - Algorithms: Foote, OLDA, SF, C-NMF, etc.
   - Boundary detection
   - **BUT:** No semantic labeling

3. **faster-whisper** (optimized Whisper)
   - Lyrics detection
   - Models: base, small, medium, large-v3
   - GPU/CPU support

4. **librosa + soundfile + scipy**
   - Feature extraction
   - Basic BPM/Key detection

---

## 🔄 CURRENT WORKFLOW (download_manager.py lines 598-697)

### Steps after audio download:

```python
# 1. BPM/Key analysis (lines 600-608)
analysis_results = self.analyze_audio_with_librosa(item.file_path)
# -> detected_bpm, detected_key, analysis_confidence

# 2. Chord detection (lines 610-632)
from .chord_detector import analyze_audio_file
chords_data, beat_offset = analyze_audio_file(
    item.file_path,
    bpm=item.detected_bpm,
    detected_key=item.detected_key,
    use_madmom=True
)

# 3. Structure detection (lines 634-654)
from .advanced_structure_detector import detect_song_structure_advanced
structure_data = detect_song_structure_advanced(
    item.file_path,
    bpm=item.detected_bpm,
    use_msaf=True  # Uses MSAF for boundaries
)

# 4. Lyrics detection (lines 656-681)
from .lyrics_detector import detect_song_lyrics
lyrics_data = detect_song_lyrics(
    item.file_path,
    model_size="large-v3",
    language=None,
    use_gpu=use_gpu
)

# 5. DB save (lines 683-697)
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

## 🚨 ISSUES IDENTIFIED

### 1. **Structure: unified pipeline (resolved)**

Old detectors (`advanced_structure_detector.py`, `ssm_structure_detector.py`, `multimodal_structure_analyzer.py`) were removed.

- ✅ Single pipeline: `core/msaf_structure_detector.py`
- ✅ `download_manager.py` calls `detect_song_structure_msaf()` directly
- ✅ Less maintenance, predictable behavior

### 2. **MSAF labels are not descriptive**

**Observation:** MSAF often returns generic labels (`A`, `B`, `C`).

**Possible improvement:** map letters to `Section 1`, `Section 2`, or provide a customizable mapping table.

### 3. **Whisper detection can fail**

**Potential issue (line 680):**
```python
lyrics_data = None  # On exception
```

**No proper GPU detection**, can fail if CUDA is misconfigured.

### 4. **Multiple chord detectors**

**Files:**
- `chord_detector.py` (main interface)
- `madmom_chord_detector.py` (Madmom CRF)
- `hybrid_chord_detector.py` (Madmom beats + librosa chroma)

**Currently used:** `chord_detector.py` with `use_madmom=True`
**Redundant:** `hybrid_chord_detector.py` (unused)

---

## ✅ WHAT WORKS WELL (KEEP)

1. **BPM/Key detection** (`analyze_audio_with_librosa`) ✅
   - Autocorrelation BPM
   - Chroma-based key detection
   - Works without librosa/numba (Windows compatible)

2. **Chord detection** (`chord_detector.py` -> `madmom_chord_detector.py`) ✅
   - Madmom CRF professional
   - Beat offset tracking
   - 24 chords (12 major + 12 minor)

3. **DB save** (`update_download_analysis`) ✅
   - Fields: `detected_bpm`, `detected_key`, `chords_data`, `beat_offset`, `structure_data`, `lyrics_data`

---

## 🎯 PROPOSED CLEANUP PLAN

### Phase 1: Selected pipeline

- ✅ Single option: simple MSAF (`core/msaf_structure_detector.py`)
- ✅ No chord/lyrics fusion, no SSM
- ➡️ Raw MSAF labels (often `A`, `B`, `C`)

### Phase 2: Cleanup done

- ❌ `hybrid_chord_detector.py` (still useless, kept for archive)
- ❌ `advanced_structure_detector.py`, `ssm_structure_detector.py`, `multimodal_structure_analyzer.py` removed
- ✅ `download_manager.py` calls `detect_song_structure_msaf()` directly

### Phase 3: Potential improvements

- Map MSAF labels (`A`, `B`, `C`) to `Section 1`, `Section 2`, etc.
- Expose a CLI script to print structure quickly
- Add a librosa fallback if MSAF is unavailable

### Phase 4: Test Whisper/GPU

**Potential issue:** CUDA misconfigured for Whisper
**Fix:** Add automatic CPU fallback

```python
# In lyrics_detector.py
try:
    model = WhisperModel(model_size, device="cuda" if use_gpu else "cpu")
except Exception as e:
    logger.warning(f"GPU failed, falling back to CPU: {e}")
    model = WhisperModel(model_size, device="cpu")
```

---

## 📋 VERIFICATION CHECKLIST

- [ ] Verify a full analysis (download -> MSAF -> DB)
- [ ] Check timeline display in the mixer
- [ ] Map MSAF labels if needed (optional)
- [ ] Test Whisper CPU fallback (GPU unplugged)

---

## 🎵 MIXER HANDOFF (VERIFY)

### Data passed:

```python
# In app.py (/mixer route)
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

### Mixer JavaScript:

```javascript
// static/js/mixer/core.js
const chordsData = EXTRACTION_INFO.chords_data;
const bpm = EXTRACTION_INFO.detected_bpm;
const key = EXTRACTION_INFO.detected_key;
const structure = EXTRACTION_INFO.structure_data;

// Pitch/tempo calibrated on these values
simplePitchTempo.setOriginalBPM(bpm);
chordDisplay.setChords(chordsData, key);
```

**VERIFY:** `structure_data` is actually displayed in the UI.

---

## 💡 DECISIONS TO MAKE

1. **Structure labeling**
   - Default: keep MSAF labels (`A`, `B`, `C`)
   - Optional: map to `Section 1`, `Section 2`, etc.

2. **Structure analyzer**
   - ✅ Decision made: single MSAF (no more multimodal)

3. **Whisper model choice**
   - Current: `large-v3` (very heavy, ~3GB)
   - Alternative: `medium` (1.5GB, faster)
   - **Recommendation:** expose a config option

---

## 📝 FINAL NOTES

**Conclusion:** Simplified pipeline: single MSAF, no redundancy.
**Short-term goal:** label mapping option + UI verification.
**Estimated time:** 1h for mapping + tests (if needed).

**Points to confirm with the user:**
1. Do they want automatic label mapping (`A`, `B`, `C` -> `Section N`)?
2. Should we provide a CLI script to inspect structure?
3. Should we expose a Whisper model choice (medium vs large)?
