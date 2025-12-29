# Claude Code Memory - StemTube Project

> **Purpose**: This file serves as persistent memory across Claude Code sessions. It captures project conventions, current state, and important context that should be maintained between conversations.

---

## Project Identity

**Name**: StemTube Web
**Type**: Flask-based web application for AI-powered audio stem extraction
**Primary Use**: YouTube audio downloading + Demucs stem separation + Professional music analysis
**Tech Stack**: Flask + PyTorch + Demucs + madmom + faster-whisper + Web Audio API

---

## Critical Architecture Patterns

### 1. Download-Centric Data Model
- Downloads are the primary entity (not extractions)
- Extractions are properties/flags on download records
- Global deduplication: `global_downloads` + `user_downloads`
- Never create separate extraction tables

### 2. Deduplication Flow
```
User Request → Check global_downloads → Grant instant access OR Process → Update database → Grant access
```

### 3. Real-time Updates
- WebSocket via Flask-SocketIO
- Per-user rooms for targeted events
- Callback chain: Manager → UserSessionManager → Database → WebSocket

### 4. File Organization
```
core/downloads/{video_title}/
  audio/{filename}.mp3
  stems/vocals.mp3, drums.mp3, bass.mp3, other.mp3
```

---

## Important Conventions

### Database
- **Always use parameterized queries** (never string interpolation)
- **COALESCE pattern**: Prefer `global_downloads` data over `user_downloads`
- **JSON fields**: Use for arrays/objects (chords_data, structure_data, lyrics_data)
- **Manual migrations**: No ORM, use direct SQLite ALTER statements

### Code Style
- **Python**: PEP 8, type hints, docstrings, functions <50 lines
- **JavaScript**: ES6+, modular architecture, one class per file
- **File naming**: snake_case for Python, kebab-case for JS/CSS

### Frontend Modules
- **Pattern**: Each mixer module is a class with `init()`, `sync()`, `reset()`
- **Initialization**: Modules reference main mixer via `this.mixer`
- **DOM**: Append elements, don't replace innerHTML (preserves existing elements)
- **Events**: Use custom events for cross-module communication

---

## Critical Fields (Database Schema)

### global_downloads table
```sql
-- Core fields
id, video_id, title, thumbnail, media_type, quality, file_path, file_size, created_at

-- Extraction fields
extracted, extraction_model, stems_paths, stems_zip_path, extracted_at

-- Analysis fields (authoritative source)
detected_bpm, detected_key, analysis_confidence
chords_data (JSON array)
structure_data (JSON object/array)
lyrics_data (JSON array)
```

**IMPORTANT**: Use COALESCE in queries to prefer global_downloads data.

---

## Active Features (As of October 2025)

### ✅ Implemented & Production Ready
1. **Download System**: YouTube + file upload with deduplication
2. **Stem Extraction**: Demucs with GPU acceleration
3. **Chord Detection**: madmom CRF (professional-grade, 24 chord types)
4. **Structure Analysis**: MSAF-only segmentation (backend complete)
5. **Structure Display**: Visual timeline in mixer (frontend complete - Oct 15, 2025)
6. **Lyrics/Karaoke**: faster-whisper with word-level timestamps
7. **Mixer Interface**: 11 modular components with real-time sync
8. **Global Library**: Cross-user content sharing
9. **Admin Tools**: User management + cleanup utilities
10. **Silent Stem Detection**: Auto-exclude empty stems from mixer

### 🔧 Known Issues & Solutions

**madmom compatibility**: Requires numpy patch on first install
```bash
python patch_madmom.py  # Fixes np.float → np.float64
```

**GPU lyrics**: Requires cuDNN for faster-whisper GPU mode
```bash
sudo apt-get install -y libcudnn8 libcudnn8-dev
```

**FFmpeg**: Auto-downloads on startup if missing (no manual intervention)

---

## Development Workflow

### Starting a Session
1. Read `CLAUDE.md` for comprehensive project documentation
2. Read `SESSION_NOTES.md` for latest session state
3. Read this file (`CLAUDE_MEMORY.md`) for conventions

### During Development
1. Follow established patterns (check similar modules first)
2. Update documentation as you code (not after)
3. Test with real data (database has 10+ extractions with full analysis)

