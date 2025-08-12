"""
Main Flask application for StemTube Web.
Provides a web interface for YouTube browsing, downloading, and stem extraction.
"""
import ssl
ssl._create_default_https_context = ssl._create_unverified_context

import os
import json
import time
import uuid
import subprocess
import sys
import tempfile
import shutil
import re
from datetime import datetime
from functools import wraps

from flask import (
    Flask, render_template, request, jsonify, send_from_directory,
    redirect, url_for, flash, session
)
from flask_socketio import SocketIO, emit, join_room, leave_room
from flask_login import (
    LoginManager, login_user, logout_user, login_required, current_user
)
from flask_session import Session

# Core modules
from core.aiotube_client import get_aiotube_client
from core.download_manager import (
    DownloadManager, DownloadItem, DownloadType, DownloadStatus
)
from core.stems_extractor import (
    StemsExtractor, ExtractionItem, ExtractionStatus
)
from core.config import (
    get_setting, update_setting, get_ffmpeg_path, get_ffprobe_path,
    ensure_ffmpeg_available, ensure_valid_downloads_directory
)
from core.auth_db import (
    init_db, authenticate_user, get_user_by_id, get_user_by_username,
    create_user, update_user, change_password, delete_user, get_all_users,
    add_user, reset_user_password
)
from core.auth_models import User

# Persistent downloads DB
from core.downloads_db import (
    init_table as init_downloads_table,
    add_or_update as db_add_download,
    delete_from as db_delete_download,
    list_for as db_list_downloads,
    find_global_download as db_find_global_download,
    add_user_access as db_add_user_access,
    # Extraction functions from same table
    find_global_extraction as db_find_global_extraction,
    find_or_reserve_extraction as db_find_or_reserve_extraction,
    mark_extraction_complete as db_mark_extraction_complete,
    add_user_extraction_access as db_add_user_extraction_access,
    list_extractions_for as db_list_extractions,
    set_extraction_in_progress as db_set_extraction_in_progress,
    set_user_extraction_in_progress as db_set_user_extraction_in_progress,
    clear_extraction_in_progress as db_clear_extraction_in_progress,
    cleanup_stuck_extractions,
    cleanup_duplicate_user_downloads
)

# ------------------------------------------------------------------
# Utility Functions
# ------------------------------------------------------------------
def is_valid_youtube_video_id(video_id):
    """Validate a YouTube video ID."""
    if not video_id or not isinstance(video_id, str):
        return False
    
    # YouTube video IDs are exactly 11 characters
    if len(video_id) != 11:
        return False
    
    # Only alphanumeric, hyphen, and underscore are allowed
    if not re.match(r'^[a-zA-Z0-9_-]{11}$', video_id):
        return False
    
    return True

# ------------------------------------------------------------------
# Bootstrap
# ------------------------------------------------------------------
ensure_ffmpeg_available()
init_db()
init_downloads_table()
cleanup_stuck_extractions()  # Clean up any stuck extractions from previous runs
cleanup_duplicate_user_downloads()  # Clean up duplicate user_downloads records

# ------------------------------------------------------------------
# Flask & SocketIO setup
# ------------------------------------------------------------------
app = Flask(__name__)
app.config['SECRET_KEY'] = 'stemtubes-web-secret-key'
app.config['SESSION_TYPE'] = 'filesystem'
app.config['SESSION_PERMANENT'] = True
app.config['PERMANENT_SESSION_LIFETIME'] = 86400
app.config['SESSION_FILE_DIR'] = os.path.join(
    os.path.dirname(os.path.abspath(__file__)), 'flask_session')
os.makedirs(app.config['SESSION_FILE_DIR'], exist_ok=True)

sess = Session(app)
login_manager = LoginManager()
login_manager.init_app(app)
login_manager.login_view = 'login'
login_manager.login_message = 'Please log in to access this page.'
login_manager.login_message_category = 'error'

@login_manager.user_loader
def load_user(user_id):
    user_data = get_user_by_id(user_id)
    return User(user_data) if user_data else None

socketio = SocketIO(
    app,
    cors_allowed_origins="*",
    logger=True,
    engineio_logger=True,
    async_mode='threading',
    manage_session=False
)

