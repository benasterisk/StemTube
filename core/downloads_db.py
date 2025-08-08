"""
Persistent per-user library (table: user_downloads)
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
    """Create the downloads tables if they don't exist."""
    with _conn() as conn:
        # Global downloads table - tracks actual files on disk
        conn.execute("""
            CREATE TABLE IF NOT EXISTS global_downloads(
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                video_id TEXT NOT NULL,
                title TEXT,
                thumbnail TEXT,
                file_path TEXT,
                media_type TEXT,
                quality TEXT,
                file_size INTEGER,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                extracted BOOLEAN DEFAULT 0,
                extraction_model TEXT,
                stems_paths TEXT,
                stems_zip_path TEXT,
                extracted_at TIMESTAMP,
                extracting BOOLEAN DEFAULT 0,
                UNIQUE(video_id, media_type, quality)
            )
        """)
        
        # User downloads table - tracks which users have access to which files  
        conn.execute("""
            CREATE TABLE IF NOT EXISTS user_downloads(
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                global_download_id INTEGER NOT NULL,
                video_id TEXT NOT NULL,
                title TEXT,
                thumbnail TEXT,
                file_path TEXT,
                media_type TEXT,
                quality TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                extracted BOOLEAN DEFAULT 0,
                extraction_model TEXT,
                stems_paths TEXT,
                stems_zip_path TEXT,
                extracted_at TIMESTAMP,
                extracting BOOLEAN DEFAULT 0,
                FOREIGN KEY (global_download_id) REFERENCES global_downloads(id),
                UNIQUE(user_id, video_id, media_type)
            )
        """)
        conn.commit()
        
        # Add extraction fields to existing tables if they don't exist
        _add_extraction_fields_if_missing(conn)

def _add_extraction_fields_if_missing(conn):
    """Add extraction fields to existing tables if they don't exist."""
    # List of extraction fields to add
    extraction_fields = [
        ("extracted", "BOOLEAN DEFAULT 0"),
        ("extraction_model", "TEXT"),
        ("stems_paths", "TEXT"),
        ("stems_zip_path", "TEXT"),
        ("extracted_at", "TIMESTAMP"),
        ("extracting", "BOOLEAN DEFAULT 0")
    ]
    
    for table_name in ["global_downloads", "user_downloads"]:
        # Get existing columns
        cursor = conn.cursor()
        cursor.execute(f"PRAGMA table_info({table_name})")
        existing_columns = {row[1] for row in cursor.fetchall()}
        
        # Add missing extraction fields
        for field_name, field_type in extraction_fields:
            if field_name not in existing_columns:
                try:
                    conn.execute(f"ALTER TABLE {table_name} ADD COLUMN {field_name} {field_type}")
                    print(f"Added column {field_name} to {table_name}")
                except Exception as e:
                    print(f"Error adding column {field_name} to {table_name}: {e}")
        
        conn.commit()

def add_or_update(user_id, meta):
    """Insert or update a download record for a user."""
    with _conn() as conn:
        video_id = meta["video_id"]
        media_type = meta.get("download_type", "audio")
        quality = meta["quality"]
        file_path = meta["file_path"]
        
        # First, check if this file already exists globally
        cursor = conn.cursor()
        cursor.execute("""
            SELECT id FROM global_downloads 
            WHERE video_id=? AND media_type=? AND quality=?
        """, (video_id, media_type, quality))
        
        global_download = cursor.fetchone()
        
        if global_download:
            # File already exists globally - just add user access
            global_download_id = global_download[0]
        else:
            # File doesn't exist - create global record
            cursor.execute("""
                INSERT INTO global_downloads
                    (video_id, title, thumbnail, file_path, media_type, quality, file_size)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            """, (
                video_id,
                meta["title"],
                meta.get("thumbnail_url", ""),
                file_path,
                media_type,
                quality,
                meta.get("file_size", 0)
            ))
            global_download_id = cursor.lastrowid
        
        # Add/update user access record
        conn.execute("""
            INSERT INTO user_downloads
                (user_id, global_download_id, video_id, title, thumbnail, file_path, media_type, quality)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(user_id, video_id, media_type) DO UPDATE SET
                global_download_id = excluded.global_download_id,
                title              = excluded.title,
                thumbnail          = excluded.thumbnail,
                file_path          = excluded.file_path,
                quality            = excluded.quality
        """, (
            user_id,
            global_download_id,
            video_id,
            meta["title"],
            meta.get("thumbnail_url", ""),
            file_path,
            media_type,
            quality
        ))
        conn.commit()

