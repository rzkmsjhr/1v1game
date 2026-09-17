// Cloudflare Pages Middleware for dynamic Open Graph & social link preview rewriting
interface Env {
  ROOMS_KV?: KVNamespace;
}

const GAME_TITLES: Record<string, string> = {
  'tetris': 'Tetris 1v1 Battle',
  'othello': 'Othello (Reversi)',
  'pool': '8-Ball & 9-Ball Pool',
  'snake-ladder': 'Snakes & Ladders',
  'sling-puck': 'Fast Sling Puck',
  'block-fit': 'Block Fit Duel',
  'soda-dash': 'Soda Dash',
  'sheep-fight': 'Sheep Fight'
};

export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, env, next } = context;
  const url = new URL(request.url);
  const roomCode = url.searchParams.get('room')?.trim().toUpperCase();

  const response = await next();
  const contentType = response.headers.get('content-type') || '';

  // Only rewrite HTML pages when ?room=CODE is provided
  if (!roomCode || !contentType.includes('text/html')) {
    return response;
  }

  // Look up room data
  let roomData: any = null;
  if (env.ROOMS_KV) {
    const raw = await env.ROOMS_KV.get(roomCode);
    if (raw) {
      try { roomData = JSON.parse(raw); } catch {}
    }
  }

  const isHostWaiting = roomData &&
    roomData.status === 'waiting' &&
    !roomData.guestAnswer &&
    (Date.now() - (roomData.lastHostSeen || roomData.createdAt || 0) <= 12000);

  let title: string;
  let description: string;
  let imageUrl: string;

  if (isHostWaiting) {
    const gameId = roomData.gameId || 'tetris';
    const gameTitle = GAME_TITLES[gameId] || '1v1 Match';
    title = `🎮 You're Invited to Play ${gameTitle}! (Room: ${roomCode})`;
    description = `Your friend is waiting for you in 1v1 Battle Hub! Click to join room ${roomCode} and battle now.`;
    imageUrl = `${url.origin}/screenshots/${gameId}.png`;
  } else {
    title = `1v1 Battle Hub • Match Invitation Expired`;
    description = `Room ${roomCode} has expired or the host is no longer waiting. Visit the hub to start a new 1v1 game!`;
    imageUrl = `${url.origin}/screenshots/pool.png`;
  }

  // Use Cloudflare Pages native streaming HTMLRewriter
  return new HTMLRewriter()
    .on('title', { element(e) { e.setInnerContent(title); } })
    .on('meta[name="description"]', { element(e) { e.setAttribute('content', description); } })
    .on('meta[property="og:title"]', { element(e) { e.setAttribute('content', title); } })
    .on('meta[property="og:description"]', { element(e) { e.setAttribute('content', description); } })
    .on('meta[property="og:image"]', { element(e) { e.setAttribute('content', imageUrl); } })
    .on('meta[name="twitter:title"]', { element(e) { e.setAttribute('content', title); } })
    .on('meta[name="twitter:description"]', { element(e) { e.setAttribute('content', description); } })
    .on('meta[name="twitter:image"]', { element(e) { e.setAttribute('content', imageUrl); } })
    .transform(response);
};
