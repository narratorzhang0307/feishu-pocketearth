#!/usr/bin/env node
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const firstExisting = (candidates, suffix) => candidates.filter(Boolean).find((candidate) => existsSync(path.join(candidate, suffix)));
const javaHome = firstExisting([
  process.env.JAVA_HOME,
  path.join(root, 'var/toolchains/jdk21/Contents/Home'),
  '/Applications/Android Studio.app/Contents/jbr/Contents/Home',
], 'bin/java');
const sdkRoot = firstExisting([
  process.env.ANDROID_SDK_ROOT,
  process.env.ANDROID_HOME,
  path.join(root, 'var/toolchains/android-sdk'),
  path.join(homedir(), 'Library/Android/sdk'),
], 'platforms/android-36/android.jar');

if (!javaHome) throw new Error('Android 构建需要 JDK 21：设置 JAVA_HOME，或放到 var/toolchains/jdk21。');
if (!sdkRoot) throw new Error('Android 构建需要 API 36 SDK：设置 ANDROID_SDK_ROOT，或放到 var/toolchains/android-sdk。');

const args = process.argv.slice(2);
if (!args.length) args.push('assembleDebug');
const run = spawnSync('./gradlew', args, {
  cwd: path.join(root, 'android'),
  stdio: 'inherit',
  env: { ...process.env, JAVA_HOME: javaHome, ANDROID_HOME: sdkRoot, ANDROID_SDK_ROOT: sdkRoot },
});
if (run.error) throw run.error;
process.exit(run.status ?? 1);