def find_global_download(video_id, media_type, quality):
    """Check if a download already exists globally."""
    with _conn() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT * FROM global_downloads 
            WHERE video_id=? AND media_type=? AND quality=?
        """, (video_id, media_type, quality))
        result = cursor.fetchone()
        return dict(result) if result else None

def add_user_access(user_id, global_download):
    """Give a user access to an existing global download."""
    with _conn() as conn:
        conn.execute("""
            INSERT INTO user_downloads
                (user_id, global_download_id, video_id, title, thumbnail, file_path, media_type, quality)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(user_id, video_id, media_type) DO NOTHING
        """, (
            user_id,
            global_download["id"],
            global_download["video_id"],
            global_download["title"],
            global_download["thumbnail"],
            global_download["file_path"],
            global_download["media_type"],
            global_download["quality"]
        ))
        conn.commit()

def list_for(user_id):
    """Return all downloads for a given user, newest first."""
    with _conn() as conn:
        cur = conn.execute(
            "SELECT * FROM user_downloads WHERE user_id=? ORDER BY created_at DESC",
            (user_id,)
        )
        return [dict(row) for row in cur.fetchall()]

def get_download_by_id(user_id, download_id):
    """Get a specific download by ID for a user."""
    with _conn() as conn:
        cur = conn.execute(
            "SELECT * FROM user_downloads WHERE user_id=? AND id=?",
            (user_id, download_id)
        )
        row = cur.fetchone()
        return dict(row) if row else None

def delete_from(user_id, video_id):
    """Delete a specific download record for a user."""
    with _conn() as conn:
        conn.execute(
            "DELETE FROM user_downloads WHERE user_id=? AND video_id=?",
            (user_id, video_id)
        )
        conn.commit()

# ============ EXTRACTION FUNCTIONS ============

def find_global_extraction(video_id, model_name):
    """Check if an extraction already exists globally for a video with a specific model."""
    with _conn() as conn:
        cursor = conn.cursor()
        print(f"[DB DEBUG] Searching for extraction: video_id='{video_id}', model='{model_name}'")
        cursor.execute("""
            SELECT * FROM global_downloads 
            WHERE video_id=? AND extracted=1 AND extraction_model=?
        """, (video_id, model_name))
        result = cursor.fetchone()
        if result:
            print(f"[DB DEBUG] Found global extraction: id={result[0]}, extracted={result['extracted']}")
        else:
            print(f"[DB DEBUG] No global extraction found for video_id='{video_id}', model='{model_name}'")
            # Debug: Check what extractions DO exist for this video_id
            cursor.execute("SELECT id, video_id, extracted, extraction_model FROM global_downloads WHERE video_id=?", (video_id,))
            debug_results = cursor.fetchall()
            print(f"[DB DEBUG] All records for video_id '{video_id}': {[(r[0], r[1], r[2], r[3]) for r in debug_results]}")
        return dict(result) if result else None

def find_or_reserve_extraction(video_id, model_name):
    """Atomically check for existing extraction or reserve it for processing.
    
    Returns:
        tuple: (existing_extraction_dict or None, reserved_successfully: bool)
        - If existing extraction found: (extraction_dict, False)  
        - If successfully reserved: (None, True)
        - If already reserved by another process: (None, False)
    """
    with _conn() as conn:
        cursor = conn.cursor()
        print(f"[DB DEBUG] Atomic check/reserve for video_id='{video_id}', model='{model_name}'")
        
        # Start transaction for atomicity
        conn.execute("BEGIN IMMEDIATE")
        
        try:
            # First check for completed extraction
            cursor.execute("""
                SELECT * FROM global_downloads 
                WHERE video_id=? AND extracted=1 AND extraction_model=?
            """, (video_id, model_name))
            existing = cursor.fetchone()
            
            if existing:
                print(f"[DB DEBUG] Found existing completed extraction")
                conn.commit()
                return dict(existing), False
            
            # Check for in-progress extraction
            cursor.execute("""
                SELECT * FROM global_downloads 
                WHERE video_id=? AND extracting=1 AND extraction_model=?
            """, (video_id, model_name))
            in_progress = cursor.fetchone()
            
            if in_progress:
                print(f"[DB DEBUG] Found extraction already in progress")
                conn.commit()
                return None, False
            
            # No existing or in-progress extraction - try to reserve it
            cursor.execute("""
                UPDATE global_downloads 
                SET extracting=1, extraction_model=?
                WHERE video_id=? AND (extracting=0 OR extracting IS NULL)
            """, (model_name, video_id))
            
            if cursor.rowcount > 0:
                print(f"[DB DEBUG] Successfully reserved extraction")
                conn.commit()
                return None, True
            else:
                print(f"[DB DEBUG] Could not reserve - no matching download record found")
                conn.commit()
                return None, False
                
        except Exception as e:
            print(f"[DB DEBUG] Error in atomic operation: {e}")
            conn.rollback()
            raise

def find_global_extraction_in_progress(video_id, model_name):
    """Check if an extraction is currently in progress for a video with a specific model."""
    with _conn() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT * FROM global_downloads 
            WHERE video_id=? AND extracting=1 AND extraction_model=?
        """, (video_id, model_name))
        result = cursor.fetchone()
        return dict(result) if result else None

