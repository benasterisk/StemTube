#!/usr/bin/env python3
"""
Check database schema for field length limitations.
"""
import sqlite3
from pathlib import Path
import sys

# Add the project root to Python path
PROJECT_ROOT = Path(__file__).parent
sys.path.insert(0, str(PROJECT_ROOT))

from core.downloads_db import DB_PATH

def check_schema():
    """Check database schema for potential issues."""
    print("=" * 60)
    print("Database Schema Analysis")
    print("=" * 60)
    print(f"Database: {DB_PATH}")
    print()
    
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        
        # Get table schema
        print("=== GLOBAL_DOWNLOADS TABLE SCHEMA ===")
        cursor.execute("PRAGMA table_info(global_downloads)")
        columns = cursor.fetchall()
        
        for col in columns:
            col_id, col_name, col_type, not_null, default_val, primary_key = col
            print(f"  {col_name}: {col_type}")
            if col_name == 'video_id':
                if 'VARCHAR' in col_type.upper():
                    # Extract length limit if specified
                    import re
                    length_match = re.search(r'VARCHAR\((\d+)\)', col_type, re.IGNORECASE)
                    if length_match:
                        limit = length_match.group(1)
                        print(f"    ⚠️  LENGTH LIMIT: {limit} characters")
                        if int(limit) < 11:
                            print(f"    ❌ PROBLEM: Limit {limit} is less than required 11 characters!")
                    else:
                        print(f"    ✅ No explicit length limit")
                elif col_type.upper() == 'TEXT':
                    print(f"    ✅ TEXT field - no length limit")
        
        print("\n=== USER_DOWNLOADS TABLE SCHEMA ===")
        cursor.execute("PRAGMA table_info(user_downloads)")
        columns = cursor.fetchall()
        
        for col in columns:
            col_id, col_name, col_type, not_null, default_val, primary_key = col
            if col_name == 'video_id':
                print(f"  {col_name}: {col_type}")
                if 'VARCHAR' in col_type.upper():
                    import re
                    length_match = re.search(r'VARCHAR\((\d+)\)', col_type, re.IGNORECASE)
                    if length_match:
                        limit = length_match.group(1)
                        print(f"    ⚠️  LENGTH LIMIT: {limit} characters")
                        if int(limit) < 11:
                            print(f"    ❌ PROBLEM: Limit {limit} is less than required 11 characters!")
                    else:
                        print(f"    ✅ No explicit length limit")
                elif col_type.upper() == 'TEXT':
                    print(f"    ✅ TEXT field - no length limit")
        
        # Check for any existing data issues
        print("\n=== CURRENT DATA ANALYSIS ===")
        cursor.execute("SELECT video_id, LENGTH(video_id) as len FROM global_downloads ORDER BY len")
        results = cursor.fetchall()
        
        if results:
            print("Video ID lengths in database:")
            for video_id, length in results:
                status = "✅" if length == 11 else "❌"
                print(f"  {status} '{video_id}' (length: {length})")
        else:
            print("No data in global_downloads table")
        
        conn.close()
        
    except Exception as e:
        print(f"Error checking schema: {e}")
        import traceback
        traceback.print_exc()

if __name__ == '__main__':
    check_schema()