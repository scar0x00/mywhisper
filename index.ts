import { $ } from "bun";
import fs from "fs/promises";
import { homedir } from "os";
import path from "path";

// We define our log file path (XDG standard location)
const LOG_FILE = `${homedir()}/.local/state/dictado.log`;

// Config file path (same directory as the script)
const CONFIG_PATH = path.join(import.meta.dir, "config.json");

// Default configuration values
const DEFAULT_CONFIG = {
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
};

// Configuration type
interface Config {
    sounds: {
        start: string;
        end: string;
        volume: number;
    };
    model: string;
    arecord: {
        format: string;
        channels: number;
        rate: number;
    };
    paths: {
        audioFile: string;
        pidFile: string;
    };
}

// Internal logging function - no need for shell '>>' redirection
async function log(message: string) {
    const timestamp = new Date().toISOString();
    const formattedMessage = `[${timestamp}] ${message}\n`;

    // console.log(`[${timestamp}] ${message}`);
    await fs.appendFile(LOG_FILE, formattedMessage).catch(() => {});
}

// Load or create configuration
async function loadConfig(): Promise<Config> {
    try {
        const configFile = Bun.file(CONFIG_PATH);
        if (await configFile.exists()) {
            const configText = await configFile.text();
            const config = JSON.parse(configText) as Config;
            await log(`Configuration loaded from ${CONFIG_PATH}`);
            return config;
        }
    } catch (error) {
        await log(`Error reading config file: ${error.message}`);
    }

    // Config file doesn't exist or is invalid, create default
    await log(`Creating default configuration at ${CONFIG_PATH}`);
    try {
        await fs.writeFile(CONFIG_PATH, JSON.stringify(DEFAULT_CONFIG, null, 2));
        await log("Default configuration created successfully");
    } catch (error) {
        await log(`Error creating config file: ${error.message}`);
    }

    return DEFAULT_CONFIG;
}

// Convert volume from 1-100 scale to paplay's 0-65536 scale
function volumeToPaplay(volume: number): number {
    // Clamp volume between 1 and 100
    const clampedVolume = Math.max(1, Math.min(100, volume));
    // Convert to paplay scale (0-65536)
    return Math.round((clampedVolume / 100) * 65536);
}

await log("--- Script begins execution ---");

// Load configuration
const config = await loadConfig();

const KEY_PATH = `${homedir()}/.config/openrouter_key`;
let API_KEY = "";

try {
    const rawKey = await fs.readFile(KEY_PATH, "utf8");
    API_KEY = rawKey.trim();
} catch (error) {
    await log(`FATAL ERROR: No se pudo leer la API Key en: ${KEY_PATH}`);
    process.exit(1);
}

async function getRecordingPid() {
    try {
        const pid = await fs.readFile(config.paths.pidFile, "utf8");
        const { exitCode } = await $`ps -p ${pid}`.quiet().nothrow();
        return exitCode === 0 ? pid : null;
    } catch {
        return null;
    }
}

const pid = await getRecordingPid();

// Calculate paplay volume from config
const paplayVolume = volumeToPaplay(config.sounds.volume);

if (!pid) {
    // ESTADO 1: Iniciar grabacion
    // Adding .quiet() prevents these from capturing or holding standard output streams
    await $`paplay --volume=${paplayVolume} ${config.sounds.start}`.quiet().nothrow();
    // await $`notify-send "Grabando..." "Habla y presiona el atajo de nuevo."`.quiet().nothrow();

    const proc = Bun.spawn(
        [
            "arecord",
            "-f",
            config.arecord.format,
            "-c",
            config.arecord.channels.toString(),
            "-r",
            config.arecord.rate.toString(),
            config.paths.audioFile,
        ],
        {
            // Explicitly ignoring streams ensures arecord detaches completely
            stdin: "ignore",
            stdout: "ignore",
            stderr: "ignore",
        },
    );

    await fs.writeFile(config.paths.pidFile, proc.pid.toString());
    await log(
        `Started recording (PID: ${proc.pid}). Audio saving to ${config.paths.audioFile}`,
    );
    process.exit(0);
} else {
    // ESTADO 2: Detener, procesar y auto-tipear
    await log(`Active recording found (PID: ${pid}). Stopping recording...`);
    await $`kill -INT ${pid}`.quiet().nothrow();
    await fs.unlink(config.paths.pidFile).catch(() => {});
    await log("Stopped recording successfully.");

    try {
        const file = Bun.file(config.paths.audioFile);
        const arrayBuffer = await file.arrayBuffer();
        const base64Audio = Buffer.from(arrayBuffer).toString("base64");

        const payload = {
            model: config.model,
            input_audio: {
                data: base64Audio,
                format: "wav",
            },
        };

        await log("Sending audio payload to OpenRouter...");
        const response = await fetch(
            "https://openrouter.ai/api/v1/audio/transcriptions",
            {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${API_KEY}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(payload),
            },
        );

        if (!response.ok) {
            const errorText = await response.text();
            await log(
                `ERROR: OpenRouter request failed. HTTP ${response.status} - ${errorText}`,
            );
            throw new Error(`HTTP ${response.status} - ${errorText}`);
        }

        const result = await response.json();
        await log(`Response received from OpenRouter. Success: true`);

        if (result.text) {
            const textoLimpio = result.text.trim();
            await log(`Transcript result: "${textoLimpio}"`);

            // Manually spawn xclip and pipe the text directly to its stdin
            const clipProc = Bun.spawn(
                ["xclip", "-selection", "clipboard"],
                { stdin: "pipe" },
            );
            clipProc.stdin.write(textoLimpio);
            clipProc.stdin.flush();
            clipProc.stdin.end(); // This sends the EOF immediately!
            await clipProc.exited; // Wait for it to close (should be instant now)

            await $`paplay --volume=${paplayVolume} ${config.sounds.end}`.quiet()
                .nothrow();

            await Bun.sleep(200);
            await $`xdotool key "ctrl+v"`.quiet().nothrow();
            await log("Transcript pasted via xdotool successfully.");
            process.exit(0);
        } else {
            await log(
                "ERROR: API returned a successful response but no 'text' field was found in the JSON.",
            );
            throw new Error("La API devolvio un JSON sin texto.");
            process.exit(1);
        }
    } catch (error) {
        await log(`FATAL ERROR: ${error.message}`);
        process.exit(1);
    }
}
