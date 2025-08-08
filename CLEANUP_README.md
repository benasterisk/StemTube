# StemTube Cleanup Utility

A utility script to safely clean up downloads and extractions from StemTube while preserving user accounts.

## Features

- ✅ **Safe Cleanup**: Removes downloads and extractions from database and filesystem
- ✅ **Preserves Users**: User accounts and authentication data remain intact
- ✅ **Database Backup**: Optional automatic database backup before cleanup
- ✅ **Date Filtering**: Option to keep recent downloads (last N days)
- ✅ **Dry Run Mode**: Preview what would be deleted without actual deletion
- ✅ **Detailed Stats**: Shows cleanup statistics and disk space freed
- ✅ **Safety Checks**: Multiple confirmation prompts and error handling

## Quick Start

```bash
# Preview what would be deleted (safe)
python cleanup_downloads.py --dry-run

# Full cleanup with backup (recommended)
python cleanup_downloads.py --backup-db

# Keep downloads from last 7 days
python cleanup_downloads.py --keep-recent 7 --backup-db

# Force cleanup without prompts (dangerous!)
python cleanup_downloads.py --force --backup-db
```

## What Gets Deleted

### Database Tables
- ❌ `global_downloads` - All download records
- ❌ `user_downloads` - All user access records  
- ✅ `users` - **PRESERVED** - User accounts remain intact

### Filesystem
- ❌ All directories in `core/downloads/`
- ❌ All audio files and stem extractions
- ❌ All ZIP archives

### What's Preserved
- ✅ User accounts and passwords
- ✅ Application settings (`core/config.json`)
- ✅ Database structure (tables remain, just emptied)
- ✅ Application code and dependencies

## Usage Examples

### Safe Preview
```bash
python cleanup_downloads.py --dry-run
```
Shows what would be deleted without making any changes.

### Recommended Cleanup
```bash
python cleanup_downloads.py --backup-db
```
Creates database backup, then cleans everything with confirmation prompts.

### Keep Recent Downloads
```bash
python cleanup_downloads.py --keep-recent 30 --backup-db
```
Deletes downloads older than 30 days, keeps recent ones.

### Automated Cleanup
```bash
python cleanup_downloads.py --force --backup-db
```
⚠️ **DANGEROUS**: Skips confirmation prompts - use in scripts only.

## Command Line Options

| Option | Description |
|--------|-------------|
| `--dry-run` | Preview mode - shows what would be deleted |
| `--backup-db` | Create database backup before cleanup |
| `--keep-recent DAYS` | Keep downloads from last N days |
| `--force` | Skip confirmation prompts (dangerous!) |
| `--help` | Show help message |

## Sample Output

```
StemTube Cleanup Utility
Database: /path/to/stemtubes.db
Downloads directory: /path/to/core/downloads
🔍 DRY RUN MODE - No actual changes will be made
------------------------------------------------------------
📊 Current Status:
   Database:
     • Global downloads: 9
     • User downloads: 13
     • User accounts: 2 (will be preserved)
     • Extractions: 7
   Filesystem:
     • Files: 112
     • Directories: 31
     • Total size: 0.37 GB

🧹 Will delete ALL downloads and extractions:
   • Global downloads: 9
   • User downloads: 13

📈 Cleanup Statistics:
   • Global downloads deleted: 9
   • User downloads deleted: 13
   • Directories deleted: 11
   • Files deleted: 112
   • Disk space freed: 380.2 MB

✅ Cleanup completed successfully!
```

## Safety Features

1. **Multiple Confirmations**: Requires typing 'yes' to confirm dangerous operations
2. **Dry Run Mode**: Always test with `--dry-run` first
3. **Database Backup**: Automatic backup creation with `--backup-db`
4. **User Preservation**: User accounts are never touched
5. **Error Handling**: Graceful handling of permission errors and missing files
6. **Detailed Logging**: Shows exactly what was deleted

## Recovery

If you need to recover after cleanup:

1. **Database**: Restore from backup created with `--backup-db`
2. **Files**: No recovery possible - files are permanently deleted
3. **Users**: User accounts are never deleted, no recovery needed

## Best Practices

1. **Always use `--dry-run` first** to preview changes
2. **Create backups** with `--backup-db` before real cleanup
3. **Consider `--keep-recent`** to preserve recent downloads
4. **Run during maintenance windows** when users aren't active
5. **Monitor disk space** before and after cleanup

## Troubleshooting

### Permission Errors
```bash
# Make script executable
chmod +x cleanup_downloads.py

# Run with proper permissions
sudo python cleanup_downloads.py --dry-run
```

### Import Errors
```bash
# Ensure you're in the StemTube root directory
cd /path/to/StemTube
python cleanup_downloads.py --dry-run
```

### Database Locked
Stop the StemTube application before running cleanup.

## Warning ⚠️

**This operation cannot be undone!** 

- All downloads and extractions will be permanently deleted
- Files cannot be recovered from the filesystem
- Always use `--backup-db` for safety
- Test with `--dry-run` first

User accounts and authentication data are completely safe and will never be deleted.