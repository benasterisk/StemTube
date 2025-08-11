"""
File cleanup utilities for admin operations.
Handles safe deletion of download files and extraction directories.
"""
import os
import shutil
import json
from pathlib import Path
from typing import Tuple, List, Dict, Any

# Base directory for downloads - must match the app's download directory
DOWNLOADS_BASE_DIR = Path(__file__).parent / "downloads"

def is_safe_path(file_path: str) -> bool:
    """Check if a file path is within the allowed downloads directory."""
    try:
        file_path_obj = Path(file_path).resolve()
        base_dir_resolved = DOWNLOADS_BASE_DIR.resolve()
        
        # Ensure the path is within our downloads directory
        return str(file_path_obj).startswith(str(base_dir_resolved))
    except Exception:
        return False

def get_file_size(file_path: str) -> int:
    """Get file size in bytes, return 0 if file doesn't exist."""
    try:
        return os.path.getsize(file_path) if os.path.exists(file_path) else 0
    except Exception:
        return 0

def get_directory_size(dir_path: str) -> int:
    """Get total size of directory and all its contents."""
    total_size = 0
    try:
        for dirpath, dirnames, filenames in os.walk(dir_path):
            for filename in filenames:
                file_path = os.path.join(dirpath, filename)
                try:
                    total_size += os.path.getsize(file_path)
                except Exception:
                    continue  # Skip files we can't access
    except Exception:
        pass
    return total_size

def delete_download_files(download_info: Dict[str, Any]) -> Tuple[bool, str, Dict[str, Any]]:
    """
    Delete all files associated with a download including stems.
    
    Args:
        download_info: Dictionary containing download information from database
        
    Returns:
        Tuple of (success, message, cleanup_stats)
    """
    stats = {
        'files_deleted': [],
        'directories_deleted': [],
        'total_size_freed': 0,
        'errors': []
    }
    
    try:
        file_path = download_info.get('file_path')
        stems_paths_json = download_info.get('stems_paths')
        stems_zip_path = download_info.get('stems_zip_path')
        
        # Validate that all paths are safe
        paths_to_check = [file_path] if file_path else []
        
        if stems_paths_json:
            try:
                stems_paths = json.loads(stems_paths_json)
                if isinstance(stems_paths, dict):
                    paths_to_check.extend(stems_paths.values())
            except Exception:
                pass
        
        if stems_zip_path:
            paths_to_check.append(stems_zip_path)
        
        # Check all paths are safe before proceeding
        for path in paths_to_check:
            if path and not is_safe_path(path):
                return False, f"Unsafe path detected: {path}", stats
        
        # Delete the main audio file
        if file_path and os.path.exists(file_path):
            if is_safe_path(file_path):
                try:
                    file_size = get_file_size(file_path)
                    os.remove(file_path)
                    stats['files_deleted'].append(file_path)
                    stats['total_size_freed'] += file_size
                except Exception as e:
                    stats['errors'].append(f"Error deleting main file {file_path}: {str(e)}")
        
        # Delete stem files
        if stems_paths_json:
            try:
                stems_paths = json.loads(stems_paths_json)
                if isinstance(stems_paths, dict):
                    for stem_name, stem_path in stems_paths.items():
                        if stem_path and os.path.exists(stem_path) and is_safe_path(stem_path):
                            try:
                                file_size = get_file_size(stem_path)
                                os.remove(stem_path)
                                stats['files_deleted'].append(stem_path)
                                stats['total_size_freed'] += file_size
                            except Exception as e:
                                stats['errors'].append(f"Error deleting stem {stem_name} at {stem_path}: {str(e)}")
            except Exception as e:
                stats['errors'].append(f"Error parsing stems paths: {str(e)}")
        
        # Delete stems zip file
        if stems_zip_path and os.path.exists(stems_zip_path) and is_safe_path(stems_zip_path):
            try:
                file_size = get_file_size(stems_zip_path)
                os.remove(stems_zip_path)
                stats['files_deleted'].append(stems_zip_path)
                stats['total_size_freed'] += file_size
            except Exception as e:
                stats['errors'].append(f"Error deleting zip file {stems_zip_path}: {str(e)}")
        
        # Try to remove empty directories
        directories_to_clean = set()
        
        # Add parent directories of all deleted files
        for deleted_file in stats['files_deleted']:
            parent_dir = os.path.dirname(deleted_file)
            while parent_dir and parent_dir != str(DOWNLOADS_BASE_DIR):
                directories_to_clean.add(parent_dir)
                parent_dir = os.path.dirname(parent_dir)
        
        # Remove empty directories (from deepest to shallowest)
        for directory in sorted(directories_to_clean, key=len, reverse=True):
            try:
                if is_safe_path(directory) and os.path.exists(directory):
                    # Only remove if directory is empty
                    if not os.listdir(directory):
                        os.rmdir(directory)
                        stats['directories_deleted'].append(directory)
            except Exception as e:
                # Not an error - directory might not be empty or we might not have permissions
                pass
        
        success = len(stats['files_deleted']) > 0
        if success:
            message = f"Deleted {len(stats['files_deleted'])} files, freed {format_file_size(stats['total_size_freed'])}"
            if stats['errors']:
                message += f" with {len(stats['errors'])} errors"
        else:
            message = "No files were deleted"
            if stats['errors']:
                message += f" due to {len(stats['errors'])} errors"
        
        return success, message, stats
        
    except Exception as e:
        stats['errors'].append(f"Unexpected error: {str(e)}")
        return False, f"Error during cleanup: {str(e)}", stats

