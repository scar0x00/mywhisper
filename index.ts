import { $ } from "bun";
import fs from "fs/promises";
import { homedir } from "os";

// We define our log file path (XDG standard location)
const LOG_FILE = `${homedir()}/.local/state/dictado.log`;

// Internal logging function - no need for shell '>>' redirection
async function log(message: string) {
    const timestamp = new Date().toISOString();
    const formattedMessage = `[${timestamp}] ${message}\n`;
    
    // console.log(`[${timestamp}] ${message}`);
    await fs.appendFile(LOG_FILE, formattedMessage).catch(() => {});
}

await log("--- Script begins execution ---");

const SOUND_START = "/usr/share/sounds/freedesktop/stereo/dialog-warning.oga";
const SOUND_END = "/usr/share/sounds/freedesktop/stereo/message.oga";
const KEY_PATH = `${homedir()}/.config/openrouter_key`;
let API_KEY = "";
const AUDIO_FILE = "/tmp/dictado.wav";
const PID_FILE = "/tmp/dictado_pid.txt";

try {
    const rawKey = await fs.readFile(KEY_PATH, "utf8");
    API_KEY = rawKey.trim();
} catch (error) {
    await log(`FATAL ERROR: No se pudo leer la API Key en: ${KEY_PATH}`);
    process.exit(1);
}

async function getRecordingPid() {
    try {
        const pid = await fs.readFile(PID_FILE, "utf8");
        const { exitCode } = await $`ps -p ${pid}`.quiet().nothrow();
        return exitCode === 0 ? pid : null;
    } catch {
        return null;
    }
}

const pid = await getRecordingPid();

if (!pid) {
    // ESTADO 1: Iniciar grabacion
    // Adding .quiet() prevents these from capturing or holding standard output streams
    await $`paplay --volume=19661 ${SOUND_START}`.quiet().nothrow();
    // await $`notify-send "Grabando..." "Habla y presiona el atajo de nuevo."`.quiet().nothrow();
    
    const proc = Bun.spawn([
        "arecord",
        "-f",
        "S16_LE",
        "-c",
        "1",
        "-r",
        "16000",
        AUDIO_FILE,
    ], {
        // Explicitly ignoring streams ensures arecord detaches completely
        stdin: "ignore",
        stdout: "ignore",
        stderr: "ignore",
    });

    await fs.writeFile(PID_FILE, proc.pid.toString());
    await log(`Started recording (PID: ${proc.pid}). Audio saving to ${AUDIO_FILE}`);
    process.exit(0);
} else {
    // ESTADO 2: Detener, procesar y auto-tipear
    await log(`Active recording found (PID: ${pid}). Stopping recording...`);
    await $`kill -INT ${pid}`.quiet().nothrow();
    await fs.unlink(PID_FILE).catch(() => {});
    await log("Stopped recording successfully.");

    try {
        const file = Bun.file(AUDIO_FILE);
        const arrayBuffer = await file.arrayBuffer();
        const base64Audio = Buffer.from(arrayBuffer).toString("base64");

        // mistralai/voxtral-mini-transcribe
        // openai/whisper-large-v3-turbo
        // openai/whisper-1
        // openai/whisper-large-v3
        const payload = {
            model: "openai/whisper-large-v3",
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
                    "Authorization": `Bearer ${API_KEY}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(payload),
            },
        );

        if (!response.ok) {
            const errorText = await response.text();
            await log(`ERROR: OpenRouter request failed. HTTP ${response.status} - ${errorText}`);
            throw new Error(`HTTP ${response.status} - ${errorText}`);
        }

        const result = await response.json();
        await log(`Response received from OpenRouter. Success: true`);

        if (result.text) {
            const textoLimpio = result.text.trim();
            await log(`Transcript result: "${textoLimpio}"`);

            // Manually spawn xclip and pipe the text directly to its stdin
            const clipProc = Bun.spawn(["xclip", "-selection", "clipboard"], { stdin: "pipe" });
            clipProc.stdin.write(textoLimpio);
            clipProc.stdin.flush();
            clipProc.stdin.end(); // This sends the EOF immediately!
            await clipProc.exited; // Wait for it to close (should be instant now)

            await $`paplay --volume=19661 ${SOUND_END}`.quiet().nothrow();

            await Bun.sleep(200);
            await $`xdotool key "ctrl+v"`.quiet().nothrow();
            await log("Transcript pasted via xdotool successfully.");
            process.exit(0);
        } else {
            await log("ERROR: API returned a successful response but no 'text' field was found in the JSON.");
            throw new Error("La API devolvio un JSON sin texto.");
            process.exit(1);
        }
    } catch (error) {
        await log(`FATAL ERROR: ${error.message}`);
        process.exit(1);
    }
}