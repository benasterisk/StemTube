#!/usr/bin/env python3
"""
Add video ID validation to prevent truncated video IDs from being stored.
"""
import re

def is_valid_youtube_video_id(video_id):
    """
    Validate a YouTube video ID.
    
    YouTube video IDs are exactly 11 characters long and contain only
    alphanumeric characters, hyphens, and underscores.
    
    Args:
        video_id (str): The video ID to validate
        
    Returns:
        bool: True if valid, False otherwise
    """
    if not video_id or not isinstance(video_id, str):
        return False
    
    # YouTube video IDs are exactly 11 characters
    if len(video_id) != 11:
        return False
    
    # Only alphanumeric, hyphen, and underscore are allowed
    if not re.match(r'^[a-zA-Z0-9_-]{11}$', video_id):
        return False
    
    return True

def validate_and_fix_frontend():
    """Show the JavaScript fix needed for frontend validation."""
    print("=" * 60)
    print("Frontend Fix (static/js/app.js)")
    print("=" * 60)
    
    print("Add this validation function:")
    print("""
function isValidYouTubeVideoId(videoId) {
    if (!videoId || typeof videoId !== 'string') {
        return false;
    }
    
    // YouTube video IDs are exactly 11 characters
    if (videoId.length !== 11) {
        return false;
    }
    
    // Only alphanumeric, hyphen, and underscore are allowed
    if (!/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
        return false;
    }
    
    return true;
}
""")
    
    print("\nModify the search results processing (around line 2420):")
    print("""
// Extract video ID
let videoId;
if (item.id && typeof item.id === 'object' && item.id.videoId) {
    videoId = item.id.videoId;
} else if (item.id && typeof item.id === 'string') {
    videoId = item.id;
} else {
    videoId = item.videoId || '';
}

// VALIDATE VIDEO ID
if (!isValidYouTubeVideoId(videoId)) {
    console.warn(`Invalid video ID found: '${videoId}' (length: ${videoId.length}) - skipping`);
    return; // Skip this invalid result
}

console.log(`Extracted valid videoId: ${videoId}`);
""")

def validate_and_fix_backend():
    """Show the backend fix needed for API validation."""
    print("\n" + "=" * 60)  
    print("Backend Fix (app.py)")
    print("=" * 60)
    
    print("Add this validation function to app.py:")
    print("""
def is_valid_youtube_video_id(video_id):
    \"\"\"Validate a YouTube video ID.\"\"\"
    if not video_id or not isinstance(video_id, str):
        return False
    
    # YouTube video IDs are exactly 11 characters
    if len(video_id) != 11:
        return False
    
    # Only alphanumeric, hyphen, and underscore are allowed
    import re
    if not re.match(r'^[a-zA-Z0-9_-]{11}$', video_id):
        return False
    
    return True
""")
    
    print("\nModify the add_download API endpoint (around line 667):")
    print("""
def add_download():
    data = request.json or {}
    required = ['video_id', 'title', 'thumbnail_url', 'download_type', 'quality']
    if any(f not in data for f in required):
        return jsonify({'error': 'Missing required fields'}), 400

    try:
        video_id = data['video_id']
        
        # VALIDATE VIDEO ID
        if not is_valid_youtube_video_id(video_id):
            return jsonify({
                'error': f'Invalid YouTube video ID: "{video_id}" (length: {len(video_id)})'
            }), 400
        
        download_type = DownloadType.AUDIO if str(data['download_type']).lower() == 'audio' else DownloadType.VIDEO
        quality = data['quality']
        
        # Continue with existing logic...
""")

if __name__ == '__main__':
    # Test the validation function
    test_cases = [
        ('dQw4w9WgXcQ', True),   # Valid 11-char ID
        ('7ejYNYwrryw', True),   # Valid 11-char ID  
        ('NOaN7zXK184', True),   # Valid 11-char ID
        ('HQmmM', False),        # Too short (5 chars)
        ('2cZ', False),          # Too short (3 chars)
        ('xHJoY0oSD', False),    # Too short (9 chars)
        ('dQw4w9WgXcQ123', False), # Too long (14 chars)
        ('dQw4w9WgXc!', False),  # Invalid character
        ('', False),             # Empty
        (None, False),           # None
    ]
    
    print("Testing video ID validation:")
    for video_id, expected in test_cases:
        result = is_valid_youtube_video_id(video_id)
        status = "✅" if result == expected else "❌"
        print(f"{status} '{video_id}' -> {result} (expected: {expected})")
    
    validate_and_fix_frontend()
    validate_and_fix_backend()
    
    print("\n" + "=" * 60)
    print("Summary")
    print("=" * 60)
    print("1. ✅ Fixed corrupted video IDs in database")
    print("2. 🔧 Need to add frontend validation in static/js/app.js")
    print("3. 🔧 Need to add backend validation in app.py")
    print("4. 🧪 Need to test deduplication with valid video IDs")
    print()
    print("After applying these fixes, deduplication should work properly!")