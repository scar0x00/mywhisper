import fs from "fs/promises";
import path from "path";
import { log, errorMessage } from "./utils.ts";
import type { Config } from "./types.ts";

export const CONFIG_PATH = path.join(import.meta.dir, "config.json");

export const DEFAULT_CONFIG: Config = {
    sounds: {
        start: "/usr/share/sounds/freedesktop/stereo/dialog-warning.oga",
        end: "/usr/share/sounds/freedesktop/stereo/message.oga",
        volume: 30,
    },
    model: "openai/whisper-large-v3",
    arecord: {
        format: "S16_LE",
        channels: 1,
        rate: 16000,
    },
    paths: {
        audioFile: "/tmp/dictado.wav",
        pidFile: "/tmp/dictado_pid.txt",
    },
    maxDuration: 240,
};

export async function loadConfig(): Promise<Config> {
    try {
        const configFile = Bun.file(CONFIG_PATH);
        if (await configFile.exists()) {
            const configText = await configFile.text();
            const config = JSON.parse(configText) as Config;
            await log(`Configuration loaded from ${CONFIG_PATH}`);
            return config;
        }
    } catch (error) {
        await log(`Error reading config file: ${errorMessage(error)}`);
    }

    // Config file doesn't exist or is invalid, create default
    await log(`Creating default configuration at ${CONFIG_PATH}`);
    try {
        await fs.writeFile(CONFIG_PATH, JSON.stringify(DEFAULT_CONFIG, null, 2));
        await log("Default configuration created successfully");
    } catch (error) {
        await log(`Error creating config file: ${errorMessage(error)}`);
    }

    return DEFAULT_CONFIG;
}
