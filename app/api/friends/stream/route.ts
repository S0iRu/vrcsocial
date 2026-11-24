import { NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import WebSocket from 'ws';
import { checkRateLimit, getClientId } from '@/lib/rateLimit';
import { VRC_API_BASE, buildVrcHeaders } from '@/lib/vrcApi';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const WEBSOCKET_URL = 'wss://pipeline.vrchat.cloud';
const USER_AGENT = 'VRCSocial/1.0.0 (GitHub: vrcsocial-dev)';

// 1 接続ごとに VRChat への WebSocket とタイマーを持ち続けるので、同じ接続元からの同時接続数に上限を置く
// （複数タブや同じ回線の家族での利用を妨げない程度の数）
const MAX_STREAMS_PER_CLIENT = 6;
const activeStreams = new Map<string, number>();

const jsonError = (status: number, error: string) =>
    new Response(JSON.stringify({ error }), {
        status,
        headers: { 'Content-Type': 'application/json' }
    });

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

    const vrcHeaders = buildVrcHeaders(authCookie, cookieStore.get('twoFactorAuth')?.value);
    if (!authCookie || !vrcHeaders) {
        return jsonError(401, 'Not authenticated');
    }

    const clientId = getClientId(req);
    const streamCount = activeStreams.get(clientId) ?? 0;
    if (streamCount >= MAX_STREAMS_PER_CLIENT) {
        return jsonError(429, 'Too many streams');
    }
    // 確認の待ち時間に同時接続で上限をすり抜けられないよう、先に枠を確保する
    activeStreams.set(clientId, streamCount + 1);
    let slotReleased = false;
    const releaseSlot = () => {
        if (slotReleased) return;
        slotReleased = true;
        const count = (activeStreams.get(clientId) ?? 1) - 1;
        if (count > 0) activeStreams.set(clientId, count);
        else activeStreams.delete(clientId);
    };

    // Cookie が「ある」だけでなく、VRChat で実際に有効なことを確かめてからストリームを開く。
    // でたらめな値でも接続を持ち続けられると、誰でもサーバーの資源を占有できてしまう。
    try {
        const userRes = await fetch(`${VRC_API_BASE}/auth/user`, { headers: vrcHeaders });
        if (!userRes.ok) {
            releaseSlot();
            return jsonError(userRes.status === 401 ? 401 : 502, userRes.status === 401 ? 'Not authenticated' : 'Failed to verify session');
        }
        // 2FA 未完了の Cookie でも 200 が返ることがある
        const user: unknown = await userRes.json();
        const pending2FA = typeof user === 'object' && user !== null && 'requiresTwoFactorAuth' in user;
        if (pending2FA) {
            releaseSlot();
            return jsonError(401, 'Not authenticated');
        }
    } catch (error: unknown) {
        releaseSlot();
        console.error('[SSE] Failed to verify session:', error);
        return jsonError(502, 'Failed to verify session');
    }

    // Create a TransformStream to handle SSE
    const encoder = new TextEncoder();
    let ws: WebSocket | null = null;
    let isConnectionClosed = false;
    let pingInterval: NodeJS.Timeout | null = null;
    // 後始末は一度だけ。VRChat 側の切断・エラー・ブラウザ側の切断のどれで終わっても同じ処理を通す
    let cleanup = () => {};

    const stream = new ReadableStream({
        start(controller) {
            cleanup = () => {
                if (isConnectionClosed) return;
                isConnectionClosed = true;
                releaseSlot();

                if (pingInterval) {
                    clearInterval(pingInterval);
                    pingInterval = null;
                }

                if (ws) {
                    ws.close();
                    ws = null;
                }

                // ストリームを閉じてブラウザに終了を伝える（EventSource 側が再接続する）。
                // ブラウザ側から先に切られた場合は既に閉じているので、失敗しても構わない
                try {
                    controller.close();
                } catch { /* already closed */ }
            };

            // ブラウザが接続を切ったら、VRChat への接続も残さない
            req.signal.addEventListener('abort', () => cleanup());

            // Send initial connection message
            const sendSSE = (event: string, data: unknown) => {
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
                cleanup();
            });

            ws.on('error', (error) => {
                console.error('[SSE] VRChat WebSocket error:', error.message);
                if (!isConnectionClosed) {
                    sendSSE('error', { message: error.message });
                }
                cleanup();
            });
        },

        cancel() {
            console.log('[SSE] Client disconnected');
            cleanup();
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
