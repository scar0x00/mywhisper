import { $ } from "bun";
import fs from "fs/promises";

export function volumeToPaplay(volume: number): number {
    const clampedVolume = Math.max(1, Math.min(100, volume));
    return Math.round((clampedVolume / 100) * 65536);
}

export async function getRecordingPid(pidFile: string) {
    try {
        const pid = await fs.readFile(pidFile, "utf8");
        const { exitCode } = await $`ps -p ${pid}`.quiet().nothrow();
        return exitCode === 0 ? pid : null;
    } catch {
        return null;
    }
}

export async function audioFileExists(audioFile: string): Promise<boolean> {
    try {
        const file = Bun.file(audioFile);
        return await file.exists() && (await file.size) > 0;
    } catch {
        return false;
    }
}
