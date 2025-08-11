#!/usr/bin/env python3
"""
Test the Raphael video directly to understand the video ID issue.
"""
import sys
import os
import re
from pathlib import Path

# Add the project root to Python path
PROJECT_ROOT = Path(__file__).parent
sys.path.insert(0, str(PROJECT_ROOT))

def test_url_parsing():
    """Test URL parsing with the problematic Raphael video."""
    test_url = "https://youtu.be/YSUoSxafl6g"
    print("=" * 60)
    print("Testing Raphael Video URL Parsing")
    print("=" * 60)
    print(f"Test URL: {test_url}")
    print(f"Expected video_id: YSUoSxafl6g (length: 11)")
    print()
    
    # Test frontend extraction logic (from static/js/app.js)
    print("🧪 Testing frontend extraction patterns...")
    
    # Pattern from extractVideoId function
    js_pattern = r'^.*(youtu.be\/|v\/|e\/|u\/\w+\/|embed\/|v=)([^#\&\?]*).*'
    match = re.search(js_pattern, test_url)
    if match:
        extracted = match.group(2)
        print(f"✅ Frontend regex: '{extracted}' (length: {len(extracted)})")
        
        # Test validation
        is_valid = len(extracted) == 11 and re.match(r'^[a-zA-Z0-9_-]{11}$', extracted)
        print(f"   Valid: {is_valid}")
    else:
        print("❌ Frontend regex: No match")
    
    # Test backend extraction logic (from aiotube_client.py)
    print("\n🧪 Testing backend extraction patterns...")
    backend_pattern = r'youtu\.be/([^?&]+)'
    match = re.search(backend_pattern, test_url)
    if match:
        extracted = match.group(1)
        print(f"✅ Backend regex: '{extracted}' (length: {len(extracted)})")
        
        # Test validation
        is_valid = len(extracted) == 11 and re.match(r'^[a-zA-Z0-9_-]{11}$', extracted)
        print(f"   Valid: {is_valid}")
    else:
        print("❌ Backend regex: No match")

def test_search_simulation():
    """Simulate what happens during search."""
    print("\n" + "=" * 60)
    print("Simulating Search Process")
    print("=" * 60)
    
    # This is what should happen:
    # 1. User searches for "raphael"
    # 2. aiotube returns results with video_ids
    # 3. Frontend displays results
    # 4. User clicks download
    # 5. Frontend sends video_id to API
    
    expected_video_id = "YSUoSxafl6g"
    print(f"Expected flow:")
    print(f"1. Search 'raphael' -> find video_id: {expected_video_id}")
    print(f"2. User clicks download -> send video_id: {expected_video_id}")  
    print(f"3. API receives video_id: {expected_video_id}")
    print(f"4. DownloadItem created with video_id: {expected_video_id}")
    print(f"5. Download completes -> store in DB with video_id: {expected_video_id}")
    
    print(f"\nBut we're seeing in the logs:")
    print(f"- API receives: xHJoY0oSD_Y (11 chars) - different video!")
    print(f"- Download completes with: xHJoY0oSD (9 chars) - truncated!")
    
    print(f"\nThis suggests two issues:")
    print(f"1. The search is returning a DIFFERENT video (xHJoY0oSD_Y vs YSUoSxafl6g)")
    print(f"2. Even that different video gets truncated during processing")

def analyze_video_id_discrepancy():
    """Analyze why we're seeing different video IDs."""
    print("\n" + "=" * 60)
    print("Video ID Discrepancy Analysis") 
    print("=" * 60)
    
    expected_from_url = "YSUoSxafl6g"  # From the URL https://youtu.be/YSUoSxafl6g
    seen_in_logs = "xHJoY0oSD_Y"      # From the API debug logs
    truncated_in_db = "xHJoY0oSD"      # From the database
    
    print(f"URL video_id:       {expected_from_url} (length: {len(expected_from_url)})")
    print(f"API received:       {seen_in_logs} (length: {len(seen_in_logs)})")  
    print(f"Stored in DB:       {truncated_in_db} (length: {len(truncated_in_db)})")
    print()
    
    print("🤔 Possible explanations:")
    print("1. YouTube redirects/canonical URLs - the URL redirects to a different video")
    print("2. aiotube search returns different video than expected")
    print("3. Multiple videos with same title but different IDs")
    print("4. User is not actually using the URL but searching for 'Raphael'")
    
    print(f"\n🔍 Key insight:")
    print(f"The video_id xHJoY0oSD_Y is completely different from YSUoSxafl6g")
    print(f"This is NOT a truncation issue at the URL level")
    print(f"This suggests the user is searching for 'raphael' and getting a different video")

def test_multiple_raphael_videos():
    """Check if there are multiple Raphael videos."""
    print("\n" + "=" * 60)
    print("Multiple Raphael Videos Check")
    print("=" * 60)
    
    print("There might be multiple 'Raphaël - Caravane' videos on YouTube:")
    print("1. Official video: YSUoSxafl6g")
    print("2. Another version/upload: xHJoY0oSD_Y") 
    print("3. When user searches 'raphael', they get the second one")
    print("4. But when they paste the URL, they expect the first one")
    print()
    print("This would explain why deduplication fails:")
    print("- User 1 searches 'raphael' -> downloads xHJoY0oSD_Y")
    print("- User 2 uses URL -> expects YSUoSxafl6g")
    print("- Different videos = no deduplication match")

if __name__ == '__main__':
    test_url_parsing()
    test_search_simulation()
    analyze_video_id_discrepancy()
    test_multiple_raphael_videos()