def delete_extraction_files_only(download_info: Dict[str, Any]) -> Tuple[bool, str, Dict[str, Any]]:
    """
    Delete only extraction-related files (stems), keeping the original download.
    
    Args:
        download_info: Dictionary containing download information from database
        
    Returns:
        Tuple of (success, message, cleanup_stats)
    """
    stats = {
        'files_deleted': [],
        'directories_deleted': [],
        'total_size_freed': 0,
        'errors': []
    }
    
    try:
        stems_paths_json = download_info.get('stems_paths')
        stems_zip_path = download_info.get('stems_zip_path')
        
        # Delete stem files
        if stems_paths_json:
            try:
                stems_paths = json.loads(stems_paths_json)
                if isinstance(stems_paths, dict):
                    for stem_name, stem_path in stems_paths.items():
                        if stem_path and os.path.exists(stem_path) and is_safe_path(stem_path):
                            try:
                                file_size = get_file_size(stem_path)
                                os.remove(stem_path)
                                stats['files_deleted'].append(stem_path)
                                stats['total_size_freed'] += file_size
                            except Exception as e:
                                stats['errors'].append(f"Error deleting stem {stem_name}: {str(e)}")
            except Exception as e:
                stats['errors'].append(f"Error parsing stems paths: {str(e)}")
        
        # Delete stems zip file
        if stems_zip_path and os.path.exists(stems_zip_path) and is_safe_path(stems_zip_path):
            try:
                file_size = get_file_size(stems_zip_path)
                os.remove(stems_zip_path)
                stats['files_deleted'].append(stems_zip_path)
                stats['total_size_freed'] += file_size
            except Exception as e:
                stats['errors'].append(f"Error deleting zip file: {str(e)}")
        
        # Try to remove empty stems directories
        stems_directories = set()
        for deleted_file in stats['files_deleted']:
            parent_dir = os.path.dirname(deleted_file)
            # Only clean up directories that look like stems directories
            if '/stems/' in parent_dir or parent_dir.endswith('/stems'):
                stems_directories.add(parent_dir)
        
        for directory in sorted(stems_directories, key=len, reverse=True):
            try:
                if is_safe_path(directory) and os.path.exists(directory) and not os.listdir(directory):
                    os.rmdir(directory)
                    stats['directories_deleted'].append(directory)
            except Exception:
                pass
        
        success = len(stats['files_deleted']) > 0
        message = f"Deleted {len(stats['files_deleted'])} extraction files, freed {format_file_size(stats['total_size_freed'])}"
        if stats['errors']:
            message += f" with {len(stats['errors'])} errors"
            
        return success, message, stats
        
    except Exception as e:
        stats['errors'].append(f"Unexpected error: {str(e)}")
        return False, f"Error during extraction cleanup: {str(e)}", stats

def format_file_size(size_bytes: int) -> str:
    """Format file size in human-readable format."""
    if size_bytes == 0:
        return "0 B"
    
    for unit in ['B', 'KB', 'MB', 'GB', 'TB']:
        if size_bytes < 1024.0:
            return f"{size_bytes:.1f} {unit}"
        size_bytes /= 1024.0
    
    return f"{size_bytes:.1f} PB"

def get_downloads_directory_usage() -> Dict[str, Any]:
    """Get overall usage statistics for the downloads directory."""
    stats = {
        'total_size': 0,
        'total_files': 0,
        'audio_files': 0,
        'audio_size': 0,
        'stem_files': 0,
        'stem_size': 0,
        'other_files': 0,
        'other_size': 0
    }
    
    try:
        if not DOWNLOADS_BASE_DIR.exists():
            return stats
            
        for root, dirs, files in os.walk(DOWNLOADS_BASE_DIR):
            for file in files:
                file_path = os.path.join(root, file)
                try:
                    file_size = os.path.getsize(file_path)
                    stats['total_size'] += file_size
                    stats['total_files'] += 1
                    
                    # Categorize files
                    if '/audio/' in root:
                        stats['audio_files'] += 1
                        stats['audio_size'] += file_size
                    elif '/stems/' in root:
                        stats['stem_files'] += 1
                        stats['stem_size'] += file_size
                    else:
                        stats['other_files'] += 1
                        stats['other_size'] += file_size
                        
                except Exception:
                    continue
                    
    except Exception:
        pass
    
    return stats