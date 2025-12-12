import { Config } from '@bubblewrap/core/dist/lib/Config';
import { JdkHelper } from '@bubblewrap/core/dist/lib/jdk/JdkHelper';
import { AndroidSdkTools } from '@bubblewrap/core/dist/lib/androidSdk/AndroidSdkTools';
import { GradleWrapper } from '@bubblewrap/core/dist/lib/GradleWrapper';
import { TwaManifest } from '@bubblewrap/core/dist/lib/TwaManifest';
import { TwaGenerator } from '@bubblewrap/core/dist/lib/TwaGenerator';
import { ConsoleLog } from '@bubblewrap/core/dist/lib/Log';
import fs from 'fs-extra';
import path from 'path';
import { execSync } from 'child_process';
import process from 'process';

export interface BuildConfig {
    appName: string;
    appUrl: string;
    appIconPath: string; // Path to the uploaded icon
    buildId: string;
    workingDir: string;
}

export class BuildEngine {
    private config: BuildConfig;
    private log: ConsoleLog;
    private jdkPath: string;
    private androidSdkPath: string;

    constructor(config: BuildConfig) {
        this.config = config;
        this.log = new ConsoleLog('BuildEngine');

        // Dynamic Path Resolution
        this.jdkPath = process.env.JAVA_HOME || 'C:\\Program Files\\Java\\jdk-22';
        this.androidSdkPath = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || 'C:\\Users\\Sandeep Kasturi\\AppData\\Local\\Android\\Sdk';
    }

    private getExecutable(binName: string): string {
        const isWin = process.platform === 'win32';
        const ext = isWin ? '.exe' : '';
        return path.join(this.jdkPath, 'bin', `${binName}${ext}`);
    }

    async run() {
        // Vercel Serverless Protection
        if (process.env.VERCEL) {
            throw new Error(
                "HOSTING ERROR: You are running on Vercel Serverless.\n" +
                "The Android Build Engine requires Java & Android SDK, which are not available here.\n\n" +
                "SOLUTION: You must host this app on a Docker container (Railway/Fly.io) OR implement the GitHub Actions adapter."
            );
        }

        try {
            await this.setupEnvironment();
            await this.generateProject();
            await this.buildApk();
            await this.signApk();

            const fingerPrint = this.getSha256Fingerprint();

            return {
                success: true,
                apkPath: this.getSignedApkPath(),
                packageId: `com.nativebridge.app${this.config.buildId.replace(/-/g, '')}`,
                sha256Fingerprint: fingerPrint
            };
        } catch (error) {
            console.error('Build failed:', error);
            throw error;
        }
    }

    private getSha256Fingerprint(): string {
        try {
            const keystorePath = path.join(this.config.workingDir, 'android.keystore');
            const keytool = this.getExecutable('keytool');

            // Command to list keystore details including certificate fingerprints
            const cmd = `"${keytool}" -list -v -keystore "${keystorePath}" -alias android -storepass password`;
            const output = execSync(cmd).toString();

            // Regex to find SHA256: AA:BB:CC...
            const match = output.match(/SHA256:\s*([A-Fa-f0-9:]+)/);
            return match ? match[1] : '';
        } catch (e) {
            console.error('Failed to extract SHA-256 fingerprint', e);
            return '';
        }
    }

    private async setupEnvironment() {
        console.log(`[${this.config.buildId}] Setting up environment...`);
        console.log(`Using JDK: ${this.jdkPath}`);
        console.log(`Using SDK: ${this.androidSdkPath}`);
        // Ensure working directory exists
        await fs.ensureDir(this.config.workingDir);
    }

