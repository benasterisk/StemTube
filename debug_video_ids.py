#!/usr/bin/env python3
"""
Debug script to check video IDs in the database.
"""
import sqlite3
from pathlib import Path
import sys

# Add the project root to Python path
PROJECT_ROOT = Path(__file__).parent
sys.path.insert(0, str(PROJECT_ROOT))

from core.downloads_db import DB_PATH

def debug_video_ids():
    """Debug video IDs in the database."""
    print("=" * 60)
    print("StemTube Video ID Debug")
    print("=" * 60)
    
    try:
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        
        # Check all video_ids in global downloads
        print("=== ALL VIDEO IDs IN GLOBAL DOWNLOADS ===")
        cursor.execute("SELECT id, video_id, title, created_at FROM global_downloads ORDER BY created_at DESC")
        downloads = cursor.fetchall()
        
        for dl in downloads:
            print(f"ID: {dl['id']}")
            print(f"  Video ID: '{dl['video_id']}'")
            print(f"  Length: {len(dl['video_id'])}")
            print(f"  Title: {dl['title']}")
            print(f"  Created: {dl['created_at']}")
            print()
        
        # Check for video_ids that might be too short or malformed
        print("=== CHECKING FOR SUSPICIOUS VIDEO IDs ===")
        suspicious = []
        for dl in downloads:
            vid = dl['video_id']
            if len(vid) < 10:  # YouTube video IDs should be 11 characters
                suspicious.append(dl)
                print(f"⚠️  SHORT VIDEO ID: '{vid}' (length: {len(vid)})")
            elif not vid.replace('-', '').replace('_', '').isalnum():
                suspicious.append(dl)
                print(f"⚠️  NON-ALPHANUMERIC VIDEO ID: '{vid}'")
        
        if not suspicious:
            print("✅ All video IDs look normal")
            
        conn.close()
        
    except Exception as e:
        print(f"Error: {e}")
        import traceback
        traceback.print_exc()

if __name__ == '__main__':
    debug_video_ids()