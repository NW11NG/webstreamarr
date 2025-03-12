# M3U Channel Manager

A web-based application for managing M3U channels with custom headers. This application allows you to store and manage M3U URLs along with their associated headers (User-Agent, Referer, Origin) and channel icons.

## Features

- Add M3U channels with custom headers
- Upload channel icons
- View all saved channels
- Delete channels
- Persistent storage using SQLite
- Modern, responsive web interface

## Requirements

- Docker
- Port 34001 available on your system

## Quick Start

1. Build the Docker container:
```bash
docker build -t m3u-channel-manager .
```

2. Run the container:
```bash
docker run -d -p 34001:34001 -v $(pwd)/channels.db:/app/channels.db m3u-channel-manager
```

3. Access the web interface at `http://localhost:34001`

## Usage

1. Open your web browser and navigate to `http://localhost:34001`
2. To add a new channel:
   - Enter the channel name
   - Paste the M3U URL
   - (Optional) Add an icon URL
   - (Optional) Add custom headers (User-Agent, Referer, Origin)
   - Click "Add Channel"
3. To delete a channel, click the "Delete" button on the channel card

## Data Persistence

The application uses SQLite for data storage. The database file is stored at `channels.db` and is mounted as a volume in the Docker container to ensure data persistence between container restarts.

## License

MIT 