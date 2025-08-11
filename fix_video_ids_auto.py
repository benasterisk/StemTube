#!/usr/bin/env python3
"""
Fix corrupted/truncated video IDs in the database automatically.
"""
import sqlite3
from pathlib import Path
import sys

# Add the project root to Python path
PROJECT_ROOT = Path(__file__).parent
sys.path.insert(0, str(PROJECT_ROOT))

from core.downloads_db import DB_PATH

def fix_video_ids_auto():
    """Fix corrupted video IDs in the database automatically."""
    print("=" * 60)
    print("StemTube Video ID Auto-Fix")
    print("=" * 60)
    
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        
        # Find all suspicious video IDs
        cursor.execute("SELECT id, video_id, title, file_path FROM global_downloads")
        downloads = cursor.fetchall()
        
        corrupted_ids = []
        for dl in downloads:
            vid = dl[1]  # video_id
            if len(vid) < 10:  # YouTube video IDs should be 11 characters
                corrupted_ids.append(dl)
        
        if not corrupted_ids:
            print("✅ No corrupted video IDs found")
            conn.close()
            return
        
        print(f"Found {len(corrupted_ids)} corrupted video IDs:")
        for dl in corrupted_ids:
            print(f"  ID {dl[0]}: '{dl[1]}' (length: {len(dl[1])}) - {dl[2][:50]}...")
        
        print()
        print("🔧 Auto-fixing corrupted entries...")
        
        # Delete corrupted entries from both tables
        deleted_global = 0
        deleted_user = 0
        
        for dl in corrupted_ids:
            global_id = dl[0]
            video_id = dl[1]
            
            # Delete from user_downloads first (foreign key constraint)
            cursor.execute("DELETE FROM user_downloads WHERE global_download_id = ?", (global_id,))
            deleted_user += cursor.rowcount
            
            # Delete from global_downloads
            cursor.execute("DELETE FROM global_downloads WHERE id = ?", (global_id,))
            deleted_global += cursor.rowcount
            
            print(f"  ✅ Deleted corrupted entry: '{video_id}' (ID: {global_id})")
        
        # Commit changes
        conn.commit()
        
        print()
        print(f"✅ Fixed video ID corruption:")
        print(f"   • Deleted {deleted_global} global download entries")
        print(f"   • Deleted {deleted_user} user download entries")
        print()
        print("✅ Deduplication should now work properly for new downloads.")
        
        conn.close()
        return True
        
    except Exception as e:
        print(f"Error: {e}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == '__main__':
    success = fix_video_ids_auto()
    sys.exit(0 if success else 1)