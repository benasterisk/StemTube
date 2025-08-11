#!/usr/bin/env python3
"""
Debug script to test deduplication functionality.
"""
import sqlite3
from pathlib import Path
import sys
import os

# Add the project root to Python path
PROJECT_ROOT = Path(__file__).parent
sys.path.insert(0, str(PROJECT_ROOT))

from core.downloads_db import find_global_download, DB_PATH

def debug_deduplication():
    """Debug the deduplication functionality."""
    print("=" * 60)
    print("StemTube Deduplication Debug")
    print("=" * 60)
    print(f"Database path: {DB_PATH}")
    print(f"Database exists: {os.path.exists(DB_PATH)}")
    print()
    
    # Connect to database
    try:
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        
        # Check global downloads table
        print("=== GLOBAL DOWNLOADS TABLE ===")
        cursor.execute("SELECT COUNT(*) FROM global_downloads")
        count = cursor.fetchone()[0]
        print(f"Total global downloads: {count}")
        
        if count > 0:
            cursor.execute("""
                SELECT video_id, title, media_type, quality, created_at 
                FROM global_downloads 
                ORDER BY created_at DESC 
                LIMIT 10
            """)
            downloads = cursor.fetchall()
            print("\nRecent global downloads:")
            for i, dl in enumerate(downloads, 1):
                print(f"  {i}. video_id={dl['video_id'][:20]}... media_type={dl['media_type']} quality={dl['quality']}")
                print(f"     title={dl['title'][:50]}...")
        
        print()
        
        # Check user downloads table
        print("=== USER DOWNLOADS TABLE ===")
        cursor.execute("SELECT COUNT(*) FROM user_downloads")
        count = cursor.fetchone()[0]
        print(f"Total user downloads: {count}")
        
        if count > 0:
            cursor.execute("""
                SELECT user_id, video_id, title, media_type, quality, created_at 
                FROM user_downloads 
                ORDER BY created_at DESC 
                LIMIT 10
            """)
            downloads = cursor.fetchall()
            print("\nRecent user downloads:")
            for i, dl in enumerate(downloads, 1):
                print(f"  {i}. user_id={dl['user_id']} video_id={dl['video_id'][:20]}... media_type={dl['media_type']} quality={dl['quality']}")
                print(f"     title={dl['title'][:50]}...")
        
        print()
        
        # Test deduplication function
        print("=== TESTING DEDUPLICATION FUNCTION ===")
        if count > 0:
            # Get a test video_id from the database
            cursor.execute("SELECT video_id, media_type, quality FROM global_downloads LIMIT 1")
            test_row = cursor.fetchone()
            if test_row:
                test_video_id = test_row['video_id']
                test_media_type = test_row['media_type']
                test_quality = test_row['quality']
                
                print(f"Testing with:")
                print(f"  video_id: {test_video_id}")
                print(f"  media_type: {test_media_type}")
                print(f"  quality: {test_quality}")
                
                # Test the function
                result = find_global_download(test_video_id, test_media_type, test_quality)
                print(f"  Result: {'FOUND' if result else 'NOT FOUND'}")
                if result:
                    print(f"    ID: {result['id']}")
                    print(f"    Title: {result['title'][:50]}...")
                
                print()
                
                # Test with slightly different parameters
                print("Testing with wrong quality:")
                result2 = find_global_download(test_video_id, test_media_type, "wrong_quality")
                print(f"  Result: {'FOUND' if result2 else 'NOT FOUND'}")
                
                print("Testing with wrong media_type:")  
                result3 = find_global_download(test_video_id, "wrong_type", test_quality)
                print(f"  Result: {'FOUND' if result3 else 'NOT FOUND'}")
                
        else:
            print("No downloads found in database to test with")
        
        # Look for potential duplicate entries
        print()
        print("=== CHECKING FOR DUPLICATES ===")
        cursor.execute("""
            SELECT video_id, media_type, quality, COUNT(*) as count
            FROM global_downloads
            GROUP BY video_id, media_type, quality
            HAVING COUNT(*) > 1
        """)
        duplicates = cursor.fetchall()
        if duplicates:
            print("Found duplicate global downloads:")
            for dup in duplicates:
                print(f"  video_id={dup['video_id']} media_type={dup['media_type']} quality={dup['quality']} count={dup['count']}")
        else:
            print("No duplicate global downloads found")
            
        cursor.execute("""
            SELECT user_id, video_id, media_type, COUNT(*) as count
            FROM user_downloads
            GROUP BY user_id, video_id, media_type
            HAVING COUNT(*) > 1
        """)
        user_duplicates = cursor.fetchall()
        if user_duplicates:
            print("Found duplicate user downloads:")
            for dup in user_duplicates:
                print(f"  user_id={dup['user_id']} video_id={dup['video_id']} media_type={dup['media_type']} count={dup['count']}")
        else:
            print("No duplicate user downloads found")
        
        conn.close()
        
    except Exception as e:
        print(f"Error: {e}")
        import traceback
        traceback.print_exc()

if __name__ == '__main__':
    debug_deduplication()