#!/usr/bin/env python3
"""Debug script to check Bébé Lilly duplication issue."""
import sqlite3
from pathlib import Path

DB_PATH = Path("stemtubes.db")

def debug_bebe_lilly():
    with sqlite3.connect(DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        
        # Check all records for Bébé Lilly
        print("=== BÉBÉ LILLY RECORDS ===")
        cursor.execute("""
            SELECT * FROM user_downloads 
            WHERE video_id = 'D0dXRx3RrNY' 
            ORDER BY id
        """)
        user_records = cursor.fetchall()
        
        print(f"Found {len(user_records)} user_downloads records:")
        for i, record in enumerate(user_records, 1):
            print(f"\nRecord {i} (ID: {record['id']}):")
            print(f"  user_id: {record['user_id']}")
            print(f"  global_download_id: {record['global_download_id']}")
            print(f"  video_id: {record['video_id']}")
            print(f"  title: {record['title']}")
            print(f"  file_path: {record['file_path']}")
            print(f"  media_type: {record['media_type']}")
            print(f"  quality: {record['quality']}")
            print(f"  extracted: {record['extracted']}")
            print(f"  extraction_model: {record['extraction_model']}")
            print(f"  stems_paths: {record['stems_paths']}")
            print(f"  created_at: {record['created_at']}")
        
        # Check global record
        print("\n=== GLOBAL DOWNLOAD RECORD ===")
        cursor.execute("""
            SELECT * FROM global_downloads 
            WHERE video_id = 'D0dXRx3RrNY'
        """)
        global_record = cursor.fetchone()
        if global_record:
            print("Global record:")
            print(f"  id: {global_record['id']}")
            print(f"  video_id: {global_record['video_id']}")
            print(f"  title: {global_record['title']}")
            print(f"  file_path: {global_record['file_path']}")
            print(f"  media_type: {global_record['media_type']}")
            print(f"  quality: {global_record['quality']}")
            print(f"  extracted: {global_record['extracted']}")
            print(f"  extraction_model: {global_record['extraction_model']}")
        else:
            print("No global record found!")

if __name__ == '__main__':
    debug_bebe_lilly()