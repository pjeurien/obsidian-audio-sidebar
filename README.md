# Audio Sidebar

An Obsidian plugin that provides a persistent audio player in the right sidebar, unaffected by note navigation or scrolling.

## Features

- Load all audio files from any vault folder into the sidebar
- Audio keeps playing no matter which note you open or how far you scroll
- Only one track plays at a time — starting a new track pauses the previous one
- Loop toggle
- Real-time search to filter tracks by name
- Tracks sorted alphabetically
- Embed a clickable button in any note to load a folder and optionally auto-play a track

## Supported formats

`mp3` · `wav` · `ogg` · `flac` · `m4a` · `webm` · `aac`

## Usage

### Sidebar

1. Click a folder in the file explorer (this selects it silently)
2. Click **Load from selected folder** in the Audio Sidebar
3. Press play on any track

The sidebar will not change or clear when you switch notes or tabs. Click the button again to load a different folder.

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

### Command

The command **Audio Sidebar: Load audio from current note's folder** is available in the command palette and can be bound to a hotkey. It opens the sidebar and loads the folder of whichever note is currently active.

## Installation

Copy the plugin folder into your vault's `.obsidian/plugins/` directory and enable it under Settings → Community Plugins.
