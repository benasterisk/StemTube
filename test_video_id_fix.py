#!/usr/bin/env python3
"""
Test the video_id extraction fix.
"""

def old_logic(item_id):
    """The old broken logic."""
    return item_id.split('_')[0] if '_' in item_id else item_id

def new_logic(item_id):
    """The new fixed logic."""
    if '_' in item_id:
        parts = item_id.split('_')
        # The timestamp is always the last part, video_id is everything before it
        return '_'.join(parts[:-1])
    else:
        return item_id

def test_extraction():
    """Test both extraction methods."""
    test_cases = [
        ("xHJoY0oSD_Y_1754695699", "xHJoY0oSD_Y"),  # Case from logs
        ("dQw4w9WgXcQ_1234567890", "dQw4w9WgXcQ"),   # Normal case without underscore
        ("abc_def_ghi_1234567890", "abc_def_ghi"),   # Multiple underscores
        ("simple_123456789", "simple"),              # Simple case
        ("nounderscore", "nounderscore"),            # No underscore
    ]
    
    print("Testing Video ID Extraction Fix")
    print("=" * 60)
    
    for download_id, expected_video_id in test_cases:
        old_result = old_logic(download_id)
        new_result = new_logic(download_id)
        
        old_correct = old_result == expected_video_id
        new_correct = new_result == expected_video_id
        
        print(f"Download ID: {download_id}")
        print(f"  Expected:   {expected_video_id}")
        print(f"  Old logic:  {old_result} {'✅' if old_correct else '❌'}")
        print(f"  New logic:  {new_result} {'✅' if new_correct else '❌'}")
        print()

if __name__ == '__main__':
    test_extraction()