def set_extraction_in_progress(video_id, model_name):
    """Mark an extraction as in progress."""
    with _conn() as conn:
        conn.execute("""
            UPDATE global_downloads 
            SET extracting=1, extraction_model=?
            WHERE video_id=?
        """, (model_name, video_id))
        conn.commit()

def clear_extraction_in_progress(video_id):
    """Clear the extraction in progress flag."""
    with _conn() as conn:
        conn.execute("""
            UPDATE global_downloads 
            SET extracting=0
            WHERE video_id=?
        """, (video_id,))
        conn.commit()

def mark_extraction_complete(video_id, extraction_data):
    """Mark a global download as extracted with stems information."""
    with _conn() as conn:
        import json
        print(f"[DB DEBUG] Marking extraction complete for video_id='{video_id}', model='{extraction_data['model_name']}'")
        
        # Use transaction to ensure atomicity
        conn.execute("BEGIN IMMEDIATE")
        
        try:
            cursor = conn.cursor()
            cursor.execute("SELECT id, video_id, title FROM global_downloads WHERE video_id=?", (video_id,))
            existing = cursor.fetchone()
            if existing:
                print(f"[DB DEBUG] Found existing global download: id={existing[0]}, video_id='{existing[1]}'")
            else:
                print(f"[DB DEBUG] WARNING: No global download found for video_id='{video_id}'")
            
            result = conn.execute("""
                UPDATE global_downloads 
                SET extracted=1, 
                    extracting=0,
                    extraction_model=?, 
                    stems_paths=?, 
                    stems_zip_path=?, 
                    extracted_at=CURRENT_TIMESTAMP
                WHERE video_id=?
            """, (
                extraction_data["model_name"],
                json.dumps(extraction_data["stems_paths"]),
                extraction_data.get("zip_path", ""),
                video_id
            ))
            rows_affected = result.rowcount
            print(f"[DB DEBUG] Updated {rows_affected} rows in global_downloads")
            
            # Also update all user_downloads records for this video
            conn.execute("""
                UPDATE user_downloads 
                SET extracted=1,
                    extracting=0,
                    extraction_model=?,
                    stems_paths=?,
                    stems_zip_path=?,
                    extracted_at=CURRENT_TIMESTAMP
                WHERE video_id=?
            """, (
                extraction_data["model_name"],
                json.dumps(extraction_data["stems_paths"]),
                extraction_data.get("zip_path", ""),
                video_id
            ))
            
            # Commit transaction
            conn.commit()
            print(f"[DB DEBUG] Successfully marked extraction complete and committed transaction")
            
        except Exception as e:
            print(f"[DB DEBUG] Error marking extraction complete: {e}")
            conn.rollback()
            raise

