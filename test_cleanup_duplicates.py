#!/usr/bin/env python3
"""Test script to run the duplicate cleanup function."""
import sys
from pathlib import Path

# Add the project root to Python path
PROJECT_ROOT = Path(__file__).parent
sys.path.insert(0, str(PROJECT_ROOT))

from core.downloads_db import cleanup_duplicate_user_downloads

def test_cleanup():
    print("Running duplicate cleanup function...")
    cleanup_duplicate_user_downloads()
    print("Cleanup completed!")

if __name__ == '__main__':
    test_cleanup()