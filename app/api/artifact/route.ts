import { NextRequest, NextResponse } from 'next/server';
import AdmZip from 'adm-zip';

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const artifactId = searchParams.get('artifactId');

    if (!artifactId) {
        return NextResponse.json({ error: 'Missing artifactId' }, { status: 400 });
    }

    const githubToken = process.env.GITHUB_PAT;
    const owner = process.env.GITHUB_OWNER;
    const repo = process.env.GITHUB_REPO;

    if (!githubToken || !owner || !repo) {
        return NextResponse.json({ error: 'Server config missing' }, { status: 500 });
    }

    try {
        // 1. Download the zip from GitHub
        const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/actions/artifacts/${artifactId}/zip`, {
            headers: {
                'Authorization': `Bearer ${githubToken}`,
            },
        });

        if (!res.ok) {
            return NextResponse.json({ error: 'Download failed' }, { status: res.status });
        }

        // 2. Buffer the zip file
        const arrayBuffer = await res.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        // 3. Extract in memory using adm-zip
        const zip = new AdmZip(buffer);
        const zipEntries = zip.getEntries();

        // 4. Find the APK file
        const apkEntry = zipEntries.find(entry => entry.entryName.endsWith('.apk'));

        if (!apkEntry) {
            return NextResponse.json({ error: 'No APK found in artifact' }, { status: 404 });
        }

        // 5. Serve the APK raw
        // Ensure BodyInit cast for NextResponse compatibility
        const apkBuffer = apkEntry.getData();

        const headers = new Headers();
        headers.set('Content-Type', 'application/vnd.android.package-archive');
        headers.set('Content-Disposition', `attachment; filename="${apkEntry.name}"`);
        headers.set('Content-Length', apkBuffer.length.toString());

        return new NextResponse(apkBuffer as unknown as BodyInit, {
            status: 200,
            headers,
        });

    } catch (error: any) {
        console.error('Download proxy error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