def add_user_extraction_access(user_id, global_download):
    """Give a user access to an existing extraction by updating their user_downloads record."""
    with _conn() as conn:
        print(f"[DB DEBUG] Adding user extraction access: user_id={user_id}, video_id='{global_download['video_id']}'")
        # Check if user already has access to this download
        cursor = conn.cursor()
        cursor.execute("""
            SELECT id FROM user_downloads 
            WHERE user_id=? AND video_id=?
        """, (user_id, global_download["video_id"]))
        existing = cursor.fetchone()
        print(f"[DB DEBUG] Existing user download record: {existing}")
        
        if existing:
            # Update existing record
            conn.execute("""
                UPDATE user_downloads 
                SET extracted=1,
                    extracting=0,
                    extraction_model=?,
                    stems_paths=?,
                    stems_zip_path=?,
                    extracted_at=?
                WHERE user_id=? AND video_id=?
            """, (
                global_download["extraction_model"],
                global_download["stems_paths"],
                global_download["stems_zip_path"],
                global_download["extracted_at"],
                user_id,
                global_download["video_id"]
            ))
        else:
            # Create new user access record
            conn.execute("""
                INSERT INTO user_downloads
                    (user_id, global_download_id, video_id, title, thumbnail, file_path, media_type, quality, 
                     extracted, extraction_model, stems_paths, stems_zip_path, extracted_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)
            """, (
                user_id,
                global_download["id"],
                global_download["video_id"],
                global_download["title"],
                global_download["thumbnail"],
                global_download["file_path"],
                global_download["media_type"],
                global_download["quality"],
                global_download["extraction_model"],
                global_download["stems_paths"],
                global_download["stems_zip_path"],
                global_download["extracted_at"]
            ))
        conn.commit()

def set_user_extraction_in_progress(user_id, video_id, model_name):
    """Mark an extraction as in progress for a specific user."""
    with _conn() as conn:
        conn.execute("""
            UPDATE user_downloads 
            SET extracting=1, extraction_model=?
            WHERE user_id=? AND video_id=?
        """, (model_name, user_id, video_id))
        conn.commit()

def list_extractions_for(user_id):
    """Return all downloads with extractions for a given user, newest first."""
    with _conn() as conn:
        cur = conn.execute("""
            SELECT * FROM user_downloads 
            WHERE user_id=? AND extracted=1 
            ORDER BY extracted_at DESC
        """, (user_id,))
        return [dict(row) for row in cur.fetchall()]

# ============ ADMIN CLEANUP FUNCTIONS ============

def get_all_downloads_for_admin():
    """Return all downloads across all users for admin cleanup interface."""
    with _conn() as conn:
        cur = conn.execute("""
            SELECT 
                gd.id as global_id,
                gd.video_id,
                gd.title,
                gd.file_path,
                gd.media_type,
                gd.quality,
                gd.file_size,
                gd.created_at,
                gd.extracted,
                gd.extraction_model,
                gd.extracting,
                gd.extracted_at,
                COUNT(ud.id) as user_count,
                GROUP_CONCAT(u.username, ', ') as users
            FROM global_downloads gd
            LEFT JOIN user_downloads ud ON gd.id = ud.global_download_id
            LEFT JOIN users u ON ud.user_id = u.id
            GROUP BY gd.id
            ORDER BY gd.created_at DESC
        """)
        return [dict(row) for row in cur.fetchall()]

