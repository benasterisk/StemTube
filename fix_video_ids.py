#!/usr/bin/env python3
"""
Fix corrupted/truncated video IDs in the database.
"""
import sqlite3
from pathlib import Path
import sys
import re

# Add the project root to Python path
PROJECT_ROOT = Path(__file__).parent
sys.path.insert(0, str(PROJECT_ROOT))

from core.downloads_db import DB_PATH

def fix_video_ids():
    """Fix corrupted video IDs in the database."""
    print("=" * 60)
    print("StemTube Video ID Fix")
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
            return
        
        print(f"Found {len(corrupted_ids)} corrupted video IDs:")
        for dl in corrupted_ids:
            print(f"  ID {dl[0]}: '{dl[1]}' (length: {len(dl[1])}) - {dl[2][:50]}...")
        
        print()
        print("⚠️  These entries have corrupted video IDs that prevent deduplication from working.")
        print("⚠️  The safest fix is to delete these corrupted entries so users can re-download properly.")
        print()
        
        response = input("Delete corrupted entries? (y/N): ")
        if response.lower() != 'y':
            print("❌ Operation cancelled")
            return
        
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
        print("Users can now re-download these videos and deduplication will work properly.")
        
        conn.close()
        
    except Exception as e:
        print(f"Error: {e}")
        import traceback
        traceback.print_exc()

def check_video_id_source():
    """Check where the video ID corruption might be coming from."""
    print()
    print("=" * 60)
    print("Checking for Video ID Corruption Sources")
    print("=" * 60)
    
    # Look for patterns in the way video IDs are being processed
    # This helps identify where the truncation is happening
    
    print("📋 YouTube video IDs should be 11 characters long and alphanumeric with - and _")
    print("📋 Common patterns: dQw4w9WgXcQ, 7ejYNYwrryw, NOaN7zXK184")
    print()
    print("🔍 Potential sources of corruption:")
    print("   1. URL parsing issues (extracting wrong part of URL)")
    print("   2. Database field length limits")
    print("   3. String truncation in processing")
    print("   4. Frontend JavaScript issues")
    print()
    print("💡 Recommendation: Check the video ID extraction code in:")
    print("   • core/aiotube_client.py - YouTube URL parsing")
    print("   • app.py - API parameter handling") 
    print("   • static/js/app.js - Frontend video ID extraction")

if __name__ == '__main__':
    fix_video_ids()
    check_video_id_source()