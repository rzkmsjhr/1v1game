import { defineConfig, type Plugin } from 'vite';
import http from 'http';

// In-memory room store for local development preview
interface RoomData {
  gameId: string;
  hostOffer?: any;
  guestAnswer?: any;
  hostIce: any[];
  guestIce: any[];
  createdAt: number;
}

const localRooms = new Map<string, RoomData>();

function localSignalingPlugin(): Plugin {
  return {
    name: 'local-signaling',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith('/api/room')) {
          return next();
        }

        const url = new URL(req.url, 'http://localhost');
        const pathParts = url.pathname.replace(/^\/api\/room\/?/, '').split('/').filter(Boolean);

        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

        if (req.method === 'OPTIONS') {
          res.statusCode = 204;
          return res.end();
        }

        // Clean expired rooms (> 30 mins)
        const now = Date.now();
        for (const [id, r] of localRooms.entries()) {
          if (now - r.createdAt > 30 * 60 * 1000) {
            localRooms.delete(id);
          }
        }

        // Helper to read json body
        const readBody = async () => {
          return new Promise<any>((resolve) => {
            let data = '';
            req.on('data', chunk => data += chunk);
            req.on('end', () => {
              try {
                resolve(data ? JSON.parse(data) : {});
              } catch {
                resolve({});
              }
            });
          });
        };

        // POST /api/room/create
        if (req.method === 'POST' && pathParts[0] === 'create') {
          const body = await readBody();
          const code = Math.random().toString(36).substring(2, 8).toUpperCase();
          localRooms.set(code, {
            gameId: body.gameId || 'tetris',
            gameVariant: body.gameVariant || null,
            hostOffer: body.offer,
            hostIce: body.ice || [],
            guestIce: [],
            createdAt: Date.now()
          });
          res.statusCode = 200;
          return res.end(JSON.stringify({ success: true, code, gameId: body.gameId || 'tetris', gameVariant: body.gameVariant || null }));
        }

        const roomCode = pathParts[0]?.toUpperCase();
        if (!roomCode || !localRooms.has(roomCode)) {
          res.statusCode = 404;
          return res.end(JSON.stringify({ error: 'Room not found or expired' }));
        }

        const room = localRooms.get(roomCode)!;

        // POST /api/room/:code/join
        if (req.method === 'POST' && pathParts[1] === 'join') {
          const body = await readBody();
          room.guestAnswer = body.answer;
          if (body.ice) room.guestIce.push(...body.ice);
          res.statusCode = 200;
          return res.end(JSON.stringify({
            success: true,
            gameId: room.gameId,
            gameVariant: room.gameVariant || null,
            hostOffer: room.hostOffer,
            hostIce: room.hostIce
          }));
        }

        // POST /api/room/:code/ice
        if (req.method === 'POST' && pathParts[1] === 'ice') {
          const body = await readBody();
          const role = body.role; // 'host' | 'guest'
          if (role === 'host' && body.candidate) {
            room.hostIce.push(body.candidate);
          } else if (role === 'guest' && body.candidate) {
            room.guestIce.push(body.candidate);
          }
          res.statusCode = 200;
          return res.end(JSON.stringify({ success: true }));
        }

        // GET /api/room/:code/poll?role=host|guest
        if (req.method === 'GET' && pathParts[1] === 'poll') {
          const role = url.searchParams.get('role');
          if (role === 'host') {
            return res.end(JSON.stringify({
              gameId: room.gameId,
              gameVariant: room.gameVariant || null,
              guestAnswer: room.guestAnswer || null,
              guestIce: room.guestIce
            }));
          } else {
            return res.end(JSON.stringify({
              gameId: room.gameId,
              gameVariant: room.gameVariant || null,
              hostOffer: room.hostOffer || null,
              hostIce: room.hostIce
            }));
          }
        }

        // GET /api/room/:code
        if (req.method === 'GET') {
          return res.end(JSON.stringify({
            exists: true,
            gameId: room.gameId,
            gameVariant: room.gameVariant || null,
            hasOffer: !!room.hostOffer,
            hasAnswer: !!room.guestAnswer
          }));
        }

        res.statusCode = 404;
        res.end(JSON.stringify({ error: 'Not found' }));
      });
    }
  };
}

// Redirects any incoming request on port 3001 directly to port 3000
function port3001RedirectPlugin(): Plugin {
  let redirectServer: http.Server | null = null;
  return {
    name: 'port-3001-redirect',
    configureServer() {
      if (!redirectServer) {
        redirectServer = http.createServer((req, res) => {
          const targetUrl = `http://localhost:3000${req.url || '/'}`;
          res.writeHead(302, {
            'Location': targetUrl,
            'Access-Control-Allow-Origin': '*'
          });
          res.end(`Redirecting to ${targetUrl}`);
        });
        redirectServer.on('error', () => {
          // 3001 might already be used or closing, ignore safely
        });
        try {
          redirectServer.listen(3001);
        } catch {
          // Ignore if 3001 unavailable
        }
      }
    }
  };
}

export default defineConfig({
  plugins: [localSignalingPlugin(), port3001RedirectPlugin()],
  build: {
    target: 'esnext'
  },
  server: {
    port: 3000,
    strictPort: true,
    host: true
  }
});
