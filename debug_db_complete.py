#!/usr/bin/env python3
"""
Script pour débugger complètement la base de données
"""

import sqlite3
import os
import json
from datetime import datetime

def debug_complete_database():
    """Débugger complètement la base de données"""
    print("=== DÉBOGAGE COMPLET DE LA BASE DE DONNÉES ===\n")
    
    db_path = "stemtubes.db"
    
    if not os.path.exists(db_path):
        print("❌ Base de données non trouvée")
        return
    
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    
    # 1. Vérifier les tables existantes
    print("📋 TABLES DISPONIBLES:")
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
    tables = cursor.fetchall()
    for table in tables:
        print(f"  - {table['name']}")
    print()
    
    # 2. Analyser global_downloads
    print("📊 GLOBAL_DOWNLOADS:")
    cursor.execute("SELECT * FROM global_downloads ORDER BY created_at DESC LIMIT 10")
    global_downloads = cursor.fetchall()
    
    for download in global_downloads:
        print(f"  ID: {download['id']}")
        print(f"  Video ID: {download['video_id']}")
        print(f"  Title: {download['title'] if 'title' in download.keys() else 'N/A'}")
        print(f"  Extracted: {download['extracted'] if 'extracted' in download.keys() else 'N/A'}")
        print(f"  Created: {download['created_at'] if 'created_at' in download.keys() else 'N/A'}")
        
        if 'stems_paths' in download.keys() and download['stems_paths']:
            try:
                stems = json.loads(download['stems_paths'])
                print(f"  Stems: {list(stems.keys())}")
            except:
                print(f"  Stems: Erreur parsing")
        print()
    
    # 3. Analyser user_downloads
    print("👤 USER_DOWNLOADS:")
    cursor.execute("SELECT * FROM user_downloads ORDER BY created_at DESC LIMIT 10")
    user_downloads = cursor.fetchall()
    
    for download in user_downloads:
        print(f"  User ID: {download['user_id']}")
        print(f"  Download ID: {download['download_id']}")
        print(f"  Video ID: {download['video_id']}")
        print(f"  Title: {download['title'] if 'title' in download.keys() else 'N/A'}")
        print(f"  Extracted: {download['extracted'] if 'extracted' in download.keys() else 'N/A'}")
        print(f"  Created: {download['created_at'] if 'created_at' in download.keys() else 'N/A'}")
        print()
    
    # 4. Vérifier les extractions récentes par date
    print("🕒 EXTRACTIONS RÉCENTES (dernières 48h):")
    two_days_ago = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    
    cursor.execute("""
        SELECT * FROM user_downloads 
        WHERE extracted = 1 
        ORDER BY extracted_at DESC 
        LIMIT 10
    """)
    recent_extractions = cursor.fetchall()
    
    for extraction in recent_extractions:
        print(f"  📁 {extraction['title'] if 'title' in extraction.keys() else 'N/A'}")
        print(f"     User: {extraction['user_id']}, ID: {extraction['download_id']}")
        print(f"     Video: {extraction['video_id']}")
        print(f"     Extracted: {extraction['extracted_at'] if 'extracted_at' in extraction.keys() else 'N/A'}")
        print()
    
    conn.close()

def check_file_system_vs_database():
    """Comparer système de fichiers vs base de données"""
    print("=== COMPARAISON FICHIERS VS BASE DE DONNÉES ===\n")
    
    # Chercher tous les dossiers avec stems
    stems_dirs = []
    for root, dirs, files in os.walk("core/downloads"):
        if "stems" in dirs:
            stems_path = os.path.join(root, "stems")
            if os.path.exists(stems_path):
                # Compter les fichiers MP3 dans stems
                mp3_files = [f for f in os.listdir(stems_path) if f.endswith('.mp3')]
                if mp3_files:
                    stems_dirs.append({
                        'path': stems_path,
                        'parent': os.path.basename(root),
                        'stems': mp3_files
                    })
    
    print(f"📁 DOSSIERS AVEC STEMS TROUVÉS: {len(stems_dirs)}")
    
    # Base de données
    conn = sqlite3.connect("stemtubes.db")
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    
    cursor.execute("SELECT COUNT(*) as count FROM user_downloads WHERE extracted = 1")
    db_extractions = cursor.fetchone()['count']
    
    print(f"💾 EXTRACTIONS EN BASE: {db_extractions}")
    print()
    
    print("📋 DÉTAIL DES STEMS SUR DISQUE:")
    for stems_dir in stems_dirs:
        print(f"  📂 {stems_dir['parent']}")
        print(f"     Path: {stems_dir['path']}")
        print(f"     Stems: {stems_dir['stems']}")
        print()
    
    conn.close()

if __name__ == "__main__":
    debug_complete_database()
    check_file_system_vs_database()