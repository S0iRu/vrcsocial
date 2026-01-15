'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Lock, User, ArrowRight, Loader2, ShieldCheck } from 'lucide-react';

export default function LoginPage() {
    const router = useRouter();
    const [step, setStep] = useState<'login' | '2fa'>('login');
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [code, setCode] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    const [debugInfo, setDebugInfo] = useState('');

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setError('');
        setDebugInfo('');

        try {
            const res = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password }),
            });

            const data = await res.json();
            console.log('[Login Debug] Status:', res.status, 'Data:', data);

            if (res.ok) {
                // Authentication is now handled via httpOnly cookies only
                // No credentials stored in localStorage for security

                if (data.requiresTwoFactorAuth) {
                    setStep('2fa');
                } else {
                    // Full page reload to reinitialize FriendsProvider
                    window.location.href = '/';
                }
            } else if (res.status === 401 && data.requiresTwoFactorAuth) {
                setStep('2fa');
            } else {
                setError(`Login failed: ${res.status}`);
                // Show full response data for debugging
                setDebugInfo(JSON.stringify(data, null, 2));
            }
        } catch (err: any) {
            setError('An error occurred during login request.');
            setDebugInfo(err.toString());
        } finally {
            setIsLoading(false);
        }
    };

    const handleVerify = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setError('');
        setDebugInfo('');

        try {
            const res = await fetch('/api/auth/verify', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ code }),
            });

            const data = await res.json();

            if (res.ok) {
                // Full page reload to reinitialize FriendsProvider
                window.location.href = '/';
            } else {
                setError(data.error || 'Verification failed');
                if (data.details) {
                    setDebugInfo(JSON.stringify(data.details, null, 2));
                }
            }
        } catch (err: any) {
            setError('An error occurred during verification.');
            setDebugInfo(err.message);
        } finally {
            setIsLoading(false);
        }
    };

    const handleTest = async () => {
        setIsLoading(true);
        setDebugInfo('Testing connection to VRChat API...');
        try {
            const res = await fetch('/api/auth/login', { method: 'GET' });
            const data = await res.json();
            setDebugInfo('Connection Result:\n' + JSON.stringify(data, null, 2));
        } catch (e: any) {
            setDebugInfo('Test Failed: ' + e.toString());
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-[#0f172a] p-4 relative overflow-hidden">
            <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] rounded-full bg-indigo-600/20 blur-[120px]" />
            <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] rounded-full bg-cyan-600/20 blur-[120px]" />

            <div className="w-full max-w-md glass-card p-8 rounded-2xl relative z-10 transition-all duration-300">
                <div className="text-center mb-8">
                    <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 to-cyan-400 mb-2">
                        VRC Social
                    </h1>
                    <p className="text-slate-400 text-sm">
                        {step === 'login' ? 'Sign in with your VRChat account' : 'Enter 2-Factor Authentication Code'}
                    </p>
                </div>

                {step === 'login' ? (
                    <form onSubmit={handleLogin} className="space-y-6">
                        <div className="space-y-2">
                            <label className="text-xs font-bold text-slate-400 uppercase ml-1">Username</label>
                            <div className="relative">
                                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
                                <input
                                    type="text"
                                    value={username}
                                    onChange={(e) => setUsername(e.target.value)}
                                    className="w-full bg-slate-900/50 border border-slate-700 rounded-xl pl-10 pr-4 py-3 text-white focus:outline-none focus:border-indigo-500 transition-colors"
                                    placeholder="VRChat Username"
                                    required
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="text-xs font-bold text-slate-400 uppercase ml-1">Password</label>
                            <div className="relative">
                                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
                                <input
                                    type="password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="w-full bg-slate-900/50 border border-slate-700 rounded-xl pl-10 pr-4 py-3 text-white focus:outline-none focus:border-indigo-500 transition-colors"
                                    placeholder="••••••••"
                                    required
                                />
                            </div>
                        </div>

                        {error && (
                            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                                <p className="font-bold text-center mb-1">{error}</p>
                            </div>
                        )}

                        {debugInfo && (
                            <div className="p-3 rounded-lg bg-black/30 border border-white/10 text-slate-300 text-xs overflow-x-auto whitespace-pre-wrap max-h-40">
                                {debugInfo}
                            </div>
                        )}

                        <button
                            type="submit"
                            disabled={isLoading}
                            className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold shadow-lg shadow-indigo-500/20 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                        >
                            {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <>Next <ArrowRight className="w-5 h-5" /></>}
                        </button>

                        <div className="text-center pt-2">
                            <button type="button" onClick={handleTest} className="text-xs text-indigo-400 hover:text-indigo-300 underline">
                                Test API Connection
                            </button>
                        </div>
                    </form>
                ) : (

                    <form onSubmit={handleVerify} className="space-y-6">
                        <div className="space-y-2">
                            <label className="text-xs font-bold text-slate-400 uppercase ml-1">Authentication Code</label>
                            <div className="relative">
                                <ShieldCheck className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
                                <input
                                    type="text"
                                    value={code}
                                    onChange={(e) => setCode(e.target.value)}
                                    className="w-full bg-slate-900/50 border border-slate-700 rounded-xl pl-10 pr-4 py-3 text-white focus:outline-none focus:border-indigo-500 transition-colors tracking-widest text-center text-lg"
                                    placeholder="000000"
                                    maxLength={6}
                                    required
                                />
                            </div>
                            <p className="text-xs text-slate-500 text-center mt-2">
                                Check your authenticator app or email.
                            </p>
                        </div>

                        {error && (
                            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                                <p className="font-bold text-center mb-1">{error}</p>
                                {debugInfo && (
                                    <pre className="text-[10px] bg-black/20 p-2 rounded overflow-x-auto whitespace-pre-wrap mt-2">
                                        {debugInfo}
                                    </pre>
                                )}
                            </div>
                        )}

                        <button
                            type="submit"
                            disabled={isLoading}
                            className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold shadow-lg shadow-indigo-500/20 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                        >
                            {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <>Verify & Login <ArrowRight className="w-5 h-5" /></>}
                        </button>

                        <button
                            type="button"
                            onClick={() => setStep('login')}
                            className="w-full text-xs text-slate-500 hover:text-white transition-colors mt-2"
                        >
                            Cancel and go back
                        </button>
                    </form>
                )}
            </div>
        </div>
    );
}
