# Audio Sidebar

An Obsidian plugin that provides a persistent audio player in the right sidebar, unaffected by note navigation or scrolling.

## Features

- Load all audio files from any vault folder into the sidebar
- Set a default vault folder in plugin settings and load it automatically
- Open a searchable one-shot SFX picker from the sidebar or command palette
- Audio keeps playing no matter which note you open or how far you scroll
- Single-track playback by default, with optional overlap for manual transitions
- Optional music overlap toggle for manual transitions between tracks
- Separate master, music, and SFX volume controls
- Music fade in, fade out, and automatic crossfade between tracks
- Loop toggle
- Real-time search to filter tracks by name
- Tracks sorted alphabetically
- Embed a clickable button in any note to load a folder and optionally auto-play a track
- Embed a clickable button in any note to play a one-shot sound effect

## Supported formats

`mp3` · `wav` · `ogg` · `flac` · `m4a` · `webm` · `aac`

## Usage

### Sidebar

Optional: set a default folder under **Settings → Community Plugins → Audio Sidebar**. Use a vault-relative path such as `Music/Ambient`.
Optional: set a separate **Sound effects folder** there as well, for example `SFX`.
Optional: enable **Allow music overlap** there if you want multiple music tracks to keep playing during transitions.
Optional: set **Master volume**, **Music volume**, and **Sound effects volume** there, or adjust them live from the sidebar toolbar.
Optional: set **Music fade duration** to control fade-ins, fade-outs, and crossfades between music tracks.

1. Click a folder in the file explorer (this selects it silently)
2. Click **Load from selected folder** in the Audio Sidebar
3. Press play on any track

The sidebar will not change or clear when you switch notes or tabs. Click the button again to load a different folder.
Use the **Overlap** toggle in the track list header to switch between single-track playback and layered music playback.
When overlap is off, starting a new track crossfades from the current track into the new one using the configured fade duration.

Use **Play sound effect** in the sidebar toolbar to open a searchable picker. Choosing a result plays it once without changing the current music list.

### Codeblock

Embed a button in any note that loads a folder when clicked:

````
```audiosidebar
Music/Ambient
```
````

To also auto-play a specific track when clicked, add `#trackname`:

````
```audiosidebar
Music/Ambient#Rainy Tavern
```
````

The track name is matched by partial, case-insensitive search — `#Tavern` will match `Rainy Tavern.mp3`. The button displays the folder name and track name as a label.

To play a one-shot sound effect directly from a note, use `audiosfx`:

````
```audiosfx
SFX/Doors/Creaking Door.mp3
```
````

If you have set a **Sound effects folder** in plugin settings, you can also use just the file name or basename:

````
```audiosfx
Creaking Door
```
````

This plays the effect once and does not loop.

### Command

The command **Audio Sidebar: Load audio from current note's folder** is available in the command palette and can be bound to a hotkey. It opens the sidebar and loads the folder of whichever note is currently active.

The command **Audio Sidebar: Open sound effects picker** opens the same one-shot SFX search modal without needing the sidebar button.

## Installation

Copy the plugin folder into your vault's `.obsidian/plugins/` directory and enable it under Settings → Community Plugins.

## Author

Patriek Jeuriens
GitHub: https://github.com/pjeurien/obsidian-audio-sidebar
