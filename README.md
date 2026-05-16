# Audio Sidebar

Custom Obsidian plugin for managing music, one-shot sound effects, looping ambience, and note-embedded audio controls.

## Features

- Persistent right-sidebar audio player for folder-based music playback
- Optional music overlap for manual transitions
- Fade-aware track stopping and crossfading
- Searchable sound-effects picker
- Searchable loop picker for ambient audio
- Markdown codeblocks for note-embedded audio controls
- File-explorer context menu entries to copy ready-to-paste codeblocks

## Supported Codeblocks

### Music sidebar loader

Loads a folder into the audio sidebar. Optionally auto-plays a specific track by basename.

````md
```audiosidebar
Session Information/Campaigns/The Ballad of the Corpse Dancer/Audio
```
````

````md
```audiosidebar
Session Information/Campaigns/The Ballad of the Corpse Dancer/Audio#The Ballad of the Corpse Dancer
```
````

### One-shot sound effect

Plays a single sound effect immediately.

````md
```audiosfx
SFX#Door Slam
```
````

### Looping ambience

Toggles a looping ambient sound on or off.

````md
```audioloop
Loops#Rain Interior
```
````

### Fade out all audio

Fades out all active sidebar music and loops, and stops active SFX. This is intended for direct use inside notes as a scene-control button.

````md
```audiofadeoutall
Fade out all audio
```
````

The label is optional. If omitted, the button defaults to `Fade out all audio`.

## Right-Click Menu Support

### Folders

Right-clicking a folder in the file explorer provides:

- `Add to note as Audio Sidebar`
- `Copy fade-out-all codeblock`

### Audio files

Right-clicking an audio file opens an `Audio` submenu with:

- `Copy track codeblock`
- `Copy SFX codeblock`
- `Copy loop codeblock`
- `Copy fade-out-all codeblock`

## Commands

- `Load audio from current note's folder`
- `Open sound effects picker`
- `Open loop picker`
- `Stop all loops`
- `Fade out all audio`

## Notes

- `audiosidebar` uses the sidebar view and can auto-play a track after loading a folder.
- `audiosfx` plays detached one-shot audio and does not require the sidebar to stay focused.
- `audioloop` tracks active loops by file path so the same loop cannot be started twice.
- `audiofadeoutall` uses the plugin's fade-aware stop path for music and loops.

