#!/usr/bin/env python3
"""
Test API validation with the problematic video ID.
"""
import requests
import json

def test_api_validation():
    """Test the API validation with various video IDs."""
    base_url = "http://localhost:5011"
    
    # Test cases
    test_cases = [
        {
            'video_id': 'YSUoSxafl6g',  # Correct 11-char ID
            'expected': 'should_work',
            'description': 'Valid 11-character ID'
        },
        {
            'video_id': 'xHJoY0oSD',    # Corrupted 9-char ID
            'expected': 'should_fail',
            'description': 'Invalid 9-character ID (corrupted)'
        },
        {
            'video_id': 'abc',          # Too short
            'expected': 'should_fail', 
            'description': 'Too short (3 characters)'
        },
        {
            'video_id': 'YSUoSxafl6g123', # Too long
            'expected': 'should_fail',
            'description': 'Too long (14 characters)'
        }
    ]
    
    print("=" * 60)
    print("Testing API Video ID Validation")
    print("=" * 60)
    print(f"API endpoint: {base_url}/api/downloads")
    print()
    
    for i, test in enumerate(test_cases, 1):
        print(f"Test {i}: {test['description']}")
        print(f"  Video ID: '{test['video_id']}' (length: {len(test['video_id'])})")
        
        # Prepare API request
        payload = {
            'video_id': test['video_id'],
            'title': 'Test Video',
            'thumbnail_url': 'https://example.com/thumb.jpg',
            'download_type': 'audio',
            'quality': 'best'
        }
        
        try:
            response = requests.post(
                f"{base_url}/api/downloads",
                json=payload,
                timeout=5
            )
            
            if test['expected'] == 'should_fail':
                if response.status_code == 400:
                    data = response.json()
                    if 'error' in data and 'Invalid YouTube video ID' in data['error']:
                        print(f"  ✅ CORRECT: API rejected invalid ID with proper error")
                        print(f"     Error: {data['error']}")
                    else:
                        print(f"  ⚠️  API rejected but with unexpected error: {data}")
                else:
                    print(f"  ❌ WRONG: API should have rejected this but got status {response.status_code}")
                    try:
                        print(f"     Response: {response.json()}")
                    except:
                        print(f"     Response: {response.text}")
            else:  # should_work
                if response.status_code == 200 or response.status_code == 401:  # 401 = not authenticated
                    if response.status_code == 401:
                        print(f"  ✅ CORRECT: API would accept valid ID (authentication required)")
                    else:
                        print(f"  ✅ CORRECT: API accepted valid ID")
                        data = response.json()
                        print(f"     Response: {data}")
                else:
                    print(f"  ❌ WRONG: API should accept valid ID but got status {response.status_code}")
                    try:
                        print(f"     Response: {response.json()}")
                    except:
                        print(f"     Response: {response.text}")
                        
        except requests.exceptions.ConnectionError:
            print(f"  ⚠️  Cannot connect to {base_url} - server not running?")
            return False
        except Exception as e:
            print(f"  ❌ Error testing API: {e}")
            return False
            
        print()
    
    return True

if __name__ == '__main__':
    success = test_api_validation()
    if success:
        print("✅ API validation test completed")
    else:
        print("❌ API validation test failed")