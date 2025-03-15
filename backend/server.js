const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');
const fetch = require('node-fetch');
const puppeteer = require('puppeteer');

const app = express();
const port = 34001;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors({
    origin: true, // Allow all origins
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'HEAD'],
    allowedHeaders: ['*'], // Allow all headers
    exposedHeaders: ['Content-Length', 'Content-Range'],
    credentials: true,
    maxAge: 86400 // Cache preflight requests for 24 hours
}));

// Static file serving - make sure this comes before other routes
app.use(express.static(path.join(__dirname, '../frontend'), {
    index: 'index.html',
    extensions: ['html']
}));

// Request logging
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} ${req.method} ${req.url}`);
    next();
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Error:', err);
    res.status(500).json({ error: 'Internal server error' });
});

const getVPNStatus = async () => {
  try {
    console.log('Checking VPN status at http://localhost:8000/v1/publicip');
    const response = await fetch('http://localhost:8000/v1/publicip', {
      timeout: 5000 // 5 second timeout
    });
    
    if (!response.ok) {
      console.error('VPN status check failed:', response.status, response.statusText);
      return null;
    }
    
    const data = await response.json();
    console.log('VPN status response:', data);
    
    if (!data.public_ip) {
      console.error('VPN status response missing public_ip');
      return null;
    }
    
    return {
      ip: data.public_ip,
      location: data.country || 'Unknown'
    };
  } catch (error) {
    console.error('Error fetching VPN status:', error);
    return null;
  }
};

// Add list of modern user agents
const USER_AGENTS = [
  // Windows Chrome
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  // Windows Firefox
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:123.0) Gecko/20100101 Firefox/123.0',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:122.0) Gecko/20100101 Firefox/122.0',
  // Windows Edge
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36 Edg/122.0.0.0',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36 Edg/121.0.0.0',
  // macOS Chrome
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  // macOS Safari
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2.1 Safari/605.1.15',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Safari/605.1.15'
];

// Function to get a random user agent
function getRandomUserAgent() {
  const randomIndex = Math.floor(Math.random() * USER_AGENTS.length);
  return USER_AGENTS[randomIndex];
}

// Stream processing function
const processStream = async (url, headers, res) => {
  console.log('Processing stream with headers:', headers);
  
  const ffmpegEnv = {
    ...process.env,
    FFREPORT: 'file=ffmpeg-report.log:level=32'
  };

  const ffmpegArgs = [
    '-loglevel', 'warning',
    '-reconnect', '1',
    '-reconnect_streamed', '1',
    '-reconnect_delay_max', '30',
    '-timeout', '30000000',
    '-http_persistent', '0',
    '-multiple_requests', '1',
    '-rw_timeout', '30000000',
    '-analyzeduration', '5000000',
    '-probesize', '5000000',
    '-fflags', '+genpts+igndts+nobuffer+flush_packets',
    '-flags', '+low_delay',
    '-avioflags', 'direct',
    '-vsync', 'cfr',              // Force CFR for better sync
    '-async', '1',                // Audio sync method
    '-protocol_whitelist', 'file,https,tls,tcp,crypto'
  ];

  // Add headers if provided
  const headerString = Object.entries(headers)
    .filter(([_, value]) => value)
    .map(([key, value]) => {
      // Clean header value by removing trailing semicolons and whitespace
      const cleanValue = value.replace(/[;\s]+$/, '').trim();
      switch(key) {
        case 'userAgent':
          return `User-Agent: ${cleanValue}`;
        case 'referer':
          return `Referer: ${cleanValue}`;
        case 'origin':
          return `Origin: ${cleanValue}`;
        default:
          return null;
      }
    })
    .filter(header => header)
    .join('\r\n');

  if (headerString) {
    ffmpegArgs.push('-headers', headerString + '\r\n');
  }

  ffmpegArgs.push(
    '-i', url,
    // Video transcoding settings for better streaming stability
    '-c:v', 'libx264',
    '-preset', 'veryfast',        // Changed from ultrafast for better quality/sync
    '-tune', 'zerolatency',
    '-profile:v', 'main',         // Changed to main profile for better quality
    '-level', '3.1',
    '-maxrate', '3000k',
    '-bufsize', '6000k',
    '-crf', '23',
    '-pix_fmt', 'yuv420p',
    '-g', '50',                   // Increased GOP size slightly
    '-keyint_min', '50',          // Match GOP size
    '-sc_threshold', '0',
    // Encoding options for better sync
    '-x264opts', 'no-scenecut:vbv-maxrate=3000:vbv-bufsize=6000:nal-hrd=cbr:force-cfr=1',
    // Scale down video if needed
    '-vf', 'scale=iw*min(1\\,min(1280/iw\\,720/ih)):ih*min(1\\,min(1280/iw\\,720/ih)),format=yuv420p',
    // Audio transcoding settings with sync corrections
    '-c:a', 'aac',
    '-b:a', '128k',
    '-ar', '44100',
    '-ac', '2',
    '-af', 'aresample=async=1000',  // Help with audio sync
    // Output format settings
    '-f', 'mpegts',
    '-muxdelay', '0',
    '-muxpreload', '0',
    'pipe:1'
  );

  console.log('FFmpeg command:', ffmpegArgs.join(' '));

  const ffmpeg = spawn('ffmpeg', ffmpegArgs, { 
    env: ffmpegEnv,
    stdio: ['pipe', 'pipe', 'pipe']
  });

  let hasError = false;
  let errorMessage = '';

  ffmpeg.stderr.on('data', (data) => {
    const message = data.toString();
    console.error('FFmpeg:', message);
    errorMessage += message;
    
    if ((message.includes('Error') || message.includes('Invalid')) && 
        !message.includes('HTTP error') && 
        !message.includes('SPS') && 
        !message.includes('probesize') && 
        !message.includes('Could not find codec parameters') &&
        !res.headersSent && 
        !hasError) {
      hasError = true;
      console.error('Fatal streaming error:', message);
      res.status(500).send('Stream processing error: ' + message);
      cleanupStream(ffmpeg);
    }
  });

  ffmpeg.stdout.on('data', (data) => {
    if (!res.headersSent) {
      console.log('First data received, length:', data.length);
    }
  });

  ffmpeg.on('error', (err) => {
    console.error('FFmpeg process error:', err);
    if (!res.headersSent && !hasError) {
      hasError = true;
      res.status(500).send('Stream processing error: ' + err.message);
      cleanupStream(ffmpeg);
    }
  });

  // Set response headers
  res.setHeader('Content-Type', 'video/mp2t');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Connection', 'close');

  // Only pipe if we haven't encountered an error
  if (!hasError) {
    ffmpeg.stdout.pipe(res);
    return ffmpeg;  // Return the FFmpeg process for cleanup
  }
  
  return null;
};

// Helper function to clean up stream resources
function cleanupStream(ffmpeg) {
  if (!ffmpeg) {
    console.log('No FFmpeg process to clean up');
    return;
  }

  try {
    console.log('Starting stream cleanup for process:', ffmpeg.pid);
    
    // Track cleanup status
    let cleanupComplete = false;
    const cleanupTimeout = setTimeout(() => {
      if (!cleanupComplete) {
        console.log('Cleanup taking too long, forcing process termination');
        try {
          if (ffmpeg.pid && !ffmpeg.killed) {
            process.kill(ffmpeg.pid, 'SIGKILL');
          }
        } catch (e) {
          console.log('Force kill failed:', e.message);
        }
      }
    }, 5000); // Force cleanup after 5 seconds

    // Force close any open file descriptors
    if (ffmpeg.stdio) {
      ffmpeg.stdio.forEach((stream, index) => {
        if (stream && !stream.destroyed) {
          try {
            stream.destroy();
            console.log(`Closed stdio stream ${index}`);
          } catch (e) {
            console.log(`Error destroying stdio stream ${index}:`, e.message);
          }
        }
      });
    }

    // Try graceful shutdown first
    if (ffmpeg.stdin && !ffmpeg.stdin.destroyed) {
      try {
        ffmpeg.stdin.end();
        ffmpeg.stdin.destroy();
        console.log('Closed stdin');
      } catch (e) {
        console.log('Error closing stdin:', e.message);
      }
    }
    
    if (ffmpeg.stdout && !ffmpeg.stdout.destroyed) {
      try {
        ffmpeg.stdout.unpipe();
        ffmpeg.stdout.destroy();
        console.log('Closed stdout');
      } catch (e) {
        console.log('Error closing stdout:', e.message);
      }
    }
    
    if (ffmpeg.stderr && !ffmpeg.stderr.destroyed) {
      try {
        ffmpeg.stderr.destroy();
        console.log('Closed stderr');
      } catch (e) {
        console.log('Error closing stderr:', e.message);
      }
    }

    // Try to kill the process if it exists
    if (ffmpeg.pid && !ffmpeg.killed) {
      try {
        // Send SIGTERM first for graceful shutdown
        ffmpeg.kill('SIGTERM');
        console.log('Sent SIGTERM to process');
        
        // Force kill after 2 seconds if still running
        setTimeout(() => {
          try {
            if (ffmpeg.pid && !ffmpeg.killed) {
              process.kill(ffmpeg.pid, 'SIGKILL');
              console.log('Force killed FFmpeg process:', ffmpeg.pid);
            }
          } catch (killError) {
            console.log('Process already terminated');
          }
        }, 2000);
      } catch (e) {
        console.log('Error killing process:', e.message);
        // Try force kill if SIGTERM fails
        try {
          if (ffmpeg.pid && !ffmpeg.killed) {
            process.kill(ffmpeg.pid, 'SIGKILL');
            console.log('Force killed FFmpeg process after SIGTERM failed');
          }
        } catch (killError) {
          console.log('Force kill failed:', killError.message);
        }
      }
    }

    // Remove all event listeners
    try {
      if (ffmpeg.stdout) {
        ffmpeg.stdout.removeAllListeners();
        console.log('Removed stdout listeners');
      }
      if (ffmpeg.stderr) {
        ffmpeg.stderr.removeAllListeners();
        console.log('Removed stderr listeners');
      }
      if (ffmpeg.removeAllListeners) {
        ffmpeg.removeAllListeners();
        console.log('Removed process listeners');
      }
    } catch (e) {
      console.log('Error removing listeners:', e.message);
    }

    cleanupComplete = true;
    clearTimeout(cleanupTimeout);
    console.log('Stream cleanup completed for process:', ffmpeg.pid);
  } catch (error) {
    console.log('Stream cleanup completed with error:', error.message);
  }
}

// Stream endpoint with connection tracking and improved cleanup
const activeStreams = new Map();

app.get('/proxy/stream', async (req, res) => {
  const { url, userAgent, referer, origin } = req.query;
  const streamId = Math.random().toString(36).substring(7);
  const clientIP = req.ip;

  if (!url) {
    return res.status(400).send('URL parameter is required');
  }

  // Clean header values by removing trailing semicolons and whitespace
  const cleanHeader = (value) => value ? value.replace(/[;\s]+$/, '').trim() : '';

  console.log(`Stream request [${streamId}] from ${clientIP}:`, {
    url,
    userAgent: cleanHeader(userAgent),
    referer: cleanHeader(referer),
    origin: cleanHeader(origin)
  });

  try {
    // Use random user agent if none provided
    const randomUserAgent = getRandomUserAgent();
    // Only use the essential headers with cleaned values
    const headers = {
      'User-Agent': cleanHeader(userAgent) || randomUserAgent,
      'Referer': cleanHeader(referer) || '',
      'Origin': cleanHeader(origin) || ''
    };

    console.log('Using stream headers with random User-Agent:', headers);
    
    // Add failure counter
    let failureCount = 0;
    const MAX_RETRIES = 3;
    
    async function attemptStreamAccess(attemptHeaders) {
      // Get a new random user agent for each attempt
      const currentUserAgent = getRandomUserAgent();
      const finalHeaders = {
        ...attemptHeaders,
        'User-Agent': currentUserAgent
      };
      
      console.log(`Attempt ${failureCount + 1} using User-Agent: ${currentUserAgent}`);
      
      const response = await fetch(url, { headers: finalHeaders });
      if (!response.ok) {
        if (response.status === 403 && failureCount < MAX_RETRIES) {
          failureCount++;
          console.log(`403 error encountered for URL: ${url}, attempt ${failureCount} of ${MAX_RETRIES}`);
          
          // Get channel info from database using the URL
          const channel = await new Promise((resolve, reject) => {
            db.get('SELECT * FROM channels WHERE m3u_url = ?', [url], (err, row) => {
              if (err) reject(err);
              else resolve(row);
            });
          });

          if (channel && channel.website_url) {
            // Use auto-detect to update headers
            const result = await new Promise(async (resolve, reject) => {
              const req = { body: { url: channel.website_url } };
              const res = {
                json: (data) => resolve(data),
                status: (code) => ({
                  json: (data) => reject(new Error(data.error || 'Auto-detect failed'))
                })
              };
              await autoDetectHandler(req, res);
            });

            // Update channel with new headers
            await new Promise((resolve, reject) => {
              db.run(`UPDATE channels 
                     SET user_agent = ?, 
                         referer = ?, 
                         origin = ?,
                         last_update = DATETIME('now')
                     WHERE id = ?`,
                [
                  result.headers.userAgent || channel.user_agent,
                  result.headers.referer || channel.referer,
                  result.headers.origin || channel.origin,
                  channel.id
                ],
                (err) => {
                  if (err) reject(err);
                  else resolve();
                });
            });

            console.log(`Channel ${channel.id} headers updated after 403 error (attempt ${failureCount})`);
            
            // Try the request again with new headers
            const updatedHeaders = {
              'User-Agent': result.headers.userAgent || attemptHeaders['User-Agent'],
              'Referer': result.headers.referer || attemptHeaders['Referer'],
              'Origin': result.headers.origin || attemptHeaders['Origin']
            };
            
            // Recursive call with new headers
            return attemptStreamAccess(updatedHeaders);
          } else {
            throw new Error(`Stream URL validation failed: ${response.status} ${response.statusText} (No channel found for auto-update)`);
          }
        } else if (response.status === 403) {
          throw new Error(`Stream URL validation failed: Maximum retry attempts (${MAX_RETRIES}) reached`);
        } else {
          throw new Error(`Stream URL validation failed: ${response.status} ${response.statusText}`);
        }
      }
      return response;
    }

    // Initial attempt
    await attemptStreamAccess(headers);
  } catch (error) {
    console.error('Stream validation error:', error);
    if (!res.headersSent) {
      return res.status(500).send(`Stream validation error: ${error.message}`);
    }
    return;
  }

  // Clean up any stale streams for this client
  const staleStreams = Array.from(activeStreams.values())
    .filter(stream => stream.clientIP === clientIP && 
           (Date.now() - stream.lastActive > 30000 || // Stale after 30 seconds of inactivity
            !stream.ffmpeg || 
            stream.ffmpeg.killed));
            
  if (staleStreams.length > 0) {
    console.log(`Found ${staleStreams.length} stale streams for client ${clientIP}, cleaning up`);
    staleStreams.forEach(stream => {
      cleanupStream(stream.ffmpeg);
      activeStreams.delete(stream.id);
    });
  }

  // Check for existing active stream for this URL from this client
  const existingStream = Array.from(activeStreams.values())
    .find(stream => stream.clientIP === clientIP && stream.url === url);

  if (existingStream && existingStream.ffmpeg && !existingStream.ffmpeg.killed) {
    console.log(`Client ${clientIP} already has an active stream for this URL, cleaning up old stream`);
    cleanupStream(existingStream.ffmpeg);
    activeStreams.delete(existingStream.id);
  }

  let currentStream = {
    id: streamId,
    url,
    clientIP,
    startTime: Date.now(),
    lastActive: Date.now(),
    ffmpeg: null,
    isActive: true
  };

  // Add this stream to active streams
  activeStreams.set(streamId, currentStream);

  // Set up keep-alive interval to update lastActive
  const keepAliveInterval = setInterval(() => {
    const stream = activeStreams.get(streamId);
    if (stream) {
      stream.lastActive = Date.now();
      activeStreams.set(streamId, stream);
    }
  }, 5000);

  // Remove stream when finished
  res.on('close', () => {
    console.log(`Stream [${streamId}] closed by client ${clientIP}`);
    clearInterval(keepAliveInterval);
    
    const stream = activeStreams.get(streamId);
    if (stream) {
      stream.isActive = false;
      if (stream.ffmpeg) {
        cleanupStream(stream.ffmpeg);
      }
      activeStreams.delete(streamId);
    }
    
    console.log(`Active streams: ${activeStreams.size}`);
    
    // Clean up any other stale streams
    const now = Date.now();
    Array.from(activeStreams.values())
      .filter(s => !s.isActive || now - s.lastActive > 30000)
      .forEach(s => {
        console.log(`Cleaning up stale stream [${s.id}]`);
        if (s.ffmpeg) cleanupStream(s.ffmpeg);
        activeStreams.delete(s.id);
      });
  });

  try {
    const ffmpegProcess = await processStream(url, { userAgent, referer, origin }, res);
    if (ffmpegProcess) {
      currentStream.ffmpeg = ffmpegProcess;
      activeStreams.set(streamId, currentStream);
      
      // Monitor ffmpeg process state
      ffmpegProcess.on('exit', (code, signal) => {
        console.log(`FFmpeg process [${streamId}] exited with code ${code} and signal ${signal}`);
        const stream = activeStreams.get(streamId);
        if (stream) {
          stream.isActive = false;
          activeStreams.delete(streamId);
        }
      });
    }
  } catch (error) {
    console.error(`Stream [${streamId}] processing error:`, error);
    clearInterval(keepAliveInterval);
    const stream = activeStreams.get(streamId);
    if (stream && stream.ffmpeg) {
      cleanupStream(stream.ffmpeg);
    }
    activeStreams.delete(streamId);
    if (!res.headersSent) {
      res.status(500).send('Stream processing error: ' + error.message);
    }
  }
});

// Add status endpoint to monitor active streams
app.get('/api/streams/status', (req, res) => {
  const status = Array.from(activeStreams.entries()).map(([id, stream]) => ({
    id,
    url: stream.url,
    duration: Date.now() - stream.startTime
  }));
  
  res.json({
    activeStreams: status,
    count: activeStreams.size
  });
});

// Status endpoint (simplified)
app.get('/api/proxy-status', async (req, res) => {
  const status = await getVPNStatus();
  res.json({
    connected: status !== null,
    ip: status?.ip || 'unknown',
    location: status?.location || 'unknown'
  });
});

// Database initialization
const dbFile = process.env.DATABASE_PATH || path.join(__dirname, '../data/channels.db');
const dbDir = path.dirname(dbFile);

if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
}

const db = new sqlite3.Database(dbFile, async (err) => {
    if (err) {
        console.error('Error opening database:', err);
        process.exit(1);
    } else {
        console.log('Connected to SQLite database at:', dbFile);
        
        try {
            // Create channels table with all fields
            await new Promise((resolve, reject) => {
                db.run(`CREATE TABLE IF NOT EXISTS channels (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL,
                    m3u_url TEXT NOT NULL,
                    website_url TEXT,
                    icon_url TEXT,
                    user_agent TEXT,
                    referer TEXT,
                    origin TEXT,
                    auto_update_enabled INTEGER DEFAULT 0,
                    auto_update_interval INTEGER DEFAULT 12,
                    last_update TEXT,
                    created_at TEXT,
                    updated_at TEXT
                )`, (err) => {
                    if (err) reject(err);
                    else resolve();
                });
            });
            console.log('Channels table ready');

            // Get existing columns
            const columns = await new Promise((resolve, reject) => {
                db.all("PRAGMA table_info(channels)", [], (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows.map(row => row.name));
                });
            });
            console.log('Existing columns:', columns);

            // Add missing columns if needed
            const requiredColumns = {
                'website_url': 'TEXT',
                'auto_update_enabled': 'INTEGER DEFAULT 0',
                'auto_update_interval': 'INTEGER DEFAULT 12',
                'last_update': 'TEXT',
                'created_at': 'TEXT',
                'updated_at': 'TEXT'
            };

            for (const [column, type] of Object.entries(requiredColumns)) {
                if (!columns.includes(column)) {
                    await new Promise((resolve, reject) => {
                        db.run(`ALTER TABLE channels ADD COLUMN ${column} ${type}`, (err) => {
                            if (err) reject(err);
                            else resolve();
                        });
                    });
                    console.log(`Added column: ${column}`);
                }
            }

            // Update any NULL values with defaults
            await new Promise((resolve, reject) => {
                db.run(`UPDATE channels 
                       SET auto_update_enabled = COALESCE(auto_update_enabled, 0),
                           auto_update_interval = COALESCE(auto_update_interval, 12),
                           created_at = COALESCE(created_at, DATETIME('now')),
                           updated_at = COALESCE(updated_at, DATETIME('now'))
                       WHERE auto_update_enabled IS NULL 
                          OR auto_update_interval IS NULL
                          OR created_at IS NULL
                          OR updated_at IS NULL`, (err) => {
                    if (err) reject(err);
                    else resolve();
                });
            });
            console.log('Updated default values');

            // Create triggers
            await new Promise((resolve, reject) => {
                db.run(`CREATE TRIGGER IF NOT EXISTS update_channels_timestamp 
                        AFTER UPDATE ON channels
                        BEGIN
                            UPDATE channels SET updated_at = DATETIME('now')
                            WHERE id = NEW.id;
                        END`, (err) => {
                    if (err) reject(err);
                    else resolve();
                });
            });

            await new Promise((resolve, reject) => {
                db.run(`CREATE TRIGGER IF NOT EXISTS set_channels_timestamps
                        AFTER INSERT ON channels
                        BEGIN
                            UPDATE channels 
                            SET created_at = DATETIME('now'),
                                updated_at = DATETIME('now')
                            WHERE id = NEW.id;
                        END`, (err) => {
                    if (err) reject(err);
                    else resolve();
                });
            });
            console.log('Triggers created');

            // Create user agents table
            await new Promise((resolve, reject) => {
                db.run(`CREATE TABLE IF NOT EXISTS user_agents (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    nickname TEXT NOT NULL UNIQUE,
                    user_agent TEXT NOT NULL,
                    created_at TEXT DEFAULT (DATETIME('now'))
                )`, (err) => {
                    if (err) reject(err);
                    else resolve();
                });
            });
            console.log('User agents table ready');

        } catch (error) {
            console.error('Error initializing database:', error);
            process.exit(1);
        }
    }
});

// Channel management endpoints
app.get('/api/channels', (req, res) => {
    console.log('GET /api/channels requested');
    db.all('SELECT * FROM channels', [], (err, rows) => {
        if (err) {
            console.error('Error fetching channels:', err);
            res.status(500).json({ error: err.message });
            return;
        }
        console.log('Returning channels:', rows);
        res.json(rows);
    });
});

// Get single channel endpoint
app.get('/api/channels/:id', (req, res) => {
    const { id } = req.params;
    console.log(`GET /api/channels/${id} requested`);
    
    db.get('SELECT * FROM channels WHERE id = ?', [id], (err, row) => {
        if (err) {
            console.error('Error fetching channel:', err);
            return res.status(500).json({ error: err.message });
        }
        if (!row) {
            return res.status(404).json({ error: 'Channel not found' });
        }
        res.json(row);
    });
});

app.post('/api/channels', (req, res) => {
    console.log('POST /api/channels requested');
    console.log('Request body:', req.body);
    
    const { 
        name, 
        m3u_url, 
        website_url,
        icon_url, 
        user_agent, 
        referer, 
        origin,
        auto_update_enabled,
        auto_update_interval 
    } = req.body;
    
    if (!name || !m3u_url) {
        console.error('Missing required fields');
        return res.status(400).json({ error: 'Name and M3U URL are required' });
    }

    const sql = `INSERT INTO channels (
        name, 
        m3u_url, 
        website_url,
        icon_url, 
        user_agent, 
        referer, 
        origin,
        auto_update_enabled,
        auto_update_interval
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`;
    
    const params = [
        name, 
        m3u_url, 
        website_url,
        icon_url, 
        user_agent, 
        referer, 
        origin,
        auto_update_enabled ? 1 : 0,
        auto_update_interval || 12
    ];
    
    console.log('Executing SQL:', sql);
    console.log('Parameters:', params);

    db.run(sql, params, function(err) {
        if (err) {
            console.error('Error inserting channel:', err);
            return res.status(500).json({ error: err.message });
        }
        console.log('Channel inserted successfully, ID:', this.lastID);
        res.status(201).json({ id: this.lastID });
    });
});

app.put('/api/channels/:id', (req, res) => {
    console.log('PUT /api/channels/:id requested');
    console.log('Request body:', req.body);
    
    const { id } = req.params;
    const { 
        name, 
        m3u_url, 
        website_url,
        icon_url, 
        user_agent, 
        referer, 
        origin,
        auto_update_enabled,
        auto_update_interval,
        last_update 
    } = req.body;
    
    if (!name || !m3u_url) {
        console.error('Missing required fields');
        return res.status(400).json({ error: 'Name and M3U URL are required' });
    }

    // Validate auto_update_interval (1 hour to 7 days)
    const interval = parseInt(auto_update_interval);
    if (auto_update_enabled && (isNaN(interval) || interval < 1 || interval > 168)) {
        return res.status(400).json({ error: 'Auto-update interval must be between 1 and 168 hours (7 days)' });
    }

    // Clean header values
    const cleanHeader = (value) => value ? value.replace(/[;\s]+$/, '').trim() : null;

    const sql = `UPDATE channels 
                 SET name = ?, 
                     m3u_url = ?, 
                     website_url = ?,
                     icon_url = ?, 
                     user_agent = ?, 
                     referer = ?, 
                     origin = ?,
                     auto_update_enabled = ?,
                     auto_update_interval = ?,
                     last_update = ?
                 WHERE id = ?`;
    
    const params = [
        name, 
        m3u_url, 
        website_url,
        icon_url, 
        cleanHeader(user_agent), 
        cleanHeader(referer), 
        cleanHeader(origin),
        auto_update_enabled ? 1 : 0,
        interval || 12,
        last_update,
        id
    ];
    
    console.log('Executing SQL:', sql);
    console.log('Parameters:', params);

    db.run(sql, params, function(err) {
        if (err) {
            console.error('Error updating channel:', err);
            return res.status(500).json({ error: err.message });
        }
        if (this.changes === 0) {
            return res.status(404).json({ error: 'Channel not found' });
        }
        console.log('Channel updated successfully');
        res.json({ message: 'Channel updated successfully' });
    });
});

app.delete('/api/channels/:id', (req, res) => {
    const { id } = req.params;
    db.run('DELETE FROM channels WHERE id = ?', id, (err) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        res.json({ message: 'Channel deleted successfully' });
    });
});

// User agent management endpoints
app.get('/api/user-agents', (req, res) => {
    console.log('GET /api/user-agents requested');
    db.all('SELECT * FROM user_agents ORDER BY nickname', [], (err, rows) => {
        if (err) {
            console.error('Error fetching user agents:', err);
            res.status(500).json({ error: err.message });
            return;
        }
        console.log('Returning user agents:', rows);
        res.json(rows);
    });
});

app.post('/api/user-agents', (req, res) => {
    console.log('POST /api/user-agents requested');
    console.log('Request body:', req.body);
    
    const { nickname, user_agent } = req.body;
    
    if (!nickname || !user_agent) {
        console.error('Missing required fields');
        return res.status(400).json({ error: 'Nickname and User Agent string are required' });
    }

    const sql = `INSERT INTO user_agents (nickname, user_agent) VALUES (?, ?)`;
    
    console.log('Executing SQL:', sql);
    console.log('Parameters:', [nickname, user_agent]);

    db.run(sql, [nickname, user_agent], function(err) {
        if (err) {
            if (err.message.includes('UNIQUE constraint failed')) {
                return res.status(409).json({ error: 'A user agent with this nickname already exists' });
            }
            console.error('Error inserting user agent:', err);
            return res.status(500).json({ error: err.message });
        }
        console.log('User agent inserted successfully, ID:', this.lastID);
        res.status(201).json({ id: this.lastID });
    });
});

app.delete('/api/user-agents/:id', (req, res) => {
    const { id } = req.params;
    db.run('DELETE FROM user_agents WHERE id = ?', id, (err) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        res.json({ message: 'User agent deleted successfully' });
    });
});

// Static stream endpoint
app.get('/static/stream/:channelId', async (req, res) => {
    const { channelId } = req.params;
    
    try {
        // Get channel from database
        const channel = await new Promise((resolve, reject) => {
            db.get('SELECT * FROM channels WHERE id = ?', [channelId], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });

        if (!channel) {
            return res.status(404).send('Channel not found');
        }

        // Clean header values
        const cleanHeader = (value) => value ? value.replace(/[;\s]+$/, '').trim() : '';

        // Construct the proxy URL with current headers
        const proxyUrl = new URL('/proxy/stream', `http://${req.headers.host}`);
        proxyUrl.searchParams.append('url', channel.m3u_url);
        
        if (channel.user_agent) proxyUrl.searchParams.append('userAgent', cleanHeader(channel.user_agent));
        if (channel.referer) proxyUrl.searchParams.append('referer', cleanHeader(channel.referer));
        if (channel.origin) proxyUrl.searchParams.append('origin', cleanHeader(channel.origin));

        // Redirect to the proxy URL
        res.redirect(proxyUrl.toString());
    } catch (error) {
        console.error('Error in static stream endpoint:', error);
        res.status(500).send('Internal server error');
    }
});

