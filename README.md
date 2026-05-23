# mywhisper

Aplicación de dictado por voz que utiliza la API de OpenRouter para transcribir audio a texto y escribirlo automáticamente en cualquier campo de texto.

## Características

- Grabación de audio con atajo de teclado (toggle: iniciar/detener)
- Transcripción automática usando modelos de IA (OpenAI Whisper, etc.)
- Reproducción de sonidos de feedback al iniciar y finalizar la grabación
- Pegado automático del texto transcrito usando `xdotool`
- Configuración flexible mediante archivo JSON

## Requisitos

### Dependencias del sistema

```bash
# PulseAudio (para reproducción de sonidos)
sudo apt-get install pulseaudio-utils

# ALSA (para grabación de audio)
sudo apt-get install alsa-utils

# xclip (para portapapeles)
sudo apt-get install xclip

# xdotool (para simular teclado)
sudo apt-get install xdotool
```

### API Key de OpenRouter

Crea el archivo `~/.config/openrouter_key` con tu API key:

```bash
mkdir -p ~/.config
echo "tu-api-key-aqui" > ~/.config/openrouter_key
```

## Instalación

```bash
# Clonar o navegar al directorio
cd mywhisper

# Instalar dependencias de Bun
bun install
```

## Configuración

La aplicación se configura mediante el archivo **`config.json`** ubicado en el mismo directorio que el script.

### Creación automática

Si el archivo `config.json` no existe, se creará automáticamente con los valores por defecto la primera vez que ejecutes el script.

### Estructura del archivo

```json
{
  "sounds": {
    "start": "/usr/share/sounds/freedesktop/stereo/dialog-warning.oga",
    "end": "/usr/share/sounds/freedesktop/stereo/message.oga",
    "volume": 30
  },
  "model": "openai/whisper-large-v3",
  "arecord": {
    "format": "S16_LE",
    "channels": 1,
    "rate": 16000
  },
  "paths": {
    "audioFile": "/tmp/dictado.wav",
    "pidFile": "/tmp/dictado_pid.txt"
  }
}
```

### Parámetros configurables

#### `sounds`
Configuración de los sonidos de feedback.

- **`start`**: Ruta al archivo de sonido que se reproduce al iniciar la grabación.
- **`end`**: Ruta al archivo de sonido que se reproduce al finalizar la grabación.
- **`volume`**: Volumen de reproducción en escala de **1 a 100** (por defecto: `30`).

#### `model`
Modelo de transcripción a utilizar en OpenRouter. Algunas opciones disponibles:

- `openai/whisper-large-v3` (por defecto)
- `openai/whisper-large-v3-turbo`
- `openai/whisper-1`
- `mistralai/voxtral-mini-transcribe`

#### `arecord`
Parámetros de grabación de audio.

- **`format`**: Formato de muestreo (por defecto: `S16_LE`)
- **`channels`**: Número de canales (por defecto: `1` - mono)
- **`rate`**: Tasa de muestreo en Hz (por defecto: `16000`)

#### `paths`
Rutas de archivos temporales.

- **`audioFile`**: Archivo temporal donde se guarda la grabación (por defecto: `/tmp/dictado.wav`)
- **`pidFile`**: Archivo para rastrear el proceso de grabación activo (por defecto: `/tmp/dictado_pid.txt`)

### Ejemplos de configuración

#### Aumentar el volumen al 80%

```json
{
  "sounds": {
    "volume": 80
  }
}
```

#### Usar un modelo más rápido

```json
{
  "model": "openai/whisper-large-v3-turbo"
}
```

#### Cambiar los sonidos (usando archivos personalizados)

```json
{
  "sounds": {
    "start": "/home/usuario/sounds/inicio.wav",
    "end": "/home/usuario/sounds/fin.wav",
    "volume": 50
  }
}
```

#### Configuración de alta calidad de audio

```json
{
  "arecord": {
    "format": "S32_LE",
    "channels": 2,
    "rate": 48000
  }
}
```

## Uso

### Ejecución directa

```bash
bun run index.ts
```

### Configurar atajo de teclado

Para usar la aplicación cómodamente, configura un atajo de teclado en tu entorno de escritorio que ejecute:

```bash
bun run /ruta/a/mywhisper/index.ts
```

**GNOME (Settings > Keyboard > Custom Shortcuts):**
- Name: Dictado por voz
- Command: `bun run /home/usuario/mywhisper/index.ts`
- Shortcut: `Ctrl+Alt+D` (o el que prefieras)

**KDE:**
- System Settings > Shortcuts > Custom Shortcuts
- Añadir comando con la ruta completa

**i3wm:**
```conf
bindsym $mod+Shift+d exec bun run /home/usuario/mywhisper/index.ts
```

### Flujo de trabajo

1. Presiona el atajo de teclado configurado → Escucharás el sonido de inicio
2. Habla el texto que quieres transcribir
3. Presiona nuevamente el mismo atajo → Escucharás el sonido de fin
4. El texto transcrito se pegará automáticamente donde esté el cursor

## Solución de problemas

### Error: "No se pudo leer la API Key"

Verifica que el archivo `~/.config/openrouter_key` existe y contiene tu API key válida.

### No se escucha el sonido de inicio/fin

- Verifica que los archivos de sonido especificados en `config.json` existen
- Aumenta el volumen en la configuración (`sounds.volume`)
- Asegúrate de que PulseAudio esté funcionando

### Error de grabación

- Verifica que tu micrófono esté configurado como dispositivo predeterminado en ALSA
- Prueba `arecord -l` para listar dispositivos disponibles

### El texto no se pega

- Verifica que `xdotool` esté instalado
- Asegúrate de que el foco esté en un campo de texto editable al finalizar la grabación

## Registro de eventos

La aplicación guarda un registro de eventos en:

```
~/.local/state/dictado.log
```

Útil para depurar problemas.

## Desarrollo

Este proyecto fue creado usando `bun init`. Requiere Bun v1.3.13 o superior.

```bash
# Ejecutar en modo desarrollo
bun --hot run index.ts
```

## Licencia

MIT
