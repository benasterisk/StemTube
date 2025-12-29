# Audio Files Migration Guide

**Total Downloads Directory Size**: 4.8 GB  
**Number of Downloaded Songs**: 38+ videos with audio and stems

## 🎯 Your Options

### Option 1: Keep Files in Original Location (RECOMMENDED FOR NOW)
**Best if**: You want to minimize disk space and keep both installations working

```bash
# Update v1.0 config to point to original downloads
nano ~/Documents/Dev/stemtube_v1.0/core/config.json
```

Change the `downloads_path` setting:
```json
{
  "downloads_path": "/home/michael/Documents/Dev/StemTube-dev/core/downloads"
}
```

**Pros:**
- ✓ No disk space needed (files stay in one location)
- ✓ Both installations can access the same files
- ✓ Fastest option (no copying needed)
- ✓ Good for testing before full migration

**Cons:**
- ✗ v1.0 still depends on StemTube-dev directory
- ✗ Can't delete old installation without breaking v1.0

---

### Option 2: Copy All Files to v1.0
**Best if**: You want v1.0 to be completely independent

```bash
# Full copy (will take several minutes, requires 4.8 GB)
cp -r /home/michael/Documents/Dev/StemTube-dev/core/downloads \
      /home/michael/Documents/Dev/stemtube_v1.0/core/

# Or use rsync for better control
rsync -av --progress \
  /home/michael/Documents/Dev/StemTube-dev/core/downloads/ \
  /home/michael/Documents/Dev/stemtube_v1.0/core/downloads/
```

**After copying, v1.0 will automatically use its local downloads directory.**

**Pros:**
- ✓ v1.0 is completely independent
- ✓ Can safely delete old installation
- ✓ Production-ready setup
- ✓ Files move with the installation

**Cons:**
- ✗ Requires 4.8 GB of additional disk space
- ✗ Takes several minutes to copy
- ✗ Disk I/O intensive operation

---

### Option 3: Selective Copy by User
**Best if**: You want to copy only certain users' downloads

```bash
# Show which downloads belong to which user
sqlite3 /home/michael/Documents/Dev/stemtube_v1.0/stemtubes.db \
  "SELECT DISTINCT u.username, COUNT(ud.id) as count 
   FROM users u 
   LEFT JOIN user_downloads ud ON u.id = ud.user_id 
   GROUP BY u.id 
   ORDER BY count DESC;"
```

Then copy specific directories based on user interest.

**Pros:**
- ✓ Save disk space (only copy what you need)
- ✓ Reduce clutter
- ✓ Faster than full copy

**Cons:**
- ✗ Manual management required
- ✗ Complex path tracking

---

## 📊 Storage Analysis

### Current Disk Space Usage
```
Downloads directory: 4.8 GB
  - Audio files: ~2.5 GB
  - Stem files: ~2.3 GB
```

### What You Get with Each Option

| Option | Disk Used | Time | Independence | Recommended |
|--------|-----------|------|--------------|------------|
| Keep Original | 0 GB | Instant | No | ✓ For Testing |
| Copy All | +4.8 GB | 5-10 min | Yes | ✓ For Production |
| Selective Copy | +0.5-4 GB | 2-5 min | Partial | • Maybe |

---

## 🚀 Recommended Setup (Best Practice)

**Phase 1: Test with Config Update (RIGHT NOW)**
1. Update v1.0 config to use original downloads directory
2. Verify application loads and users can access files
3. Test new downloads/extractions work properly
4. Confirm all analysis data is accessible

**Phase 2: Copy Files (When Satisfied)**
1. Once everything works, copy the downloads directory
2. Update config to use local downloads directory
3. Verify files are accessible from v1.0
4. Test that new extractions work

**Phase 3: Archive & Cleanup (Optional)**
1. Keep StemTube-dev as a backup
2. Or delete it once you're confident in v1.0

---

## 🔧 Implementation: Option 1 (Config Update)

**Step 1: Open the config file**
```bash
nano /home/michael/Documents/Dev/stemtube_v1.0/core/config.json
```

**Step 2: Find and update downloads_path**

Find this section:
```json
"downloads_path": "core/downloads"
```

Change to:
```json
"downloads_path": "/home/michael/Documents/Dev/StemTube-dev/core/downloads"
```

**Step 3: Save and exit**
- Press `Ctrl+O`, then `Enter` to save
- Press `Ctrl+X` to exit

**Step 4: Test**
```bash
cd /home/michael/Documents/Dev/stemtube_v1.0
python app.py
```

Then check if your 38 downloads appear in the application.

---

## 🔧 Implementation: Option 2 (Full Copy)

**Step 1: Check available disk space**
```bash
df -h /home/michael/Documents/Dev/
# Make sure you have at least 5 GB free
```

**Step 2: Copy files (using rsync for progress)**
```bash
rsync -av --progress \
  /home/michael/Documents/Dev/StemTube-dev/core/downloads/ \
  /home/michael/Documents/Dev/stemtube_v1.0/core/downloads/
```

**Step 3: Verify the copy**
```bash
du -sh /home/michael/Documents/Dev/stemtube_v1.0/core/downloads/
# Should show ~4.8 GB
```

**Step 4: Make sure config uses default path**
```bash
# Verify config has default setting
nano /home/michael/Documents/Dev/stemtube_v1.0/core/config.json
# Should show: "downloads_path": "core/downloads"
```

**Step 5: Test**
```bash
cd /home/michael/Documents/Dev/stemtube_v1.0
python app.py
```

---

## ✅ Verification Checklist

After implementing your chosen option:

- [ ] Application starts without errors
- [ ] Can log in with any user account
- [ ] 38 downloads appear in Downloads tab
- [ ] Can see extraction information for extracted songs
- [ ] Mixer loads audio files correctly
- [ ] Can play stems from existing extractions
- [ ] Can perform new downloads (test 1 short video)
- [ ] Can extract stems from new download
- [ ] No file path errors in browser console

---

## 🆘 Troubleshooting

**Problem: "File not found" errors when playing audio**
```
Solution: Config path is incorrect
1. Check config.json downloads_path setting
2. Verify the path actually exists
3. Try Option 1 (config update) first to test
```

**Problem: "Cannot access /old/location/downloads" errors**
```
Solution: Config still points to old location
1. Update config to absolute path
2. Or copy files to v1.0 (Option 2)
3. Restart application
```

**Problem: Disk space issues during copy**
```
Solution: Use Option 3 (selective copy)
1. Check what you actually need
2. Copy only essential downloads
3. Or clean up other files to free space
```

---

## 📝 Current Status

✅ **Completed:**
- Database migration (all 10 users, 38 downloads, 54 records)
- YouTube cache migration (73 cached searches)
- Backup files created

⏳ **Next Step (Pick One):**
1. **Option 1** (Recommended for testing): Update config to use original downloads path
2. **Option 2** (Recommended for production): Copy all files to v1.0
3. **Option 3** (For specific needs): Selective copy based on user preference

---

## 📞 Need Help?

If you get stuck:
1. Check the troubleshooting section above
2. Look at application logs: `tail -f app.log`
3. Database is backed up: `stemtubes.db.backup-20251114-203832`
4. Original installation is unchanged: `/home/michael/Documents/Dev/StemTube-dev`

