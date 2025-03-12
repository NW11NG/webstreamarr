# M3U Channel Manager

A web-based application for scraping and managing M3U channels with custom headers. This application allows you to store and manage M3U URLs along with their associated headers (User-Agent, Referer, Origin) and channel icons.

## I probably won't maintain this, it works mostly but has issues with his blob storage streams. if you fix it your a legend

## For user with threadfin - might work with other stuff tho


## Features

- Scrape website for m3u link and associated headers
- Automatically schedule updates to get the new m3u & headers
- Add M3U channels with custom headers
- Upload channel icons
- View all saved channels
- Delete channels
- Persistent storage using SQLite

## Requirements

- Docker
- Port 34001 available on your system (Or Gluetun Instance)

## Quick Start

1. Build the Docker container:
```bash
docker build -t webstreamarr .
```

2. Run the container:
```bash
docker run -d -p 34001:34001 -v $(pwd)/channels.db:/app/channels.db webstreamarr
```
(Preferably use compose which an example is provided)

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

4. OR FOR MAGIC USE THE AUTODETECT IT WAS A PAIN TO GET WORKINGish)

## Data Persistence

The application uses SQLite for data storage. The database file is stored at `channels.db` and is mounted as a volume in the Docker container to ensure data persistence between container restarts.

## License

MIT 