### Ending a Session
1. Update `SESSION_NOTES.md` with work completed
2. Update `CLAUDE.md` if architecture/features changed
3. Update this file if conventions/patterns changed

### Common Tasks
- **Database reset**: `python clear_database.py`
- **Inspect database**: `python debug_db.py`
- **Test analysis**:
  ```bash
  source venv/bin/activate
  python - <<'PY'
  from core.msaf_structure_detector import detect_song_structure_msaf
  sections = detect_song_structure_msaf("core/downloads/.../audio/song.mp3")
  print(sections)
  PY
  ```
- **Fix madmom**: `python patch_madmom.py`
- **Admin access**: `python reset_admin_password.py`

---

## User Preferences

### UI/UX Philosophy
- **Easy toggles**: User wants ability to enable/disable features easily
- **Progressive disclosure**: Show advanced features only when relevant
- **Visual feedback**: Always provide feedback for user actions (toasts, highlights)
- **Performance**: Prefer client-side rendering over server round-trips

### Feature Requests Handling
- User asks "is feature X working?" → Check backend first, then frontend
- User says "finish implementation" → They want production-ready, not prototype
- User wants "easy to deactivate" → Add visible toggle button in UI

---

## Testing Strategy

### Manual Testing (Current)
- No formal test suite
- Test via web interface at http://localhost:5011
- Use existing extractions in database (ID 6: Neil Young - Heart Of Gold has full analysis)

### Test Extractions Available
- **ID 6**: Neil Young - Heart Of Gold (8 sections, chords, lyrics)
- **ID 7-15**: Various songs with structure data
- All have: BPM, Key, Chords (madmom CRF), Structure (LLM format)

### Browser Testing
- Primary: Chrome/Firefox desktop
- Mobile: iOS Safari (requires mobile-audio-engine.js)
- Check console for `[ModuleName]` prefixed logs

---

## Important File Locations

### Documentation
- `/opt/stemtube/StemTube-dev/CLAUDE.md` - Complete project docs (1,670+ lines)
- `/opt/stemtube/StemTube-dev/CLAUDE_MEMORY.md` - This file (persistent memory)
- `/opt/stemtube/StemTube-dev/SESSION_NOTES.md` - Latest session state

### Configuration
- `/opt/stemtube/StemTube-dev/core/config.json` - Runtime settings
- `/opt/stemtube/StemTube-dev/core/config.py` - Default settings

### Database
- `/opt/stemtube/StemTube-dev/stemtubes.db` - SQLite database

### Core Backend
- `app.py` (3,002 lines) - Main Flask app, 78 endpoints
- `core/downloads_db.py` - Database operations
- `core/download_manager.py` - Download queue
- `core/stems_extractor.py` - Demucs integration

### Analysis Modules
- `core/madmom_chord_detector.py` - Professional chord detection
- `core/msaf_structure_detector.py` - Simple MSAF-based structure detection
- `core/lyrics_detector.py` - faster-whisper transcription

### Frontend Mixer
- `templates/mixer.html` - Mixer UI template
- `static/css/mixer/mixer.css` - Mixer styling
- `static/js/mixer/core.js` - Main coordinator
- `static/js/mixer/audio-engine.js` - Desktop audio (Web Audio API)
- `static/js/mixer/mobile-audio-engine.js` - iOS audio (HTML5 Audio)
- `static/js/mixer/chord-display.js` - Chord timeline
- `static/js/mixer/structure-display.js` - Structure timeline (new)
- `static/js/mixer/karaoke-display.js` - Lyrics display

---

## Recent Changes (Last 3 Sessions)

### October 15, 2025 - Structure Display Implementation
- ✅ Completed frontend integration for structure analysis
- ✅ Added visual timeline with color-coded sections
- ✅ Implemented click-to-seek and double-click-to-loop
- ✅ Added toggle button for easy enable/disable
- ✅ Fixed DOM initialization bug (appendChild pattern)
- ✅ Updated CLAUDE.md with complete documentation

### Earlier October 2025 - Documentation Overhaul
- ✅ Expanded CLAUDE.md from 693 to 1,670+ lines
- ✅ Added complete API reference (78 endpoints)
- ✅ Documented all 11 mixer modules
- ✅ Added frontend architecture deep dive
- ✅ Created troubleshooting guide