// M3U playlist endpoint
app.get('/api/playlist.m3u', async (req, res) => {
    console.log('M3U playlist requested');
    
    try {
        // Get all channels from the database, ordered by ID
        const channels = await new Promise((resolve, reject) => {
            db.all('SELECT * FROM channels ORDER BY id', [], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });

        // Set response headers for M3U file
        res.setHeader('Content-Type', 'application/x-mpegurl');
        res.setHeader('Content-Disposition', 'attachment; filename="channels.m3u"');

        // Write M3U header with Threadfin compatible format
        res.write('#EXTM3U\n');

        // Generate entries for each channel
        channels.forEach(channel => {
            // Create static URL for the stream
            const staticUrl = new URL(`/static/stream/${channel.id}`, `http://${req.headers.host}`);

            // Convert GitHub blob URL to raw URL if needed
            let iconUrl = channel.icon_url;
            if (iconUrl?.includes('github.com') && iconUrl.includes('/blob/')) {
                iconUrl = iconUrl.replace('github.com', 'raw.githubusercontent.com').replace('/blob/', '/');
            }

            // Write channel information in Threadfin compatible format
            res.write(`#EXTINF:-1 tvg-id="${channel.id}" tvg-name="${channel.name}"`);
            if (iconUrl) {
                res.write(` tvg-logo="${iconUrl}"`);
            }
            res.write(` group-title="ReStreamArr",${channel.name}\n`);
            res.write(`${staticUrl.toString()}\n`);
        });

        res.end();
    } catch (error) {
        console.error('Error generating playlist:', error);
        res.status(500).json({ error: 'Failed to generate playlist' });
    }
});

// Add a new endpoint to resequence channel IDs
app.post('/api/channels/resequence', async (req, res) => {
    console.log('Resequencing channel IDs...');
    
    try {
        // Start a transaction
        await new Promise((resolve, reject) => {
            db.run('BEGIN TRANSACTION', (err) => {
                if (err) reject(err);
                else resolve();
            });
        });

        // Get all channels ordered by ID
        const channels = await new Promise((resolve, reject) => {
            db.all('SELECT * FROM channels ORDER BY id', [], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });

        // Create temporary table
        await new Promise((resolve, reject) => {
            db.run(`CREATE TEMPORARY TABLE temp_channels AS SELECT * FROM channels`, (err) => {
                if (err) reject(err);
                else resolve();
            });
        });

        // Delete all records from main table
        await new Promise((resolve, reject) => {
            db.run('DELETE FROM channels', (err) => {
                if (err) reject(err);
                else resolve();
            });
        });

        // Reset the autoincrement
        await new Promise((resolve, reject) => {
            db.run('DELETE FROM sqlite_sequence WHERE name="channels"', (err) => {
                if (err) reject(err);
                else resolve();
            });
        });

        // Reinsert records with new sequential IDs
        for (let i = 0; i < channels.length; i++) {
            const channel = channels[i];
            await new Promise((resolve, reject) => {
                db.run(`INSERT INTO channels (
                    name, m3u_url, website_url, icon_url, user_agent, referer, origin,
                    auto_update_enabled, auto_update_interval, last_update, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    channel.name, channel.m3u_url, channel.website_url, channel.icon_url,
                    channel.user_agent, channel.referer, channel.origin,
                    channel.auto_update_enabled, channel.auto_update_interval,
                    channel.last_update, channel.created_at, channel.updated_at
                ],
                (err) => {
                    if (err) reject(err);
                    else resolve();
                });
            });
        }

        // Drop temporary table
        await new Promise((resolve, reject) => {
            db.run('DROP TABLE temp_channels', (err) => {
                if (err) reject(err);
                else resolve();
            });
        });

        // Commit transaction
        await new Promise((resolve, reject) => {
            db.run('COMMIT', (err) => {
                if (err) reject(err);
                else resolve();
            });
        });

        console.log('Channel IDs resequenced successfully');
        res.json({ message: 'Channel IDs resequenced successfully' });
    } catch (error) {
        console.error('Error resequencing channel IDs:', error);
        // Rollback on error
        await new Promise((resolve) => {
            db.run('ROLLBACK', () => resolve());
        });
        res.status(500).json({ error: 'Failed to resequence channel IDs: ' + error.message });
    }
});

// Add force auto-update endpoint
app.post('/api/channels/force-update', async (req, res) => {
    try {
        // Get all channels with auto-update enabled
        const channels = await new Promise((resolve, reject) => {
            db.all('SELECT * FROM channels WHERE auto_update_enabled = 1', [], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });

        console.log(`Found ${channels.length} channels with auto-update enabled`);
        let updateResults = [];

        for (const channel of channels) {
            try {
                if (!channel.website_url) {
                    updateResults.push({ id: channel.id, name: channel.name, status: 'skipped', message: 'No website URL configured' });
                    continue;
                }

                console.log(`Force updating channel ${channel.id} (${channel.name})`);
                
                // Use direct auto-detect function
                const result = await new Promise(async (resolve, reject) => {
                    const req = { body: { url: channel.website_url } };
                    const res = {
                        json: (data) => resolve(data),
                        status: (code) => ({
                            json: (data) => reject(new Error(data.error || 'Auto-detect failed'))
                        })
                    };
                    await autoDetectHandler(req, res);
                });

                // Update channel with new headers
                await new Promise((resolve, reject) => {
                    db.run(`UPDATE channels 
                           SET user_agent = ?, 
                               referer = ?, 
                               origin = ?,
                               last_update = DATETIME('now')
                           WHERE id = ?`,
                        [
                            result.headers.userAgent || channel.user_agent,
                            result.headers.referer || channel.referer,
                            result.headers.origin || channel.origin,
                            channel.id
                        ],
                        (err) => {
                            if (err) reject(err);
                            else resolve();
                        });
                });

                updateResults.push({ 
                    id: channel.id, 
                    name: channel.name, 
                    status: 'success',
                    headers: result.headers
                });
                console.log(`Successfully updated headers for channel ${channel.id}`);
            } catch (error) {
                console.error(`Error updating channel ${channel.id}:`, error);
                updateResults.push({ 
                    id: channel.id, 
                    name: channel.name, 
                    status: 'error', 
                    message: error.message 
                });
            }
        }

        res.json({
            total: channels.length,
            results: updateResults
        });
    } catch (error) {
        console.error('Error in force update:', error);
        res.status(500).json({ error: 'Failed to force update: ' + error.message });
    }
});

// Auto-detect M3U URL and headers from a webpage
app.post('/api/auto-detect', autoDetectHandler);

// Serve frontend - this should be the last route
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// Start server with error handling
const server = app.listen(port, '0.0.0.0', () => {
    console.log(`Server running on port ${port}`);
    console.log(`Database location: ${dbFile}`);

    // Start auto-update checker
    startAutoUpdateChecker();
}).on('error', (err) => {
    console.error('Failed to start server:', err);
    process.exit(1);
});

// Auto-update checker function
async function startAutoUpdateChecker() {
    console.log('Starting auto-update checker');
    
    // Check every minute
    setInterval(async () => {
        try {
            // Get all channels with auto-update enabled
            const channels = await new Promise((resolve, reject) => {
                db.all('SELECT * FROM channels WHERE auto_update_enabled = 1', [], (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows);
                });
            });

            const now = new Date();

            for (const channel of channels) {
                try {
                    // Skip if no website URL
                    if (!channel.website_url) {
                        console.log(`Channel ${channel.id} has no website URL for auto-update`);
                        continue;
                    }

                    // Calculate next update time
                    const lastUpdate = channel.last_update ? new Date(channel.last_update) : new Date(0);
                    const intervalMs = (channel.auto_update_interval || 12) * 3600000; // Convert hours to milliseconds
                    const nextUpdate = new Date(lastUpdate.getTime() + intervalMs);

                    // Check if it's time to update
                    if (now >= nextUpdate) {
                        console.log(`Auto-updating channel ${channel.id} (${channel.name})`);
                        
                        // Use direct auto-detect function instead of HTTP request
                        try {
                            const result = await new Promise(async (resolve, reject) => {
                                const req = { body: { url: channel.website_url } };
                                const res = {
                                    json: (data) => resolve(data),
                                    status: (code) => ({
                                        json: (data) => reject(new Error(data.error || 'Auto-detect failed'))
                                    })
                                };
                                await autoDetectHandler(req, res);
                            });

                            // Update channel with new headers
                            await new Promise((resolve, reject) => {
                                db.run(`UPDATE channels 
                                       SET user_agent = ?, 
                                           referer = ?, 
                                           origin = ?,
                                           last_update = DATETIME('now')
                                       WHERE id = ?`,
                                    [
                                        result.headers.userAgent || channel.user_agent,
                                        result.headers.referer || channel.referer,
                                        result.headers.origin || channel.origin,
                                        channel.id
                                    ],
                                    (err) => {
                                        if (err) reject(err);
                                        else resolve();
                                    });
                            });

                            console.log(`Successfully updated headers for channel ${channel.id}`);
                        } catch (error) {
                            throw new Error(`Auto-detect failed: ${error.message}`);
                        }
                    }
                } catch (error) {
                    console.error(`Error auto-updating channel ${channel.id}:`, error);
                }
            }
        } catch (error) {
            console.error('Error in auto-update checker:', error);
        }
    }, 60000); // Check every minute
}

// Extract the auto-detect handler into a separate function
async function autoDetectHandler(req, res) {
    const { url } = req.body;
  
    if (!url) {
        return res.status(400).json({ error: 'URL is required' });
    }

    let browser = null;
    let hasResponded = false;
    let navigationTimeout = 30000;
    let globalTimeout = setTimeout(() => {
        if (!hasResponded) {
            hasResponded = true;
            console.log('Global timeout reached, closing browser');
            if (browser) {
                browser.close().catch(console.error);
            }
            res.status(408).json({ error: 'Timeout while searching for M3U URL' });
        }
    }, 45000);

    try {
        console.log('Launching browser for URL:', url);
        browser = await puppeteer.launch({
            headless: 'new',
            executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium',
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu',
                '--load-extension=/usr/lib/chromium/extensions'
            ]
        });

        // Wait a bit for uBlock to initialize
        await new Promise(resolve => setTimeout(resolve, 1000));

        const page = await browser.newPage();
        
        // Set a random user agent
        const randomUserAgent = getRandomUserAgent();
        await page.setUserAgent(randomUserAgent);
        console.log('Using random User-Agent for auto-detect:', randomUserAgent);
        
        let m3uUrl = null;
        let headers = {
          userAgent: randomUserAgent,
          referer: '',
          origin: ''
        };

        // Set default timeout for all operations
        page.setDefaultTimeout(navigationTimeout);
        page.setDefaultNavigationTimeout(navigationTimeout);

        // Enable request interception
        await page.setRequestInterception(true);

        // Track manifest requests
        let manifestHeaders = null;

        // Listen for network requests
        page.on('request', request => {
          const resourceUrl = request.url();
          const requestHeaders = request.headers();
          const resourceType = request.resourceType();
          
          // Clean header values - remove trailing semicolons and whitespace
          const cleanHeader = (header) => {
            if (!header) return '';
            return header.replace(/[;\s]+$/, '').trim();
          };

          // Function to extract headers from request
          const extractHeaders = (headers) => {
            return {
              userAgent: cleanHeader(headers['user-agent']),
              referer: cleanHeader(headers['referer'] || headers['referrer']),
              origin: cleanHeader(headers['origin'])
            };
          };

          // Clean URL before checking
          const cleanUrl = resourceUrl.replace(/[;\s]+$/, '');

          // Check for M3U URLs in XHR/fetch requests or regular requests
          if ((resourceType === 'xhr' || resourceType === 'fetch') && 
              (cleanUrl.includes('.m3u8') || cleanUrl.includes('.m3u'))) {
            console.log('Found M3U URL in XHR/fetch request:', cleanUrl);
            console.log('Resource type:', resourceType);
            m3uUrl = cleanUrl;
            manifestHeaders = extractHeaders(requestHeaders);
            console.log('M3U headers:', manifestHeaders);

            // Parse URL parameters if it's an M3U8 URL
            let urlParams = null;
            if (cleanUrl.includes('.m3u8?')) {
              try {
                const urlObj = new URL(cleanUrl);
                urlParams = Object.fromEntries(urlObj.searchParams.entries());
                console.log('Found M3U8 parameters:', urlParams);
              } catch (e) {
                console.error('Error parsing URL parameters:', e);
              }
            }

            // If we found what we need, respond immediately
            if (!hasResponded) {
              hasResponded = true;
              const finalM3uUrl = m3uUrl.replace(/[;\s]+$/, '');
              const finalHeaders = manifestHeaders || headers;

              // Remove any empty headers and ensure no trailing semicolons
              const cleanedHeaders = {};
              Object.entries(finalHeaders).forEach(([key, value]) => {
                const cleanedValue = value?.replace(/[;\s]+$/, '').trim();
                if (cleanedValue) {
                  cleanedHeaders[key] = cleanedValue;
                }
              });

              res.json({
                success: true,
                m3uUrl: finalM3uUrl,
                headers: cleanedHeaders,
                isHLS: finalM3uUrl.includes('.m3u8'),
                urlParams: urlParams
              });

              // Close the browser since we're done
              if (browser) {
                browser.close().catch(console.error);
              }
              clearTimeout(globalTimeout);
            }
          }

          request.continue();
        });

        try {
          // Navigate to the page and wait for network idle
          await page.goto(url, {
            waitUntil: 'networkidle0',
            timeout: navigationTimeout
          }).catch(error => {
            // Log but don't throw navigation errors if we already found the M3U URL
            console.log('Navigation warning:', error.message);
            if (!m3uUrl) {
              throw error; // Only throw if we haven't found an M3U URL yet
            }
          });

          // If we haven't found an M3U URL after navigation completes, check the page content
          if (!hasResponded) {
            try {
              // Look for M3U URLs in page source
              const content = await page.content();
              const m3uMatches = content.match(/(https?:\/\/[^"'\s]+\.m3u8?)/gi);
              
              if (m3uMatches && m3uMatches.length > 0) {
                m3uUrl = m3uMatches[0].replace(/[;\s]+$/, '');
                console.log('Found M3U URL in page source:', m3uUrl);
                
                // Parse URL parameters if it's an M3U8 URL
                let urlParams = null;
                if (m3uUrl.includes('.m3u8?')) {
                  try {
                    const urlObj = new URL(m3uUrl);
                    urlParams = Object.fromEntries(urlObj.searchParams.entries());
                    console.log('Found M3U8 parameters in page source:', urlParams);
                  } catch (e) {
                    console.error('Error parsing URL parameters from page source:', e);
                  }
                }
                
                if (!hasResponded) {
                  hasResponded = true;
                  res.json({
                    success: true,
                    m3uUrl: m3uUrl,
                    headers: headers,
                    isHLS: m3uUrl.includes('.m3u8'),
                    urlParams: urlParams
                  });
                }
              } else if (!hasResponded) {
                hasResponded = true;
                res.status(404).json({ error: 'No M3U URL found on the page' });
              }
            } catch (contentError) {
              console.error('Error reading page content:', contentError);
              if (!hasResponded) {
                hasResponded = true;
                res.status(500).json({ error: `Failed to read page content: ${contentError.message}` });
              }
            }
          }
        } catch (error) {
          console.error('Navigation error:', error);
          // Only respond with error if we haven't found an M3U URL yet
          if (!hasResponded && !m3uUrl) {
            hasResponded = true;
            res.status(500).json({ error: `Failed to load page: ${error.message}` });
          }
        }
    } catch (error) {
        console.error('Auto-detect error:', error);
        if (!hasResponded) {
            hasResponded = true;
            res.status(500).json({ error: `Auto-detection failed: ${error.message}` });
        }
    } finally {
        clearTimeout(globalTimeout);
        if (browser) {
            try {
                await browser.close();
            } catch (error) {
                console.error('Error closing browser:', error);
            }
        }
    }
}

// Handle process termination gracefully
process.on('SIGTERM', () => {
    console.log('Received SIGTERM signal, shutting down gracefully...');
    server.close(() => {
        console.log('Server closed');
        process.exit(0);
    });
});

process.on('SIGINT', () => {
    console.log('Received SIGINT signal, shutting down gracefully...');
    server.close(() => {
        console.log('Server closed');
        process.exit(0);
    });
}); 