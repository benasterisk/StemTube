#!/usr/bin/env python3
"""
Test video ID extraction from the URL that's causing issues.
"""
import sys
import os
from pathlib import Path

# Add the project root to Python path
PROJECT_ROOT = Path(__file__).parent
sys.path.insert(0, str(PROJECT_ROOT))

try:
    from core.aiotube_client import get_aiotube_client
except ImportError as e:
    print(f"Error importing aiotube_client: {e}")
    sys.exit(1)

def test_video_id_extraction():
    """Test video ID extraction from the problematic URL."""
    test_url = "https://youtu.be/YSUoSxafl6g"
    expected_video_id = "YSUoSxafl6g"
    
    print("=" * 60)
    print("Testing Video ID Extraction")
    print("=" * 60)
    print(f"Test URL: {test_url}")
    print(f"Expected video ID: {expected_video_id} (length: {len(expected_video_id)})")
    print()
    
    try:
        # Test the backend client
        client = get_aiotube_client()
        
        print("🧪 Testing backend aiotube_client.get_video_info()...")
        result = client.get_video_info(test_url)
        
        if "error" in result:
            print(f"❌ Backend returned error: {result['error']}")
            return False
        
        if "items" in result and result["items"]:
            item = result["items"][0]
            backend_video_id = None
            
            if "id" in item:
                if isinstance(item["id"], dict) and "videoId" in item["id"]:
                    backend_video_id = item["id"]["videoId"]
                elif isinstance(item["id"], str):
                    backend_video_id = item["id"]
            
            print(f"📥 Backend extracted video ID: '{backend_video_id}'")
            print(f"   Length: {len(backend_video_id) if backend_video_id else 0}")
            
            if backend_video_id == expected_video_id:
                print("✅ Backend extraction is CORRECT")
            else:
                print("❌ Backend extraction is WRONG")
                print(f"   Expected: '{expected_video_id}' (length: {len(expected_video_id)})")
                print(f"   Got:      '{backend_video_id}' (length: {len(backend_video_id) if backend_video_id else 0})")
                return False
        else:
            print("❌ Backend returned no items")
            return False
            
    except Exception as e:
        print(f"❌ Error testing backend: {e}")
        import traceback
        traceback.print_exc()
        return False
    
    # Test URL parsing manually
    print("\n🧪 Testing manual URL parsing...")
    import re
    
    # Test various regex patterns
    patterns = [
        (r'youtu\.be/([^?&]+)', 'youtu.be pattern'),
        (r'v=([^&]+)', 'v= pattern'),
        (r'embed/([^?&]+)', 'embed pattern'),
        (r'shorts/([^?&]+)', 'shorts pattern'),
    ]
    
    for pattern, description in patterns:
        match = re.search(pattern, test_url)
        if match:
            extracted = match.group(1)
            print(f"✅ {description}: '{extracted}' (length: {len(extracted)})")
        else:
            print(f"❌ {description}: No match")
    
    return True

if __name__ == '__main__':
    success = test_video_id_extraction()
    if not success:
        print("\n❌ Video ID extraction test failed")
        sys.exit(1)
    else:
        print("\n✅ Video ID extraction test completed")