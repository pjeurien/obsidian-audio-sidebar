# Audio Sidebar

An Obsidian plugin for managing music, one-shot sound effects, and looping ambience during play sessions — with a persistent sidebar player, note-embedded audio buttons, and fade-aware controls throughout.

Made by [Patriek Jeuriens](https://community.obsidian.md/plugins/audio-sidebar).

## Features

- Persistent right-sidebar player for folder-based music playback
- Searchable one-shot sound effects picker with fade-out on stop
- Searchable looping ambience picker — loops fade in and out automatically
- Now-playing panel showing all active music, loops, and SFX with elapsed time and stop controls, plus each loop's level
- Fade-aware crossfading for music tracks with a configurable duration
- Optional music overlap mode for manual transitions between tracks
- Per-category volume sliders: master, music, SFX, and loop
- Scene creator: combine a music track and any number of loops into a single note button, with optional preset music and loop volumes and a level for each loop
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

Switches to a music track and any number of loops, crossfading only what changes. Created with the **🎬 Create Scene** button in the sidebar toolbar, which opens a dialog to pick a track and loops and copy the finished codeblock.

````md
```audioscene
name: Tavern Night
musicVolume: 80
loopVolume: 35
music: Music/Bardify#Tavern Night
loop: Loops#Rain Interior | 40
loop: Loops#Hearth Fire
```
````

- `name` — label shown on the button (required)
- `music` — optional; uses `folder#basename` syntax, same as `audiosidebar`
- `loop` — optional; repeatable; uses `folder#basename` syntax, same as `audioloop`. Add `| 0–100` after the reference to set that loop's own level, relative to the Loop slider. Levels follow how loud the loop sounds rather than raw amplitude: `| 50` sounds about half as loud, and `| 90` is a small but audible step down. Without a level the loop plays at 100%. Each loop's level is shown next to it in the now-playing panel.
- `musicVolume` — optional; 0–100. Sets the Music volume slider when the scene starts
- `loopVolume` — optional; 0–100. Sets the Loop volume slider when the scene starts

Clicking the button moves from what is playing now to the scene, changing only what differs:

- **Loops** that both scenes share keep playing without a restart. If the new scene gives a shared loop a different level, it glides there. Loops that aren't in the new scene fade out while the new ones fade in.
- **Music:** the same track keeps playing from where it is. A different track in the folder already loaded in the sidebar crossfades. A track from another folder plays after the current music fades out, because loading the new folder replaces the sidebar's track list.
- **Volumes** set by the scene move smoothly to their new values over the fade duration, and the sliders move with them. A volume that the scene leaves out stays where it is. Moving a slider yourself during the change takes over that slider.
- **Sound effects** still playing fade out.

If you switch scenes again before a change finishes, a loop or track that is still fading out comes back instead of restarting. In the Create Scene dialog, the **Volume** box has optional Music and All loops sliders, with a slider for each selected loop listed under All loops.

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
- `audioscene` crossfades from the current audio to the scene, so shared loops and the same music track carry on uninterrupted. Use an `audiofadeoutall` button first if you want a scene to start from silence. Scene volume presets change the saved Music/Loop sliders, so they stay in effect until you move the sliders or start another scene that sets them.
- `audiofadeoutall` uses the fade-aware stop path for music and loops.
- SFX fade out over 500 ms when stopped from the now-playing panel. The stop-all command cuts immediately.
