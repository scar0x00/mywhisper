import fs from "fs/promises";
import { homedir } from "os";

export const LOG_FILE = `${homedir()}/.local/state/dictado.log`;

export function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

export async function log(message: string) {
    const timestamp = new Date().toISOString();
    const formattedMessage = `[${timestamp}] ${message}\n`;

    await fs.appendFile(LOG_FILE, formattedMessage).catch(() => {});
}