# ------------------------------------------------------------------
# Global YouTube client
# ------------------------------------------------------------------
aiotube_client = get_aiotube_client()
# ------------------------------------------------------------------
# UserSessionManager  (replaces the old one)
# ------------------------------------------------------------------
class UserSessionManager:
    """Stable per-user (or per-anonymous) managers keyed by a deterministic id."""
    def __init__(self):
        self.download_managers: dict[str, DownloadManager] = {}
        self.stems_extractors: dict[str, StemsExtractor] = {}

    # ---------- internal helper ----------
    def _key(self) -> str:
        """Return stable key: 'user_<id>' or consistent anonymous key."""
        from flask import has_request_context
        if has_request_context():
            if current_user.is_authenticated:
                return f"user_{current_user.id}"
            # anonymous – keep same UUID across refresh
            if 'anon_key' not in session:
                session['anon_key'] = str(uuid.uuid4())
            return session['anon_key']
        # background thread (no request context) – dummy fallback
        return "background_fallback"

    # ---------- download manager ----------
    def get_download_manager(self) -> DownloadManager:
        key = self._key()
        if key not in self.download_managers:
            dm = DownloadManager()
            # Capture the room key for background callbacks
            room_key = key
            user_id = current_user.id if current_user and current_user.is_authenticated else None
            dm.on_download_progress = lambda item_id, progress, speed=None, eta=None: self._emit_progress_with_room(item_id, progress, speed, eta, room_key)
            dm.on_download_complete = lambda item_id, title=None, file_path=None: self._emit_complete_with_room(item_id, title, file_path, room_key, user_id)
            dm.on_download_error   = lambda item_id, error: self._emit_error_with_room(item_id, error, room_key)
            self.download_managers[key] = dm
        return self.download_managers[key]

    # ---------- stems extractor ----------
    def get_stems_extractor(self) -> StemsExtractor:
        key = self._key()
        if key not in self.stems_extractors:
            se = StemsExtractor()
            # Capture the room key for background callbacks
            room_key = key
            user_id = current_user.id if current_user and current_user.is_authenticated else None
            se.on_extraction_progress = lambda item_id, progress, status_msg=None: self._emit_extraction_progress_with_room(item_id, progress, status_msg, room_key)
            se.on_extraction_complete = lambda item_id, title=None, video_id=None, item=None: self._emit_extraction_complete_with_room(item_id, title, video_id, room_key, user_id, item)
            se.on_extraction_error   = lambda item_id, error: self._emit_extraction_error_with_room(item_id, error, room_key)
            self.stems_extractors[key] = se
        return self.stems_extractors[key]

    # ---------- safe emitters with room keys ----------
    def _emit_progress_with_room(self, item_id, progress, speed_or_msg=None, eta=None, room_key=None):
        socketio.emit('download_progress', {
            'download_id': item_id,
            'progress': progress,
            'speed': speed_or_msg,
            'eta': eta
        }, room=room_key or self._key())

    def _emit_extraction_progress_with_room(self, item_id, progress, status_msg=None, room_key=None):
        socketio.emit('extraction_progress', {
            'extraction_id': item_id,
            'progress': progress,
            'status': status_msg or "Extracting stems..."
        }, room=room_key or self._key())

    def _emit_complete_with_room(self, item_id, title=None, file_path=None, room_key=None, user_id=None):
        if title:  # download finished
            video_id = None
            download_item = None
            
            # Get video_id directly from download manager - this is the reliable source!
            if user_id:
                dm = self.get_download_manager()
                
                # Find the download item in the manager
                for status in ['active', 'completed', 'failed']:
                    for item in dm.get_all_downloads().get(status, []):
                        if item.download_id == item_id:
                            download_item = item
                            video_id = item.video_id  # Use the original video_id directly!
                            break
                    if download_item:
                        break
            
            # Fallback only if we couldn't find the item (shouldn't happen)
            if not video_id:
                print(f"[WARNING] Could not find video_id for download {item_id}, using fallback extraction")
                if '_' in item_id:
                    parts = item_id.split('_')
                    video_id = '_'.join(parts[:-1])
                else:
                    video_id = item_id
                
            print(f"[DEBUG] Download completion: item_id={item_id}, found_in_manager={download_item is not None}, video_id={video_id}")
            
            # persist to database first to get global_download_id
            global_download_id = None
            if user_id and download_item:
                # Get file size if possible
                file_size = 0
                if file_path and os.path.exists(file_path):
                    try:
                        file_size = os.path.getsize(file_path)
                    except:
                        file_size = 0
                
                # Use download_item metadata for database persistence
                global_download_id = db_add_download(user_id, {
                    "video_id": download_item.video_id,
                    "title": download_item.title,
                    "thumbnail_url": download_item.thumbnail_url or "",
                    "file_path": file_path,
                    "download_type": download_item.download_type.value,
                    "quality": download_item.quality,
                    "file_size": file_size
                })
            elif user_id:
                # Fallback if download item not found (shouldn't happen normally)
                file_size = 0
                if file_path and os.path.exists(file_path):
                    try:
                        file_size = os.path.getsize(file_path)
                    except:
                        file_size = 0
                        
                # Extract video_id properly from item_id (remove only the timestamp)
                if '_' in item_id:
                    parts = item_id.split('_')
                    fallback_video_id = '_'.join(parts[:-1])  # Remove only timestamp
                else:
                    fallback_video_id = item_id
                    
                print(f"[DEBUG] Fallback db save: item_id={item_id}, extracted video_id={fallback_video_id}")
                
                global_download_id = db_add_download(user_id, {
                    "video_id": fallback_video_id,
                    "title": title,
                    "thumbnail_url": "",
                    "file_path": file_path,
                    "download_type": "audio",
                    "quality": "best",
                    "file_size": file_size
                })
            
            # Emit WebSocket event with global_download_id included
            socketio.emit('download_complete', {
                'download_id': item_id, 
                'title': title, 
                'file_path': file_path,
                'video_id': video_id,  # Add video_id for extraction deduplication
                'global_download_id': global_download_id  # Add for remove functionality
            }, room=room_key or self._key())

    def _emit_error_with_room(self, item_id, error, room_key=None):
        socketio.emit('download_error', {'download_id': item_id, 'error_message': error}, room=room_key or self._key())
    
    def _emit_extraction_error_with_room(self, item_id, error, room_key=None):
        print(f"[CALLBACK DEBUG] Extraction error: item_id={item_id}, error={error}")
        socketio.emit('extraction_error', {'extraction_id': item_id, 'error_message': error}, room=room_key or self._key())
        
        # Clear the extracting flag for failed extractions
        se = self.get_stems_extractor()
        extraction = se.get_extraction_status(item_id)
        if extraction and extraction.video_id:
            print(f"[CALLBACK DEBUG] Clearing extracting flag for failed extraction: video_id={extraction.video_id}")
            try:
                db_clear_extraction_in_progress(extraction.video_id)
                print(f"[CALLBACK DEBUG] Successfully cleared extracting flag")
            except Exception as db_error:
                print(f"[CALLBACK DEBUG] Error clearing extracting flag: {db_error}")

    def _emit_extraction_complete_with_room(self, item_id, title=None, video_id=None, room_key=None, user_id=None, item=None):
        """Handle extraction completion - always emits extraction_complete event."""
        print(f"[CALLBACK DEBUG] Extraction finished: item_id={item_id}, title={title}, video_id={video_id}, user_id={user_id}")
        
        # Send to the specific user who initiated the extraction
        socketio.emit('extraction_complete', {
            'extraction_id': item_id,
            'video_id': video_id,
            'title': title
        }, room=room_key or self._key())
        
        # BROADCAST to ALL connected clients (no room restriction)
        print(f"[CALLBACK DEBUG] Broadcasting extraction completion to ALL connected clients")
        try:
            # Use broadcast=True to send to ALL connected clients regardless of rooms
            socketio.emit('extraction_completed_global', {
                'extraction_id': item_id,
                'video_id': video_id,
                'title': title
            }, broadcast=True)
            print(f"[CALLBACK DEBUG] Global broadcast sent with broadcast=True")
        except Exception as e:
            print(f"[CALLBACK DEBUG] Error sending global broadcast: {e}")
            
        # Alternative approach: try sending without any room parameter
        try:
            socketio.emit('extraction_refresh_needed', {
                'extraction_id': item_id,
                'video_id': video_id,
                'title': title,
                'message': 'New extraction available - please refresh'
            })
            print(f"[CALLBACK DEBUG] Alternative global event sent")
        except Exception as e:
            print(f"[CALLBACK DEBUG] Error sending alternative event: {e}")
        
        # Persist completed extraction to downloads database
        if user_id and video_id and item:
            print(f"[CALLBACK DEBUG] User ID: {user_id}, Video ID: {video_id}")
            print(f"[CALLBACK DEBUG] Extraction details: status={item.status.value}, video_id='{item.video_id}', model={item.model_name}")
            print(f"[CALLBACK DEBUG] Stems paths: {item.output_paths}")
            print(f"[CALLBACK DEBUG] Zip path: {item.zip_path}")
            
            # Now we have direct access to the extraction item data
            if item and item.video_id:
                print(f"[CALLBACK DEBUG] Persisting extraction to database...")
                try:
                    # Mark the global download as extracted
                    db_mark_extraction_complete(item.video_id, {
                        "model_name": item.model_name,
                        "stems_paths": item.output_paths or {},
                        "zip_path": item.zip_path or ""
                    })
                    print(f"[CALLBACK DEBUG] Global download marked as extracted")
                    
                    # Ensure transaction is committed by using a fresh connection
                    
                    # Give user access to the extraction
                    global_download = db_find_global_extraction(item.video_id, item.model_name)
                    if global_download:
                        db_add_user_extraction_access(user_id, global_download)
                        print(f"[CALLBACK DEBUG] User access granted to extraction")
                        
                        # Verify the database update was successful
                        user_extractions = db_list_extractions(user_id)
                        print(f"[CALLBACK DEBUG] User now has {len(user_extractions)} extractions in database")
                    else:
                        print(f"[CALLBACK DEBUG] ERROR: Could not find global extraction after marking complete")
                except Exception as e:
                    print(f"[CALLBACK DEBUG] ERROR: Failed to persist extraction to database: {e}")
                    import traceback
                    traceback.print_exc()
        else:
            print(f"[CALLBACK DEBUG] Missing user_id, video_id, or item data")

    # ---------- legacy emitters (kept for compatibility) ----------
    def _emit_progress(self, item_id, progress, speed_or_msg=None, eta=None):
        self._emit_progress_with_room(item_id, progress, speed_or_msg, eta, self._key())

    def _emit_complete(self, item_id, title=None, file_path=None):
        user_id = current_user.id if current_user and current_user.is_authenticated else None
        self._emit_complete_with_room(item_id, title, file_path, self._key(), user_id)

    def _emit_error(self, item_id, error):
        self._emit_error_with_room(item_id, error, self._key())
# Instantiate global manager
user_session_manager = UserSessionManager()

# ------------------------------------------------------------------
# WebSocket helpers
# ------------------------------------------------------------------
@socketio.on('connect')
def handle_connect():
    if not current_user.is_authenticated:
        emit('auth_error', {'redirect': url_for('login')})
        return False
    room = user_session_manager._key()
    join_room(room)
    emit('connection_established', {'session_key': room})

@socketio.on('disconnect')
def handle_disconnect():
    leave_room(user_session_manager._key())


# ------------------------------------------------------------------
# Decorators (must appear BEFORE any route uses them)
# ------------------------------------------------------------------
def admin_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if not current_user.is_authenticated or not current_user.is_admin:
            flash('You do not have permission to access this page.', 'error')
            return redirect(url_for('index'))
        return f(*args, **kwargs)
    return decorated_function

def api_login_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if not current_user.is_authenticated:
            return jsonify({
                'error': 'Unauthorized',
                'message': 'Authentication required',
                'redirect': url_for('login')
            }), 401
        return f(*args, **kwargs)
    return decorated_function

# ------------------------------------------------------------------
# Routes
# ------------------------------------------------------------------
@app.route('/')
@login_required
def index():
    return render_template('index.html', current_username=current_user.username, current_user=current_user)

@app.route('/login', methods=['GET', 'POST'])
def login():
    if current_user.is_authenticated:
        return redirect(url_for('index'))
    error = None
    if request.method == 'POST':
        username = request.form.get('username')
        password = request.form.get('password')
        remember = 'remember' in request.form
        if not username or not password:
            error = 'Username and password are required.'
        else:
            user_data = authenticate_user(username, password)
            if user_data:
                login_user(User(user_data), remember=remember)
                next_page = request.args.get('next') or url_for('index')
                if not next_page.startswith('/'):
                    next_page = url_for('index')
                return redirect(next_page)
            else:
                error = 'Invalid username or password.'
    return render_template('login.html', error=error, current_year=datetime.now().year)

@app.route('/logout')
@login_required
def logout():
    logout_user()
    flash('You have been logged out.', 'info')
    return redirect(url_for('login'))

@app.route('/admin')
@login_required
@admin_required
def admin():
    return render_template('admin.html', users=get_all_users())

@app.route('/admin/embedded')
@login_required
@admin_required
def admin_embedded():
    """Embedded admin interface for iframe usage."""
    return render_template('admin_embedded.html', users=get_all_users())

@app.route('/admin/add_user', methods=['POST'])
@login_required
@admin_required
def admin_add_user():
    username = request.form.get('username', '').strip()
    password = request.form.get('password', '').strip()
    email = request.form.get('email', '').strip() or None
    is_admin = 'is_admin' in request.form
    
    if not username or not password:
        flash('Username and password are required', 'error')
        return redirect(url_for('admin'))
    
    success, message = add_user(username, password, email, is_admin)
    flash(message, 'success' if success else 'error')
    return redirect(url_for('admin'))

@app.route('/admin/edit_user', methods=['POST'])
@login_required
@admin_required
def admin_edit_user():
    user_id = request.form.get('user_id')
    username = request.form.get('username', '').strip()
    email = request.form.get('email', '').strip() or None
    is_admin = 'is_admin' in request.form
    
    if not user_id or not username:
        flash('User ID and username are required', 'error')
        return redirect(url_for('admin'))
    
    success, message = update_user(user_id, username=username, email=email, is_admin=is_admin)
    flash(message, 'success' if success else 'error')
    return redirect(url_for('admin'))

@app.route('/admin/reset_password', methods=['POST'])
@login_required
@admin_required
def admin_reset_password():
    user_id = request.form.get('user_id')
    password = request.form.get('password', '').strip()
    
    if not user_id or not password:
        flash('User ID and password are required', 'error')
        return redirect(url_for('admin'))
    
    success, message = reset_user_password(user_id, password)
    flash(message, 'success' if success else 'error')
    return redirect(url_for('admin'))

