import { NextRequest, NextResponse } from 'next/server';

// Simple in-memory rate limiting (for serverless, consider using Redis/Upstash)
// This implementation works per-instance, which is suitable for development
// For production with multiple instances, use a distributed store like Upstash Redis

interface RateLimitEntry {
    count: number;
    resetTime: number;
}

// Store rate limit data - In production, use Redis or similar
const rateLimitStore = new Map<string, RateLimitEntry>();

// Configuration
const RATE_LIMIT_CONFIG = {
    login: {
        windowMs: 15 * 60 * 1000, // 15 minutes
        maxRequests: 5, // 5 login attempts per window
    },
    verify: {
        windowMs: 15 * 60 * 1000, // 15 minutes
        maxRequests: 10, // 10 2FA attempts per window
    },
    api: {
        windowMs: 60 * 1000, // 1 minute
        maxRequests: 60, // 60 requests per minute
    },
    user: {
        windowMs: 60 * 1000, // 1 minute
        maxRequests: 30, // 30 requests per minute
    },
    friends: {
        windowMs: 60 * 1000, // 1 minute
        maxRequests: 20, // 20 requests per minute (heavier endpoint)
    },
    friendDetail: {
        windowMs: 60 * 1000, // 1 minute
        maxRequests: 60, // 60 requests per minute
    },
    worlds: {
        windowMs: 60 * 1000, // 1 minute
        maxRequests: 60, // 60 requests per minute
    },
    stream: {
        windowMs: 60 * 1000, // 1 minute
        maxRequests: 5, // 5 connections per minute (SSE is long-lived)
    }
};

// Get client identifier (IP address or fallback)
function getClientId(req: NextRequest): string {
    const forwarded = req.headers.get('x-forwarded-for');
    const realIp = req.headers.get('x-real-ip');
    const ip = forwarded?.split(',')[0]?.trim() || realIp || 'unknown';
    return ip;
}

// Check if request should be rate limited
export function checkRateLimit(
    req: NextRequest,
    type: keyof typeof RATE_LIMIT_CONFIG
): { limited: boolean; remaining: number; resetIn: number } {
    const config = RATE_LIMIT_CONFIG[type];
    const clientId = getClientId(req);
    const key = `${type}:${clientId}`;
    const now = Date.now();

    // Clean up expired entries periodically
    if (Math.random() < 0.01) {
        cleanupExpiredEntries();
    }

    const entry = rateLimitStore.get(key);

    if (!entry || now > entry.resetTime) {
        // Create new entry
        rateLimitStore.set(key, {
            count: 1,
            resetTime: now + config.windowMs
        });
        return {
            limited: false,
            remaining: config.maxRequests - 1,
            resetIn: config.windowMs
        };
    }

    // Check if limit exceeded
    if (entry.count >= config.maxRequests) {
        return {
            limited: true,
            remaining: 0,
            resetIn: entry.resetTime - now
        };
    }

    // Increment count
    entry.count++;
    rateLimitStore.set(key, entry);

    return {
        limited: false,
        remaining: config.maxRequests - entry.count,
        resetIn: entry.resetTime - now
    };
}

// Generate rate limit response
export function rateLimitResponse(resetIn: number): NextResponse {
    const response = NextResponse.json(
        {
            error: 'Too many requests',
            message: 'Please try again later',
            retryAfter: Math.ceil(resetIn / 1000)
        },
        { status: 429 }
    );
    response.headers.set('Retry-After', String(Math.ceil(resetIn / 1000)));
    return response;
}

// Add rate limit headers to response
export function addRateLimitHeaders(
    response: NextResponse,
    remaining: number,
    resetIn: number
): NextResponse {
    response.headers.set('X-RateLimit-Remaining', String(remaining));
    response.headers.set('X-RateLimit-Reset', String(Math.ceil(resetIn / 1000)));
    return response;
}

// Cleanup expired entries to prevent memory leaks
function cleanupExpiredEntries(): void {
    const now = Date.now();
    for (const [key, entry] of rateLimitStore.entries()) {
        if (now > entry.resetTime) {
            rateLimitStore.delete(key);
        }
    }
}

// Reset rate limit for a specific client (useful after successful login)
export function resetRateLimit(req: NextRequest, type: keyof typeof RATE_LIMIT_CONFIG): void {
    const clientId = getClientId(req);
    const key = `${type}:${clientId}`;
    rateLimitStore.delete(key);
}
