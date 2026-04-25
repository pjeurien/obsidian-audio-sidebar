const { Modal, Notice, Plugin, ItemView, PluginSettingTab, Setting, TFolder, TFile, setIcon } = require('obsidian');

const VIEW_TYPE = 'audio-sidebar';
const AUDIO_EXTENSIONS = ['mp3', 'wav', 'ogg', 'flac', 'm4a', 'webm', 'aac'];
const DEFAULT_SETTINGS = {
  defaultFolderPath: '',
  sfxFolderPath: '',
  allowMusicOverlap: false,
  masterVolume: 100,
  musicVolume: 100,
  sfxVolume: 100,
  musicFadeMs: 1500
};

// ─── SFX Picker Modal ────────────────────────────────────────────────────────
// Searchable modal for one-shot sound effects. Opened via the sidebar toolbar
// or the "Open sound effects picker" command.

class AudioSfxModal extends Modal {
  constructor(app, plugin, files) {
    super(app);
    this.plugin = plugin;
    this.files = files;
    this.filteredFiles = files;
  }

  onOpen() {
    this.modalEl.addClass('audio-sb-sfx-modal');
    const { contentEl } = this;
    contentEl.empty();

    const searchEl = contentEl.createEl('input', {
      cls: 'audio-sb-sfx-search',
      type: 'text',
      placeholder: 'Search sound effects...'
    });

    const listEl = contentEl.createEl('div', { cls: 'audio-sb-sfx-list' });
    this.renderList(listEl);

    searchEl.addEventListener('input', () => {
      const query = searchEl.value.toLowerCase().trim();
      this.filteredFiles = this.files.filter(file =>
        !query ||
        file.basename.toLowerCase().includes(query) ||
        file.path.toLowerCase().includes(query)
      );
      this.renderList(listEl);
    });

    searchEl.focus();
  }

  renderList(listEl) {
    listEl.empty();

    if (this.filteredFiles.length === 0) {
      listEl.createEl('div', {
        text: 'No matching sound effects.',
        cls: 'audio-sb-sfx-empty'
      });
      return;
    }

    for (const file of this.filteredFiles) {
      const rowEl = listEl.createEl('div', { cls: 'audio-sb-sfx-modal-row' });

      const itemEl = rowEl.createEl('button', {
        cls: 'audio-sb-sfx-item',
        type: 'button'
      });
      itemEl.createEl('span', { text: '♪', cls: 'audio-sb-sfx-icon' });
      itemEl.createEl('div', { text: file.basename, cls: 'audio-sb-sfx-name' });
      itemEl.onclick = () => {
        this.close();
        this.plugin.playSfx(file);
      };

      // Copy button: produces a ready-to-paste audiosfx codeblock using
      // folder#basename syntax so the path is explicit and always resolvable.
      const copyBtn = rowEl.createEl('button', {
        cls: 'audio-sb-sfx-copy',
        type: 'button',
        attr: { 'aria-label': 'Copy audiosfx codeblock' }
      });
      setIcon(copyBtn, 'copy');
      copyBtn.onclick = () => {
        const parent = file.parent;
        const folderPath = parent && parent.path && parent.path !== '/' ? parent.path : null;
        const ref = folderPath ? `${folderPath}#${file.basename}` : file.basename;
        navigator.clipboard.writeText(`\`\`\`audiosfx\n${ref}\n\`\`\``);
        new Notice('Codeblock copied');
      };
    }
  }

  onClose() {
    this.contentEl.empty();
  }
}

// ─── Sidebar View ─────────────────────────────────────────────────────────────
// Persistent ItemView rendered in the right panel. Survives note navigation
// because Obsidian only unmounts it when the leaf is explicitly closed.

