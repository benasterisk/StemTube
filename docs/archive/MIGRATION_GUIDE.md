# Migration Guide: Old Prod -> New Prod

## Current Situation

You deployed the DEV code to the production machine, but you need to recover:
- ✅ The **real user database** (users, passwords, admin)
- ✅ The **real downloads** (original MP3 files)
- ✅ The **real extractions** (separated stems)

## 🎯 Automatic Solution (Recommended)

### Step 1: Configuration

Edit `migrate_from_old_prod.sh` and update these variables:

```bash
# Old production machine
OLD_PROD_HOST="user@old-prod-server.com"  # <-- UPDATE
OLD_PROD_PATH="/opt/stemtube/StemTube-dev"  # <-- UPDATE if different

# New machine (current)
NEW_PROD_PATH="/path/to/StemTube-dev"  # <-- OK if you are here
```

**Examples for OLD_PROD_HOST:**
- `root@192.168.1.100` (IP access)
- `michael@prod.example.com` (hostname access)
- `ubuntu@stemtube-prod` (if set in ~/.ssh/config)

### Step 2: Test SSH connection

Verify you can connect to the old machine:

```bash
ssh user@old-prod-server.com
```

If it works, you are ready. Otherwise, configure SSH keys:

```bash
# Copy your public key to the old machine
ssh-copy-id user@old-prod-server.com
```

### Step 3: Run the migration

```bash
# Make the script executable
chmod +x migrate_from_old_prod.sh

# Run the migration
./migrate_from_old_prod.sh
```

The script will:
1. ✅ Back up your current DEV data
2. ✅ Download the PROD database
3. ✅ Download all audio files
4. ✅ Verify integrity

**Estimated time:** 5-60 minutes depending on data size.

### Step 4: Restart

```bash
# Start the app with the real PROD data
python app.py
```

Test login with your normal PROD accounts.

---

## 🔧 Manual Solution (Alternative)

If you prefer to control each step manually:

### 1. Back up current DEV data

```bash
# Create a backup directory
mkdir -p ~/stemtube_backup_$(date +%Y%m%d)
cd ~/stemtube_backup_$(date +%Y%m%d)

# Back up the DEV database
cp /path/to/StemTube-dev/stemtubes.db ./stemtubes_dev.db

# Back up the DEV files
cp -r /path/to/StemTube-dev/core/downloads ./downloads_dev/
```

### 2. Stop the app

```bash
# Find the process
ps aux | grep "python.*app.py"

# Stop it cleanly
pkill -f "python.*app.py"
```

### 3. Fetch the PROD database

```bash
# Method 1: rsync (resume if interrupted)
rsync -avzh --progress \
  user@old-prod:/opt/stemtube/StemTube-dev/stemtubes.db \
  /path/to/StemTube-dev/stemtubes.db

# Method 2: scp (simple)
scp user@old-prod:/opt/stemtube/StemTube-dev/stemtubes.db \
  /path/to/StemTube-dev/stemtubes.db
```

### 4. Fetch PROD audio files

```bash
# Warning: may be large and slow
rsync -avzh --progress \
  user@old-prod:/opt/stemtube/StemTube-dev/core/downloads/ \
  /path/to/StemTube-dev/core/downloads/
```

**Tip:** To resume an interrupted transfer, just re-run the same rsync command.

### 5. Verify integrity

```bash
cd /path/to/StemTube-dev

# Check database integrity
sqlite3 stemtubes.db "PRAGMA integrity_check;"
# Should output: ok

# Count users
sqlite3 stemtubes.db "SELECT COUNT(*) FROM users;"

# Count downloads
sqlite3 stemtubes.db "SELECT COUNT(*) FROM global_downloads;"

# Check files
find core/downloads -name "*.mp3" | wc -l
```

### 6. Fix permissions

```bash
chmod -R u+rw core/downloads
chmod 644 stemtubes.db
```

### 7. Restart

```bash
python app.py
```

---

## 🔍 Post-Migration Checks

After the app restarts, verify:

### 1. Admin login
- Go to http://localhost:5011
- Log in with your usual PROD admin account
- ✅ If it works -> DB is good

### 2. User list
- Go to the "Users Administration" tab
- Verify all PROD users are present

### 3. Downloads and extractions
- Check the "Downloads" tab
- Check the "Extractions" tab
- ✅ Lists should match the old PROD

### 4. Mixer
- Open an extraction in the mixer
- Verify stems load correctly
- ✅ Audio should play with no 404 errors

### 5. Library (if enabled)
- Verify the global library shows all content

---

## 🚨 Troubleshooting

### Error: "Connection refused" during SSH

**Cause:** SSH is not accessible or blocked by firewall.

**Fix:**
```bash
# Verify SSH works
ssh -v user@old-prod-server.com

# If timeout, check firewall
ping old-prod-server.com
```

### Error: "Permission denied" during rsync

**Cause:** Insufficient permissions on the old machine.

**Fix:**
```bash
# Connect with sudo if needed
ssh user@old-prod-server.com "sudo chmod -R +r /opt/stemtube/StemTube-dev"
```

### Error: "No space left on device"

**Cause:** Not enough disk space.

**Fix:**
```bash
# Check available space
df -h /path/to/StemTube-dev

# Free up space if needed
# Remove old logs, tmp files, etc.
```

### Database corrupted after transfer

**Cause:** Interrupted transfer.

**Fix:**
```bash
# Restore backup and retry
cp ~/stemtube_backup_*/stemtubes_dev.db /path/to/StemTube-dev/stemtubes.db

# Re-download with rsync (verifies integrity)
rsync -avzh --progress --checksum \
  user@old-prod:/opt/stemtube/StemTube-dev/stemtubes.db \
  /path/to/StemTube-dev/stemtubes.db
```

### Stems do not load in mixer (404)

**Cause:** File paths are incorrect in the database.

**Fix:**
```bash
# Check paths in the database
sqlite3 stemtubes.db "SELECT id, title, stems_paths FROM global_downloads WHERE extracted=1 LIMIT 5;"

# If paths are absolute and wrong, fix them
# Example correction (ADAPT THIS):
sqlite3 stemtubes.db "UPDATE global_downloads SET stems_paths = REPLACE(stems_paths, '/old/path/', '/new/path/');"
```

---

## 📊 Typical Size Stats

Use this to estimate transfer time:

| Item | Typical Size | Transfer Time (100 Mbps) |
|------|--------------|--------------------------|
| Database | 10-100 MB | < 1 minute |
| 1 MP3 download | 5-15 MB | 1-2 seconds |
| 1 extraction (4 stems) | 20-60 MB | 5-10 seconds |
| 100 songs + extractions | 5-10 GB | 10-20 minutes |
| 1000 songs + extractions | 50-100 GB | 1-3 hours |

**Tip:** Run the transfer overnight if you have a lot of data.

---

## 🔐 Security

### Backup before migration

**IMPORTANT:** The script creates a backup automatically, but for safety:

```bash
# Full manual backup
tar -czf stemtube_backup_$(date +%Y%m%d).tar.gz \
  stemtubes.db \
  core/downloads/
```

### Keep the old machine

**Do NOT delete the old machine immediately.**

Wait at least 1 week after migration to make sure everything works.

---

## 📞 Support

If you hit problems:

1. Check logs: `tail -f logs/app.log`
2. Verify DB integrity: `sqlite3 stemtubes.db "PRAGMA integrity_check;"`
3. Check files: `find core/downloads -name "*.mp3" | head -20`

If things go badly, restore the backup:
```bash
cp ~/stemtube_backup_*/stemtubes_dev.db ./stemtubes.db
```

---

**Last updated:** 2025-10-28
