"""
Download manager for StemTubes application.
Handles downloading YouTube videos and audio using yt-dlp.
"""
import os
import time
import threading
import queue
import re
from typing import Dict, List, Optional, Callable, Any
from dataclasses import dataclass
from enum import Enum

import yt_dlp
import librosa
import numpy as np

from .config import get_setting, update_setting, get_ffmpeg_path, DOWNLOADS_DIR, ensure_valid_downloads_directory


class DownloadType(Enum):
    """Enum for download types."""
    AUDIO = "audio"
    VIDEO = "video"


class DownloadStatus(Enum):
    """Enum for download status."""
    QUEUED = "queued"
    DOWNLOADING = "downloading"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"
    ERROR = "error"


@dataclass
class DownloadItem:
    """Class representing a download item."""
    video_id: str
    title: str
    thumbnail_url: str
    download_type: DownloadType
    quality: str
    status: DownloadStatus = DownloadStatus.QUEUED
    progress: float = 0.0
    speed: str = ""
    eta: str = ""
    file_path: str = ""
    error_message: str = ""
    download_id: str = ""
    cancel_event: threading.Event = None
    # Audio analysis fields
    detected_bpm: Optional[float] = None
    detected_key: Optional[str] = None
    analysis_confidence: Optional[float] = None
    
    def __post_init__(self):
        """Generate a unique download ID if not provided."""
        if not self.download_id:
            self.download_id = f"{self.video_id}_{int(time.time())}"
        if self.cancel_event is None:
            self.cancel_event = threading.Event()


