'use client';

import { useState, useEffect } from 'react';
import { Loader2, Download, Smartphone, Globe, Upload, ArrowRight, Share2, Mail, QrCode } from 'lucide-react';
import { MobileEmulator } from '@/components/ui/MobileEmulator';
import { GenerateButton } from '@/components/ui/GenerateButton';
import { BuildAnimation } from '@/components/ui/BuildAnimation';
import { StickManAnimation } from '@/components/ui/StickManAnimation';
import { BuildVideo } from '@/components/ui/BuildVideo';
import { QRCodeCanvas } from 'qrcode.react';

export function AppGeneratorForm() {
    const [appName, setAppName] = useState('');
    const [appUrl, setAppUrl] = useState('');
    const [icon, setIcon] = useState<File | null>(null);
    const [status, setStatus] = useState<'idle' | 'building' | 'success' | 'error' | 'active-cloud'>('idle');
    const [log, setLog] = useState<string>('');
    const [downloadUrl, setDownloadUrl] = useState('');
    const [githubUrl, setGithubUrl] = useState('');
    const [buildId, setBuildId] = useState('');

    useEffect(() => {
        let interval: NodeJS.Timeout;

        if (status === 'active-cloud' && buildId) {
            let elapsed = 0;
            interval = setInterval(async () => {
                elapsed += 5;
                setLog(prev => {
                    const clean = prev.split('\n').filter(l => !l.startsWith('Waiting for GitHub')).join('\n');
                    return clean + `\nWaiting for GitHub Actions... (${elapsed}s elapsed)`;
                });

                try {
                    const res = await fetch(`/api/status?buildId=${buildId}`);
                    const data = await res.json();

                    if (data.status === 'completed' && data.artifactId) {
                        clearInterval(interval);
                        setStatus('success');
                        setDownloadUrl(`/api/artifact?artifactId=${data.artifactId}`);
                        setLog(prev => prev + '\n\nBuild Complete! APK is ready.');
                    }
                } catch (err) {
                    console.error('Polling error', err);
                }
            }, 5000);
        }

        return () => clearInterval(interval);
    }, [status, buildId]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!icon) return;

        setStatus('building');
        setLog('Starting build process...\n');

        const formData = new FormData();
        formData.append('appName', appName);
        formData.append('appUrl', appUrl);
        formData.append('icon', icon);

        try {
            const response = await fetch('/api/build', {
                method: 'POST',
                body: formData,
            });

            const data = await response.json();

            if (data.success) {
                if (data.mode === 'cloud') {
                    setStatus('active-cloud');
                    setBuildId(data.buildId);
                    setGithubUrl(data.githubUrl);
                    setLog(prev => prev + `Request sent to GitHub Actions!\nBuild ID: ${data.buildId}\n`);
                } else {
                    setStatus('success');
                    setDownloadUrl(data.downloadUrl);
                    setLog(prev => prev + `Build Complete!\npackageId: ${data.packageId}\nSHA256: ${data.sha256Fingerprint}\n`);
                }
            } else {
                setStatus('error');
                setLog(prev => prev + `Error: ${data.error}\n`);
            }
        } catch (err) {
            setStatus('error');
            setLog(prev => prev + 'Network error occurred.\n');
        }
    };

    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-8 items-center max-w-5xl mx-auto">
            {/* Left Side: Form */}
            <div className="order-2 lg:order-1">
                <div className="bg-slate-900/50 backdrop-blur-xl border border-slate-800 rounded-2xl p-8 shadow-2xl shadow-purple-500/10">
                    {status === 'active-cloud' && (
                        <div className="text-center py-10">
                            {/* We want to show logs here too, or just keep the form layout but hidden?  */}
                            {/* Actually, let's keep the standard structure and show logs below. */}
                            <div className="w-16 h-16 bg-purple-500/10 rounded-full flex items-center justify-center mx-auto mb-6 animate-pulse">
                                <Loader2 className="w-8 h-8 text-purple-400 animate-spin" />
                            </div>
                            <h3 className="text-xl font-bold text-white mb-2">Building in Cloud</h3>
                            <p className="text-slate-400 mb-6">GitHub Actions is processing your request...</p>

                            <button
                                onClick={async () => {
                                    setLog(prev => prev + '\nManually checking status...');
                                    try {
                                        const res = await fetch(`/api/status?buildId=${buildId}`);
                                        const data = await res.json();
                                        if (data.status === 'completed' && data.artifactId) {
                                            setStatus('success');
                                            setDownloadUrl(`/api/artifact?artifactId=${data.artifactId}`);
                                            setLog(prev => prev + '\nBuild Complete! APK is ready.');
                                        } else {
                                            setLog(prev => prev + `\nStatus: ${data.status}`);
                                        }
                                    } catch (e) {
                                        setLog(prev => prev + '\nCheck failed.');
                                    }
                                }}
                                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-sm font-medium transition-colors"
                            >
                                Check Status Now
                            </button>
                        </div>
                    )}

                    {status === 'success' && (
                        <div className="text-center py-8 animate-in fade-in zoom-in duration-500">
                            <div className="w-16 h-16 bg-green-500/10 rounded-full flex items-center justify-center mx-auto mb-6">
                                <Download className="w-8 h-8 text-green-400" />
                            </div>

                            <h3 className="text-2xl font-bold text-white mb-2">App Generated Successfully!</h3>
                            <p className="text-slate-400 mb-8">Your native Android application is ready.</p>

                            <div className="grid gap-4 max-w-sm mx-auto">
                                <a
                                    href={downloadUrl}
                                    download
                                    className="flex items-center justify-center gap-2 w-full bg-green-600 hover:bg-green-500 text-white font-bold py-4 rounded-xl transition-all shadow-lg shadow-green-900/20 group"
                                >
                                    <Download className="w-5 h-5 group-hover:scale-110 transition-transform" />
                                    Download APK
                                </a>

                                <div className="grid grid-cols-2 gap-4">
                                    <a
                                        href={`mailto:?subject=Check out my new app: ${appName}&body=Hey, I just created a native Android app for ${appName} using Kinetix! You can download it here: ${downloadUrl}`}
                                        className="flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium py-3 rounded-xl transition-colors"
                                    >
                                        <Mail className="w-4 h-4" />
                                        Email
                                    </a>
                                    <button
                                        onClick={() => window.navigator.share?.({ title: appName, text: `Check out ${appName}`, url: downloadUrl }).catch(() => { })}
                                        className="flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium py-3 rounded-xl transition-colors"
                                    >
                                        <Share2 className="w-4 h-4" />
                                        Share
                                    </button>
                                </div>
                            </div>

                            <div className="mt-8 pt-8 border-t border-slate-800">
                                <p className="text-sm font-medium text-slate-400 mb-4 flex items-center justify-center gap-2">
                                    <QrCode className="w-4 h-4" />
                                    Scan to Download
                                </p>
                                <div className="bg-white p-4 rounded-xl inline-block shadow-xl shadow-white/5">
                                    <QRCodeCanvas
                                        value={downloadUrl}
                                        size={180}
                                        level={"H"}
                                        includeMargin={false}
                                        imageSettings={{
                                            src: "/icon-192.png",
                                            x: undefined,
                                            y: undefined,
                                            height: 24,
                                            width: 24,
                                            excavate: true,
                                        }}
                                    />
                                </div>
                            </div>
                        </div>
                    )}

                    {status !== 'success' && status !== 'active-cloud' && (
                        <form onSubmit={handleSubmit} className="space-y-6">
                            <div>
                                <label className="block text-sm font-medium text-slate-300 mb-2">
                                    Application Name
                                </label>
                                <div className="relative">
                                    <Smartphone className="absolute left-3 top-3.5 w-5 h-5 text-slate-500" />
                                    <input
                                        type="text"
                                        required
                                        maxLength={20}
                                        className="w-full bg-slate-950 border border-slate-800 rounded-lg py-3 pl-10 pr-4 text-slate-100 placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500 transition-all font-medium"
                                        placeholder="My Awesome App"
                                        value={appName}
                                        onChange={(e) => setAppName(e.target.value)}
                                        disabled={status === 'building'}
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-slate-300 mb-2">
                                    Website URL
                                </label>
                                <div className="relative">
                                    <Globe className="absolute left-3 top-3.5 w-5 h-5 text-slate-500" />
                                    <input
                                        type="url"
                                        required
                                        className="w-full bg-slate-950 border border-slate-800 rounded-lg py-3 pl-10 pr-4 text-slate-100 placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500 transition-all font-medium"
                                        placeholder="https://example.com"
                                        value={appUrl}
                                        onChange={(e) => setAppUrl(e.target.value)}
                                        disabled={status === 'building'}
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-slate-300 mb-2">
                                    App Icon (PNG, 512x512)
                                </label>
                                <div className="relative group">
                                    <div className="absolute inset-0 bg-purple-500/5 rounded-lg group-hover:bg-purple-500/10 transition-colors" />
                                    <input
                                        type="file"
                                        accept="image/png"
                                        required
                                        className="w-full relative z-10 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-purple-600 file:text-white hover:file:bg-purple-500 text-slate-400 py-3 px-4 cursor-pointer"
                                        onChange={(e) => setIcon(e.target.files?.[0] || null)}
                                        disabled={status === 'building'}
                                    />
                                    <Upload className="absolute right-4 top-3.5 w-5 h-5 text-slate-600 pointer-events-none" />
                                </div>
                            </div>

                            <div className="mt-4">
                                {status === 'building' || (status === 'error' && log.includes('Starting build')) ? (
                                    <BuildVideo />
                                ) : (
                                    <GenerateButton
                                        isLoading={false}
                                        disabled={false}
                                    />
                                )}
                            </div>
                        </form>
                    )}

                    {/* Logs Terminal */}
                    {(status === 'building' || status === 'error' || status === 'active-cloud') && (
                        <div className="mt-8 bg-black rounded-lg border border-slate-800 p-4 font-mono text-xs text-green-400 h-48 overflow-y-auto shadow-inner">
                            <div className="flex items-center gap-2 text-slate-500 mb-2 pb-2 border-b border-slate-900">
                                <span className="w-2 h-2 rounded-full bg-red-500" />
                                <span className="w-2 h-2 rounded-full bg-yellow-500" />
                                <span className="w-2 h-2 rounded-full bg-green-500" />
                                <span className="ml-auto">build_log.txt</span>
                            </div>
                            <pre className="whitespace-pre-wrap">{log}</pre>
                        </div>
                    )}
                </div>
            </div>

            {/* Right Side: Emulator */}
            <div className="order-1 lg:order-2 flex flex-col items-center">
                <div className="mb-8 text-center lg:text-left">
                    <span className="text-purple-400 font-semibold tracking-wider text-sm uppercase mb-2 block">Live Preview</span>
                    <h3 className="text-2xl font-bold text-white mb-2">See It Before You Build</h3>
                    <p className="text-slate-400">Type your URL to preview how your app will look on a device.</p>
                </div>
                <MobileEmulator url={appUrl} />
            </div>
        </div>
    );
}
