import { NextRequest, NextResponse } from 'next/server';

// 状態を変える POST を、他サイトから送り込まれた要求（CSRF）から守るための確認。
// ブラウザは同一オリジンの POST にも Origin を付けるので、付いていれば自サイトと完全一致することを求める。
// 前方一致で比べると `https://<自ホスト>.evil.example` が通ってしまう。
// Origin が無い要求（curl などブラウザ以外）は、Cookie を勝手に送られる心配がないので通す。
export function checkSameOrigin(req: NextRequest): NextResponse | null {
    // Sec-Fetch-Site はブラウザ自身が付け、ページ側のスクリプトからは書き換えられない。
    // same-origin と明示されていれば、トンネル側で Host が書き換わる構成でも正しく判定できる。
    if (req.headers.get('sec-fetch-site') === 'same-origin') return null;

    const origin = req.headers.get('origin');
    if (!origin) return null;

    const host = req.headers.get('host');
    if (host && (origin === `https://${host}` || origin === `http://${host}`)) {
        return null;
    }
    return NextResponse.json({ error: 'Invalid origin' }, { status: 403 });
}

// JSON 本文を受け取る POST 用。
// HTML フォームからは application/json を送れないので、Content-Type も確認しておくと
// text/plain のフォーム送信に JSON を仕込む手口を防げる。
export function checkJsonPost(req: NextRequest): NextResponse | null {
    const originError = checkSameOrigin(req);
    if (originError) return originError;

    const contentType = req.headers.get('content-type') ?? '';
    if (contentType.split(';')[0].trim().toLowerCase() !== 'application/json') {
        return NextResponse.json({ error: 'Content-Type must be application/json' }, { status: 415 });
    }
    return null;
}
