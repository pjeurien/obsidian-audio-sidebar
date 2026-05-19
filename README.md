# Audio Sidebar

An Obsidian plugin for managing music, one-shot sound effects, and looping ambience during play sessions — with a persistent sidebar player, note-embedded audio buttons, and fade-aware controls throughout.

Made by [Patriek Jeuriens](https://community.obsidian.md/plugins/audio-sidebar).

## Features

- Persistent right-sidebar player for folder-based music playback
- Searchable one-shot sound effects picker with fade-out on stop
- Searchable looping ambience picker — loops fade in and out automatically
- Now-playing panel showing all active music, loops, and SFX with elapsed time and stop controls
- Fade-aware crossfading for music tracks with a configurable duration
- Optional music overlap mode for manual transitions between tracks
- Per-category volume sliders: master, music, SFX, and loop
- Scene creator: combine a music track and any number of loops into a single note button
- Markdown codeblocks for note-embedded audio buttons
- File-explorer context menu to copy ready-to-paste codeblocks

## Codeblocks

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

Plays a single sound effect immediately. Can be stopped with a fade from the now-playing panel.

````md
```audiosfx
SFX#Door Slam
```
````

You can also target a file by its full vault path, or use `folder#basename` syntax to pick from a specific folder.

### Looping ambience

Toggles a looping ambient sound on or off. The same loop cannot be started twice. Fades in on start and fades out on stop.

````md
```audioloop
Loops#Rain Interior
```
````

### Scene

Fades out all current audio and simultaneously starts a music track and any number of loops. Created with the **🎬 Create Scene** button in the sidebar toolbar, which opens a dialog to pick a track and loops and copy the finished codeblock.

````md
```audioscene
name: Tavern Night
music: Music/Bardify#Tavern Night
loop: Loops#Rain Interior
loop: Loops#Hearth Fire
```
````

- `name` — label shown on the button (required)
- `music` — optional; uses `folder#basename` syntax, same as `audiosidebar`
- `loop` — optional; repeatable; uses `folder#basename` syntax, same as `audioloop`

Clicking the button fades out all active audio before starting the scene.

### Fade out all audio

Fades out all active music and loops, and stops any active SFX. Intended as a scene-control button embedded directly in a note.

````md
```audiofadeoutall
Fade out all audio
```
````

The label is optional — if omitted the button reads `Fade out all audio`.

## Right-Click Menu

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

| Command | Description |
|---|---|
| Load audio from current note's folder | Loads the active note's parent folder into the sidebar |
| Open sound effects picker | Opens the searchable one-shot SFX modal |
| Open loop picker | Opens the searchable loop modal |
| Stop all loops | Fades out and stops all active loops |
| Fade out all audio | Fades out all music and loops, stops all SFX |

## Settings

| Setting | Description |
|---|---|
| Default folder | Vault-relative path loaded automatically when the sidebar opens |
| Use selected folder | Copies the folder selected in the file explorer into the default folder setting |
| Sound effects folder | Vault-relative path used by the SFX picker |
| Loops folder | Vault-relative path used by the loop picker |
| Allow music overlap | Lets multiple music tracks play simultaneously for manual crossfades |
| Master volume | Overall volume applied to all categories |
| Music volume | Volume for tracks played in the sidebar |
| Sound effects volume | Volume for one-shot effects |
| Loop volume | Volume for looping ambience |
| Music fade duration | Fade in/out duration in milliseconds, used for music and loops |

## Notes

- `audiosidebar` uses the sidebar view and can auto-play a track after loading a folder.
- `audiosfx` plays detached one-shot audio and does not require the sidebar to stay open.
- `audioloop` tracks active loops by file path so the same loop cannot be started twice.
- `audioscene` fades out all audio before starting, so it always starts clean.
- `audiofadeoutall` uses the fade-aware stop path for music and loops.
- SFX fade out over 500 ms when stopped from the now-playing panel. The stop-all command cuts immediately.