### September 2025 - Professional Analysis Integration
- ✅ Upgraded to madmom CRF for chord detection
- ✅ Implemented MSAF-based structure analysis
- ✅ Added faster-whisper for lyrics transcription

---

## Git Best Practices (User Preference)

- **Commit messages**: Descriptive, present tense ("Add structure display timeline")
- **File organization**: Keep related files together (mixer modules in same directory)
- **Documentation**: Update docs in same commit as code changes
- **No secrets**: Never commit `.env`, credentials, or API keys

---

## Performance Expectations

### Analysis Processing Times (3-4 minute song)
- **BPM detection**: <1 second (scipy)
- **Key detection**: <1 second (chroma)
- **Chord detection**: 20-40 seconds (madmom CRF)
- **Structure analysis**: ~5 seconds (MSAF)
- **Lyrics transcription**: 30-120 seconds (CPU) or 10-30 seconds (GPU)

### Stem Extraction Times
- **CPU**: 3-8 minutes
- **GPU (CUDA)**: 20-60 seconds
- **6-stem model**: +50% vs 4-stem

---

## Security Reminders

- ✅ Parameterized queries (SQL injection prevention)
- ✅ Path validation (directory traversal prevention)
- ✅ bcrypt password hashing
- ✅ Admin-only routes (`@admin_required`)
- ⚠️ TODO: Add CSRF protection (Flask-WTF)
- ⚠️ TODO: Add rate limiting (Flask-Limiter)

---

## When Things Break

### Common Errors & Solutions

**"Container not found"** → Check if HTML container exists before JavaScript runs

**"madmom import error"** → Run `python patch_madmom.py`

**"CUDA not available"** → Check `nvidia-smi`, reinstall PyTorch with CUDA

**"FFmpeg not found"** → Restart app (auto-downloads FFmpeg)

**"Extraction stuck"** → Use admin cleanup to reset extraction flag

**"WebSocket not connecting"** → Check Flask-SocketIO installed, port 5011 open

---

## Future Roadmap Priorities

### High Priority (Next Release)
1. Library tab UI for browsing global content
2. User-editable lyrics with timestamp adjustment
3. Export features (LRC, DAW markers)

### Medium Priority
1. Mobile-responsive improvements
2. Advanced search and filtering
3. Playlist management

### Research & Experimentation
1. Enhanced AI models (newer Demucs, Spleeter)
2. Chord inversion detection
3. User feedback loop for structure labeling

---

## Important Gotchas

### 1. iOS Audio Context
- Requires user gesture to unlock audio
- Use `mobile-audio-engine.js` instead of Web Audio API
- Check `mobile-debug-fix.js` for iOS-specific workarounds

### 2. LLM Structure Format
- Backend stores structure in LLM format: `{sections: [...], pattern: "...", genre_hints: "..."}`
- Frontend expects simple array: `[{start, end, label}, ...]`
- Always use `transformLLMStructure()` when loading data

### 3. Chord Transposition
- Chords must transpose when user changes pitch in mixer
- `simple-pitch-tempo.js` tracks `currentPitchShift`
- `chord-display.js` listens for `pitchShiftChanged` event
- Use `transposeChord(chord, semitones)` for accurate transposition

### 4. Silent Stem Detection
- Runs during extraction, not in mixer
- Uses librosa RMS analysis with -40dB threshold
- Excludes stems from mixer, but keeps files on disk
- Configurable via `enable_silent_stem_detection` in config.json

---

## Session Continuity Checklist

**When starting a new session:**
- [ ] Read this file (CLAUDE_MEMORY.md)
- [ ] Read SESSION_NOTES.md for latest state
- [ ] Check CLAUDE.md for specific documentation
- [ ] Review recent git commits (if applicable)
- [ ] Check database state with `python debug_db.py` (if needed)

**When ending a session:**
- [ ] Update SESSION_NOTES.md with work completed
- [ ] Update CLAUDE.md if features/architecture changed
- [ ] Update this file if conventions changed
- [ ] Document any issues encountered and solutions
- [ ] Note any incomplete work or next steps

---

**Last Updated**: October 15, 2025
**Project Version**: October 2025
**Total Lines of Code**: ~20,000+
**Active Development**: Structure Display Timeline (just completed)
