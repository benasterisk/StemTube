# StemTube Service - systemctl Commands

The StemTube service is installed and configured with systemd.

## Available Commands

### Start the service
```bash
sudo systemctl start stemtube
```

### Stop the service
```bash
sudo systemctl stop stemtube
```

### Restart the service
```bash
sudo systemctl restart stemtube
```

### View service status
```bash
systemctl status stemtube
```

### Enable auto-start on boot
```bash
sudo systemctl enable stemtube
```
*(Already enabled by default)*

### Disable auto-start
```bash
sudo systemctl disable stemtube
```

## View logs

### Live logs
```bash
journalctl -u stemtube -f
```

### Last 50 logs
```bash
journalctl -u stemtube -n 50
```

### Logs since today
```bash
journalctl -u stemtube --since today
```

### Logs from the last hour
```bash
journalctl -u stemtube --since "1 hour ago"
```

## Additional log files

The service also writes logs in `logs/`:
- `logs/stemtube_app.log` - Flask app logs
- `logs/stemtube_ngrok.log` - ngrok tunnel logs
- `logs/stemtube_stop.log` - service stop logs
- `logs/stemtube.log` - main application logs
- `logs/stemtube_errors.log` - errors only
- `logs/stemtube_processing.log` - audio processing logs

## Service details

- **Service name**: `stemtube.service`
- **Config file**: `/etc/systemd/system/stemtube.service`
- **User**: `michael`
- **Working directory**: `/path/to/StemTube-dev`
- **Flask port**: `5011`
- **ngrok tunnel**: `https://definite-cockatoo-bold.ngrok-free.app`
- **Wrapper scripts**: `/usr/local/bin/ngrok`, `/usr/local/bin/ffmpeg`, `/usr/local/bin/ffprobe`

## What the service does

1. Loads environment variables from `.env`
2. Starts ngrok (HTTPS tunnel)
3. Starts the Flask app (`app.py`)
4. Writes PID files (`stemtube_app.pid`, `stemtube_ngrok.pid`)
5. Logs output to `logs/`
