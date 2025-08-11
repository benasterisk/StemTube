#!/usr/bin/env python3
"""
Debug the specific Raphaël - Caravane URL to see where the video ID gets corrupted.
"""
import re
import sqlite3
from pathlib import Path
import sys

# Add the project root to Python path
PROJECT_ROOT = Path(__file__).parent
sys.path.insert(0, str(PROJECT_ROOT))

from core.downloads_db import DB_PATH

def test_url_extraction():
    """Test URL extraction with the problematic URL."""
    test_url = "https://youtu.be/YSUoSxafl6g"
    expected_id = "YSUoSxafl6g"
    
    print("=" * 60)
    print("Debugging Raphaël - Caravane URL")
    print("=" * 60)
    print(f"Test URL: {test_url}")
    print(f"Expected video ID: '{expected_id}' (length: {len(expected_id)})")
    print()
    
    # Test the regex patterns from the code
    print("🧪 Testing URL extraction patterns...")
    
    # Pattern from aiotube_client.py line 255
    pattern = r'youtu\.be/([^?&]+)'
    match = re.search(pattern, test_url)
    if match:
        extracted = match.group(1)
        print(f"✅ Backend pattern: '{extracted}' (length: {len(extracted)})")
        if extracted == expected_id:
            print(f"   ✅ CORRECT extraction")
        else:
            print(f"   ❌ WRONG extraction - expected '{expected_id}'")
    else:
        print(f"❌ Backend pattern: No match")
    
    # Pattern from frontend extractVideoId function
    js_pattern = r'^.*(youtu.be\/|v\/|e\/|u\/\w+\/|embed\/|v=)([^#\&\?]*).*'
    match = re.search(js_pattern, test_url)
    if match:
        extracted = match.group(2)
        print(f"✅ Frontend pattern: '{extracted}' (length: {len(extracted)})")
        if extracted == expected_id:
            print(f"   ✅ CORRECT extraction")
        else:
            print(f"   ❌ WRONG extraction - expected '{expected_id}'")
    else:
        print(f"❌ Frontend pattern: No match")
    
    print()

def check_current_database():
    """Check what's currently in the database."""
    print("🔍 Current database state:")
    
    try:
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        
        # Look for any entries related to Raphaël or Caravane
        cursor.execute("""
            SELECT id, video_id, title, created_at 
            FROM global_downloads 
            WHERE title LIKE '%Raphaël%' OR title LIKE '%Caravane%'
            ORDER BY created_at DESC
        """)
        results = cursor.fetchall()
        
        if results:
            print("Found related entries:")
            for row in results:
                status = "✅" if len(row['video_id']) == 11 else f"❌ (length: {len(row['video_id'])})"
                print(f"  {status} ID {row['id']}: '{row['video_id']}' - {row['title']}")
                print(f"      Created: {row['created_at']}")
        else:
            print("No entries found for 'Raphaël' or 'Caravane'")
        
        # Check user downloads too
        cursor.execute("""
            SELECT user_id, video_id, title, created_at 
            FROM user_downloads 
            WHERE title LIKE '%Raphaël%' OR title LIKE '%Caravane%'
            ORDER BY created_at DESC
        """)
        results = cursor.fetchall()
        
        if results:
            print("\nUser downloads:")
            for row in results:
                status = "✅" if len(row['video_id']) == 11 else f"❌ (length: {len(row['video_id'])})"
                print(f"  {status} User {row['user_id']}: '{row['video_id']}' - {row['title']}")
                print(f"      Created: {row['created_at']}")
        
        conn.close()
        
    except Exception as e:
        print(f"Error checking database: {e}")

def analyze_id_corruption():
    """Analyze potential sources of ID corruption."""
    print("\n" + "=" * 60)
    print("ID Corruption Analysis")
    print("=" * 60)
    
    correct_id = "YSUoSxafl6g"
    corrupted_id = "xHJoY0oSD"
    
    print(f"Correct ID:   '{correct_id}' (length: {len(correct_id)})")
    print(f"Corrupted ID: '{corrupted_id}' (length: {len(corrupted_id)})")
    print()
    
    # Compare character by character
    print("Character comparison:")
    max_len = max(len(correct_id), len(corrupted_id))
    for i in range(max_len):
        c_char = correct_id[i] if i < len(correct_id) else '?'
        r_char = corrupted_id[i] if i < len(corrupted_id) else '?'
        
        match = "✅" if c_char == r_char else "❌"
        print(f"  Position {i}: '{c_char}' vs '{r_char}' {match}")
    
    print("\n🔍 Possible corruption sources:")
    
    # Check if it's a substring
    if corrupted_id in correct_id:
        start_pos = correct_id.index(corrupted_id)
        print(f"   • Substring from position {start_pos}: '{correct_id[start_pos:start_pos+len(corrupted_id)]}'")
    
    # Check if it's a prefix
    if correct_id.startswith(corrupted_id):
        print(f"   • Corrupted ID is a PREFIX of correct ID (truncated at position {len(corrupted_id)})")
    
    # Check if it's character encoding or slicing issue
    print(f"   • First 9 chars of correct: '{correct_id[:9]}'")
    print(f"   • Last 9 chars of correct:  '{correct_id[-9:]}'")
    
    # Check if there's any pattern in the slicing
    if len(corrupted_id) == 9:
        print(f"   • Possible slicing patterns:")
        print(f"     - [:-2]: '{correct_id[:-2]}' (remove last 2)")
        print(f"     - [2:]:  '{correct_id[2:]}' (remove first 2)")
        print(f"     - [1:-1]: '{correct_id[1:-1]}' (remove first and last)")

def suggest_fixes():
    """Suggest what to look for to fix the issue."""
    print("\n" + "=" * 60)
    print("Next Steps to Find the Issue")
    print("=" * 60)
    
    print("🔍 Places to check for ID truncation:")
    print("   1. Frontend JavaScript - check console logs when submitting")
    print("   2. Backend aiotube_client - add debug prints for video_id")
    print("   3. API request processing - log the video_id received")
    print("   4. Database insertion - check what gets stored")
    print()
    
    print("🛠️  Recommended debugging:")
    print("   1. Add console.log in static/js/app.js before API calls")
    print("   2. Add print statements in core/aiotube_client.py")
    print("   3. Add logging in app.py API endpoints")
    print("   4. Test with the exact URL: https://youtu.be/YSUoSxafl6g")
    print()
    
    print("⚡ Quick test:")
    print("   Start the app and try to download this exact URL:")
    print("   https://youtu.be/YSUoSxafl6g")
    print("   Check browser console and server logs for the video_id")

if __name__ == '__main__':
    test_url_extraction()
    check_current_database()
    analyze_id_corruption()
    suggest_fixes()