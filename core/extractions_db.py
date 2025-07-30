"""
Persistent per-user extractions library (table: user_extractions)
"""
import os
import sqlite3
from pathlib import Path

DB_PATH = Path(__file__).parent.parent / "stemtubes.db"

def _conn():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_table():
    """Create the extractions tables if they don't exist."""
    with _conn() as conn:
        # Global extractions table - tracks actual stem files on disk
        conn.execute("""
            CREATE TABLE IF NOT EXISTS global_extractions(
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                video_id TEXT NOT NULL,
                title TEXT,
                model_name TEXT,
                selected_stems TEXT,  -- JSON string of selected stems
                stems_paths TEXT,     -- JSON string of {stem_name: file_path}
                zip_path TEXT,
                audio_path TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(video_id, model_name)
            )
        """)
        
        # User extractions table - tracks which users have access to which extractions
        conn.execute("""
            CREATE TABLE IF NOT EXISTS user_extractions(
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                global_extraction_id INTEGER NOT NULL,
                video_id TEXT NOT NULL,
                title TEXT,
                model_name TEXT,
                selected_stems TEXT,  -- JSON string of selected stems
                stems_paths TEXT,     -- JSON string of {stem_name: file_path}
                zip_path TEXT,
                audio_path TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (global_extraction_id) REFERENCES global_extractions(id),
                UNIQUE(user_id, video_id, model_name)
            )
        """)
        conn.commit()

def add_or_update(user_id, meta):
    """Insert or update an extraction record for a user."""
    with _conn() as conn:
        video_id = meta["video_id"]
        model_name = meta["model_name"]
        
        # First, check if this extraction already exists globally
        cursor = conn.cursor()
        cursor.execute("""
            SELECT id FROM global_extractions 
            WHERE video_id=? AND model_name=?
        """, (video_id, model_name))
        
        global_extraction = cursor.fetchone()
        
        if global_extraction:
            # Extraction already exists globally - just add user access
            global_extraction_id = global_extraction[0]
        else:
            # Extraction doesn't exist - create global record
            cursor.execute("""
                INSERT INTO global_extractions
                    (video_id, title, model_name, selected_stems, stems_paths, zip_path, audio_path)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            """, (
                video_id,
                meta["title"],
                model_name,
                meta["selected_stems"],  # JSON string
                meta["stems_paths"],     # JSON string
                meta.get("zip_path", ""),
                meta["audio_path"]
            ))
            global_extraction_id = cursor.lastrowid
        
        # Add/update user access record
        conn.execute("""
            INSERT INTO user_extractions
                (user_id, global_extraction_id, video_id, title, model_name, selected_stems, stems_paths, zip_path, audio_path)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(user_id, video_id, model_name) DO UPDATE SET
                global_extraction_id = excluded.global_extraction_id,
                title                = excluded.title,
                selected_stems       = excluded.selected_stems,
                stems_paths          = excluded.stems_paths,
                zip_path             = excluded.zip_path,
                audio_path           = excluded.audio_path
        """, (
            user_id,
            global_extraction_id,
            video_id,
            meta["title"],
            model_name,
            meta["selected_stems"],  # JSON string
            meta["stems_paths"],     # JSON string
            meta.get("zip_path", ""),
            meta["audio_path"]
        ))
        conn.commit()

def list_for(user_id):
    """Return all extractions for a given user, newest first."""
    with _conn() as conn:
        cur = conn.execute(
            "SELECT * FROM user_extractions WHERE user_id=? ORDER BY created_at DESC",
            (user_id,)
        )
        return [dict(row) for row in cur.fetchall()]

def delete_from(user_id, video_id, model_name=None):
    """Delete extraction record(s) for a user."""
    with _conn() as conn:
        if model_name:
            # Delete specific model extraction
            conn.execute(
                "DELETE FROM user_extractions WHERE user_id=? AND video_id=? AND model_name=?",
                (user_id, video_id, model_name)
            )
        else:
            # Delete all extractions for this video
            conn.execute(
                "DELETE FROM user_extractions WHERE user_id=? AND video_id=?",
                (user_id, video_id)
            )
        conn.commit()

def find_global_extraction(video_id, model_name):
    """Check if an extraction already exists globally."""
    with _conn() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT * FROM global_extractions 
            WHERE video_id=? AND model_name=?
        """, (video_id, model_name))
        result = cursor.fetchone()
        return dict(result) if result else None

def add_user_extraction_access(user_id, global_extraction):
    """Give a user access to an existing global extraction."""
    with _conn() as conn:
        conn.execute("""
            INSERT INTO user_extractions
                (user_id, global_extraction_id, video_id, title, model_name, selected_stems, stems_paths, zip_path, audio_path)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(user_id, video_id, model_name) DO NOTHING
        """, (
            user_id,
            global_extraction["id"],
            global_extraction["video_id"],
            global_extraction["title"],
            global_extraction["model_name"],
            global_extraction["selected_stems"],
            global_extraction["stems_paths"],
            global_extraction["zip_path"],
            global_extraction["audio_path"]
        ))
        conn.commit()

def find_existing(user_id, video_id, model_name):
    """Find existing extraction for specific video and model."""
    with _conn() as conn:
        cur = conn.execute(
            "SELECT * FROM user_extractions WHERE user_id=? AND video_id=? AND model_name=?",
            (user_id, video_id, model_name)
        )
        result = cur.fetchone()
        return dict(result) if result else None