def delete_download_completely(global_download_id):
    """Delete a download completely from both global and user tables."""
    with _conn() as conn:
        cursor = conn.cursor()
        
        # Start transaction for atomicity
        conn.execute("BEGIN IMMEDIATE")
        
        try:
            # Get download info before deletion for file cleanup
            cursor.execute("SELECT * FROM global_downloads WHERE id=?", (global_download_id,))
            download_info = cursor.fetchone()
            
            if not download_info:
                return False, "Download not found"
            
            # Delete from user_downloads first (foreign key constraint)
            cursor.execute("DELETE FROM user_downloads WHERE global_download_id=?", (global_download_id,))
            affected_users = cursor.rowcount
            
            # Delete from global_downloads
            cursor.execute("DELETE FROM global_downloads WHERE id=?", (global_download_id,))
            
            conn.commit()
            return True, f"Deleted download from database (affected {affected_users} users)", dict(download_info)
            
        except Exception as e:
            conn.rollback()
            return False, f"Database error: {str(e)}", None

def reset_extraction_status(global_download_id):
    """Reset extraction status for a download while keeping the download record."""
    with _conn() as conn:
        cursor = conn.cursor()
        
        # Start transaction for atomicity
        conn.execute("BEGIN IMMEDIATE")
        
        try:
            # Reset extraction fields in global_downloads
            cursor.execute("""
                UPDATE global_downloads 
                SET extracted=0, extracting=0, extraction_model=NULL, 
                    stems_paths=NULL, stems_zip_path=NULL, extracted_at=NULL
                WHERE id=?
            """, (global_download_id,))
            
            if cursor.rowcount == 0:
                conn.rollback()
                return False, "Download not found"
            
            # Reset extraction fields in user_downloads
            cursor.execute("""
                UPDATE user_downloads 
                SET extracted=0, extracting=0, extraction_model=NULL,
                    stems_paths=NULL, stems_zip_path=NULL, extracted_at=NULL
                WHERE global_download_id=?
            """, (global_download_id,))
            affected_users = cursor.rowcount
            
            conn.commit()
            return True, f"Reset extraction status (affected {affected_users} users)"
            
        except Exception as e:
            conn.rollback()
            return False, f"Database error: {str(e)}"

def get_storage_usage_stats():
    """Get storage usage statistics for admin dashboard."""
    with _conn() as conn:
        cur = conn.cursor()
        
        # Get total downloads count and estimated size
        cur.execute("""
            SELECT 
                COUNT(*) as total_downloads,
                SUM(COALESCE(file_size, 0)) as total_download_size,
                COUNT(CASE WHEN extracted=1 THEN 1 END) as total_extractions
            FROM global_downloads
        """)
        stats = dict(cur.fetchone())
        
        # Get user distribution
        cur.execute("""
            SELECT 
                COUNT(DISTINCT ud.user_id) as users_with_downloads,
                AVG(user_download_counts.download_count) as avg_downloads_per_user
            FROM (
                SELECT user_id, COUNT(*) as download_count 
                FROM user_downloads 
                GROUP BY user_id
            ) as user_download_counts
            JOIN user_downloads ud ON ud.user_id = user_download_counts.user_id
        """)
        user_stats = cur.fetchone()
        if user_stats:
            stats.update(dict(user_stats))
        
        return stats

def cleanup_stuck_extractions():
    """Clean up stuck extractions on application startup."""
    with _conn() as conn:
        cursor = conn.cursor()
        
        # Find stuck extractions (extracting=1 but not completed within reasonable time)
        # For now, we'll just reset all stuck extractions
        cursor.execute("""
            SELECT COUNT(*) FROM global_downloads 
            WHERE extracting=1 AND extracted=0
        """)
        stuck_count = cursor.fetchone()[0]
        
        if stuck_count > 0:
            print(f"[STARTUP] Found {stuck_count} stuck extractions - cleaning up...")
            
            # Reset stuck extractions
            cursor.execute("""
                UPDATE global_downloads 
                SET extracting=0, extraction_model=NULL
                WHERE extracting=1 AND extracted=0
            """)
            
            cursor.execute("""
                UPDATE user_downloads 
                SET extracting=0, extraction_model=NULL
                WHERE extracting=1 AND extracted=0
            """)
            
            conn.commit()
            print(f"[STARTUP] Cleaned up {stuck_count} stuck extractions")
        else:
            print("[STARTUP] No stuck extractions found")
