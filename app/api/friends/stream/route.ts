import { NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import WebSocket from 'ws';
import { checkRateLimit } from '@/lib/rateLimit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const WEBSOCKET_URL = 'wss://pipeline.vrchat.cloud';
const USER_AGENT = 'VRCSocial/1.0.0 (GitHub: vrcsocial-dev)';

interface VRChatWebSocketMessage {
    type: string;
    content: string;
}

/**
 * GET /api/friends/stream
 * 
 * Server-Sent Events endpoint that connects to VRChat WebSocket
 * and forwards real-time friend events to the client.
 */
export async function GET(req: NextRequest) {
    // Rate limiting check for SSE connections
    const rateCheck = checkRateLimit(req, 'stream');
    if (rateCheck.limited) {
        return new Response(JSON.stringify({ 
            error: 'Too many requests',
            retryAfter: Math.ceil(rateCheck.resetIn / 1000)
        }), {
            status: 429,
            headers: { 
                'Content-Type': 'application/json',
                'Retry-After': String(Math.ceil(rateCheck.resetIn / 1000))
            }
        });
    }

    const cookieStore = await cookies();
    const authCookie = cookieStore.get('auth')?.value;

    if (!authCookie) {
        return new Response(JSON.stringify({ error: 'Not authenticated' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    // Create a TransformStream to handle SSE
    const encoder = new TextEncoder();
    let ws: WebSocket | null = null;
    let isConnectionClosed = false;
    let pingInterval: NodeJS.Timeout | null = null;

    const stream = new ReadableStream({
        start(controller) {
            // Send initial connection message
            const sendSSE = (event: string, data: any) => {
                if (isConnectionClosed) return;
                try {
                    const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
                    controller.enqueue(encoder.encode(message));
                } catch (e) {
                    console.error('[SSE] Failed to send message:', e);
                }
            };

            // Send keepalive ping every 15 seconds
            pingInterval = setInterval(() => {
                if (!isConnectionClosed) {
                    sendSSE('ping', { timestamp: Date.now() });
                }
            }, 15000);

            // Connect to VRChat WebSocket
            const wsUrl = `${WEBSOCKET_URL}/?authToken=${encodeURIComponent(authCookie)}`;
            console.log('[SSE] Connecting to VRChat WebSocket...');

            ws = new WebSocket(wsUrl, {
                headers: {
                    'User-Agent': USER_AGENT
                }
            });

            ws.on('open', () => {
                console.log('[SSE] VRChat WebSocket connected');
                sendSSE('connected', { status: 'connected', timestamp: Date.now() });
            });

            ws.on('message', (data: WebSocket.Data) => {
                try {
                    const message: VRChatWebSocketMessage = JSON.parse(data.toString());
                    
                    // Parse the content field (it's a JSON string)
                    const content = typeof message.content === 'string'
                        ? JSON.parse(message.content)
                        : message.content;

                    console.log(`[SSE] VRChat event: ${message.type}`);

                    // Forward relevant events to client
                    const relevantEvents = [
                        'friend-online',
                        'friend-offline',
                        'friend-location',
                        'friend-update',
                        'friend-add',
                        'friend-delete',
                        'friend-active'  // Friend became active (similar to online)
                    ];

                    if (relevantEvents.includes(message.type)) {
                        sendSSE(message.type, content);
                    }
                } catch (e) {
                    console.error('[SSE] Failed to parse WebSocket message:', e);
                }
            });

            ws.on('close', (code, reason) => {
                console.log(`[SSE] VRChat WebSocket closed: code=${code}, reason=${reason}`);
                if (!isConnectionClosed) {
                    sendSSE('disconnected', { code, reason: reason?.toString() });
                }
            });

            ws.on('error', (error) => {
                console.error('[SSE] VRChat WebSocket error:', error.message);
                if (!isConnectionClosed) {
                    sendSSE('error', { message: error.message });
                }
            });
        },

        cancel() {
            console.log('[SSE] Client disconnected');
            isConnectionClosed = true;
            
            if (pingInterval) {
                clearInterval(pingInterval);
                pingInterval = null;
            }
            
            if (ws) {
                ws.close();
                ws = null;
            }
        }
    });

    return new Response(stream, {
        headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache, no-transform',
            'Connection': 'keep-alive',
            'X-Accel-Buffering': 'no', // Disable nginx buffering
        }
    });
}