class AudioSidebarView extends ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType() { return VIEW_TYPE; }
  getDisplayText() { return 'Audio'; }
  getIcon() { return 'music'; }

  async onOpen() {
    this.draw(null);
  }

  // Rebuilds the entire sidebar DOM. Called once on open and again after a
  // settings change that requires a full redraw (e.g. overlap toggle).
  draw(folder) {
    this._looping = true;
    this._suppressPauseSync = false;
    const content = this.containerEl.children[1];
    content.empty();
    content.addClass('audio-sb-view');

    const toolbar = content.createEl('div', { cls: 'audio-sb-toolbar' });
    const loadBtn = toolbar.createEl('button', { text: 'Load from selected folder', cls: 'audio-sb-load-btn' });
    loadBtn.onclick = () => {
      const folder = this.plugin.selectedFolder;
      if (folder) this.loadFolder(folder);
    };
    const sfxRow = toolbar.createEl('div', { cls: 'audio-sb-sfx-row' });
    const sfxBtn = sfxRow.createEl('button', { text: 'Play sound effect', cls: 'audio-sb-load-btn audio-sb-sfx-btn' });
    sfxBtn.onclick = () => this.plugin.openSfxPicker();
    const stopSfxBtn = sfxRow.createEl('button', { text: 'Stop sound effects', cls: 'audio-sb-load-btn audio-sb-sfx-btn' });
    stopSfxBtn.onclick = () => this.plugin.stopAllSfx();
    this.renderVolumeControls(toolbar);

    this._bodyEl = content.createEl('div', { cls: 'audio-sb-body' });
    this._footerEl = content.createEl('div', { cls: 'audio-sb-footer' });
    this._footerLabelEl = this._footerEl.createEl('div', { text: 'Now Playing', cls: 'audio-sb-footer-label' });
    this._footerTrackEl = this._footerEl.createEl('div', { text: 'Nothing playing', cls: 'audio-sb-footer-track' });
    this._footerMetaEl = this._footerEl.createEl('div', { text: '', cls: 'audio-sb-footer-meta' });
    this._footerControlsEl = this._footerEl.createEl('div', { cls: 'audio-sb-footer-controls' });
    this._footerPlayBtn = this._footerControlsEl.createEl('button', { text: 'Play', cls: 'audio-sb-footer-btn', type: 'button' });
    this._footerStopBtn = this._footerControlsEl.createEl('button', { text: 'Stop', cls: 'audio-sb-footer-btn', type: 'button' });
    this._footerPlayBtn.onclick = () => this.toggleCurrentTrack();
    this._footerStopBtn.onclick = () => this.stopCurrentTrack();

    this._loopBtn = null;
    this._currentAudio = null;
    this._currentTrackName = '';

    if (!this._loadedFolder) return;
    this.renderTracks(this._bodyEl, this._loadedFolder);
  }

  toggleLoop() {
    this._looping = !this._looping;
    this.updateLoopButton();
    this._loopBtn.classList.toggle('audio-sb-loop-on', this._looping);
    this._loopBtn.classList.toggle('audio-sb-loop-off', !this._looping);
    this.getTrackAudios().forEach(a => a.loop = this._looping);
  }

  toggleMusicOverlap() {
    this.plugin.settings.allowMusicOverlap = !this.plugin.settings.allowMusicOverlap;
    this.plugin.saveSettings();
    this.applyMusicOverlapPolicy();
    this.updateOverlapButton();
  }

  updateLoopButton() {
    if (!this._loopBtn) return;
    this._loopBtn.textContent = `⟳ Loop: ${this._looping ? 'On' : 'Off'}`;
    this._loopBtn.title = this._looping ? 'Disable loop' : 'Enable loop';
  }

  updateOverlapButton() {
    if (!this._overlapBtn) return;
    const enabled = !!this.plugin.settings.allowMusicOverlap;
    this._overlapBtn.textContent = `⇄ Overlap: ${enabled ? 'On' : 'Off'}`;
    this._overlapBtn.title = enabled ? 'Disable music overlap' : 'Enable music overlap';
    this._overlapBtn.classList.toggle('audio-sb-loop-on', enabled);
    this._overlapBtn.classList.toggle('audio-sb-loop-off', !enabled);
  }

  getTrackAudios() {
    return this._trackList ? Array.from(this._trackList.querySelectorAll('audio')) : [];
  }

  getFadeDurationMs() {
    return this.plugin.clampFadeMs(this.plugin.settings.musicFadeMs);
  }

  renderVolumeControls(parentEl) {
    const volumeRow = parentEl.createEl('div', { cls: 'audio-sb-volume-row' });
    this._masterVolumeInput = this.createVolumeControl(volumeRow, 'Master', 'masterVolume');
    this._musicVolumeInput = this.createVolumeControl(volumeRow, 'Music', 'musicVolume');
    this._sfxVolumeInput = this.createVolumeControl(volumeRow, 'SFX', 'sfxVolume');
  }

  createVolumeControl(parentEl, label, settingKey) {
    const wrap = parentEl.createEl('label', { cls: 'audio-sb-volume-control' });
    wrap.createEl('span', { text: label, cls: 'audio-sb-volume-label' });
    const valueEl = wrap.createEl('span', {
      text: `${this.plugin.settings[settingKey]}%`,
      cls: 'audio-sb-volume-value'
    });
    const input = wrap.createEl('input', {
      cls: 'audio-sb-volume-slider',
      type: 'range',
      attr: { min: '0', max: '100', step: '1' }
    });
    input.value = String(this.plugin.settings[settingKey]);
    // 'input' previews volume live while dragging; 'change' persists it.
    input.addEventListener('input', () => {
      const value = Number(input.value);
      valueEl.textContent = `${value}%`;
      this.plugin.previewVolumeSetting(settingKey, value);
    });
    input.addEventListener('change', async () => {
      await this.plugin.updateVolumeSetting(settingKey, Number(input.value));
    });
    return input;
  }

  syncVolumeControls() {
    const controls = [
      [this._masterVolumeInput, this.plugin.settings.masterVolume],
      [this._musicVolumeInput, this.plugin.settings.musicVolume],
      [this._sfxVolumeInput, this.plugin.settings.sfxVolume]
    ];

    for (const [input, value] of controls) {
      if (!input) continue;
      input.value = String(value);
      const valueEl = input.parentElement?.querySelector('.audio-sb-volume-value');
      if (valueEl) valueEl.textContent = `${value}%`;
    }
  }

  stopAllTracks(clearSelection = true) {
    this.getTrackAudios().forEach(audio => {
      this.clearFade(audio);
      audio.dataset.fadeLevel = '1';
      audio.pause();
      audio.currentTime = 0;
    });

    if (clearSelection) {
      this._currentAudio = null;
      this._currentTrackName = '';
    } else {
      this.syncCurrentAudio();
    }

    this.updateNowPlaying();
  }

  // Determines the active track by picking the most recently started playing
  // audio. Used after overlap-policy enforcement to keep the footer accurate.
  syncCurrentAudio() {
    const playingAudios = this.getTrackAudios()
      .filter(audio => !audio.paused && !audio.ended)
      .sort((a, b) => Number(b.dataset.lastStarted || 0) - Number(a.dataset.lastStarted || 0));

    this._currentAudio = playingAudios[0] || null;
    this._currentTrackName = this._currentAudio?.dataset.trackName || '';
  }

  // When overlap is turned off, fades out every track except the most recent.
  applyMusicOverlapPolicy() {
    if (this.plugin.settings.allowMusicOverlap) return;

    this.syncCurrentAudio();
    const current = this._currentAudio;
    this.getTrackAudios().forEach(audio => {
      if (audio !== current) this.fadeOutAndStop(audio, { resetTime: false });
    });
    this.updateNowPlaying();
  }

  applyMusicVolume() {
    this.getTrackAudios().forEach(audio => {
      this.applyAudioVolume(audio);
    });
  }

  // Volume = effective master×category volume scaled by the current fade level
  // so that fades work independently of the volume sliders.
  applyAudioVolume(audio) {
    if (!audio) return;
    const fadeLevel = Number(audio.dataset.fadeLevel || 1);
    audio.volume = this.plugin.getEffectiveVolume('music') * fadeLevel;
  }

  clearFade(audio) {
    if (!audio) return;
    if (audio._audioSbFadeInterval) {
      window.clearInterval(audio._audioSbFadeInterval);
      audio._audioSbFadeInterval = null;
    }
  }

  setFadeLevel(audio, fadeLevel) {
    const clamped = Math.max(0, Math.min(1, fadeLevel));
    audio.dataset.fadeLevel = String(clamped);
    this.applyAudioVolume(audio);
  }

  // Animates volume between the current fade level and targetLevel over
  // durationMs using a 50 ms tick interval. Resolves when the fade completes.
  startFade(audio, targetLevel, durationMs, options = {}) {
    if (!audio) return Promise.resolve();

    const duration = this.plugin.clampFadeMs(durationMs);
    const target = Math.max(0, Math.min(1, targetLevel));
    const startLevel = Number(audio.dataset.fadeLevel || 1);
    this.clearFade(audio);

    if (duration <= 0 || Math.abs(startLevel - target) < 0.01) {
      this.setFadeLevel(audio, target);
      if (options.pauseOnComplete) {
        // Suppress the pause event so it doesn't incorrectly clear _currentAudio.
        this._suppressPauseSync = true;
        audio.pause();
        this._suppressPauseSync = false;
      }
      if (options.resetTime) audio.currentTime = 0;
      return Promise.resolve();
    }

    return new Promise(resolve => {
      const startedAt = Date.now();
      audio._audioSbFadeInterval = window.setInterval(() => {
        const elapsed = Date.now() - startedAt;
        const progress = Math.min(elapsed / duration, 1);
        const nextLevel = startLevel + ((target - startLevel) * progress);
        this.setFadeLevel(audio, nextLevel);

        if (progress >= 1) {
          this.clearFade(audio);
          if (options.pauseOnComplete) {
            this._suppressPauseSync = true;
            audio.pause();
            this._suppressPauseSync = false;
          }
          if (options.resetTime) audio.currentTime = 0;
          resolve();
        }
      }, 50);
    });
  }

  // Sets fadeLevel to 0 before play() so handleTrackPlay can fade in from
  // silence. The pendingFadeIn flag signals handleTrackPlay to run the fade.
  async fadeInTrack(audio) {
    if (!audio) return;
    audio.dataset.pendingFadeIn = '1';
    try {
      await audio.play();
    } catch (error) {
      delete audio.dataset.pendingFadeIn;
      this.setFadeLevel(audio, 1);
      throw error;
    }
  }

  fadeOutAndStop(audio, options = {}) {
    if (!audio || audio.paused || audio.ended) return Promise.resolve();
    return this.startFade(audio, 0, this.getFadeDurationMs(), {
      pauseOnComplete: true,
      resetTime: options.resetTime !== false
    }).then(() => {
      // Restore fade level so the next play starts at full volume.
      this.setFadeLevel(audio, 1);
      this.applyAudioVolume(audio);
      if (this._currentAudio === audio) {
        this.syncCurrentAudio();
        this.updateNowPlaying();
      }
    });
  }

  // Called by the 'play' event on every track audio element.
  // Handles crossfading out other tracks and fading the new one in.
  handleTrackPlay(audio, trackName) {
    audio.dataset.lastStarted = String(Date.now());
    const otherPlayingAudios = this.getTrackAudios().filter(a => a !== audio && !a.paused && !a.ended);

    if (!this.plugin.settings.allowMusicOverlap) {
      otherPlayingAudios.forEach(other => {
        this.fadeOutAndStop(other, { resetTime: false });
      });
    }

    if (this.getFadeDurationMs() > 0) {
      this.setFadeLevel(audio, 0);
      this.startFade(audio, 1, this.getFadeDurationMs());
    } else {
      this.setFadeLevel(audio, 1);
    }
    delete audio.dataset.pendingFadeIn;

    this._currentAudio = audio;
    this._currentTrackName = trackName;
    this.updateNowPlaying();
  }

  loadFolder(folder) {
    this._loadedFolder = folder;
    this.stopAllTracks();
    this._bodyEl.empty();
    this.renderTracks(this._bodyEl, folder);
  }

  renderTracks(content, folder) {
    const audioFiles = this.plugin.findAudioInFolder(folder);

    const header = content.createEl('div', { cls: 'audio-sb-header' });
    header.createEl('span', { text: folder.name || 'Root', cls: 'audio-sb-folder-name' });
    this._countEl = header.createEl('span', { text: `${audioFiles.length} track${audioFiles.length !== 1 ? 's' : ''}`, cls: 'audio-sb-count' });
    this._loopBtn = header.createEl('button', { cls: `audio-sb-loop-btn ${this._looping !== false ? 'audio-sb-loop-on' : 'audio-sb-loop-off'}` });
    this._loopBtn.onclick = () => this.toggleLoop();
    this.updateLoopButton();
    this._overlapBtn = header.createEl('button', {
      cls: `audio-sb-loop-btn ${this.plugin.settings.allowMusicOverlap ? 'audio-sb-loop-on' : 'audio-sb-loop-off'}`
    });
    this._overlapBtn.onclick = () => this.toggleMusicOverlap();
    this.updateOverlapButton();

    const searchEl = content.createEl('input', { cls: 'audio-sb-search', type: 'text' });
    searchEl.placeholder = 'Search tracks…';
    searchEl.addEventListener('input', () => this.filterTracks(searchEl.value));

    if (audioFiles.length === 0) {
      content.createEl('div', { text: `No audio files in ${folder.name || 'root'}.`, cls: 'audio-sb-empty' });
      return;
    }

    this._trackList = content.createEl('div', { cls: 'audio-sb-list' });

    for (const af of audioFiles) {
      const item = this._trackList.createEl('div', { cls: 'audio-sb-item' });
      item.dataset.name = af.basename.toLowerCase();

      item.createEl('div', { text: af.basename, cls: 'audio-sb-track-name' });

      const playerRow = item.createEl('div', { cls: 'audio-sb-player-row' });
      const audio = playerRow.createEl('audio');
      audio.controls = true;
      audio.loop = this._looping !== false;
      audio.src = this.app.vault.getResourcePath(af);
      audio.dataset.fadeLevel = '1';
      this.applyAudioVolume(audio);
      audio.dataset.trackName = af.basename;
      audio.addEventListener('play', () => {
        this.handleTrackPlay(audio, af.basename);
      });
      audio.addEventListener('loadedmetadata', () => {
        if (this._currentAudio === audio) this.updateNowPlaying();
      });
      audio.addEventListener('durationchange', () => {
        if (this._currentAudio === audio) this.updateNowPlaying();
      });
      audio.addEventListener('pause', () => {
        // _suppressPauseSync is set during programmatic pauses (fade-out) to
        // prevent incorrectly clearing _currentAudio mid-transition.
        if (this._suppressPauseSync) return;
        if (this._currentAudio === audio) {
          this.syncCurrentAudio();
          this.updateNowPlaying();
        }
      });
      audio.addEventListener('ended', () => {
        if (this._currentAudio === audio) {
          this.syncCurrentAudio();
          this.updateNowPlaying();
        }
      });

      const copyBtn = playerRow.createEl('button', {
        cls: 'audio-sb-track-copy',
        type: 'button',
        attr: { 'aria-label': 'Copy Track Codeblock' }
      });
      setIcon(copyBtn, 'copy');
      copyBtn.onclick = () => {
        const ref = `${folder.path}#${af.basename}`;
        navigator.clipboard.writeText(`\`\`\`audiosidebar\n${ref}\n\`\`\``);
        new Notice('Codeblock copied');
      };
    }
  }

  updateNowPlaying() {
    if (!this._footerTrackEl) return;
    this._footerTrackEl.textContent = this._currentTrackName || 'Nothing playing';
    if (this._footerMetaEl) {
      this._footerMetaEl.textContent = this._currentAudio ? this.formatDuration(this._currentAudio.duration) : '';
    }
    this._footerEl.classList.toggle('audio-sb-footer-active', !!this._currentTrackName);
    const hasTrack = !!this._currentAudio;
    const isPlaying = hasTrack && !this._currentAudio.paused && !this._currentAudio.ended;
    this._footerEl.classList.toggle('audio-sb-footer-playing', isPlaying);
    if (this._footerPlayBtn) {
      this._footerPlayBtn.disabled = !hasTrack;
      this._footerPlayBtn.textContent = isPlaying ? 'Pause' : 'Play';
    }
    if (this._footerStopBtn) {
      this._footerStopBtn.disabled = !hasTrack;
    }
  }

  formatDuration(durationSeconds) {
    if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) return '';
    const totalSeconds = Math.round(durationSeconds);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${String(seconds).padStart(2, '0')}`;
  }

  toggleCurrentTrack() {
    if (!this._currentAudio) return;
    if (this._currentAudio.paused || this._currentAudio.ended) {
      if (this._currentAudio.ended) this._currentAudio.currentTime = 0;
      this.fadeInTrack(this._currentAudio).catch(() => {
        new Notice(`Could not play ${this._currentTrackName || 'track'}`);
      });
      return;
    }
    this.fadeOutAndStop(this._currentAudio);
  }

  stopCurrentTrack(clearSelection = true) {
    if (!this._currentAudio) return;
    const audio = this._currentAudio;
    this.fadeOutAndStop(audio).then(() => {
      if (clearSelection) {
        this.syncCurrentAudio();
      }
      this.updateNowPlaying();
    });
  }

  filterTracks(query) {
    if (!this._trackList) return;
    const q = query.toLowerCase().trim();
    let visible = 0;
    this._trackList.querySelectorAll('.audio-sb-item').forEach(item => {
      const match = !q || item.dataset.name.includes(q);
      item.style.display = match ? '' : 'none';
      if (match) visible++;
    });
    if (this._countEl) {
      this._countEl.textContent = `${visible} track${visible !== 1 ? 's' : ''}`;
    }
  }

  // Finds a track by partial name match and starts playing it. Used by the
  // audiosidebar codeblock processor to auto-play after loading a folder.
  playTrack(trackName) {
    if (!this._trackList) return;
    const items = this._trackList.querySelectorAll('.audio-sb-item');
    for (const item of items) {
      if (item.dataset.name.includes(trackName)) {
        const audio = item.querySelector('audio');
        if (audio) {
          audio.currentTime = 0;
          this.fadeInTrack(audio).catch(() => {
            new Notice(`Could not play ${audio.dataset.trackName || 'track'}`);
          });
        }
        break;
      }
    }
  }

  async onClose() {
    this.stopAllTracks();
  }
}

// ─── Settings Tab ─────────────────────────────────────────────────────────────

class AudioSidebarSettingTab extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display() {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl)
      .setName('Default folder')
      .setDesc('Vault-relative folder path to load automatically when the sidebar opens.')
      .addText(text => {
        text
          .setPlaceholder('Music/Ambient')
          .setValue(this.plugin.settings.defaultFolderPath)
          .onChange(async (value) => {
            this.plugin.settings.defaultFolderPath = value.trim();
            await this.plugin.saveSettings();
          });
        text.inputEl.style.width = '100%';
      });

    new Setting(containerEl)
      .setName('Use selected folder')
      .setDesc('Copy the folder currently selected in the file explorer into the default folder setting.')
      .addButton(button => button
        .setButtonText('Use current selection')
        .onClick(async () => {
          const folder = this.plugin.selectedFolder;
          if (!(folder instanceof TFolder)) {
            new Notice('Select a folder in the file explorer first.');
            return;
          }

          this.plugin.settings.defaultFolderPath = folder.path;
          await this.plugin.saveSettings();
          await this.plugin.loadDefaultFolderIntoView();
          this.display();
          new Notice(`Default folder set to ${folder.path}`);
        }));

    new Setting(containerEl)
      .setName('Sound effects folder')
      .setDesc('Vault-relative folder path used by the searchable one-shot SFX picker.')
      .addText(text => {
        text
          .setPlaceholder('SFX')
          .setValue(this.plugin.settings.sfxFolderPath)
          .onChange(async (value) => {
            this.plugin.settings.sfxFolderPath = value.trim();
            await this.plugin.saveSettings();
          });
        text.inputEl.style.width = '100%';
      });

    new Setting(containerEl)
      .setName('Allow music overlap')
      .setDesc('Let multiple music tracks play at once so you can transition between them manually.')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.allowMusicOverlap)
        .onChange(async (value) => {
          this.plugin.settings.allowMusicOverlap = value;
          await this.plugin.saveSettings();
          this.plugin.refreshAllViews();
        }));

    new Setting(containerEl)
      .setName('Master volume')
      .setDesc('Overall volume applied to both music and sound effects.')
      .addSlider(slider => slider
        .setLimits(0, 100, 1)
        .setValue(this.plugin.settings.masterVolume)
        .setDynamicTooltip()
        .onChange(async (value) => {
          await this.plugin.updateVolumeSetting('masterVolume', value);
        }));

    new Setting(containerEl)
      .setName('Music volume')
      .setDesc('Category volume for tracks played in the audio sidebar.')
      .addSlider(slider => slider
        .setLimits(0, 100, 1)
        .setValue(this.plugin.settings.musicVolume)
        .setDynamicTooltip()
        .onChange(async (value) => {
          await this.plugin.updateVolumeSetting('musicVolume', value);
        }));

    new Setting(containerEl)
      .setName('Sound effects volume')
      .setDesc('Category volume for one-shot effects from the picker and embeds.')
      .addSlider(slider => slider
        .setLimits(0, 100, 1)
        .setValue(this.plugin.settings.sfxVolume)
        .setDynamicTooltip()
        .onChange(async (value) => {
          await this.plugin.updateVolumeSetting('sfxVolume', value);
        }));

    new Setting(containerEl)
      .setName('Music fade duration')
      .setDesc('Fade in and fade out duration in milliseconds. Used for manual stops and automatic crossfades.')
      .addSlider(slider => slider
        .setLimits(0, 5000, 100)
        .setValue(this.plugin.settings.musicFadeMs)
        .setDynamicTooltip()
        .onChange(async (value) => {
          await this.plugin.updateFadeSetting(value);
        }));
  }
}

// ─── Plugin ───────────────────────────────────────────────────────────────────

class AudioSidebarPlugin extends Plugin {
  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  clampVolume(value) {
    return Math.max(0, Math.min(100, Number(value) || 0));
  }

  clampFadeMs(value) {
    return Math.max(0, Math.min(5000, Number(value) || 0));
  }

  // Returns a 0–1 multiplier combining master and category volumes.
  getEffectiveVolume(category) {
    const master = this.clampVolume(this.settings.masterVolume) / 100;
    const categoryVolume = this.clampVolume(category === 'sfx' ? this.settings.sfxVolume : this.settings.musicVolume) / 100;
    return master * categoryVolume;
  }

  // Updates the in-memory setting and refreshes all live audio without saving,
  // so the slider feels responsive while dragging.
  previewVolumeSetting(key, value) {
    this.settings[key] = this.clampVolume(value);
    this.refreshAllViews();
    this.refreshActiveSfxVolumes();
  }

  async updateVolumeSetting(key, value) {
    this.previewVolumeSetting(key, value);
    await this.saveSettings();
  }

  async updateFadeSetting(value) {
    this.settings.musicFadeMs = this.clampFadeMs(value);
    await this.saveSettings();
  }

  getFolderByPath(path) {
    if (!path) return null;
    const target = this.app.vault.getAbstractFileByPath(path);
    return target instanceof TFolder ? target : null;
  }

  getDefaultFolder() {
    return this.getFolderByPath(this.settings.defaultFolderPath);
  }

  getSfxFolder() {
    return this.getFolderByPath(this.settings.sfxFolderPath);
  }

  getAudioFileByPath(path) {
    if (!path) return null;
    const target = this.app.vault.getAbstractFileByPath(path);
    if (!(target instanceof TFile)) return null;
    return AUDIO_EXTENSIONS.includes(target.extension.toLowerCase()) ? target : null;
  }

  // Resolves a codeblock source string to an audio TFile using three strategies
  // in order: exact vault path → folder#basename syntax → basename search in
  // the configured SFX folder.
  resolveSfxFile(source) {
    const normalized = source.trim();
    if (!normalized) return null;

    const directFile = this.getAudioFileByPath(normalized);
    if (directFile) return directFile;

    // Support folder#filename syntax to pick a file from a specific folder.
    const hashIdx = normalized.indexOf('#');
    if (hashIdx !== -1) {
      const folderPath = normalized.slice(0, hashIdx).trim();
      const filename = normalized.slice(hashIdx + 1).trim();
      const folder = this.getFolderByPath(folderPath);
      if (folder && filename) {
        const lookup = filename.toLowerCase();
        const found = this.findAudioInFolder(folder).find(file =>
          file.basename.toLowerCase() === lookup ||
          `${file.basename}.${file.extension}`.toLowerCase() === lookup
        );
        if (found) return found;
      }
    }

    const sfxFolder = this.getSfxFolder();
    if (!sfxFolder) return null;

    const lookup = normalized.toLowerCase();
    return this.findAudioInFolder(sfxFolder).find(file =>
      file.basename.toLowerCase() === lookup ||
      `${file.basename}.${file.extension}`.toLowerCase() === lookup
    ) || null;
  }

  findAudioInFolder(folder) {
    return this.app.vault.getFiles()
      .filter(f =>
        f.parent && f.parent.path === folder.path &&
        AUDIO_EXTENSIONS.includes(f.extension.toLowerCase())
      )
      .sort((a, b) => a.basename.localeCompare(b.basename));
  }

  openSfxPicker() {
    const folder = this.getSfxFolder();
    if (!folder) {
      if (this.settings.sfxFolderPath) {
        new Notice(`Audio Sidebar SFX folder not found: ${this.settings.sfxFolderPath}`);
      } else {
        new Notice('Set an SFX folder in Audio Sidebar settings first.');
      }
      return;
    }

    const files = this.findAudioInFolder(folder);
    if (files.length === 0) {
      new Notice(`No audio files found in ${folder.path}`);
      return;
    }

    new AudioSfxModal(this.app, this, files).open();
  }

  // Creates a detached Audio element so SFX plays independently of the
  // sidebar track list. Active instances are tracked in _activeSfx so they
  // can be stopped and have their volume updated as a group.
  playSfx(file) {
    const audio = new Audio(this.app.vault.getResourcePath(file));
    audio.loop = false;
    audio.volume = this.getEffectiveVolume('sfx');
    audio.addEventListener('ended', () => {
      this._activeSfx.delete(audio);
    });
    audio.addEventListener('pause', () => {
      if (audio.ended) this._activeSfx.delete(audio);
    });
    this._activeSfx.add(audio);
    audio.play().catch(() => {
      this._activeSfx.delete(audio);
      new Notice(`Could not play ${file.basename}`);
    });
  }

  stopAllSfx() {
    this._activeSfx.forEach(audio => {
      audio.pause();
      audio.currentTime = 0;
    });
    this._activeSfx.clear();
  }

  refreshActiveSfxVolumes() {
    const volume = this.getEffectiveVolume('sfx');
    this._activeSfx.forEach(audio => {
      audio.volume = volume;
    });
  }

  async loadFolderIntoLeaves(folder) {
    this.selectedFolder = folder;
    await this.activateView();
    const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE);
    for (const leaf of leaves) {
      if (leaf.view instanceof AudioSidebarView) {
        leaf.view.loadFolder(folder);
      }
    }
  }

  refreshAllViews() {
    const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE);
    for (const leaf of leaves) {
      if (leaf.view instanceof AudioSidebarView) {
        leaf.view.applyMusicOverlapPolicy();
        leaf.view.applyMusicVolume();
        leaf.view.syncVolumeControls();
        leaf.view.updateOverlapButton();
      }
    }
  }

  async loadDefaultFolderIntoView() {
    const folder = this.getDefaultFolder();
    if (!folder) {
      if (this.settings.defaultFolderPath) {
        new Notice(`Audio Sidebar default folder not found: ${this.settings.defaultFolderPath}`);
      }
      return;
    }

    await this.loadFolderIntoLeaves(folder);
  }

  async onload() {
    await this.loadSettings();
    this.selectedFolder = null;
    this._activeSfx = new Set();
    this.registerView(VIEW_TYPE, (leaf) => new AudioSidebarView(leaf, this));
    this.addSettingTab(new AudioSidebarSettingTab(this.app, this));
    this.addRibbonIcon('music', 'Audio Sidebar', () => this.activateView());
    this.app.workspace.onLayoutReady(() => {
      this.activateView();
      this.hookFileExplorer();
      this.loadDefaultFolderIntoView();
    });

    // File explorer context menu: folders get a codeblock-copy item.
    this.registerEvent(
      this.app.workspace.on('file-menu', (menu, file) => {
        if (!(file instanceof TFolder)) return;
        menu.addItem(item => item
          .setTitle('Add to note as Audio Sidebar')
          .setIcon('music')
          .onClick(() => {
            const code = `\`\`\`audiosidebar\n${file.path}\n\`\`\``;
            navigator.clipboard.writeText(code);
          })
        );
      })
    );

    // File explorer context menu: audio files get an "Audio" submenu with
    // codeblock options for both the music sidebar and one-shot SFX.
    this.registerEvent(
      this.app.workspace.on('file-menu', (menu, file) => {
        if (!(file instanceof TFile)) return;
        if (!AUDIO_EXTENSIONS.includes(file.extension.toLowerCase())) return;
        menu.addItem(item => {
          item.setTitle('Audio').setIcon('music');
          const submenu = item.setSubmenu();
          submenu.addItem(sub => sub
            .setTitle('Copy Track Codeblock')
            .setIcon('copy')
            .onClick(() => {
              const code = `\`\`\`audiosidebar\n${file.parent.path}#${file.basename}\n\`\`\``;
              navigator.clipboard.writeText(code);
              new Notice('Codeblock copied');
            })
          );
          submenu.addItem(sub => sub
            .setTitle('Copy SFX Codeblock')
            .setIcon('copy')
            .onClick(() => {
              const parent = file.parent;
              const folderPath = parent && parent.path !== '/' ? parent.path : null;
              const ref = folderPath ? `${folderPath}#${file.basename}` : file.basename;
              const code = `\`\`\`audiosfx\n${ref}\n\`\`\``;
              navigator.clipboard.writeText(code);
              new Notice('Codeblock copied');
            })
          );
        });
      })
    );

    // Loads the specified folder into the sidebar and optionally auto-plays a
    // track. The setTimeout gives loadFolder time to render the track list
    // before playTrack tries to query it.
    this.registerMarkdownCodeBlockProcessor('audiosidebar', (source, el) => {
      const [folderPart, trackPart] = source.trim().split('#');
      const folderName = folderPart.trim();
      const trackName = trackPart ? trackPart.trim().toLowerCase() : null;
      const folder = this.app.vault.getAbstractFileByPath(folderName);

      const btn = el.createEl('button', { cls: 'audio-sb-codeblock-btn' });
      btn.createEl('span', { text: '♪', cls: 'audio-sb-codeblock-icon' });
      const labelEl = btn.createEl('span', { cls: 'audio-sb-codeblock-label' });
      labelEl.createEl('span', { text: folderName.split('/').pop(), cls: 'audio-sb-codeblock-folder' });
      if (trackName) labelEl.createEl('span', { text: ` · ${trackPart.trim()}`, cls: 'audio-sb-codeblock-track' });

      if (!folder) {
        btn.createEl('span', { text: 'Folder not found', cls: 'audio-sb-codeblock-error' });
        btn.disabled = true;
        return;
      }

      btn.onclick = () => {
        this.selectedFolder = folder;
        this.activateView().then(() => {
          const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE);
          for (const leaf of leaves) {
            if (leaf.view instanceof AudioSidebarView) {
              leaf.view.loadFolder(folder);
              if (trackName) {
                setTimeout(() => leaf.view.playTrack(trackName), 50);
              }
            }
          }
        });
      };
    });

    this.registerMarkdownCodeBlockProcessor('audiosfx', (source, el) => {
      const fileSource = source.trim();
      const file = this.resolveSfxFile(fileSource);

      const btn = el.createEl('button', { cls: 'audio-sb-codeblock-btn' });
      btn.createEl('span', { text: '♪', cls: 'audio-sb-codeblock-icon' });
      const labelEl = btn.createEl('span', { cls: 'audio-sb-codeblock-label' });
      labelEl.createEl('span', {
        text: file ? file.basename : fileSource,
        cls: 'audio-sb-codeblock-folder'
      });

      if (!file) {
        btn.createEl('span', { text: 'Sound not found', cls: 'audio-sb-codeblock-error' });
        btn.disabled = true;
        return;
      }

      btn.onclick = () => this.playSfx(file);
    });

    this.addCommand({
      id: 'load-current-folder',
      name: 'Load audio from current note\'s folder',
      callback: () => {
        const activeFile = this.app.workspace.getActiveFile();
        if (!activeFile || !activeFile.parent) return;
        const folder = activeFile.parent;
        this.loadFolderIntoLeaves(folder);
      }
    });

    this.addCommand({
      id: 'open-sfx-picker',
      name: 'Open sound effects picker',
      callback: () => this.openSfxPicker()
    });
  }

  // Tracks which folder is selected in the file explorer by listening for
  // clicks on nav-folder-title elements. Obsidian has no public API for this.
  hookFileExplorer() {
    const explorerLeaf = this.app.workspace.getLeavesOfType('file-explorer')[0];
    if (!explorerLeaf) return;

    const explorerEl = explorerLeaf.view.containerEl;

    this._explorerClickHandler = (e) => {
      const folderTitleEl = e.target.closest('.nav-folder-title');
      if (!folderTitleEl) return;
      const folderPath = folderTitleEl.dataset.path;
      if (folderPath == null) return;
      const folder = folderPath === '/'
        ? this.app.vault.getRoot()
        : this.app.vault.getAbstractFileByPath(folderPath);
      if (folder) this.selectedFolder = folder;
    };

    explorerEl.addEventListener('click', this._explorerClickHandler);
    this._explorerEl = explorerEl;
  }

  async activateView() {
    const { workspace } = this.app;
    const existing = workspace.getLeavesOfType(VIEW_TYPE);
    if (existing.length) {
      workspace.revealLeaf(existing[0]);
      return;
    }
    const leaf = workspace.getRightLeaf(false);
    if (!leaf) return;
    await leaf.setViewState({ type: VIEW_TYPE, active: true });
    workspace.revealLeaf(leaf);
  }

  onunload() {
    if (this._explorerEl && this._explorerClickHandler) {
      this._explorerEl.removeEventListener('click', this._explorerClickHandler);
    }
    this.stopAllSfx();
    this.app.workspace.detachLeavesOfType(VIEW_TYPE);
  }
}

module.exports = AudioSidebarPlugin;