@app.route('/admin/delete_user', methods=['POST'])
@login_required
@admin_required
def admin_delete_user():
    user_id = request.form.get('user_id')
    
    if not user_id:
        flash('User ID is required', 'error')
        return redirect(url_for('admin'))
    
    # Don't allow users to delete themselves
    if str(current_user.id) == str(user_id):
        flash('You cannot delete your own account', 'error')
        return redirect(url_for('admin'))
    
    success, message = delete_user(user_id)
    flash(message, 'success' if success else 'error')
    return redirect(url_for('admin'))

@app.route('/mixer')
@login_required
def mixer():
    extraction_id = request.args.get('extraction_id', '')
    
    # Try to get extraction info to provide to the mixer
    extraction_info = None
    se = user_session_manager.get_stems_extractor()
    extraction = se.get_extraction_status(extraction_id)
    
    if extraction:
        extraction_info = {
            'extraction_id': extraction.extraction_id,
            'status': extraction.status.value,
            'output_paths': extraction.output_paths or {},
            'audio_path': extraction.audio_path
        }
    
    return render_template('mixer.html', extraction_id=extraction_id, extraction_info=extraction_info)


# ------------------------------------------------------------------
# API routes
# ------------------------------------------------------------------
@app.route('/api/search', methods=['GET'])
@api_login_required
def search_videos():
    query = request.args.get('query', '')
    max_results = int(request.args.get('max_results', 10))
    print(f"[API] Search request: query='{query}', max_results={max_results}")
    if not query:
        return jsonify({'error': 'No query provided'}), 400
    try:
        response = aiotube_client.search_videos(query, max_results=max_results)
        print(f"[API] Returning {len(response.get('items', []))} results")
        return jsonify(response)
    except Exception as e:
        print(f"[API] Search error: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/video/<video_id>', methods=['GET'])
@api_login_required
def get_video_info(video_id):
    info = aiotube_client.get_video_info(video_id)
    return jsonify(info) if info else (jsonify({'error': 'Video not found'}), 404)

# Downloads ---------------------------------------------------------
@app.route('/api/downloads', methods=['GET'])
@api_login_required
def get_all_downloads():
    """
    Returns:
        - live downloads from the current user manager
        - historical downloads from DB (completed only)
    """
    try:
        dm = user_session_manager.get_download_manager()
        
        # Get live downloads from current session
        live = []
        live_video_ids = set()  # Track video IDs in live session
        
        for status in ['active', 'queued', 'completed', 'failed']:
            for item in dm.get_all_downloads().get(status, []):
                live.append({
                    'download_id': item.download_id,
                    'video_id': item.video_id,
                    'title': item.title,
                    'thumbnail_url': item.thumbnail_url,
                    'type': item.download_type.value,
                    'quality': item.quality,
                    'status': item.status.value,
                    'progress': item.progress,
                    'speed': item.speed,
                    'eta': item.eta,
                    'file_path': item.file_path,
                    'error_message': item.error_message,
                    'created_at': item.download_id.split('_')[1] if '_' in item.download_id else str(int(time.time()))  # Extract timestamp from download_id
                })
                live_video_ids.add(item.video_id)
        
        # Get historical downloads from database (excluding those in live session)
        history_raw = db_list_downloads(current_user.id)
        history = []
        
        for db_item in history_raw:
            # Skip if this video is already in the live session
            if db_item['video_id'] in live_video_ids:
                continue

            # Skip if download was removed (file_path is NULL but extraction might remain)
            if not db_item['file_path']:
                continue
                
            # Map database fields to frontend format
            history.append({
                'download_id': db_item['id'],  # Use database ID as download_id for historical items
                'global_download_id': db_item['global_download_id'],  # Add global_download_id for remove functionality
                'video_id': db_item['video_id'],
                'title': db_item['title'],
                'thumbnail_url': db_item['thumbnail'],  # Map thumbnail -> thumbnail_url
                'type': db_item['media_type'],  # Map media_type -> type
                'quality': db_item['quality'],
                'status': 'completed',  # Database items are always completed
                'progress': 100.0,  # Completed items have 100% progress
                'speed': '',  # No speed for completed items
                'eta': '',  # No ETA for completed items
                'file_path': db_item['file_path'],
                'error_message': '',  # No error for completed items
                'created_at': db_item['created_at']  # Include creation time
            })

        return jsonify(live + history)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/downloads/<download_id>', methods=['GET'])
@api_login_required
def get_download_status(download_id):
    item = user_session_manager.get_download_manager().get_download_status(download_id)
    if not item:
        return jsonify({'error': 'Download not found'}), 404
    return jsonify({
        'download_id': item.download_id,
        'video_id': item.video_id,
        'title': item.title,
        'thumbnail_url': item.thumbnail_url,
        'type': item.download_type.value,
        'quality': item.quality,
        'status': item.status.value,
        'progress': item.progress,
        'speed': item.speed,
        'eta': item.eta,
        'file_path': item.file_path,
        'error_message': item.error_message
    })

@app.route('/api/downloads/<video_id>/extraction-status', methods=['GET'])
@api_login_required
def check_video_extraction_status(video_id):
    """Check extraction status for a video_id."""
    try:
        # Default model (can be made configurable later)
        model_name = 'htdemucs'
        
        # Check if extraction exists globally
        global_extraction = db_find_global_extraction(video_id, model_name)
        
        if not global_extraction:
            return jsonify({
                'exists': False,
                'user_has_access': False,
                'status': 'not_extracted'
            })
        
        # Check if current user has access to this extraction
        user_extractions = db_list_extractions(current_user.id)
        user_has_access = any(
            ext['video_id'] == video_id and ext.get('extracted') == 1 
            for ext in user_extractions
        )
        
        return jsonify({
            'exists': True,
            'user_has_access': user_has_access,
            'status': 'extracted' if user_has_access else 'extracted_no_access',
            'extraction_model': global_extraction.get('extraction_model'),
            'extracted_at': global_extraction.get('extracted_at')
        })
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/downloads', methods=['POST'])
@api_login_required
def add_download():
    data = request.json or {}
    required = ['video_id', 'title', 'thumbnail_url', 'download_type', 'quality']
    if any(f not in data for f in required):
        return jsonify({'error': 'Missing required fields'}), 400

    try:
        video_id = data['video_id']
        
        # DEBUG: Log the received video_id
        print(f"[API DEBUG] Received video_id: '{video_id}' (length: {len(video_id)})")
        print(f"[API DEBUG] Request data: {data}")
        
        # VALIDATE VIDEO ID
        if not is_valid_youtube_video_id(video_id):
            error_msg = f'Invalid YouTube video ID: "{video_id}" (length: {len(video_id)}). YouTube video IDs must be exactly 11 characters long.'
            print(f"[API DEBUG] REJECTED: {error_msg}")
            return jsonify({'error': error_msg}), 400
        
        download_type = DownloadType.AUDIO if str(data['download_type']).lower() == 'audio' else DownloadType.VIDEO
        quality = data['quality']
        
        # First check if this video exists globally (any user has downloaded it)
        global_download = db_find_global_download(video_id, download_type.value, quality)
        if global_download:
            # File already exists globally - give this user access to it
            db_add_user_access(current_user.id, global_download)
            
            # Also check if there are any extractions for this video and give user access
            try:
                # Check if the global download has an extraction (using new unified system)
                if global_download.get('extracted') == 1 and global_download.get('extraction_model'):
                    # Grant user access to the existing extraction
                    db_add_user_extraction_access(current_user.id, global_download)
                    print(f"Granted user {current_user.id} access to extraction with model {global_download['extraction_model']}")
                    
            except Exception as e:
                print(f"Warning: Could not grant extraction access: {e}")
            
            return jsonify({
                'download_id': global_download['id'],
                'message': 'File already downloaded by another user - instant access granted',
                'existing': True,
                'global': True
            })
        
        # Check if this video is already downloaded by this user (fallback check)
        existing_downloads = db_list_downloads(current_user.id)
        for existing in existing_downloads:
            if existing['video_id'] == video_id and existing['media_type'] == download_type.value:
                # Video already exists for this user - return the database ID as download_id
                return jsonify({
                    'download_id': existing['id'],
                    'message': 'Video already downloaded by you',
                    'existing': True,
                    'global': False
                })
        
        # Also check current session downloads
        dm = user_session_manager.get_download_manager()
        all_downloads = dm.get_all_downloads()
        for status_list in all_downloads.values():
            for item in status_list:
                if item.video_id == video_id and item.download_type == download_type:
                    # Already in current session
                    return jsonify({
                        'download_id': item.download_id,
                        'message': 'Download already in progress or completed',
                        'existing': True
                    })
        
        # No existing download found - proceed with new download
        item = DownloadItem(
            video_id=video_id,
            title=data['title'],
            thumbnail_url=data['thumbnail_url'],
            download_type=download_type,
            quality=data['quality']
        )
        dl_id = dm.add_download(item)
        return jsonify({'download_id': dl_id, 'existing': False})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/downloads/<download_id>', methods=['DELETE'])
@api_login_required
def cancel_download(download_id):
    ok = user_session_manager.get_download_manager().cancel_download(download_id)
    return jsonify({'success': ok})

@app.route('/api/downloads/<download_id>/retry', methods=['POST'])
@api_login_required
def retry_download(download_id):
    try:
        dm = user_session_manager.get_download_manager()
        download = dm.get_download_status(download_id)
        
        if not download:
            return jsonify({'error': 'Download not found'}), 404
        
        if download.status.value not in ['failed', 'cancelled', 'error']:
            return jsonify({'error': 'Can only retry failed or cancelled downloads'}), 400
        
        # Reset download status and re-add to queue
        download.status = DownloadStatus.QUEUED
        download.progress = 0.0
        download.speed = ""
        download.eta = ""
        download.error_message = ""
        download.file_path = ""
        
        # Reset cancel event
        if download.cancel_event:
            download.cancel_event.clear()
        
        # Move from failed to queued
        dm.failed_downloads.pop(download_id, None)
        dm.queued_downloads[download_id] = download
        
        # Re-add to the download queue so the worker picks it up
        dm.download_queue.put(download)
        
        return jsonify({'success': True, 'download_id': download_id})
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/downloads/<download_id>/delete', methods=['DELETE'])
@api_login_required
def delete_download(download_id):
    try:
        dm = user_session_manager.get_download_manager()
        
        # Remove from all possible locations
        removed = False
        if download_id in dm.queued_downloads:
            del dm.queued_downloads[download_id]
            removed = True
        if download_id in dm.active_downloads:
            del dm.active_downloads[download_id]
            removed = True
        if download_id in dm.failed_downloads:
            del dm.failed_downloads[download_id]
            removed = True
        if download_id in dm.completed_downloads:
            del dm.completed_downloads[download_id]
            removed = True
        
        # Also remove from database if user is authenticated
        db_removed = False
        if current_user and current_user.is_authenticated:
            try:
                # Handle both live downloads (download_id format) and database downloads (id format)
                if download_id.isdigit():
                    # This is a database ID, find the video_id from database first
                    import sqlite3
                    from pathlib import Path
                    DB_PATH = Path("stemtubes.db")
                    conn = sqlite3.connect(DB_PATH)
                    cursor = conn.cursor()
                    cursor.execute('SELECT video_id FROM user_downloads WHERE user_id = ? AND id = ?', 
                                  (current_user.id, download_id))
                    result = cursor.fetchone()
                    if result:
                        video_id = result[0]
                        db_delete_download(current_user.id, video_id)
                        db_removed = True
                    conn.close()
                else:
                    # This is a download_id format, extract video_id
                    video_id = download_id.split('_')[0]
                    db_delete_download(current_user.id, video_id)
                    db_removed = True
            except Exception as e:
                print(f"Database delete error: {e}")
                pass  # Ignore database errors
        
        if not removed and not db_removed:
            return jsonify({'error': 'Download not found or cannot be deleted'}), 404
        
        return jsonify({'success': True})
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/downloads/clear-all', methods=['DELETE'])
@api_login_required
def clear_all_downloads():
    try:
        dm = user_session_manager.get_download_manager()
        se = user_session_manager.get_stems_extractor()
        
        # Clear all downloads from in-memory manager
        queued_count = len(dm.queued_downloads)
        active_count = len(dm.active_downloads)
        completed_count = len(dm.completed_downloads)
        failed_count = len(dm.failed_downloads)
        
        dm.queued_downloads.clear()
        dm.active_downloads.clear()
        dm.completed_downloads.clear()
        dm.failed_downloads.clear()
        
        # Clear all extractions from in-memory manager
        extraction_active_count = len(se.active_extractions)
        extraction_completed_count = len(se.completed_extractions)
        extraction_failed_count = len(se.failed_extractions)
        
        se.active_extractions.clear()
        se.completed_extractions.clear()
        se.failed_extractions.clear()
        
        # Clear database for current user
        if current_user and current_user.is_authenticated:
            # Clear downloads from database
            import sqlite3
            from pathlib import Path
            DB_PATH = Path("stemtubes.db")
            conn = sqlite3.connect(DB_PATH)
            cursor = conn.cursor()
            cursor.execute('DELETE FROM user_downloads WHERE user_id = ?', (current_user.id,))
            db_deleted_count = cursor.rowcount
            conn.commit()
            conn.close()
        else:
            db_deleted_count = 0
        
        total_cleared = queued_count + active_count + completed_count + failed_count + extraction_active_count + extraction_completed_count + extraction_failed_count
        
        return jsonify({
            'success': True,
            'cleared': {
                'downloads': {
                    'queued': queued_count,
                    'active': active_count,
                    'completed': completed_count,
                    'failed': failed_count
                },
                'extractions': {
                    'active': extraction_active_count,
                    'completed': extraction_completed_count,
                    'failed': extraction_failed_count
                },
                'database': db_deleted_count,
                'total': total_cleared
            }
        })
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# Extractions -------------------------------------------------------
@app.route('/api/extractions', methods=['GET'])
@api_login_required
def get_all_extractions():
    """
    Returns:
        - live extractions from the current user manager
        - historical extractions from DB (completed only)
    """
    try:
        se = user_session_manager.get_stems_extractor()
        
        # Get live extractions from current session
        live = []
        live_video_model_pairs = set()  # Track (video_id, model_name) pairs in live session
        
        for status in ['active', 'queued', 'completed', 'failed']:
            for item in se.get_all_extractions().get(status, []):
                live.append({
                    'extraction_id': item.extraction_id,
                    'video_id': item.video_id,
                    'title': item.title,
                    'audio_path': item.audio_path,
                    'model_name': item.model_name,
                    'selected_stems': item.selected_stems,
                    'two_stem_mode': item.two_stem_mode,
                    'primary_stem': item.primary_stem,
                    'status': item.status.value,
                    'progress': item.progress,
                    'error_message': item.error_message,
                    'output_paths': item.output_paths,
                    'zip_path': item.zip_path,
                    'created_at': item.extraction_id.split('_')[1] if '_' in item.extraction_id else str(int(time.time()))
                })
                live_video_model_pairs.add((item.video_id, item.model_name))
        
        # Get historical extractions from database (excluding those in live session)
        history_raw = db_list_extractions(current_user.id)
        print(f"[API DEBUG] Found {len(history_raw)} historical extractions for user {current_user.id}")
        for item in history_raw:
            print(f"[API DEBUG] Historical extraction: video_id={item['video_id']}, model={item['extraction_model']}, extracted_at={item['extracted_at']}")
        history = []
        
        for db_item in history_raw:
            # Skip if this extraction is already in the live session
            if (db_item['video_id'], db_item['extraction_model']) in live_video_model_pairs:
                continue
                
            # Parse JSON fields
            import json
            try:
                stems_paths = json.loads(db_item['stems_paths']) if db_item['stems_paths'] else {}
                # Try to infer selected stems from the paths
                selected_stems = list(stems_paths.keys()) if stems_paths else ['vocals', 'drums', 'bass', 'other']
            except:
                selected_stems = ['vocals', 'drums', 'bass', 'other']
                stems_paths = {}
            
            # Map database fields to frontend format
            history.append({
                'extraction_id': f"download_{db_item['id']}",  # Use download ID as extraction_id
                'global_download_id': db_item['global_download_id'],  # Add global_download_id for remove functionality
                'video_id': db_item['video_id'],
                'title': db_item['title'],
                'audio_path': db_item['file_path'],  # Use the download file path as audio path
                'model_name': db_item['extraction_model'],
                'selected_stems': selected_stems,
                'two_stem_mode': False,  # Not stored in DB, assume false
                'primary_stem': 'vocals',  # Not stored in DB, assume vocals
                'status': 'completed',  # Database items are always completed
                'progress': 100.0,  # Completed items have 100% progress
                'error_message': '',  # No error for completed items
                'output_paths': stems_paths,
                'zip_path': db_item['stems_zip_path'],
                'created_at': db_item['extracted_at'] or db_item['created_at']
            })
        
        # Combine live and historical extractions
        all_extractions = live + history
        
        # Sort by creation time (newest first)
        all_extractions.sort(key=lambda x: x['created_at'], reverse=True)
        
        return jsonify(all_extractions)
        
    except Exception as e:
        print(f"Error getting extractions: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/extractions/<extraction_id>', methods=['GET'])
@api_login_required
def get_extraction_status(extraction_id):
    item = user_session_manager.get_stems_extractor().get_extraction_status(extraction_id)
    if not item:
        return jsonify({'error': 'Extraction not found'}), 404
    return jsonify({
        'extraction_id': item.extraction_id,
        'audio_path': item.audio_path,
        'model_name': item.model_name,
        'selected_stems': item.selected_stems,
        'two_stem_mode': item.two_stem_mode,
        'primary_stem': item.primary_stem,
        'status': item.status.value,
        'progress': item.progress,
        'error_message': item.error_message,
        'output_paths': item.output_paths,
        'zip_path': item.zip_path
    })

@app.route('/api/extractions', methods=['POST'])
@api_login_required
def add_extraction():
    data = request.json or {}
    
    # Add retry logic for race conditions
    import time
    import random
    
    max_retries = 3
    base_delay = 0.1  # 100ms
    
    for attempt in range(max_retries + 1):
        try:
            video_id = data.get('video_id')
            model_name = data.get('model_name', 'htdemucs')  # Default model
            grant_access_only = data.get('grant_access_only', False)
            
            print(f"=== EXTRACTION DEBUG START (Attempt {attempt + 1}/{max_retries + 1}) ===")
            print(f"User: {current_user.username} (ID: {current_user.id})")
            print(f"Received data: {data}")
            print(f"Video ID: {video_id}")
            print(f"Model: {model_name}")
            print(f"Grant access only: {grant_access_only}")
            print(f"Audio path: {data.get('audio_path')}")
            
            # Special case: only grant access to existing extraction
            if grant_access_only:
                if not video_id:
                    return jsonify({'error': 'video_id required for grant_access_only'}), 400
                    
                existing_extraction = db_find_global_extraction(video_id, model_name)
                if existing_extraction:
                    print(f"Granting access to existing extraction for user {current_user.id}")
                    db_add_user_extraction_access(current_user.id, existing_extraction)
                    return jsonify({
                        'extraction_id': f"download_{existing_extraction['id']}",
                        'message': f'Access granted to existing extraction',
                        'existing': True
                    })
                else:
                    return jsonify({'error': 'No extraction found for this video'}), 404
            
            # Use atomic check/reserve operation to prevent race conditions
            if video_id:
                print(f"Checking/reserving extraction for video_id='{video_id}', model='{model_name}'")
                existing_extraction, reserved = db_find_or_reserve_extraction(video_id, model_name)
                
                if existing_extraction:
                    print(f"Found existing global extraction! Granting access to user {current_user.id}")
                    # Extraction already exists globally - give user access to it
                    db_add_user_extraction_access(current_user.id, existing_extraction)
                    print(f"=== EXTRACTION DEBUG END (EXISTING GLOBAL) ===")
                    return jsonify({
                        'extraction_id': str(existing_extraction['id']),
                        'message': f'Stems already extracted with {model_name} model',
                        'existing': True
                    })
                elif not reserved:
                    if attempt < max_retries:
                        # Wait with exponential backoff before retrying
                        delay = base_delay * (2 ** attempt) + random.uniform(0, 0.1)
                        print(f"Extraction in progress by another user, retrying in {delay:.2f}s...")
                        time.sleep(delay)
                        continue
                    else:
                        print(f"Extraction already in progress by another user")
                        print(f"=== EXTRACTION DEBUG END (IN PROGRESS) ===")
                        return jsonify({
                            'extraction_id': 'in_progress',
                            'message': f'Extraction with {model_name} model already in progress. Please wait.',
                            'existing': True,
                            'in_progress': True
                        })
                # If reserved=True, we can proceed with new extraction
                print(f"Successfully reserved extraction slot")
            else:
                print("WARNING: No video_id provided - cannot check global deduplication!")
            
            # Since we successfully reserved the extraction slot, we can skip user-specific checks
            # The atomic reservation already handled global deduplication
            break  # Exit retry loop if we get here
            
        except Exception as e:
            if attempt < max_retries:
                delay = base_delay * (2 ** attempt) + random.uniform(0, 0.1)
                print(f"Database error on attempt {attempt + 1}: {e}, retrying in {delay:.2f}s...")
                time.sleep(delay)
                continue
            else:
                print(f"Failed after {max_retries + 1} attempts: {e}")
                return jsonify({'error': str(e)}), 500
    
    try:
        
        # Also check current session extractions
        print(f"Checking current session extractions...")
        se = user_session_manager.get_stems_extractor()
        all_extractions = se.get_all_extractions()
        print(f"Session extractions: {list(all_extractions.keys())}")
        for status_name, status_list in all_extractions.items():
            print(f"  {status_name}: {len(status_list)} items")
            for item in status_list:
                print(f"    - {item.audio_path} with {item.model_name}")
                # Compare based on audio path and model (since we might not have video_id for all)
                if (item.audio_path == data['audio_path'] and 
                    item.model_name == model_name):
                    print(f"Found existing session extraction!")
                    print(f"=== EXTRACTION DEBUG END (EXISTING SESSION) ===")
                    return jsonify({
                        'extraction_id': item.extraction_id,
                        'message': 'Extraction already in progress or completed',
                        'existing': True
                    })
        
        # No existing extraction found - proceed with new extraction
        print(f"No existing extraction found. Starting new extraction...")
        print(f"Creating ExtractionItem with video_id='{video_id}'")
        item = ExtractionItem(
            audio_path=data['audio_path'],
            model_name=model_name,
            output_dir=data.get('output_dir', os.path.join(
                os.path.dirname(data['audio_path']), 'stems')),
            selected_stems=data['selected_stems'],
            two_stem_mode=data.get('two_stem_mode', False),
            primary_stem=data.get('primary_stem', 'vocals'),
            video_id=video_id or "",  # Store video_id for persistence
            title=data.get('title', "")  # Store title for persistence
        )
        ex_id = se.add_extraction(item)
        print(f"New extraction started with ID: {ex_id}")
        
        # Set user extraction in progress (global extraction was already reserved)
        if video_id:
            print(f"Marking user extraction as in progress for user_id={current_user.id}, video_id='{video_id}', model='{model_name}'")
            try:
                db_set_user_extraction_in_progress(current_user.id, video_id, model_name)
                print(f"Successfully marked user extraction as in progress")
            except Exception as db_error:
                print(f"Error marking user extraction as in progress: {db_error}")
        
        print(f"=== EXTRACTION DEBUG END (NEW EXTRACTION) ===")
        return jsonify({'extraction_id': ex_id, 'existing': False})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/extractions/<extraction_id>', methods=['DELETE'])
@api_login_required
def cancel_extraction(extraction_id):
    ok = user_session_manager.get_stems_extractor().cancel_extraction(extraction_id)
    return jsonify({'success': ok})

@app.route('/api/extractions/<extraction_id>/retry', methods=['POST'])
@api_login_required
def retry_extraction(extraction_id):
    try:
        print(f"[DEBUG] Retry extraction requested for: {extraction_id}")
        se = user_session_manager.get_stems_extractor()
        
        # Debug: print current state
        print(f"[DEBUG] Active extractions: {list(se.active_extractions.keys())}")
        print(f"[DEBUG] Failed extractions: {list(se.failed_extractions.keys())}")
        print(f"[DEBUG] Completed extractions: {list(se.completed_extractions.keys())}")
        
        extraction = se.get_extraction_status(extraction_id)
        
        if not extraction:
            print(f"[DEBUG] Extraction not found: {extraction_id}")
            return jsonify({'error': 'Extraction not found'}), 404
        
        if extraction.status.value not in ['failed', 'cancelled']:
            return jsonify({'error': 'Can only retry failed or cancelled extractions'}), 400
        
        # Handle the case where a cancelled extraction might still be in active_extractions
        if extraction_id in se.active_extractions and extraction.status.value == 'cancelled':
            # Move it to failed_extractions first
            del se.active_extractions[extraction_id]
            se.failed_extractions[extraction_id] = extraction
        
        # Reset extraction status and re-add to queue
        extraction.status = ExtractionStatus.QUEUED
        extraction.progress = 0.0
        extraction.error_message = ""
        extraction.output_paths = {}
        extraction.zip_path = None
        
        # Move from failed to queued
        se.failed_extractions.pop(extraction_id, None)
        se.queued_extractions[extraction_id] = extraction
        se.extraction_queue.put(extraction)
        
        return jsonify({'success': True, 'extraction_id': extraction_id})
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/extractions/<extraction_id>/delete', methods=['DELETE'])
@api_login_required
def delete_extraction(extraction_id):
    try:
        print(f"[DEBUG] Delete extraction requested for: {extraction_id}")
        se = user_session_manager.get_stems_extractor()
        
        # Debug: print current state
        print(f"[DEBUG] Active extractions: {list(se.active_extractions.keys())}")
        print(f"[DEBUG] Failed extractions: {list(se.failed_extractions.keys())}")
        print(f"[DEBUG] Completed extractions: {list(se.completed_extractions.keys())}")
        print(f"[DEBUG] Queued extractions: {list(se.queued_extractions.keys())}")
        
        # Remove from all possible locations
        removed = False
        if extraction_id in se.failed_extractions:
            del se.failed_extractions[extraction_id]
            removed = True
        if extraction_id in se.completed_extractions:
            del se.completed_extractions[extraction_id]
            removed = True
        if extraction_id in se.active_extractions:
            del se.active_extractions[extraction_id]
            removed = True
        if extraction_id in se.queued_extractions:
            del se.queued_extractions[extraction_id]
            removed = True
        
        if not removed:
            return jsonify({'error': 'Extraction not found or cannot be deleted'}), 404
        
        return jsonify({'success': True})
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/extractions/<extraction_id>/create-zip', methods=['POST'])
@api_login_required
def create_zip_for_extraction(extraction_id):
    try:
        se = user_session_manager.get_stems_extractor()
        extraction = se.get_extraction_status(extraction_id)
        
        if not extraction and extraction_id:
            # Try to find stem files by searching the downloads directory
            downloads_dir = ensure_valid_downloads_directory()
            
            for item in os.listdir(downloads_dir):
                item_path = os.path.join(downloads_dir, item)
                if os.path.isdir(item_path):
                    stems_dir = os.path.join(item_path, 'stems')
                    if os.path.exists(stems_dir):
                        # Found a stems directory, try to create ZIP
                        try:
                            import zipfile
                            import tempfile
                            
                            # Create ZIP file path
                            zip_filename = f"{item}_stems.zip"
                            zip_path = os.path.join(stems_dir, zip_filename)
                            
                            # Create ZIP file
                            with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zipf:
                                for stem_file in os.listdir(stems_dir):
                                    if stem_file.endswith('.mp3'):
                                        file_path = os.path.join(stems_dir, stem_file)
                                        zipf.write(file_path, stem_file)
                            
                            if os.path.exists(zip_path):
                                return jsonify({'success': True, 'zip_path': zip_path})
                                
                        except Exception as zip_error:
                            print(f"Error creating ZIP: {zip_error}")
                            continue
            
            return jsonify({'error': 'Extraction not found or no stems available', 'success': False}), 404
        
        if not extraction:
            return jsonify({'error': 'Extraction not found', 'success': False}), 404
        
        if extraction.status.value != 'completed':
            return jsonify({'error': 'Extraction not completed', 'success': False}), 400
        
        if not extraction.output_paths:
            return jsonify({'error': 'No stem files found', 'success': False}), 404
        
        # Create ZIP file
        try:
            import zipfile
            
            # Create ZIP file path
            base_name = os.path.splitext(os.path.basename(extraction.audio_path))[0]
            zip_path = os.path.join(extraction.output_dir, f"{base_name}_stems.zip")
            
            # Create ZIP file
            with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zipf:
                for stem_name, file_path in extraction.output_paths.items():
                    if os.path.exists(file_path):
                        zipf.write(file_path, os.path.basename(file_path))
            
            # Update extraction with zip path
            extraction.zip_path = zip_path
            
            return jsonify({'success': True, 'zip_path': zip_path})
            
        except Exception as zip_error:
            return jsonify({'error': f'Error creating ZIP: {str(zip_error)}', 'success': False}), 500
        
    except Exception as e:
        return jsonify({'error': str(e), 'success': False}), 500

# ------------------------------------------------------------------
# User View Management API Routes
# ------------------------------------------------------------------

@app.route('/api/user/downloads/<int:download_id>/remove-from-list', methods=['DELETE'])
@api_login_required
def remove_download_from_user_list(download_id):
    """Remove a download from user's personal list (keeps file and global record)."""
    try:
        from core.downloads_db import remove_user_download_access
        success, message = remove_user_download_access(current_user.id, download_id)
        
        if success:
            return jsonify({'success': True, 'message': message})
        else:
            return jsonify({'error': message}), 400
            
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/user/extractions/<int:download_id>/remove-from-list', methods=['DELETE'])
@api_login_required  
def remove_extraction_from_user_list(download_id):
    """Remove an extraction from user's personal list (keeps extraction and global record)."""
    try:
        from core.downloads_db import remove_user_extraction_access
        success, message = remove_user_extraction_access(current_user.id, download_id)
        
        if success:
            return jsonify({'success': True, 'message': message})
        else:
            return jsonify({'error': message}), 400
            
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/user/downloads/bulk-remove-from-list', methods=['POST'])
@api_login_required
def bulk_remove_downloads_from_user_list():
    """Remove multiple downloads from user's personal list."""
    try:
        data = request.json
        download_ids = data.get('download_ids', [])
        
        if not download_ids:
            return jsonify({'error': 'No download IDs provided'}), 400
        
        from core.downloads_db import remove_user_download_access
        
        results = []
        successful_removals = 0
        
        for download_id in download_ids:
            try:
                success, message = remove_user_download_access(current_user.id, download_id)
                if success:
                    successful_removals += 1
                results.append({
                    'download_id': download_id,
                    'success': success,
                    'message': message
                })
            except Exception as e:
                results.append({
                    'download_id': download_id,
                    'success': False,
                    'message': f'Error: {str(e)}'
                })
        
        return jsonify({
            'success': True,
            'removed_count': successful_removals,
            'total_count': len(download_ids),
            'results': results
        })
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/user/extractions/bulk-remove-from-list', methods=['POST'])
@api_login_required
def bulk_remove_extractions_from_user_list():
    """Remove multiple extractions from user's personal list."""
    try:
        data = request.json
        download_ids = data.get('download_ids', [])  # Note: using download_id for extractions too
        
        if not download_ids:
            return jsonify({'error': 'No download IDs provided'}), 400
        
        from core.downloads_db import remove_user_extraction_access
        
        results = []
        successful_removals = 0
        
        for download_id in download_ids:
            try:
                success, message = remove_user_extraction_access(current_user.id, download_id)
                if success:
                    successful_removals += 1
                results.append({
                    'download_id': download_id,
                    'success': success,
                    'message': message
                })
            except Exception as e:
                results.append({
                    'download_id': download_id,
                    'success': False,
                    'message': f'Error: {str(e)}'
                })
        
        return jsonify({
            'success': True,
            'removed_count': successful_removals,
            'total_count': len(download_ids),
            'results': results
        })
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# ------------------------------------------------------------------
# Admin Cleanup API Routes
# ------------------------------------------------------------------

@app.route('/api/admin/cleanup/downloads', methods=['GET'])
@api_login_required
def admin_get_all_downloads():
    """Get all downloads across all users for admin cleanup interface."""
    if not current_user.is_admin:
        return jsonify({'error': 'Admin access required'}), 403
        
    try:
        from core.downloads_db import get_all_downloads_for_admin
        downloads = get_all_downloads_for_admin()
        # Return downloads directly as an array for easier frontend handling
        return jsonify(downloads)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/admin/cleanup/storage-stats', methods=['GET'])
@api_login_required  
def admin_get_storage_stats():
    """Get storage usage statistics for admin dashboard."""
    if not current_user.is_admin:
        return jsonify({'error': 'Admin access required'}), 403
        
    try:
        from core.downloads_db import get_storage_usage_stats
        from core.file_cleanup import get_downloads_directory_usage, format_file_size
        
        db_stats = get_storage_usage_stats()
        fs_stats = get_downloads_directory_usage()
        
        # Format sizes for display
        stats = {
            'database': db_stats,
            'filesystem': {
                'total_size': format_file_size(fs_stats['total_size']),
                'total_size_bytes': fs_stats['total_size'],
                'total_files': fs_stats['total_files'],
                'audio_size': format_file_size(fs_stats['audio_size']),
                'audio_files': fs_stats['audio_files'], 
                'stem_size': format_file_size(fs_stats['stem_size']),
                'stem_files': fs_stats['stem_files'],
                'other_size': format_file_size(fs_stats['other_size']),
                'other_files': fs_stats['other_files']
            }
        }
        
        return jsonify(stats)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/admin/cleanup/downloads/<int:global_download_id>', methods=['DELETE'])
@api_login_required
def admin_delete_download_completely(global_download_id):
    """Delete a download completely including all files and database records."""
    if not current_user.is_admin:
        return jsonify({'error': 'Admin access required'}), 403
        
    try:
        from core.downloads_db import delete_download_completely
        from core.file_cleanup import delete_download_files
        
        # Delete from database first to get download info
        success, message, download_info = delete_download_completely(global_download_id)
        
        if not success:
            return jsonify({'error': message}), 400
        
        file_cleanup_stats = {'files_deleted': [], 'total_size_freed': 0, 'errors': []}
        
        # Delete associated files if we have download info
        if download_info:
            file_success, file_message, file_cleanup_stats = delete_download_files(download_info)
            if not file_success:
                # Log the error but don't fail the entire operation since DB is already updated
                print(f"File cleanup warning: {file_message}")
        
        return jsonify({
            'success': True,
            'message': message,
            'file_cleanup': file_cleanup_stats
        })
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/admin/cleanup/downloads/<int:global_download_id>/reset-extraction', methods=['POST'])
@api_login_required
def admin_reset_extraction_status(global_download_id):
    """Reset extraction status for a download while keeping the download record."""
    if not current_user.is_admin:
        return jsonify({'error': 'Admin access required'}), 403
        
    try:
        from core.downloads_db import reset_extraction_status, get_all_downloads_for_admin
        from core.file_cleanup import delete_extraction_files_only
        
        # Get download info before resetting
        all_downloads = get_all_downloads_for_admin()
        download_info = next((d for d in all_downloads if d['global_id'] == global_download_id), None)
        
        if not download_info:
            return jsonify({'error': 'Download not found'}), 404
        
        # Reset database status
        success, message = reset_extraction_status(global_download_id)
        
        if not success:
            return jsonify({'error': message}), 400
        
        # Delete extraction files
        file_cleanup_stats = {'files_deleted': [], 'total_size_freed': 0, 'errors': []}
        if download_info.get('extracted'):
            file_success, file_message, file_cleanup_stats = delete_extraction_files_only(download_info)
            if not file_success:
                print(f"File cleanup warning: {file_message}")
        
        return jsonify({
            'success': True,
            'message': message,
            'file_cleanup': file_cleanup_stats
        })
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/admin/cleanup/downloads/bulk-delete', methods=['POST'])
@api_login_required
def admin_bulk_delete_downloads():
    """Bulk delete multiple downloads."""
    if not current_user.is_admin:
        return jsonify({'error': 'Admin access required'}), 403
        
    try:
        data = request.json
        download_ids = data.get('download_ids', [])
        
        if not download_ids:
            return jsonify({'error': 'No download IDs provided'}), 400
        
        from core.downloads_db import delete_download_completely, get_all_downloads_for_admin
        from core.file_cleanup import delete_download_files
        
        # Get all downloads info first
        all_downloads = get_all_downloads_for_admin()
        downloads_to_delete = {d['global_id']: d for d in all_downloads if d['global_id'] in download_ids}
        
        results = []
        total_freed = 0
        
        for download_id in download_ids:
            try:
                download_info_dict = downloads_to_delete.get(download_id)
                
                # Delete from database
                success, message, download_info = delete_download_completely(download_id)
                
                file_cleanup_stats = {'files_deleted': [], 'total_size_freed': 0, 'errors': []}
                
                # Delete files using either the retrieved info or the pre-fetched info
                cleanup_info = download_info or download_info_dict
                if cleanup_info:
                    file_success, file_message, file_cleanup_stats = delete_download_files(cleanup_info)
                    total_freed += file_cleanup_stats['total_size_freed']
                
                results.append({
                    'download_id': download_id,
                    'success': success,
                    'message': message,
                    'file_cleanup': file_cleanup_stats
                })
                
            except Exception as e:
                results.append({
                    'download_id': download_id,
                    'success': False,
                    'message': str(e),
                    'file_cleanup': {'files_deleted': [], 'total_size_freed': 0, 'errors': [str(e)]}
                })
        
        successful_deletions = sum(1 for r in results if r['success'])
        
        return jsonify({
            'success': True,
            'deleted_count': successful_deletions,
            'total_count': len(download_ids),
            'total_size_freed': total_freed,
            'results': results
        })
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/admin/cleanup/downloads/bulk-reset', methods=['POST'])
@api_login_required
def admin_bulk_reset_extractions():
    """Bulk reset extraction status for multiple downloads."""
    if not current_user.is_admin:
        return jsonify({'error': 'Admin access required'}), 403
        
    try:
        data = request.json
        download_ids = data.get('download_ids', [])
        
        if not download_ids:
            return jsonify({'error': 'No download IDs provided'}), 400
        
        from core.downloads_db import reset_extraction_status, get_all_downloads_for_admin
        from core.file_cleanup import delete_extraction_files_only
        
        # Get all downloads info first
        all_downloads = get_all_downloads_for_admin()
        downloads_to_reset = {d['global_id']: d for d in all_downloads if d['global_id'] in download_ids}
        
        results = []
        total_freed = 0
        
        for download_id in download_ids:
            try:
                download_info_dict = downloads_to_reset.get(download_id)
                
                # Reset extraction status in database
                success, message, download_info = reset_extraction_status(download_id)
                
                file_cleanup_stats = {'files_deleted': [], 'total_size_freed': 0, 'errors': []}
                
                # Delete extraction files (stems) but keep download files
                cleanup_info = download_info or download_info_dict
                if cleanup_info and cleanup_info.get('extracted'):
                    file_success, file_message, file_cleanup_stats = delete_extraction_files_only(cleanup_info)
                    total_freed += file_cleanup_stats['total_size_freed']
                
                results.append({
                    'download_id': download_id,
                    'success': success,
                    'message': message,
                    'file_cleanup': file_cleanup_stats
                })
                
            except Exception as e:
                results.append({
                    'download_id': download_id,
                    'success': False,
                    'message': f'Error resetting download: {str(e)}',
                    'file_cleanup': {'files_deleted': [], 'total_size_freed': 0, 'errors': [str(e)]}
                })
        
        successful_resets = len([r for r in results if r['success']])
        
        return jsonify({
            'success': True,
            'reset_count': successful_resets,
            'total_count': len(download_ids),
            'total_size_freed': total_freed,
            'results': results
        })
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# ------------------------------------------------------------------
# Remaining API routes unchanged ...
# ------------------------------------------------------------------
@app.route('/api/config', methods=['GET'])
@api_login_required
def get_config():
    se = user_session_manager.get_stems_extractor()
    return jsonify({
        'downloads_directory': ensure_valid_downloads_directory(),
        'max_concurrent_downloads': get_setting('max_concurrent_downloads', 3),
        'preferred_video_quality': get_setting('preferred_video_quality', 'best'),
        'preferred_audio_quality': get_setting('preferred_audio_quality', 'best'),
        'use_gpu_for_extraction': get_setting('use_gpu_for_extraction', True),
        'default_stem_model': get_setting('default_stem_model', 'htdemucs'),
        'ffmpeg_path': get_ffmpeg_path(),
        'ffprobe_path': get_ffprobe_path(),
        'using_gpu': se.using_gpu
    })

@app.route('/api/config', methods=['POST'])
@api_login_required
def update_config():
    data = request.json or {}
    for k, v in data.items():
        update_setting(k, v)
        
        # Apply GPU setting immediately without restart
        if k == 'use_gpu_for_extraction':
            se = user_session_manager.get_stems_extractor()
            se.set_use_gpu(v)
            print(f"GPU setting updated to {v}, using GPU: {se.using_gpu}")
    
    return jsonify({'success': True})

@app.route('/api/config/ffmpeg/check', methods=['GET'])
@api_login_required
def check_ffmpeg():
    return jsonify({'ffmpeg_available': True, 'ffmpeg_path': get_ffmpeg_path()})

@app.route('/api/config/ffmpeg/download', methods=['POST'])
@api_login_required
def download_ffmpeg_route():
    return jsonify({'error': 'Not implemented'}), 501

@app.route('/api/user/disclaimer-status', methods=['GET'])
@api_login_required
def get_disclaimer_status():
    """Check if current user has accepted the disclaimer."""
    from core.auth_db import get_user_disclaimer_status
    
    user_id = current_user.id
    accepted = get_user_disclaimer_status(user_id)
    
    return jsonify({'accepted': accepted})

@app.route('/api/user/accept-disclaimer', methods=['POST'])
@api_login_required
def accept_disclaimer_route():
    """Record that current user has accepted the disclaimer."""
    from core.auth_db import accept_disclaimer
    
    user_id = current_user.id
    success = accept_disclaimer(user_id)
    
    if success:
        return jsonify({'success': True, 'message': 'Disclaimer accepted'})
    else:
        return jsonify({'success': False, 'message': 'Failed to record disclaimer acceptance'}), 500

@app.route('/api/open-folder', methods=['POST'])
@api_login_required
def open_folder_route():
    data = request.json or {}
    folder_path = data.get('folderPath', '')
    
    if not folder_path or not os.path.exists(folder_path):
        return jsonify({'error': 'Invalid folder path'}), 400
    
    try:
        import platform
        import subprocess
        
        system = platform.system()
        if system == "Windows":
            # Open folder in Windows Explorer
            subprocess.run(['explorer', os.path.abspath(folder_path)], check=True)
        elif system == "Darwin":  # macOS
            # Open folder in Finder
            subprocess.run(['open', os.path.abspath(folder_path)], check=True)
        elif system == "Linux":
            # Open folder in default file manager
            subprocess.run(['xdg-open', os.path.abspath(folder_path)], check=True)
        else:
            return jsonify({'error': f'Unsupported operating system: {system}'}), 500
            
        return jsonify({'success': True, 'message': 'Folder opened successfully'})
        
    except subprocess.CalledProcessError as e:
        return jsonify({'error': f'Failed to open folder: {str(e)}'}), 500
    except Exception as e:
        return jsonify({'error': f'Error opening folder: {str(e)}'}), 500

@app.route('/api/download-file', methods=['GET'])
@api_login_required
def download_file_route():
    file_path = request.args.get('file_path', '')
    
    if not file_path:
        return jsonify({'error': 'No file path provided'}), 400
    
    # Security check: ensure the file path is within allowed directories
    abs_file_path = os.path.abspath(file_path)
    downloads_dir = os.path.abspath(ensure_valid_downloads_directory())
    
    if not abs_file_path.startswith(downloads_dir):
        return jsonify({'error': 'Access denied: file is outside downloads directory'}), 403
    
    if not os.path.exists(abs_file_path):
        return jsonify({'error': 'File not found'}), 404
    
    if not os.path.isfile(abs_file_path):
        return jsonify({'error': 'Path is not a file'}), 400
    
    try:
        # Get the directory and filename
        directory = os.path.dirname(abs_file_path)
        filename = os.path.basename(abs_file_path)
        
        # Use Flask's send_from_directory for secure file serving
        return send_from_directory(directory, filename, as_attachment=True)
        
    except Exception as e:
        return jsonify({'error': f'Error serving file: {str(e)}'}), 500

@app.route('/api/list-files', methods=['POST'])
@api_login_required
def list_files_route():
    data = request.json or {}
    folder_path = data.get('folder_path', '')
    
    if not folder_path:
        return jsonify({'error': 'No folder path provided', 'success': False}), 400
    
    # Security check: ensure the folder path is within allowed directories
    abs_folder_path = os.path.abspath(folder_path)
    downloads_dir = os.path.abspath(ensure_valid_downloads_directory())
    
    if not abs_folder_path.startswith(downloads_dir):
        return jsonify({'error': 'Access denied: folder is outside downloads directory', 'success': False}), 403
    
    if not os.path.exists(abs_folder_path):
        return jsonify({'error': 'Folder not found', 'success': False}), 404
    
    if not os.path.isdir(abs_folder_path):
        return jsonify({'error': 'Path is not a directory', 'success': False}), 400
    
    try:
        files = []
        for item in os.listdir(abs_folder_path):
            item_path = os.path.join(abs_folder_path, item)
            if os.path.isfile(item_path):
                files.append({
                    'name': item,
                    'path': item_path,
                    'size': os.path.getsize(item_path)
                })
        
        return jsonify({'success': True, 'files': files})
        
    except Exception as e:
        return jsonify({'error': f'Error listing files: {str(e)}', 'success': False}), 500

@app.route('/api/extracted_stems/<extraction_id>/<stem_name>')
@api_login_required
def serve_extracted_stem(extraction_id, stem_name):
    """Serve individual stem files for the mixer."""
    try:
        # First check current session's stems extractor
        se = user_session_manager.get_stems_extractor()
        extraction = se.get_extraction_status(extraction_id)
        
        # If not found in current session, check if it's a database extraction (format: download_ID)
        if not extraction and extraction_id.startswith('download_'):
            try:
                # Extract the download ID from the extraction_id
                download_id = extraction_id.replace('download_', '')
                
                # Get the extraction data from database
                from core.downloads_db import get_download_by_id
                download_data = get_download_by_id(current_user.id, download_id)
                
                if download_data and download_data.get('extracted') and download_data.get('stems_paths'):
                    import json
                    stems_paths = json.loads(download_data['stems_paths'])
                    
                    # Get the requested stem path
                    stem_file_path = stems_paths.get(stem_name)
                    
                    if stem_file_path and os.path.exists(stem_file_path):
                        # Security check: ensure the file path is within allowed directories
                        abs_file_path = os.path.abspath(stem_file_path)
                        downloads_dir = os.path.abspath(ensure_valid_downloads_directory())
                        
                        if abs_file_path.startswith(downloads_dir):
                            directory = os.path.dirname(abs_file_path)
                            filename = os.path.basename(abs_file_path)
                            return send_from_directory(directory, filename, mimetype='audio/mpeg')
                    
                    return jsonify({'error': f'Stem file not found: {stem_name}'}), 404
                
                return jsonify({'error': 'Extraction not found or not completed'}), 404
                
            except Exception as e:
                print(f"Error loading database extraction {extraction_id}: {e}")
                # Fall through to file system search
        
        # If not found in database, try to find the stem file by searching
        if not extraction:
            downloads_dir = ensure_valid_downloads_directory()
            
            # The extraction_id often contains the audio filename and timestamp
            # Try to match by searching for stems directories with matching files
            for item in os.listdir(downloads_dir):
                item_path = os.path.join(downloads_dir, item)
                if os.path.isdir(item_path):
                    stems_dir = os.path.join(item_path, 'stems')
                    if os.path.exists(stems_dir):
                        # Look for the specific stem file
                        stem_file = os.path.join(stems_dir, f'{stem_name}.mp3')
                        if os.path.exists(stem_file):
                            # Additional check: see if this seems to be the right extraction
                            # by checking if the extraction_id partially matches the directory or files
                            audio_dir = os.path.join(item_path, 'audio')
                            if os.path.exists(audio_dir):
                                # Security check first
                                abs_file_path = os.path.abspath(stem_file)
                                abs_downloads_dir = os.path.abspath(downloads_dir)
                                
                                if abs_file_path.startswith(abs_downloads_dir):
                                    directory = os.path.dirname(abs_file_path)
                                    filename = os.path.basename(abs_file_path)
                                    return send_from_directory(directory, filename, mimetype='audio/mpeg')
            
            return jsonify({'error': f'Stem file not found: {stem_name}'}), 404
        
        if extraction.status.value != 'completed':
            return jsonify({'error': 'Extraction not completed'}), 400
        
        # Look for the stem file in the extraction output paths
        stem_file_path = None
        if extraction.output_paths:
            stem_file_path = extraction.output_paths.get(stem_name)
        
        if not stem_file_path or not os.path.exists(stem_file_path):
            return jsonify({'error': f'Stem file not found: {stem_name}'}), 404
        
        # Security check: ensure the file path is within allowed directories
        abs_file_path = os.path.abspath(stem_file_path)
        downloads_dir = os.path.abspath(ensure_valid_downloads_directory())
        
        if not abs_file_path.startswith(downloads_dir):
            return jsonify({'error': 'Access denied: file is outside downloads directory'}), 403
        
        # Get the directory and filename
        directory = os.path.dirname(abs_file_path)
        filename = os.path.basename(abs_file_path)
        
        # Serve the file with appropriate MIME type for audio streaming
        return send_from_directory(directory, filename, mimetype='audio/mpeg')
        
    except Exception as e:
        return jsonify({'error': f'Error serving stem file: {str(e)}'}), 500

# ------------------------------------------------------------------
# Library API Endpoints
# ------------------------------------------------------------------

@app.route('/api/library', methods=['GET'])
@api_login_required
def get_library():
    """Get all global downloads/extractions available to users."""
    try:
        filter_type = request.args.get('filter', 'all')  # 'all', 'downloads', 'extractions'
        search_query = request.args.get('search', '').strip()
        
        # Get all global downloads
        import sqlite3
        from pathlib import Path
        DB_PATH = Path("stemtubes.db")
        
        with sqlite3.connect(DB_PATH) as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            
            # Base query for global downloads with user access information
            base_query = """
                SELECT 
                    gd.*,
                    COUNT(DISTINCT ud.user_id) as user_count,
                    CASE WHEN user_access.user_id IS NOT NULL THEN 1 ELSE 0 END as user_has_access,
                    user_access.file_path as user_file_path,
                    user_access.extracted as user_extracted
                FROM global_downloads gd
                LEFT JOIN user_downloads ud ON gd.id = ud.global_download_id
                LEFT JOIN user_downloads user_access ON gd.id = user_access.global_download_id 
                    AND user_access.user_id = ?
            """
            
            # Add search filter
            where_conditions = []
            params = [current_user.id]
            
            if search_query:
                where_conditions.append("(gd.title LIKE ? OR gd.video_id LIKE ?)")
                search_param = f"%{search_query}%"
                params.extend([search_param, search_param])
            
            # Add filter conditions
            if filter_type == 'downloads':
                where_conditions.append("gd.file_path IS NOT NULL")
            elif filter_type == 'extractions':
                where_conditions.append("gd.extracted = 1")
            
            if where_conditions:
                base_query += " WHERE " + " AND ".join(where_conditions)
            
            base_query += """
                GROUP BY gd.id
                ORDER BY gd.created_at DESC
            """
            
            cursor.execute(base_query, params)
            library_items = cursor.fetchall()
            
            # Format results
            formatted_items = []
            for item in library_items:
                # Determine what's available
                has_download = bool(item['file_path'])
                has_extraction = bool(item['extracted'])
                
                # Determine user's current access
                user_has_download_access = bool(item['user_has_access'] and item['user_file_path'])
                user_has_extraction_access = bool(item['user_has_access'] and item['user_extracted'])
                
                # Calculate file size if available
                file_size = None
                if item['file_path'] and os.path.exists(item['file_path']):
                    try:
                        file_size = os.path.getsize(item['file_path'])
                    except:
                        pass
                
                formatted_item = {
                    'id': item['id'],
                    'video_id': item['video_id'],
                    'title': item['title'],
                    'thumbnail': item['thumbnail'],
                    'media_type': item['media_type'],
                    'quality': item['quality'],
                    'created_at': item['created_at'],
                    'user_count': item['user_count'],
                    'file_size': file_size,
                    
                    # Availability flags
                    'has_download': has_download,
                    'has_extraction': has_extraction,
                    
                    # User access flags
                    'user_has_download_access': user_has_download_access,
                    'user_has_extraction_access': user_has_extraction_access,
                    
                    # Action availability
                    'can_add_download': has_download and not user_has_download_access,
                    'can_add_extraction': has_extraction and not user_has_extraction_access,
                    
                    # Badge type for display
                    'badge_type': 'both' if (has_download and has_extraction) else ('download' if has_download else 'extraction')
                }
                
                formatted_items.append(formatted_item)
            
            return jsonify({
                'success': True,
                'items': formatted_items,
                'total_count': len(formatted_items),
                'filter': filter_type,
                'search': search_query
            })
            
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/library/<int:global_download_id>/add-download', methods=['POST'])
@api_login_required
def add_library_download_to_user(global_download_id):
    """Add a download from library to user's personal downloads list."""
    try:
        # Get the global download record
        import sqlite3
        from pathlib import Path
        DB_PATH = Path("stemtubes.db")
        
        with sqlite3.connect(DB_PATH) as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM global_downloads WHERE id = ?", (global_download_id,))
            global_download = cursor.fetchone()
            
            if not global_download:
                return jsonify({'error': 'Download not found in library'}), 404
            
            # Convert to dict for use with existing functions
            global_download = dict(global_download)
        
        # Check if user already has access to this download
        existing_downloads = db_list_downloads(current_user.id)
        for existing in existing_downloads:
            if existing['global_download_id'] == global_download_id and existing['file_path']:
                return jsonify({'error': 'You already have access to this download'}), 400
        
        # Add user access to the download
        db_add_user_access(current_user.id, global_download)
        
        return jsonify({
            'success': True,
            'message': f'Added "{global_download["title"]}" to your downloads'
        })
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/library/<int:global_download_id>/add-extraction', methods=['POST'])
@api_login_required
def add_library_extraction_to_user(global_download_id):
    """Add an extraction from library to user's personal extractions list."""
    try:
        # Get the global download record
        import sqlite3
        from pathlib import Path
        DB_PATH = Path("stemtubes.db")
        
        with sqlite3.connect(DB_PATH) as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM global_downloads WHERE id = ?", (global_download_id,))
            global_download = cursor.fetchone()
            
            if not global_download:
                return jsonify({'error': 'Extraction not found in library'}), 404
            
            # Convert to dict for use with existing functions
            global_download = dict(global_download)
        
        if not global_download['extracted']:
            return jsonify({'error': 'This item has not been extracted yet'}), 400
        
        # Check if user already has access to this extraction
        user_extractions = db_list_extractions(current_user.id)
        for existing in user_extractions:
            if existing['global_download_id'] == global_download_id:
                return jsonify({'error': 'You already have access to this extraction'}), 400
        
        # Add user access to the extraction
        db_add_user_extraction_access(current_user.id, global_download)
        
        return jsonify({
            'success': True,
            'message': f'Added extraction of "{global_download["title"]}" to your list'
        })
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# ------------------------------------------------------------------
# Run
# ------------------------------------------------------------------
if __name__ == '__main__':
    import socket
    port = 5001
    socketio.run(app, host='0.0.0.0', port=port, debug=True, allow_unsafe_werkzeug=True)
