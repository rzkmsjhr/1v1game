// Cloudflare Pages Function for WebRTC 1v1 Room Signaling
// Works on Cloudflare Free Tier without needing paid Durable Objects

interface Env {
  ROOMS_KV?: KVNamespace;
}

// In-memory fallback if KV is not bound
const memoryRooms = new Map<string, any>();

export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, env, params } = context;
  const url = new URL(request.url);
  const pathParts = (params.path as string[] || []);

  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers });
  }

  // Storage helpers
  const getRoom = async (code: string) => {
    if (env.ROOMS_KV) {
      const data = await env.ROOMS_KV.get(code);
      return data ? JSON.parse(data) : null;
    }
    return memoryRooms.get(code) || null;
  };

  const setRoom = async (code: string, data: any) => {
    if (env.ROOMS_KV) {
      // 30 minute TTL (1800 seconds)
      await env.ROOMS_KV.put(code, JSON.stringify(data), { expirationTtl: 1800 });
    } else {
      memoryRooms.set(code, data);
    }
  };

  const deleteRoom = async (code: string) => {
    if (env.ROOMS_KV) {
      await env.ROOMS_KV.delete(code);
    }
    memoryRooms.delete(code);
  };

  const isHostWaiting = (r: any): boolean => {
    if (!r) return false;
    if (r.status === 'expired') return false;
    if (r.guestAnswer) return false; // Match already started or full
    const lastSeen = r.lastHostSeen || r.createdAt || 0;
    return (Date.now() - lastSeen) <= 12000;
  };

  // POST /api/room/create
  if (request.method === 'POST' && pathParts[0] === 'create') {
    try {
      const body = await request.json() as any;
      const code = Math.random().toString(36).substring(2, 8).toUpperCase();
      const now = Date.now();
      const roomData = {
        gameId: body.gameId || 'tetris',
        gameVariant: body.gameVariant || null,
        hostOffer: body.offer,
        hostIce: body.ice || [],
        guestAnswer: null,
        guestIce: [],
        createdAt: now,
        lastHostSeen: now,
        status: 'waiting', // 'waiting' | 'active' | 'expired'
      };
      await setRoom(code, roomData);
      return new Response(JSON.stringify({ success: true, code, gameId: roomData.gameId, gameVariant: roomData.gameVariant }), { headers });
    } catch (e: any) {
      return new Response(JSON.stringify({ error: e.message }), { status: 400, headers });
    }
  }

  const roomCode = pathParts[0]?.toUpperCase();
  if (!roomCode) {
    return new Response(JSON.stringify({ error: 'Room code missing' }), { status: 400, headers });
  }

  // POST /api/room/:code/expire or DELETE /api/room/:code
  if ((request.method === 'POST' && pathParts[1] === 'expire') || request.method === 'DELETE') {
    const existing = await getRoom(roomCode);
    if (existing) {
      existing.status = 'expired';
      await deleteRoom(roomCode);
    }
    return new Response(JSON.stringify({ success: true, expired: true }), { headers });
  }

  const room = await getRoom(roomCode);
  if (!room || room.status === 'expired') {
    return new Response(JSON.stringify({ error: 'Room not found or expired', exists: false, isWaiting: false, expired: true }), { status: 410, headers });
  }

  // POST /api/room/:code/join
  if (request.method === 'POST' && pathParts[1] === 'join') {
    try {
      if (!isHostWaiting(room)) {
        return new Response(JSON.stringify({ error: 'Host is no longer waiting. This match invitation has expired.' }), { status: 410, headers });
      }
      if (room.guestAnswer) {
        return new Response(JSON.stringify({ error: 'Match is already full or in progress.' }), { status: 409, headers });
      }

      const body = await request.json() as any;
      room.status = 'active';
      room.guestAnswer = body.answer;
      if (body.ice) {
        room.guestIce = [...(room.guestIce || []), ...body.ice];
      }
      await setRoom(roomCode, room);
      return new Response(JSON.stringify({
        success: true,
        gameId: room.gameId,
        gameVariant: room.gameVariant || null,
        hostOffer: room.hostOffer,
        hostIce: room.hostIce
      }), { headers });
    } catch (e: any) {
      return new Response(JSON.stringify({ error: e.message }), { status: 400, headers });
    }
  }

  // POST /api/room/:code/ice
  if (request.method === 'POST' && pathParts[1] === 'ice') {
    try {
      const body = await request.json() as any;
      const role = body.role; // 'host' | 'guest'
      if (role === 'host' && body.candidate) {
        room.hostIce = [...(room.hostIce || []), body.candidate];
        room.lastHostSeen = Date.now();
      } else if (role === 'guest' && body.candidate) {
        room.guestIce = [...(room.guestIce || []), body.candidate];
      }
      await setRoom(roomCode, room);
      return new Response(JSON.stringify({ success: true }), { headers });
    } catch (e: any) {
      return new Response(JSON.stringify({ error: e.message }), { status: 400, headers });
    }
  }

  // GET /api/room/:code/poll?role=host|guest
  if (request.method === 'GET' && pathParts[1] === 'poll') {
    const role = url.searchParams.get('role');
    if (role === 'host') {
      room.lastHostSeen = Date.now();
      await setRoom(roomCode, room);
      return new Response(JSON.stringify({
        gameId: room.gameId,
        gameVariant: room.gameVariant || null,
        guestAnswer: room.guestAnswer || null,
        guestIce: room.guestIce || []
      }), { headers });
    } else {
      // Guest polling: verify host hasn't abandoned
      if (room.status === 'waiting' && !isHostWaiting(room)) {
        room.status = 'expired';
        await deleteRoom(roomCode);
        return new Response(JSON.stringify({ error: 'Host is no longer waiting. Room has expired.' }), { status: 410, headers });
      }
      return new Response(JSON.stringify({
        gameId: room.gameId,
        gameVariant: room.gameVariant || null,
        hostOffer: room.hostOffer || null,
        hostIce: room.hostIce || []
      }), { headers });
    }
  }

  // GET /api/room/:code
  if (request.method === 'GET' && pathParts.length === 1) {
    const waiting = isHostWaiting(room);
    if (!waiting) {
      return new Response(JSON.stringify({
        exists: false,
        isWaiting: false,
        expired: true,
        gameId: room.gameId,
        error: 'Host is no longer waiting. Room has expired.'
      }), { status: 410, headers });
    }

    return new Response(JSON.stringify({
      exists: true,
      isWaiting: true,
      expired: false,
      gameId: room.gameId,
      gameVariant: room.gameVariant || null,
      hasOffer: !!room.hostOffer,
      hasAnswer: !!room.guestAnswer
    }), { headers });
  }

  return new Response(JSON.stringify({ error: 'Endpoint not found' }), { status: 404, headers });
};