    private async generateProject() {
        console.log(`[${this.config.buildId}] Generating Project...`);

        // Hostname extraction
        const url = new URL(this.config.appUrl);
        const host = url.hostname;

        // Manifest Configuration
        const manifestConfig = {
            packageId: `com.nativebridge.app${this.config.buildId.replace(/-/g, '')}`, // Sanitize package name
            host: host,
            name: this.config.appName,
            launcherName: this.config.appName.substring(0, 12), // Short name
            display: 'standalone',
            themeColor: '#000000',
            navigationColor: '#000000',
            backgroundColor: '#ffffff',
            startUrl: '/',
            iconUrl: this.config.appIconPath, // We will hack this later or serve it
            maskableIconUrl: undefined,
            appVersion: '1.0.0',
            appVersionCode: 1,
            shortcuts: [],
            splashScreenFadeOutDuration: 300,
            enableNotifications: true,
            signingKey: {
                path: path.join(this.config.workingDir, 'android.keystore'),
                alias: 'android'
            },
            generatorApp: 'NativeBridge'
        };

        const manifest = new TwaManifest(manifestConfig);
        const generator = new TwaGenerator();

        // Icon Server Strategy (Same as before)
        const port = 3000 + Math.floor(Math.random() * 10000);
        const http = require('http');
        const iconServer = http.createServer((req: any, res: any) => {
            const stream = fs.createReadStream(this.config.appIconPath);
            res.writeHead(200, { 'Content-Type': 'image/png' });
            stream.pipe(res);
        }).listen(port);

        manifest.iconUrl = `http://localhost:${port}/icon.png`;

        try {
            await generator.createTwaProject(this.config.workingDir, manifest, this.log);
        } finally {
            iconServer.close();
        }
    }

    private async buildApk() {
        console.log(`[${this.config.buildId}] Building APK...`);

        // Create local.properties: Use forward slashes for cross-platform compatibility
        const localPropsPath = path.join(this.config.workingDir, 'local.properties');

        // Escape backslashes for Windows, but forward slashes work on both for Java props usually.
        // Safer to just use path.sep logic or replace.
        const safeSdkPath = this.androidSdkPath.replace(/\\/g, '\\\\');
        await fs.writeFile(localPropsPath, `sdk.dir=${safeSdkPath}`);

        // Setup Gradle Wrapper
        const bubblewrapConfig = new Config(this.jdkPath, this.androidSdkPath);
        const jdkHelper = new JdkHelper(process, bubblewrapConfig);
        // @ts-ignore
        const androidSdkTools = new AndroidSdkTools(process, bubblewrapConfig, jdkHelper);
        const gradleWrapper = new GradleWrapper(process, androidSdkTools, this.config.workingDir);

        // Generate Keystore if needed
        const keystorePath = path.join(this.config.workingDir, 'android.keystore');
        if (!fs.existsSync(keystorePath)) {
            const keytool = this.getExecutable('keytool');
            const cmd = `"${keytool}" -genkeypair -v -keystore "${keystorePath}" -alias android -keyalg RSA -keysize 2048 -validity 10000 -storepass password -keypass password -dname "CN=NativeBridge, OU=Engineering, O=NativeBridge, C=US"`;
            execSync(cmd);
        }

        await gradleWrapper.assembleRelease();
    }

    private async signApk() {
        console.log(`[${this.config.buildId}] Signing APK...`);
        const buildToolsRoot = path.join(this.androidSdkPath, 'build-tools');
        const versions = fs.readdirSync(buildToolsRoot).filter(f => fs.statSync(path.join(buildToolsRoot, f)).isDirectory());
        const latestVersion = versions.sort().pop();

        if (!latestVersion) throw new Error('No build-tools found');

        const apksignerJar = path.join(buildToolsRoot, latestVersion, 'lib', 'apksigner.jar');
        const javaExe = this.getExecutable('java');

        const apkDir = path.join(this.config.workingDir, 'app', 'build', 'outputs', 'apk', 'release');
        const inputApk = path.join(apkDir, 'app-release-unsigned.apk');
        const outputApk = path.join(apkDir, 'app-release-signed.apk');
        const keystorePath = path.join(this.config.workingDir, 'android.keystore');

        const cmd = `"${javaExe}" -Xmx1024M -Xss1m -jar "${apksignerJar}" sign --ks "${keystorePath}" --ks-key-alias android --ks-pass pass:password --key-pass pass:password --out "${outputApk}" "${inputApk}"`;
        execSync(cmd);
    }

    private getSignedApkPath() {
        return path.join(this.config.workingDir, 'app', 'build', 'outputs', 'apk', 'release', 'app-release-signed.apk');
    }
}
