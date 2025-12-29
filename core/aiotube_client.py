"""
YouTube API client using aiotube for StemTubes application.
Alternative implementation that doesn't require an API key.
"""
import os
import json
import time
import sqlite3
import threading
from typing import Dict, List, Any, Optional, Tuple
from pathlib import Path

import aiotube
import re
import requests
from bs4 import BeautifulSoup

from .config import get_setting

# Constants
MAX_RESULTS_PER_PAGE = 50  # Increased limit to allow more results
SEARCH_CACHE_DURATION = 86400  # 24 hours

# Database for caching
DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "youtube_cache.db")


class AiotubeClient:
    """Client for interacting with YouTube using aiotube library."""

    def __init__(self):
        """Initialize the aiotube client."""
        # Cache for search results
        self._search_cache = {}
        self._search_cache_timestamps = {}

        # Initialize SQLite cache
        self._init_cache_db()

    def _init_cache_db(self):
        """Initialize SQLite cache database."""
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()

        # Table for searches
        cursor.execute('''
        CREATE TABLE IF NOT EXISTS search_cache (
            query TEXT,
            max_results INTEGER,
            page_token TEXT,
            filters TEXT,
            response TEXT,
            timestamp INTEGER,
            PRIMARY KEY (query, max_results, page_token, filters)
        )
        ''')

        # Table for suggestions
        cursor.execute('''
        CREATE TABLE IF NOT EXISTS suggestions_cache (
            query TEXT PRIMARY KEY,
            suggestions TEXT,
            timestamp INTEGER
        )
        ''')

        # Table for video information
        cursor.execute('''
        CREATE TABLE IF NOT EXISTS video_info_cache (
            video_id TEXT PRIMARY KEY,
            info TEXT,
            timestamp INTEGER
        )
        ''')

        conn.commit()
        conn.close()

    def search_videos(self, query: str, max_results: int = 5, 
                     page_token: Optional[str] = None, 
                     filters: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """Search for YouTube videos.

        Args:
            query: Search query.
            max_results: Maximum number of results to return.
            page_token: Token for pagination (not used with aiotube, kept for compatibility).
            filters: Additional filters for the search (not used with aiotube, kept for compatibility).

        Returns:
            Dictionary containing search results and pagination info.
        """
        # Validate max_results (allow up to 50)
        max_results = min(max(max_results, 1), 50)

        # Check cache in SQLite
        filters_str = json.dumps(filters or {}) if filters else "{}"
        page_token_str = page_token or ""

        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()

        cursor.execute(
            "SELECT response, timestamp FROM search_cache WHERE query = ? AND max_results = ? AND page_token = ? AND filters = ?",
            (query, max_results, page_token_str, filters_str)
        )
        result = cursor.fetchone()

        if result:
            response_str, timestamp = result
            # Check if cache is still valid
            if time.time() - timestamp < SEARCH_CACHE_DURATION:
                conn.close()
                return json.loads(response_str)

        try:
            # Use aiotube to search for videos
            print(f"[AiotubeClient] Searching for '{query}' with limit={max_results}")
            
            # Try to get more results by using a higher limit than requested
            # since aiotube might have internal limitations
            search_limit = max(max_results, 20)  # Always try to get at least 20 results
            search_results = aiotube.Search.videos(query, limit=search_limit)
            print(f"[AiotubeClient] Aiotube returned {len(search_results)} results")
            
            # Take only the requested number of results
            if len(search_results) > max_results:
                search_results = search_results[:max_results]
                print(f"[AiotubeClient] Trimmed to {len(search_results)} results as requested")
            
            # Create a response structure similar to YouTube API
            response = {
                "items": [],
                "pageInfo": {
                    "totalResults": len(search_results),
                    "resultsPerPage": len(search_results)
                }
            }
            
            # Add video details for each result
            for video_id in search_results:
                try:
                    # DEBUG: Log each video_id from search results
                    print(f"[AIOTUBE DEBUG] Processing video_id: '{video_id}' (length: {len(video_id)})")
                    
                    video = aiotube.Video(video_id)
                    metadata = video.metadata
                    
                    # Extract thumbnail URL correctly
                    thumbnail_url = ""
                    if "thumbnails" in metadata and metadata["thumbnails"] and len(metadata["thumbnails"]) > 0:
                        # Get the best quality thumbnail but not too large
                        best_thumbnail = None
                        best_width = 0

                        # Browse all thumbnails to find one with optimal width (approximately 336px)
                        for thumbnail in metadata["thumbnails"]:
                            if "url" in thumbnail and thumbnail["url"] and "width" in thumbnail:
                                width = thumbnail["width"]
                                # Prefer thumbnails between 200 and 400px wide
                                if 200 <= width <= 400 and width > best_width:
                                    best_thumbnail = thumbnail
                                    best_width = width
                        
                        # If no optimal thumbnail was found, take the last one (usually the largest)
                        if best_thumbnail:
                            thumbnail_url = best_thumbnail.get("url", "")
                        elif len(metadata["thumbnails"]) > 0:
                            # Take the last thumbnail (usually the largest)
                            thumbnail_url = metadata["thumbnails"][-1].get("url", "")
                    
                    # Clean up the thumbnail URL
                    if thumbnail_url:
                        # Remove query parameters that can cause problems
                        if '?' in thumbnail_url:
                            thumbnail_url = thumbnail_url.split('?')[0]

                    # Debug: Show metadata to understand the structure
                    print(f"DEBUG - Video ID: {video_id}")
                    print(f"DEBUG - Thumbnail URL: {thumbnail_url}")
                    print(f"DEBUG - Metadata keys: {metadata.keys()}")
                    if "thumbnails" in metadata:
                        print(f"DEBUG - Thumbnails: {metadata['thumbnails']}")
                    
                    # Extract duration correctly
                    duration = ""
                    if "duration" in metadata and metadata["duration"]:
                        # Convert seconds to detailed ISO 8601 format (with H, M, S as needed)
                        total_seconds = int(metadata["duration"])
                        hours = total_seconds // 3600
                        minutes = (total_seconds % 3600) // 60
                        seconds = total_seconds % 60

                        duration = "PT"
                        if hours > 0:
                            duration += f"{hours}H"
                        if minutes > 0 or hours > 0:  # Include M even if 0 when there are hours
                            duration += f"{minutes}M"
                        duration += f"{seconds}S"
                    
                    # DEBUG: Log the video_id being returned
                    print(f"[AIOTUBE DEBUG] Returning video_id: '{video_id}' with title: '{metadata.get('title', '')[:50]}...'")
                    
                    # Create a structure similar to YouTube API response
                    item = {
                        "id": video_id,
                        "snippet": {
                            "title": metadata.get("title", ""),
                            "channelTitle": metadata.get("channel", {}).get("name", ""),
                            "publishedAt": metadata.get("uploadDate", ""),
                            "thumbnails": {
                                "medium": {
                                    "url": thumbnail_url
                                }
                            }
                        },
                        "contentDetails": {
                            "duration": duration
                        },
                        "statistics": {
                            "viewCount": str(metadata.get("views", 0)),
                            "likeCount": str(metadata.get("likes", 0))
                        }
                    }
                    
                    response["items"].append(item)
                except Exception as e:
                    print(f"Error getting video details for {video_id}: {e}")
                    continue
            
            # Cache results in SQLite
            cursor.execute(
                "INSERT OR REPLACE INTO search_cache VALUES (?, ?, ?, ?, ?, ?)",
                (query, max_results, page_token_str, filters_str, json.dumps(response), int(time.time()))
            )
            conn.commit()
            
            return response
        except Exception as e:
            print(f"Error searching videos: {e}")
            return {"items": [], "error": str(e)}
        finally:
            conn.close()

    def get_video_info(self, video_id: str) -> Dict[str, Any]:
        """Get detailed information about a specific video."""
        # Check if it's an ID or a URL
        if "youtube.com/" in video_id or "youtu.be/" in video_id:
            # It's a URL, let's try to extract the ID
            print(f"YouTube URL detected: {video_id}", end="")
            try:
                # Extract video ID from URL
                if "youtube.com/watch" in video_id:
                    # Format standard: https://www.youtube.com/watch?v=VIDEO_ID
                    match = re.search(r'v=([^&]+)', video_id)
                    if match:
                        video_id = match.group(1)
                elif "youtu.be/" in video_id:
                    # Short format: https://youtu.be/VIDEO_ID
                    # Handle additional parameters like "si="
                    match = re.search(r'youtu\.be/([^?&]+)', video_id)
                    if match:
                        video_id = match.group(1)
                elif "youtube.com/embed/" in video_id:
                    # Format embed: https://www.youtube.com/embed/VIDEO_ID
                    match = re.search(r'embed/([^?&]+)', video_id)
                    if match:
                        video_id = match.group(1)
                elif "youtube.com/shorts/" in video_id:
                    # Format shorts: https://www.youtube.com/shorts/VIDEO_ID
                    match = re.search(r'shorts/([^?&]+)', video_id)
                    if match:
                        video_id = match.group(1)
                
                print(f" -> Extracted ID: {video_id}")
            except Exception as e:
                print(f"Error extracting ID: {e}")
                return {"error": f"Error extracting ID: {e}"}
        
        # Check if cache exists
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        
        cursor.execute(
            "SELECT info, timestamp FROM video_info_cache WHERE video_id = ?",
            (video_id,)
        )
        result = cursor.fetchone()

        if result:
            info_str, timestamp = result
            # Check if cache is still valid
            if time.time() - timestamp < SEARCH_CACHE_DURATION:
                conn.close()
                return json.loads(info_str)

        try:
            # Detect if the ID starts with a dash causing issues with aiotube
            if video_id.startswith('-'):
                # Alternative approach for IDs starting with a dash
                import requests
                from bs4 import BeautifulSoup
                
                # Create a basic response with the ID
                response = {
                    "items": [{
                        "id": {
                            "videoId": video_id  # Format compatible with frontend (item.id.videoId)
                        },
                        "snippet": {
                            "title": "",
                            "description": "",
                            "channelTitle": "",
                            "publishedAt": "",
                            "thumbnails": {
                                "default": {"url": f"https://i.ytimg.com/vi/{video_id}/default.jpg"},
                                "medium": {"url": f"https://i.ytimg.com/vi/{video_id}/mqdefault.jpg"},
                                "high": {"url": f"https://i.ytimg.com/vi/{video_id}/hqdefault.jpg"}
                            }
                        },
                        "contentDetails": {
                            "duration": ""
                        },
                        "statistics": {
                            "viewCount": "0",
                            "likeCount": "0"
                        }
                    }]
                }

                # Try to retrieve at least the title from the YouTube page
                try:
                    url = f"https://www.youtube.com/watch?v={video_id}"
                    headers = {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
                    }
                    r = requests.get(url, headers=headers)
                    if r.status_code == 200:
                        soup = BeautifulSoup(r.text, 'html.parser')
                        # Search for title in different ways
                        title = None
                        # Method 1: title tag
                        if soup.title:
                            title_text = soup.title.string
                            if ' - YouTube' in title_text:
                                title = title_text.replace(' - YouTube', '')
                        
                        if title:
                            response["items"][0]["snippet"]["title"] = title
                except Exception as web_error:
                    print(f"Error retrieving web information: {web_error}")
                    # Continue with basic information, without stopping the process
            else:
                # Use aiotube for standard IDs
                # Get video information using aiotube
                video = aiotube.Video(video_id)
                metadata = video.metadata
                
                # Extract thumbnail URL correctly
                thumbnail_url = ""
                if "thumbnails" in metadata and metadata["thumbnails"] and len(metadata["thumbnails"]) > 0:
                    # Get the best quality thumbnail but not too large
                    best_thumbnail = None
                    best_width = 0

                    # Browse all thumbnails to find one with optimal width (approximately 336px)
                    for thumbnail in metadata["thumbnails"]:
                        if "url" in thumbnail and thumbnail["url"] and "width" in thumbnail:
                            width = thumbnail["width"]
                            # Prefer thumbnails between 200 and 400px wide
                            if 200 <= width <= 400 and width > best_width:
                                best_thumbnail = thumbnail
                                best_width = width
                    
                    # If no optimal thumbnail was found, take the last one (usually the largest)
                    if best_thumbnail:
                        thumbnail_url = best_thumbnail.get("url", "")
                    elif len(metadata["thumbnails"]) > 0:
                        # Take the last thumbnail (usually the largest)
                        thumbnail_url = metadata["thumbnails"][-1].get("url", "")
                
                # Clean up the thumbnail URL
                if thumbnail_url:
                    # Remove query parameters that can cause problems
                    if '?' in thumbnail_url:
                        thumbnail_url = thumbnail_url.split('?')[0]

                # Debug: Show metadata to understand the structure
                print(f"DEBUG - Video ID: {video_id}")
                print(f"DEBUG - Thumbnail URL: {thumbnail_url}")
                print(f"DEBUG - Metadata keys: {metadata.keys()}")
                if "thumbnails" in metadata:
                    print(f"DEBUG - Thumbnails: {metadata['thumbnails']}")
                
                # Extract duration correctly
                duration = ""
                if "duration" in metadata and metadata["duration"]:
                    # Convert seconds to detailed ISO 8601 format (with H, M, S as needed)
                    total_seconds = int(metadata["duration"])
                    hours = total_seconds // 3600
                    minutes = (total_seconds % 3600) // 60
                    seconds = total_seconds % 60

                    duration = "PT"
                    if hours > 0:
                        duration += f"{hours}H"
                    if minutes > 0 or hours > 0:  # Include M even if 0 when there are hours
                        duration += f"{minutes}M"
                    duration += f"{seconds}S"
                
                # Create a structure similar to YouTube API response
                response = {
                    "items": [{
                        "id": {
                            "videoId": video_id  # Format compatible with frontend (item.id.videoId)
                        },
                        "snippet": {
                            "title": metadata.get("title", ""),
                            "description": metadata.get("description", ""),
                            "channelTitle": metadata.get("channel", {}).get("name", ""),
                            "publishedAt": metadata.get("uploadDate", ""),
                            "thumbnails": {
                                "default": {"url": thumbnail_url},
                                "medium": {"url": thumbnail_url},
                                "high": {"url": thumbnail_url}
                            }
                        },
                        "contentDetails": {
                            "duration": duration
                        },
                        "statistics": {
                            "viewCount": str(metadata.get("views", 0)),
                            "likeCount": str(metadata.get("likes", 0))
                        }
                    }]
                }
            
            # Cache results in SQLite
            cursor.execute(
                "INSERT OR REPLACE INTO video_info_cache VALUES (?, ?, ?)",
                (video_id, json.dumps(response), int(time.time()))
            )
            conn.commit()

            return response
        except Exception as e:
            print(f"Error getting video info: {e}")
            return {"error": str(e)}
        finally:
            conn.close()

    def get_search_suggestions(self, query: str) -> List[str]:
        """Get search suggestions for a query.

        Args:
            query: Partial search query.

        Returns:
            List of search suggestions.
        """
        if not query:
            return []

        # Check cache in SQLite
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()

        cursor.execute(
            "SELECT suggestions, timestamp FROM suggestions_cache WHERE query = ?",
            (query,)
        )
        result = cursor.fetchone()

        if result:
            suggestions_str, timestamp = result
            # Check if cache is still valid
            if time.time() - timestamp < SEARCH_CACHE_DURATION * 7:  # 7 days for suggestions
                conn.close()
                return json.loads(suggestions_str)

        try:
            # Search for videos using the query
            search_results = aiotube.Search.videos(query, limit=3)
            
            # Extract titles as suggestions
            suggestions = []
            for video_id in search_results:
                try:
                    video = aiotube.Video(video_id)
                    title = video.metadata.get("title", "")
                    if title and title not in suggestions:
                        suggestions.append(title)
                except Exception as e:
                    print(f"Error getting video title for {video_id}: {e}")
                    continue
            
            # Cache results in SQLite
            cursor.execute(
                "INSERT OR REPLACE INTO suggestions_cache VALUES (?, ?, ?)",
                (query, json.dumps(suggestions), int(time.time()))
            )
            conn.commit()
            
            return suggestions
        except Exception as e:
            print(f"Error getting search suggestions: {e}")
            return []
        finally:
            conn.close()

    def parse_video_duration(self, duration: str) -> int:
        """Parse duration format to seconds.

        Args:
            duration: Duration string.

        Returns:
            Duration in seconds.
        """
        if not duration:
            return 0
        
        try:
            # Parse duration in format like "3:45" or "1:23:45"
            parts = duration.split(':')
            if len(parts) == 2:  # MM:SS
                return int(parts[0]) * 60 + int(parts[1])
            elif len(parts) == 3:  # HH:MM:SS
                return int(parts[0]) * 3600 + int(parts[1]) * 60 + int(parts[2])
            else:
                return 0
        except (ValueError, IndexError):
            return 0

    def get_quota_remaining(self):
        """Get remaining quota for today.
        Included for compatibility with the original API client.
        aiotube doesn't use quotas.
        
        Returns:
            A high number to indicate unlimited quota.
        """
        return 1000000  # Effectively unlimited


# Create a singleton instance
_aiotube_client = None

def get_aiotube_client():
    """Get the aiotube client singleton instance.
    
    Returns:
        AiotubeClient instance.
    """
    global _aiotube_client
    if _aiotube_client is None:
        _aiotube_client = AiotubeClient()
    return _aiotube_client