class DownloadManager:
    """Manager for handling YouTube downloads."""
    
    def __init__(self):
        """Initialize the download manager."""
        self.download_queue = queue.Queue()
        self.active_downloads: Dict[str, DownloadItem] = {}
        self.completed_downloads: Dict[str, DownloadItem] = {}
        self.failed_downloads: Dict[str, DownloadItem] = {}
        self.queued_downloads: Dict[str, DownloadItem] = {}
        
        self.max_concurrent_downloads = get_setting("max_concurrent_downloads", 3)
        
        # Use the safe downloads directory validation function
        self.downloads_directory = ensure_valid_downloads_directory()
        
        # Create downloads directory if it doesn't exist
        os.makedirs(self.downloads_directory, exist_ok=True)
        
        # Start download worker thread
        self.worker_thread = threading.Thread(target=self._download_worker, daemon=True)
        self.worker_thread.start()
        
        # Callbacks
        self.on_download_progress: Optional[Callable[[str, float, str, str], None]] = None
        self.on_download_complete: Optional[Callable[[str, str, str], None]] = None
        self.on_download_error: Optional[Callable[[str, str], None]] = None
        self.on_download_start: Optional[Callable[[str], None]] = None
    
    def add_download(self, item: DownloadItem) -> str:
        """Add a download to the queue.
        
        Args:
            item: Download item to add.
            
        Returns:
            Download ID.
        """
        self.download_queue.put(item)
        self.queued_downloads[item.download_id] = item
        return item.download_id
    
    def cancel_download(self, download_id: str) -> bool:
        """Cancel a download.
        
        Args:
            download_id: ID of the download to cancel.
            
        Returns:
            True if the download was cancelled, False otherwise.
        """
        print(f"Attempting to cancel download: {download_id}")
        
        # Check if the download is active
        if download_id in self.active_downloads:
            item = self.active_downloads[download_id]
            item.status = DownloadStatus.CANCELLED
            
            # Signal cancellation to the download thread
            if item.cancel_event:
                item.cancel_event.set()
            
            # Move from active to failed
            del self.active_downloads[download_id]
            self.failed_downloads[download_id] = item
            
            # Notify of cancellation
            if self.on_download_error:
                self.on_download_error(download_id, "Download cancelled by user")
                
            print(f"Cancelled active download: {download_id}")
            return True
        
        # Check if the download is in the queue
        if download_id in self.queued_downloads:
            item = self.queued_downloads[download_id]
            item.status = DownloadStatus.CANCELLED
            
            # Signal cancellation
            if item.cancel_event:
                item.cancel_event.set()
            
            # Move from queue to failed
            del self.queued_downloads[download_id]
            self.failed_downloads[download_id] = item
            
            # Notify of cancellation
            if self.on_download_error:
                self.on_download_error(download_id, "Download cancelled by user")
                
            print(f"Cancelled queued download: {download_id}")
            return True
        
        # Check if the download is already completed
        if download_id in self.completed_downloads:
            print(f"Cannot cancel completed download: {download_id}")
            return False
            
        # Check if the download is already failed
        if download_id in self.failed_downloads:
            print(f"Cannot cancel failed download: {download_id}")
            return False
        
        print(f"Download not found for cancellation: {download_id}")
        return False
    
    def get_download_status(self, download_id: str) -> Optional[DownloadItem]:
        """Get the status of a download.
        
        Args:
            download_id: ID of the download.
            
        Returns:
            Download item or None if not found.
        """
        # Check active downloads
        if download_id in self.active_downloads:
            return self.active_downloads[download_id]
        
        # Check completed downloads
        if download_id in self.completed_downloads:
            return self.completed_downloads[download_id]
        
        # Check failed downloads
        if download_id in self.failed_downloads:
            return self.failed_downloads[download_id]
        
        # Check queued downloads
        if download_id in self.queued_downloads:
            return self.queued_downloads[download_id]
        
        return None
    
    def get_all_downloads(self) -> Dict[str, List[DownloadItem]]:
        """Get all downloads.
        
        Returns:
            Dictionary with active, queued, completed, and failed downloads.
        """
        return {
            "active": list(self.active_downloads.values()),
            "queued": list(self.queued_downloads.values()),
            "completed": list(self.completed_downloads.values()),
            "failed": list(self.failed_downloads.values())
        }

    def analyze_audio_with_librosa(self, audio_path: str) -> dict:
        """Analyse un fichier audio avec Librosa pour détecter BPM et tonalité."""
        try:
            print(f"🎵 [DOWNLOAD] Analyse Librosa de: {audio_path}")
            
            # Charger l'audio avec librosa (analyse des 60 premières secondes pour la vitesse)
            y, sr = librosa.load(audio_path, sr=None, duration=60)
            print(f"   📊 [DOWNLOAD] Audio chargé: {len(y)} échantillons à {sr} Hz")
            
            # === DÉTECTION BPM ===
            print("   🥁 [DOWNLOAD] Détection BPM...")
            
            # Méthode 1: Beat tracking de librosa
            tempo, beats = librosa.beat.beat_track(y=y, sr=sr)
            
            # Méthode 2: Onsets pour validation 
            onset_frames = librosa.onset.onset_detect(y=y, sr=sr, wait=1)
            onset_times = librosa.frames_to_time(onset_frames, sr=sr)
            
            # Calcul du tempo depuis les onsets comme validation
            if len(onset_times) > 1:
                onset_intervals = np.diff(onset_times)
                median_interval = np.median(onset_intervals)
                onset_tempo = 60.0 / median_interval if median_interval > 0 else tempo
                
                # Moyenne des deux méthodes si toutes deux sont raisonnables
                if 60 <= onset_tempo <= 200 and 60 <= tempo <= 200:
                    final_tempo = (tempo + onset_tempo) / 2
                elif 60 <= tempo <= 200:
                    final_tempo = tempo
                elif 60 <= onset_tempo <= 200:
                    final_tempo = onset_tempo
                else:
                    final_tempo = tempo  # Fallback
            else:
                final_tempo = tempo
                
            print(f"   ✅ [DOWNLOAD] BPM détecté: {float(final_tempo):.1f}")
            
            # === DÉTECTION TONALITÉ ===
            print("   🎹 [DOWNLOAD] Détection tonalité...")
            
            # Extraction des caractéristiques chromatiques
            chroma = librosa.feature.chroma_cqt(y=y, sr=sr)
            
            # Moyenne du chroma dans le temps
            chroma_mean = np.mean(chroma, axis=1)
            
            # Trouve la note dominante (index avec la plus haute énergie)
            dominant_note_idx = int(np.argmax(chroma_mean))
            
            # Noms des notes (C=0, C#=1, D=2, etc.)
            note_names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
            dominant_note = note_names[dominant_note_idx]
            
            # Détection majeur/mineur basée sur les patterns d'accords
            # Intervalles pour accords majeur et mineur
            major_intervals = [0, 4, 7]  # Fondamentale, tierce majeure, quinte
            minor_intervals = [0, 3, 7]  # Fondamentale, tierce mineure, quinte
            
            # Calcul de la force pour majeur vs mineur
            major_strength = sum(chroma_mean[(dominant_note_idx + interval) % 12] for interval in major_intervals)
            minor_strength = sum(chroma_mean[(dominant_note_idx + interval) % 12] for interval in minor_intervals)
            
            mode = "major" if major_strength > minor_strength else "minor"
            confidence = float(max(major_strength, minor_strength) / np.sum(chroma_mean))
            
            detected_key = f"{dominant_note} {mode}"
            
            print(f"   ✅ [DOWNLOAD] Tonalité détectée: {detected_key} (confiance: {confidence:.2f})")
            
            return {
                'bpm': round(float(final_tempo), 1),
                'key': detected_key,
                'confidence': round(float(confidence), 2)
            }
            
        except Exception as e:
            print(f"   ❌ [DOWNLOAD] Erreur lors de l'analyse Librosa: {e}")
            return {
                'bpm': None,
                'key': None,
                'confidence': None
            }
    
    def _download_worker(self):
        """Worker thread for processing downloads."""
        while True:
            # Check if we can start a new download
            if len(self.active_downloads) >= self.max_concurrent_downloads:
                time.sleep(1)
                continue
            
            try:
                # Get the next download item
                item = self.download_queue.get(block=False)
                
                # Check if the download was cancelled
                if item.status == DownloadStatus.CANCELLED:
                    self.failed_downloads[item.download_id] = item
                    del self.queued_downloads[item.download_id]
                    self.download_queue.task_done()
                    continue
                
                # Start the download
                self._start_download(item)
                
            except queue.Empty:
                # No downloads in the queue
                time.sleep(1)
    
    def _start_download(self, item: DownloadItem):
        """Start a download.
        
        Args:
            item: Download item to start.
        """
        # Update status
        item.status = DownloadStatus.DOWNLOADING
        self.active_downloads[item.download_id] = item
        del self.queued_downloads[item.download_id]
        
        # Notify download start
        if self.on_download_start:
            self.on_download_start(item.download_id)
        
        # Create individual directory for this YouTube video
        # Sanitize title for use as directory name
        safe_title = "".join([c if c.isalnum() or c in " -_" else "_" for c in item.title]).strip()
        video_dir = os.path.join(self.downloads_directory, safe_title)
        
        # Create subdirectory for the content type (audio, video, stems)
        output_dir = os.path.join(video_dir, item.download_type.value)
        os.makedirs(output_dir, exist_ok=True)
        
        # Configure yt-dlp options
        ydl_opts = {
            'format': self._get_format_string(item),
            'outtmpl': {'default': os.path.join(output_dir, '%(title)s.%(ext)s')},
            'progress_hooks': [lambda d: self._progress_hook(d, item)],
            'ffmpeg_location': get_ffmpeg_path(),
            'ignoreerrors': True,
            'quiet': True,
        }
        
        # Add postprocessors for audio downloads
        if item.download_type == DownloadType.AUDIO:
            # Configuration spécifique pour l'audio inspirée de l'implémentation originale
            ydl_opts['format'] = 'bestaudio/best'
            ydl_opts['postprocessors'] = [{
                'key': 'FFmpegExtractAudio',
                'preferredcodec': 'mp3',
                'preferredquality': '192',
            }, {
                # Add metadata postprocessor
                'key': 'FFmpegMetadata',
                'add_metadata': True,
            }]
            # Ensure FFmpeg is used with correct parameters
            ydl_opts['postprocessor_args'] = [
                '-ar', '44100',  # Set audio sample rate to 44.1kHz
                '-ac', '2',      # Set audio channels to stereo
                '-b:a', '192k',  # Set audio bitrate explicitly
            ]
        
        # Start download in a separate thread
        download_thread = threading.Thread(
            target=self._download_thread,
            args=(f"https://www.youtube.com/watch?v={item.video_id}", ydl_opts, item),
            daemon=True
        )
        download_thread.start()
    
    def _download_thread(self, url: str, ydl_opts: Dict[str, Any], item: DownloadItem):
        """Thread for downloading a video.
        
        Args:
            url: YouTube URL.
            ydl_opts: yt-dlp options.
            item: Download item.
        """
        try:
            # Check if download was cancelled before starting
            if item.cancel_event and item.cancel_event.is_set():
                print(f"Download {item.download_id} was cancelled before starting")
                return
            
            # Add a progress hook that checks for cancellation
            def cancellation_hook(d):
                if item.cancel_event and item.cancel_event.is_set():
                    raise yt_dlp.DownloadError("Download cancelled by user")
            
            # Add the cancellation hook to existing hooks
            existing_hooks = ydl_opts.get('progress_hooks', [])
            ydl_opts['progress_hooks'] = existing_hooks + [cancellation_hook]
            
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(url, download=True)
                
                # Get the downloaded file path
                if info:
                    if 'entries' in info:
                        # Playlist
                        info = info['entries'][0]
                    
                    # Get file extension
                    ext = 'mp3' if item.download_type == DownloadType.AUDIO else info.get('ext', 'mp4')
                    
                    # Get file path - outtmpl is now a dictionary
                    file_path = ydl_opts.get('outtmpl', {}).get('default')
                    if file_path:
                        # Replace placeholders with actual values
                        filename = ydl.prepare_filename(info)
                        
                        if item.download_type == DownloadType.AUDIO:
                            # For audio, yt-dlp changes the extension to mp3
                            filename = os.path.splitext(filename)[0] + '.mp3'
                            
                            # Vérifier que le fichier MP3 existe
                            if not os.path.exists(filename):
                                # Si le fichier MP3 n'existe pas, essayer de trouver un fichier avec le même nom mais une extension différente
                                base_filename = os.path.splitext(filename)[0]
                                for possible_ext in ['.webm', '.m4a', '.opus']:
                                    possible_file = base_filename + possible_ext
                                    if os.path.exists(possible_file):
                                        # Convertir manuellement en MP3 si nécessaire
                                        mp3_file = base_filename + '.mp3'
                                        self._convert_to_mp3(possible_file, mp3_file)
                                        filename = mp3_file
                                        break
                    
                        # Update file path
                        item.file_path = filename
                    
                    # Update status
                    item.status = DownloadStatus.COMPLETED
                    item.progress = 100.0
                    
                    # Assurez-vous que la progression atteint 100% dans l'interface
                    if self.on_download_progress:
                        self.on_download_progress(
                            item.download_id,
                            100.0,  # Force 100%
                            "",     # Pas de vitesse à afficher une fois terminé
                            ""      # Pas d'ETA à afficher une fois terminé
                        )
                    
                    # Attendre un court instant pour que la mise à jour à 100% soit visible
                    time.sleep(0.2)
                    
                    # Analyse Librosa pour audio seulement
                    if item.download_type == DownloadType.AUDIO and item.file_path and os.path.exists(item.file_path):
                        print(f"🎵 [DOWNLOAD] Démarrage de l'analyse Librosa pour: {item.title}")
                        analysis_results = self.analyze_audio_with_librosa(item.file_path)
                        
                        # Stocker les résultats dans l'item
                        item.detected_bpm = analysis_results.get('bpm')
                        item.detected_key = analysis_results.get('key')
                        item.analysis_confidence = analysis_results.get('confidence')
                        
                        print(f"📊 [DOWNLOAD] Analyse terminée: BPM={item.detected_bpm}, Key={item.detected_key}")
                        
                        # Mettre à jour la base de données avec les résultats d'analyse
                        try:
                            from .downloads_db import update_download_analysis
                            update_download_analysis(
                                item.video_id,
                                item.detected_bpm,
                                item.detected_key,
                                item.analysis_confidence
                            )
                        except Exception as e:
                            print(f"⚠️ [DOWNLOAD] Erreur mise à jour BDD analyse: {e}")
                    
                    # Move from active to completed
                    if item.download_id in self.active_downloads:
                        del self.active_downloads[item.download_id]
                    self.completed_downloads[item.download_id] = item
                    
                    # Notify completion
                    if self.on_download_complete:
                        self.on_download_complete(
                            item.download_id,
                            item.title,
                            item.file_path
                        )
                        
                    print(f"Download completed: {item.title}")
                    return
                
            # If we get here, the download failed
            item.status = DownloadStatus.ERROR
            item.error_message = "Failed to download video"
            
            # Move from active to failed
            if item.download_id in self.active_downloads:
                del self.active_downloads[item.download_id]
            self.failed_downloads[item.download_id] = item
            
            # Notify error
            if self.on_download_error:
                self.on_download_error(
                    item.download_id,
                    "Failed to download video"
                )
                
        except Exception as e:
            # Handle exception
            error_message = str(e)
            print(f"Download error: {error_message}")
            
            # Check if this was a cancellation
            if "cancelled by user" in error_message.lower() or (item.cancel_event and item.cancel_event.is_set()):
                item.status = DownloadStatus.CANCELLED
                item.error_message = "Download cancelled by user"
                print(f"Download {item.download_id} was cancelled")
            else:
                item.status = DownloadStatus.ERROR
                item.error_message = error_message
            
            # Move from active to failed
            if item.download_id in self.active_downloads:
                del self.active_downloads[item.download_id]
            self.failed_downloads[item.download_id] = item
            
            # Notify error
            if self.on_download_error:
                self.on_download_error(
                    item.download_id,
                    item.error_message
                )
    
    def _convert_to_mp3(self, input_file: str, output_file: str):
        """Convertir un fichier audio en MP3 en utilisant FFmpeg.
        
        Args:
            input_file: Chemin du fichier d'entrée.
            output_file: Chemin du fichier de sortie MP3.
        """
        try:
            import subprocess
            ffmpeg_path = get_ffmpeg_path()
            
            # Commande FFmpeg pour convertir en MP3
            cmd = [
                ffmpeg_path,
                '-i', input_file,
                '-vn',  # No video
                '-ar', '44100',  # Sample rate
                '-ac', '2',  # Stereo
                '-b:a', '192k',  # Bitrate
                '-f', 'mp3',  # Format
                output_file
            ]
            
            # Exécuter FFmpeg
            subprocess.run(cmd, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
            
            # Supprimer le fichier original si la conversion a réussi
            if os.path.exists(output_file) and os.path.getsize(output_file) > 0:
                try:
                    os.remove(input_file)
                except:
                    pass  # Ignorer les erreurs de suppression
                    
            return True
        except Exception as e:
            print(f"Error converting file to MP3: {e}")
            return False
    
    def _progress_hook(self, d: Dict[str, Any], item: DownloadItem):
        """Progress hook for yt-dlp.
        
        Args:
            d: Progress information from yt-dlp.
            item: Download item.
        """
        if d['status'] == 'downloading':
            # Calculate progress
            if 'total_bytes' in d:
                total = d['total_bytes']
                downloaded = d.get('downloaded_bytes', 0)
                item.progress = (downloaded / total) * 100 if total else 0
            elif 'total_bytes_estimate' in d:
                total = d['total_bytes_estimate']
                downloaded = d.get('downloaded_bytes', 0)
                item.progress = (downloaded / total) * 100 if total else 0
            
            # Update speed and ETA
            item.speed = self._clean_ansi_codes(d.get('_speed_str', ''))
            item.eta = self._clean_ansi_codes(d.get('_eta_str', ''))
            
            # Notify progress - always call the callback to ensure UI updates
            if self.on_download_progress:
                # S'assurer que l'item est dans active_downloads
                if item.download_id not in self.active_downloads and item.status != DownloadStatus.CANCELLED:
                    self.active_downloads[item.download_id] = item
                    
                # Envoyer la mise à jour de progression
                self.on_download_progress(
                    item.download_id,
                    item.progress,
                    item.speed,
                    item.eta
                )
        
        elif d['status'] == 'finished':
            # Download finished, now processing
            item.progress = 99.0
            item.speed = "Processing..."
            item.eta = ""
            
            # Notify progress
            if self.on_download_progress:
                self.on_download_progress(
                    item.download_id,
                    item.progress,
                    item.speed,
                    item.eta
                )
        
        elif d['status'] == 'error':
            # Download error
            item.status = DownloadStatus.ERROR
            item.error_message = d.get('error', 'Unknown error')
            
            # Move from active to failed
            del self.active_downloads[item.download_id]
            self.failed_downloads[item.download_id] = item
            
            # Notify download error
            if self.on_download_error:
                self.on_download_error(item.download_id, item.error_message)
    
    def _clean_ansi_codes(self, text: str) -> str:
        """Nettoyer les codes ANSI d'une chaîne de caractères.
        
        Args:
            text: Texte contenant potentiellement des codes ANSI.
            
        Returns:
            Texte nettoyé sans codes ANSI.
        """
        if not text:
            return ""
            
        # Motif regex pour détecter les codes ANSI
        ansi_pattern = re.compile(r'\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])')
        return ansi_pattern.sub('', text)
    
    def _get_format_string(self, item: DownloadItem) -> str:
        """Get the format string for yt-dlp.
        
        Args:
            item: Download item.
            
        Returns:
            Format string for yt-dlp.
        """
        if item.download_type == DownloadType.AUDIO:
            return "bestaudio/best"
        
        # Video format
        if item.quality == "best":
            return "bestvideo+bestaudio/best"
        elif item.quality == "4K":
            return "bestvideo[height<=2160]+bestaudio/best[height<=2160]"
        elif item.quality == "1080p":
            return "bestvideo[height<=1080]+bestaudio/best[height<=1080]"
        elif item.quality == "720p":
            return "bestvideo[height<=720]+bestaudio/best[height<=720]"
        elif item.quality == "480p":
            return "bestvideo[height<=480]+bestaudio/best[height<=480]"
        elif item.quality == "360p":
            return "bestvideo[height<=360]+bestaudio/best[height<=360]"
        else:
            return "bestvideo+bestaudio/best"
    
    def set_max_concurrent_downloads(self, max_downloads: int):
        """Set the maximum number of concurrent downloads.
        
        Args:
            max_downloads: Maximum number of concurrent downloads.
        """
        self.max_concurrent_downloads = max(1, max_downloads)
        update_setting("max_concurrent_downloads", self.max_concurrent_downloads)
    
    def set_downloads_directory(self, directory: str) -> bool:
        """Set the downloads directory.
        
        Args:
            directory: Directory to use for downloads.
            
        Returns:
            True if successful, False otherwise.
        """
        if os.path.isdir(directory):
            self.downloads_directory = directory
            
            # Create base directory
            os.makedirs(directory, exist_ok=True)
            
            update_setting("downloads_directory", directory)
            
            return True
        
        return False


# Create a singleton instance
_download_manager = None

def get_download_manager() -> DownloadManager:
    """Get the download manager singleton instance."""
    global _download_manager
    if _download_manager is None:
        _download_manager = DownloadManager()
    return _download_manager
