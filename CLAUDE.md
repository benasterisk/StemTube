# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Running the Application

**Start the application:**
```bash
python app.py
```
The app runs on http://localhost:5011 by default.

**Install dependencies:**
```bash
pip install -r requirements.txt
```

**Virtual environment (recommended):**
```bash
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
```

**Database initialization:**
The database (stemtubes.db) is automatically initialized on first run. No manual setup required.
Default admin user is created: username `administrator` with a generated password (displayed on first run).

**FFmpeg dependency:**
FFmpeg is automatically downloaded and installed when needed. The app checks for and installs FFmpeg on startup.

## Architecture Overview

StemTube Web is a Flask-based application for YouTube video downloading and AI-powered audio stem extraction using Demucs. The architecture follows a unified data model where **downloads are the primary entity** and extractions are properties of downloads.

### Key Architectural Principles

1. **Download-Centric Design**: All operations revolve around downloads (identified by video_id). Extractions are flags/properties on download records, not separate entities.

2. **Deduplication System**: Both downloads and extractions use global deduplication - if a file or extraction already exists, users get instant access rather than reprocessing.

3. **Session-Based Processing**: Live downloads/extractions exist in user sessions, while completed ones persist to database.

4. **Real-time Updates**: WebSocket-based progress tracking for long-running operations.

### Core Data Flow

```
User Request → Check Global Existence → Grant Access OR Start Processing → Update Database → Grant Access
```

For downloads: Check `global_downloads` table → Use existing file OR download → Save to `user_downloads`
For extractions: Check `global_downloads.extracted=1` → Use existing stems OR extract → Update download record with stems info

## Database Schema

**Primary Tables:**
- `users` - Authentication and user management
- `global_downloads` - Master file records with deduplication
- `user_downloads` - User access to files + extraction metadata

**Critical Fields (Recently Added):**
- `global_downloads.extracted` - Boolean flag if stems exist
- `global_downloads.extraction_model` - AI model used (htdemucs, etc.)
- `global_downloads.stems_paths` - JSON of stem file paths
- `global_downloads.stems_zip_path` - Path to zipped stems
- `global_downloads.extracted_at` - Extraction timestamp

Same fields mirrored in `user_downloads` for user access tracking.

## Core Components

### 1. Download System (core/downloads_db.py, core/download_manager.py)
- `DownloadManager`: Queue-based download processing
- `find_global_download()` / `add_user_access()`: Deduplication pattern
- Downloads saved to `core/downloads/{video_title}/audio/` structure

### 2. Extraction System (core/stems_extractor.py + downloads_db.py)
- `StemsExtractor`: AI-powered stem separation using Demucs
- **NEW**: Extractions now stored as download metadata, not separate records
- `find_global_extraction()` / `mark_extraction_complete()`: Same deduplication pattern as downloads
- Stems saved to `core/downloads/{video_title}/stems/` alongside audio

### 3. User Session Management (app.py UserSessionManager)
- Per-user download/extraction managers with callbacks
- Real-time WebSocket progress updates
- Session persistence to database on completion

### 4. Authentication (core/auth_db.py, core/auth_models.py)
- SQLite-based user management
- Flask-Login integration
- Default admin user created on first run

### 5. YouTube Integration (core/aiotube_client.py)
- No API key required - uses aiotube library
- Video search, metadata extraction, URL resolution
- Handles various YouTube URL formats

## API Structure

**Downloads:**
- `GET /api/downloads` - List user's downloads (with extraction status)
- `GET /api/downloads/<id>` - Get specific download status
- `POST /api/downloads` - Add download (checks global existence first)
- `DELETE /api/downloads/<id>` - Cancel download
- `POST /api/downloads/<id>/retry` - Retry failed download
- `DELETE /api/downloads/<id>/delete` - Delete download record
- `DELETE /api/downloads/clear-all` - Clear all user downloads

**Extractions:**
- `GET /api/extractions` - List user's extractions (from downloads where extracted=1)
- `GET /api/extractions/<id>` - Get specific extraction status
- `POST /api/extractions` - Start extraction (checks if already extracted first)
- `DELETE /api/extractions/<id>` - Cancel extraction
- `POST /api/extractions/<id>/retry` - Retry failed extraction
- `DELETE /api/extractions/<id>/delete` - Delete extraction record
- `POST /api/extractions/<id>/create-zip` - Create zip archive of stems
- `GET /api/extracted_stems/<extraction_id>/<stem_name>` - Download individual stem file

