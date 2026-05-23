export interface Config {
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
    maxDuration: number;
}

export interface TranscriptionResult {
    text: string;
}

export function isTranscriptionResult(obj: unknown): obj is TranscriptionResult {
    return typeof obj === "object" && obj !== null && "text" in obj;
}