**Configuration:**
- `GET /api/config` - Get application settings
- `POST /api/config` - Update settings
- `GET /api/config/ffmpeg/check` - Check FFmpeg availability
- `POST /api/config/ffmpeg/download` - Download and install FFmpeg

**File Operations:**
- `GET /api/download-file` - Download processed file
- `POST /api/list-files` - List files in directory
- `POST /api/open-folder` - Open system folder

**Search:**
- `GET /api/search` - Search YouTube videos
- `GET /api/video/<video_id>` - Get video metadata

**Real-time Events (WebSocket):**
- `download_progress` / `download_complete` / `download_error`
- `extraction_progress` / `extraction_complete` / `extraction_error`

## Important Implementation Details

### Extraction Deduplication Logic
When user requests extraction:
1. Check `find_global_extraction(video_id, model_name)` 
2. If exists: `add_user_extraction_access()` - instant access
3. If not: Run extraction → `mark_extraction_complete()` → `add_user_extraction_access()`

### File Organization
```
core/downloads/
  {video_title}/
    audio/
      {filename}.mp3
    stems/
      vocals.mp3
      drums.mp3  
      bass.mp3
      other.mp3
      {filename}_stems.zip
```

### WebSocket Callback Chain
```
StemsExtractor.on_extraction_complete → UserSessionManager._emit_complete_with_room → 
Database persistence → WebSocket emission to user
```

### Configuration Management
- Settings stored in `core/config.json`
- Runtime settings via `core/config.py`
- FFmpeg auto-detection and installation
- GPU/CPU detection for Demucs processing

## Common Development Patterns

**Adding new extraction models:**
1. Add to `STEM_MODELS` in `core/config.py`
2. Update `StemsExtractor` model loading logic
3. No database changes needed - model name stored as string

**Adding new file formats:**
1. Update `DownloadType` enum in `core/download_manager.py`
2. Modify download processing logic
3. Update frontend UI accordingly

**Database migrations:**
Manual SQLite ALTERs required. Recent example (extraction fields):
```sql
ALTER TABLE global_downloads ADD COLUMN extracted BOOLEAN DEFAULT 0;
ALTER TABLE global_downloads ADD COLUMN extraction_model TEXT;
-- etc.
```

## Recent Major Changes

**Admin Interface Integration (Latest):**
- Added integrated "Users Administration" tab for admin users in main interface
- Created embedded admin interface (`/admin/embedded`) for seamless integration
- Implemented complete user management functionality (previously stubbed)
- Fixed nested interface issues with clean, focused admin experience
- Enhanced user access control and security features

**Mixer Stem Loading Fix:**
- Fixed stem file serving for historical extractions in mixer interface
- Enhanced `/api/extracted_stems` endpoint to handle database-stored extractions
- Added `get_download_by_id` function for proper stem path resolution
- Resolved 404 errors when loading stems from completed extractions

**Extraction System Refactor:**
- Removed separate `global_extractions` and `user_extractions` tables
- Moved extraction metadata to download tables as additional fields
- Unified deduplication logic between downloads and extractions
- Extractions now appear in UI by querying downloads where `extracted=1`

This unified approach enables instant sharing of extractions between users, eliminates duplicate processing, and provides a seamless admin experience within the main application interface.

## Frontend Architecture

**Main UI (static/js/app.js):**
- Tab-based interface (Downloads, Extractions, Search)
- WebSocket event handling for real-time updates
- AJAX API communication

**Mixer Interface (static/js/mixer/):**
- Modular Web Audio API implementation  
- `core.js` - Main mixer initialization
- `audio-engine.js` - Audio processing and playback
- `waveform.js` - Visual waveform rendering
- `track-controls.js` - Volume/pan/mute controls
- `timeline.js` - Playhead and time display

## Third-Party Open Source Libraries

StemTube Web leverages several key open source libraries:

**Core Web Framework:**
- **Flask** - Lightweight WSGI web application framework
- **Flask-SocketIO** - WebSocket support for real-time updates
- **Flask-Login** - User session management and authentication

**YouTube Integration:**
- **aiotube** - Async YouTube API library for video search and metadata (no API key required)
- **yt-dlp** - YouTube video downloader and media extractor (fork of youtube-dl)

**AI/Audio Processing:**
- **Demucs** - Facebook Research's deep learning model for music source separation (GPU-accelerated when NVIDIA GPU available)
- **PyTorch** - Deep learning framework powering Demucs (automatically detects and uses CUDA for GPU acceleration)
- **librosa** - Audio analysis and feature extraction
- **soundfile** - Audio file I/O operations

**Utilities:**
- **eventlet** - Concurrent networking library for WebSocket support
- **requests** - HTTP library for API communications
- **beautifulsoup4** - HTML parsing for web scraping
- **pillow** - Image processing capabilities

## Configuration Files

**core/config.json** - Runtime application settings
**requirements.txt** - Python dependencies (Flask, PyTorch, Demucs, etc.)
**stemtubes.db** - SQLite database (auto-created)

The application is designed to be self-contained with minimal external dependencies beyond Python packages.

## Admin Interface

**Integrated Administration:**
- **Admin Tab**: Administrator users see a "Users Administration" tab in the main interface (first tab position)
- **Embedded Interface**: Clean admin interface loads within the main application via iframe (`/admin/embedded`)
- **Full Admin Page**: Standalone admin interface available at `/admin` with complete navigation
- **User Management**: Create, edit, delete users, reset passwords, manage admin privileges
- **Access Control**: Only users with `is_admin=true` can access admin functions

**Admin Features:**
- Add new users with optional email and admin privileges
- Edit existing user details (username, email, admin status)
- Reset user passwords securely
- Delete users (with protection against deleting last admin or self-deletion)
- Real-time feedback via Flash messages
- Responsive table interface showing user ID, username, email, admin status, creation date

## GPU Acceleration

**NVIDIA GPU Detection:**
- **Automatic Detection**: Application automatically detects NVIDIA GPUs with CUDA support
- **PyTorch Integration**: Uses PyTorch's CUDA detection to determine GPU availability
- **Demucs Optimization**: When GPU is available, Demucs stem extraction runs significantly faster
- **CPU Fallback**: Gracefully falls back to CPU processing when no GPU is detected
- **User Control**: GPU usage can be toggled in application settings (`use_gpu_for_extraction`)
- **Status Display**: GPU availability status shown in application settings panel

**Performance Impact:**
- **GPU Processing**: Can reduce extraction time from minutes to seconds for typical songs
- **Memory Management**: GPU memory is managed automatically by PyTorch
- **Concurrent Processing**: Multiple extractions can queue while respecting GPU memory limits

## Development and Debugging Tools

**Database Management:**
```bash
python debug_db.py          # Inspect database state and extraction records
python clear_database.py    # Reset database (clears all downloads/extractions)
python test_deduplication.py # Test deduplication logic
```

**User Management:**
```bash
python reset_admin_password.py  # Reset administrator password
```

**Development Utilities:**
```bash
python pack_codebase.py     # GUI tool to export codebase files to txt/md
```

**Configuration Files:**
- `core/config.json` - Runtime settings (theme, paths, concurrency, GPU usage)
- `core/config.py` - Default settings and configuration management
- `stemtubes.db` - SQLite database with user authentication and download records

## Development Workflow

**Common Development Tasks:**
1. **Database Reset**: Use `clear_database.py` for clean testing environment
2. **Debugging Extractions**: Use `debug_db.py` to inspect extraction state
3. **Testing Deduplication**: Use `test_deduplication.py` to verify logic works
4. **Admin Access**: Use `reset_admin_password.py` if locked out
5. **Code Export**: Use `pack_codebase.py` to create documentation archives

**Performance Considerations:**
- Demucs extraction is CPU/GPU intensive - monitor system resources
- Concurrent downloads limited by `max_concurrent_downloads` setting
- Large audio files may cause memory issues during processing
- WebSocket connections should be properly cleaned up

**Debugging Tips:**
- Check Flask console output for detailed error messages
- Use browser developer tools to monitor WebSocket events
- Database state can be inspected with `debug_db.py`
- File system paths are configurable in `core/config.json`