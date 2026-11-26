const { Modal, Notice, Plugin, ItemView, PluginSettingTab, Setting, TFolder, TFile, setIcon, normalizePath } = require('obsidian');

const VIEW_TYPE = 'audio-sidebar';
const AUDIO_EXTENSIONS = ['mp3', 'wav', 'ogg', 'flac', 'm4a', 'webm', 'aac'];
const DEFAULT_SETTINGS = {
  defaultFolderPath: '',
  sfxFolderPath: '',
  loopFolderPath: '',
  continuePlayback: false,
  allowMusicOverlap: false,
  masterVolume: 100,
  musicVolume: 100,
  sfxVolume: 100,
  loopVolume: 100,
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

// ─── Loop Picker Modal ───────────────────────────────────────────────────────
// Searchable modal for looping ambient sounds. Clicking a row toggles the loop
// on or off; active loops are highlighted so you can see what's running.

class AudioLoopModal extends Modal {
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
      placeholder: 'Search loops...'
    });

    this._listEl = contentEl.createEl('div', { cls: 'audio-sb-sfx-list' });
    this.renderList();

    searchEl.addEventListener('input', () => {
      const query = searchEl.value.toLowerCase().trim();
      this.filteredFiles = this.files.filter(file =>
        !query ||
        file.basename.toLowerCase().includes(query) ||
        file.path.toLowerCase().includes(query)
      );
      this.renderList();
    });

    searchEl.focus();
  }

  renderList() {
    const listEl = this._listEl;
    listEl.empty();

    if (this.filteredFiles.length === 0) {
      listEl.createEl('div', {
        text: 'No matching loops.',
        cls: 'audio-sb-sfx-empty'
      });
      return;
    }

    for (const file of this.filteredFiles) {
      const isActive = this.plugin._activeLoops.has(file.path);
      const rowEl = listEl.createEl('div', { cls: 'audio-sb-sfx-modal-row' });

      const itemEl = rowEl.createEl('button', {
        cls: `audio-sb-sfx-item${isActive ? ' audio-sb-loop-item-active' : ''}`,
        type: 'button'
      });
      const iconEl = itemEl.createEl('span', { cls: 'audio-sb-sfx-icon' });
      setIcon(iconEl, isActive ? 'square' : 'play');
      itemEl.createEl('div', { text: file.basename, cls: 'audio-sb-sfx-name' });
      itemEl.onclick = () => {
        if (this.plugin._activeLoops.has(file.path)) {
          this.plugin.stopLoop(file);
        } else {
          this.plugin.playLoop(file);
        }
        this.renderList();
      };

      const copyBtn = rowEl.createEl('button', {
        cls: 'audio-sb-sfx-copy',
        type: 'button',
        attr: { 'aria-label': 'Copy audioloop codeblock' }
      });
      setIcon(copyBtn, 'copy');
      copyBtn.onclick = () => {
        const parent = file.parent;
        const folderPath = parent && parent.path && parent.path !== '/' ? parent.path : null;
        const ref = folderPath ? `${folderPath}#${file.basename}` : file.basename;
        navigator.clipboard.writeText(`\`\`\`audioloop\n${ref}\n\`\`\``);
        new Notice('Codeblock copied');
      };
    }
  }

  onClose() {
    this.contentEl.empty();
  }
}

// ─── Create Scene Modal ──────────────────────────────────────────────────────
// Lets you pick one music track and any number of loops, then generates a
// ready-to-paste audioscene codeblock that triggers the whole set at once.

class CreateSceneModal extends Modal {
  constructor(app, plugin) {
    super(app);
    this.plugin = plugin;
    this.sceneName = '';
    this.selectedMusic = null;       // TFile | null
    this.selectedLoops = new Map();  // Map<path, TFile>
    this.loopLevels = new Map();     // Map<path, 0–100>; kept across deselect
    // Optional per-scene volume presets (0–100); null = leave current slider alone.
    this.sceneVolumes = { music: null, loop: null };
    this._musicFiles = [];
    this._loopFiles = [];
    this._filteredMusicFiles = [];
    this._filteredLoopFiles = [];
  }

  onOpen() {
    this.modalEl.addClass('audio-sb-scene-modal');
    const { contentEl } = this;
    contentEl.empty();

    contentEl.createEl('h2', { text: 'Create Scene', cls: 'audio-sb-scene-title' });

    // Scene name
    const nameRow = contentEl.createEl('div', { cls: 'audio-sb-scene-row' });
    nameRow.createEl('label', { text: 'Scene name', cls: 'audio-sb-scene-label' });
    const nameInput = nameRow.createEl('input', {
      type: 'text',
      cls: 'audio-sb-scene-name-input',
      placeholder: 'e.g. Tavern Night'
    });
    nameInput.addEventListener('input', () => {
      this.sceneName = nameInput.value;
      this._updatePreview();
    });

    // Music section
    contentEl.createEl('div', { text: 'Music track (optional — single select)', cls: 'audio-sb-scene-section-label' });
    const musicSearchEl = contentEl.createEl('input', {
      type: 'text',
      cls: 'audio-sb-sfx-search audio-sb-scene-search',
      placeholder: 'Search music...'
    });
    this._musicListEl = contentEl.createEl('div', { cls: 'audio-sb-sfx-list audio-sb-scene-list' });

    this._loadMusicFiles();
    this._renderMusicList();

    musicSearchEl.addEventListener('input', () => {
      const q = musicSearchEl.value.toLowerCase().trim();
      this._filteredMusicFiles = this._musicFiles.filter(f =>
        !q || f.basename.toLowerCase().includes(q)
      );
      this._renderMusicList();
    });

    // Loops section
    contentEl.createEl('div', { text: 'Loops (multi-select)', cls: 'audio-sb-scene-section-label' });
    const loopSearchEl = contentEl.createEl('input', {
      type: 'text',
      cls: 'audio-sb-sfx-search audio-sb-scene-search',
      placeholder: 'Search loops...'
    });
    this._loopListEl = contentEl.createEl('div', { cls: 'audio-sb-sfx-list audio-sb-scene-list' });

    this._loadLoopFiles();
    this._renderLoopList();

    loopSearchEl.addEventListener('input', () => {
      const q = loopSearchEl.value.toLowerCase().trim();
      this._filteredLoopFiles = this._loopFiles.filter(f =>
        !q || f.basename.toLowerCase().includes(q)
      );
      this._renderLoopList();
    });

    // Volume: optional Music / All loops presets, then one level per selected
    // loop nested under All loops (those rows hide while no loop is selected).
    contentEl.createEl('div', { text: 'Volume', cls: 'audio-sb-scene-section-label' });
    const volumeWrap = contentEl.createEl('div', { cls: 'audio-sb-scene-volumes' });
    this._renderSceneVolumeControl(volumeWrap, 'Music', 'music', 'musicVolume');
    this._renderSceneVolumeControl(volumeWrap, 'All loops', 'loop', 'loopVolume');
    this._loopMixEl = volumeWrap.createEl('div', { cls: 'audio-sb-scene-loop-mix' });
    this._renderLoopMix();

    // Codeblock preview
    contentEl.createEl('div', { text: 'Generated codeblock', cls: 'audio-sb-scene-section-label' });
    this._previewEl = contentEl.createEl('pre', { cls: 'audio-sb-scene-preview' });
    this._codeEl = this._previewEl.createEl('code');

    // Copy button
    const actionsRow = contentEl.createEl('div', { cls: 'audio-sb-scene-actions' });
    const copyBtn = actionsRow.createEl('button', {
      text: 'Copy codeblock',
      cls: 'audio-sb-load-btn'
    });
    copyBtn.onclick = () => {
      const code = this._buildCodeblock();
      if (!code) {
        new Notice('Enter a scene name first.');
        return;
      }
      navigator.clipboard.writeText(code);
      new Notice('Scene codeblock copied!');
    };

    this._updatePreview();
    nameInput.focus();
  }

  _loadMusicFiles() {
    let folder = null;
    const leaves = this.plugin.app.workspace.getLeavesOfType(VIEW_TYPE);
    for (const leaf of leaves) {
      if (leaf.view instanceof AudioSidebarView && leaf.view._loadedFolder) {
        folder = leaf.view._loadedFolder;
        break;
      }
    }
    if (!folder) folder = this.plugin.getDefaultFolder();
    this._musicFolder = folder;
    this._musicFiles = folder ? this.plugin.findAudioInFolder(folder) : [];
    this._filteredMusicFiles = [...this._musicFiles];
  }

  _loadLoopFiles() {
    const folder = this.plugin.getLoopFolder();
    this._loopFiles = folder ? this.plugin.findAudioInFolder(folder) : [];
    this._filteredLoopFiles = [...this._loopFiles];
  }

  _renderMusicList() {
    const listEl = this._musicListEl;
    listEl.empty();

    if (this._musicFiles.length === 0) {
      listEl.createEl('div', {
        text: 'No music folder loaded. Load a folder in the sidebar first.',
        cls: 'audio-sb-sfx-empty'
      });
      return;
    }

    // "No music" option
    const noneRow = listEl.createEl('div', { cls: 'audio-sb-sfx-modal-row' });
    const noneBtn = noneRow.createEl('button', {
      cls: `audio-sb-sfx-item${!this.selectedMusic ? ' audio-sb-scene-selected' : ''}`,
      type: 'button'
    });
    const noneIconEl = noneBtn.createEl('span', { cls: 'audio-sb-sfx-icon' });
    setIcon(noneIconEl, !this.selectedMusic ? 'check' : 'minus');
    noneBtn.createEl('div', { text: 'No music', cls: 'audio-sb-sfx-name' });
    noneBtn.onclick = () => {
      this.selectedMusic = null;
      this._renderMusicList();
      this._updatePreview();
    };

    if (this._filteredMusicFiles.length === 0) {
      listEl.createEl('div', { text: 'No matching tracks.', cls: 'audio-sb-sfx-empty' });
      return;
    }

    for (const file of this._filteredMusicFiles) {
      const isSelected = this.selectedMusic?.path === file.path;
      const rowEl = listEl.createEl('div', { cls: 'audio-sb-sfx-modal-row' });
      const itemEl = rowEl.createEl('button', {
        cls: `audio-sb-sfx-item${isSelected ? ' audio-sb-scene-selected' : ''}`,
        type: 'button'
      });
      const iconEl = itemEl.createEl('span', { cls: 'audio-sb-sfx-icon' });
      setIcon(iconEl, isSelected ? 'check' : 'music');
      itemEl.createEl('div', { text: file.basename, cls: 'audio-sb-sfx-name' });
      itemEl.onclick = () => {
        this.selectedMusic = file;
        this._renderMusicList();
        this._updatePreview();
      };
    }
  }

  _renderLoopList() {
    const listEl = this._loopListEl;
    listEl.empty();

    if (this._loopFiles.length === 0) {
      listEl.createEl('div', {
        text: 'No loop folder configured in settings.',
        cls: 'audio-sb-sfx-empty'
      });
      return;
    }

    if (this._filteredLoopFiles.length === 0) {
      listEl.createEl('div', { text: 'No matching loops.', cls: 'audio-sb-sfx-empty' });
      return;
    }

    for (const file of this._filteredLoopFiles) {
      const isSelected = this.selectedLoops.has(file.path);
      const rowEl = listEl.createEl('div', { cls: 'audio-sb-sfx-modal-row' });
      const itemEl = rowEl.createEl('button', {
        cls: `audio-sb-sfx-item${isSelected ? ' audio-sb-scene-selected' : ''}`,
        type: 'button'
      });
      const iconEl = itemEl.createEl('span', { cls: 'audio-sb-sfx-icon' });
      setIcon(iconEl, isSelected ? 'check' : 'repeat-2');
      itemEl.createEl('div', { text: file.basename, cls: 'audio-sb-sfx-name' });
      itemEl.onclick = () => {
        if (this.selectedLoops.has(file.path)) {
          this.selectedLoops.delete(file.path);
        } else {
          this.selectedLoops.set(file.path, file);
        }
        this._renderLoopList();
        this._renderLoopMix();
        this._updatePreview();
      };
    }
  }

  // One slider per selected loop: its level relative to the Loop slider.
  // 100% is the default and is left out of the codeblock.
  _renderLoopMix() {
    const mixEl = this._loopMixEl;
    if (!mixEl) return;
    mixEl.empty();
    mixEl.toggleClass('audio-sb-hidden', this.selectedLoops.size === 0);

    for (const [path, file] of this.selectedLoops) {
      const level = this.loopLevels.has(path) ? this.loopLevels.get(path) : 100;
      const row = mixEl.createEl('div', { cls: 'audio-sb-scene-volume-row audio-sb-scene-loop-row' });
      const nameEl = row.createEl('span', { cls: 'audio-sb-scene-loop-name', attr: { title: `${file.basename} — level within all loops` } });
      setIcon(nameEl.createSpan({ cls: 'audio-sb-scene-loop-icon' }), 'corner-down-right');
      nameEl.createSpan({ text: file.basename, cls: 'audio-sb-scene-loop-text' });
      const slider = row.createEl('input', {
        type: 'range',
        cls: 'audio-sb-volume-slider audio-sb-scene-volume-slider',
        attr: { min: '0', max: '100', step: '1', value: String(level) }
      });
      slider.value = String(level);
      const valueEl = row.createEl('span', { text: `${level}%`, cls: 'audio-sb-scene-volume-value' });
      slider.addEventListener('input', () => {
        this.loopLevels.set(path, Number(slider.value));
        valueEl.textContent = `${slider.value}%`;
        this._updatePreview();
      });
    }
  }

  // One row: [toggle] Label [slider] value. The slider starts at the current
  // category volume and is only written to the codeblock when toggled on.
  _renderSceneVolumeControl(parentEl, label, key, settingKey) {
    const row = parentEl.createEl('div', { cls: 'audio-sb-scene-volume-row' });
    const toggleLabel = row.createEl('label', { cls: 'audio-sb-scene-volume-toggle' });
    const checkbox = toggleLabel.createEl('input', { type: 'checkbox' });
    toggleLabel.createSpan({ text: label });

    const initial = this.plugin.clampVolume(this.plugin.settings[settingKey]);
    const slider = row.createEl('input', {
      type: 'range',
      cls: 'audio-sb-volume-slider audio-sb-scene-volume-slider',
      attr: { min: '0', max: '100', step: '1', value: String(initial) }
    });
    slider.value = String(initial);
    slider.disabled = true;
    const valueEl = row.createEl('span', { text: 'current', cls: 'audio-sb-scene-volume-value' });

    const sync = () => {
      if (checkbox.checked) {
        this.sceneVolumes[key] = Number(slider.value);
        valueEl.textContent = `${slider.value}%`;
      } else {
        this.sceneVolumes[key] = null;
        valueEl.textContent = 'current';
      }
      slider.disabled = !checkbox.checked;
      row.toggleClass('is-disabled', !checkbox.checked);
      this._updatePreview();
    };
    row.addClass('is-disabled');
    checkbox.addEventListener('change', sync);
    slider.addEventListener('input', sync);
  }

  _buildCodeblock() {
    const name = this.sceneName.trim();
    if (!name) return '';
    const lines = [`name: ${name}`];
    if (this.sceneVolumes.music !== null) lines.push(`musicVolume: ${this.sceneVolumes.music}`);
    if (this.sceneVolumes.loop !== null) lines.push(`loopVolume: ${this.sceneVolumes.loop}`);
    if (this.selectedMusic) {
      const folder = this.selectedMusic.parent;
      const ref = folder && folder.path !== '/' ? `${folder.path}#${this.selectedMusic.basename}` : this.selectedMusic.basename;
      lines.push(`music: ${ref}`);
    }
    for (const [path, file] of this.selectedLoops) {
      const folder = file.parent;
      const ref = folder && folder.path !== '/' ? `${folder.path}#${file.basename}` : file.basename;
      const level = this.loopLevels.has(path) ? this.loopLevels.get(path) : 100;
      lines.push(level !== 100 ? `loop: ${ref} | ${level}` : `loop: ${ref}`);
    }
    return `\`\`\`audioscene\n${lines.join('\n')}\n\`\`\``;
  }

  _updatePreview() {
    if (!this._codeEl) return;
    if (!this.sceneName.trim()) {
      this._codeEl.textContent = '(enter a scene name to generate the codeblock)';
      return;
    }
    this._codeEl.textContent = this._buildCodeblock();
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
    const loadRow = toolbar.createEl('div', { cls: 'audio-sb-load-row' });
    const loadBtn = loadRow.createEl('button', { text: 'Load from selected folder', cls: 'audio-sb-load-btn' });
    loadBtn.onclick = () => {
      const folder = this.plugin.selectedFolder;
      if (folder) this.loadFolder(folder);
    };
    const sceneBtn = loadRow.createEl('button', { text: 'Create Scene', cls: 'audio-sb-load-btn audio-sb-scene-create-btn' });
    sceneBtn.onclick = () => this.plugin.openSceneCreator();
    const cogBtn = loadRow.createEl('button', {
      cls: 'audio-sb-cog-btn',
      type: 'button',
      attr: { 'aria-label': 'Audio Sidebar settings' }
    });
    setIcon(cogBtn, 'settings');
    cogBtn.onclick = () => {
      this.plugin.app.setting.open();
      this.plugin.app.setting.openTabById('audio-sidebar');
    };

    this.renderVolumeControls(toolbar);

    const sfxRow = toolbar.createEl('div', { cls: 'audio-sb-sfx-row' });
    const sfxBtn = sfxRow.createEl('button', { text: 'Play sound', cls: 'audio-sb-load-btn audio-sb-sfx-btn' });
    sfxBtn.onclick = () => this.plugin.openSfxPicker();
    const loopBtn = sfxRow.createEl('button', { text: 'Play loop', cls: 'audio-sb-load-btn audio-sb-sfx-btn' });
    loopBtn.onclick = () => this.plugin.openLoopPicker();

    this._bodyEl = content.createEl('div', { cls: 'audio-sb-body' });
    this._footerEl = content.createEl('div', { cls: 'audio-sb-footer' });
    this._footerEl.createEl('div', { text: 'Now playing', cls: 'audio-sb-footer-label' });
    this._nowPlayingListEl = this._footerEl.createEl('div', { cls: 'audio-sb-np-list' });

    if (this._nowPlayingTimer) window.clearInterval(this._nowPlayingTimer);
    this._nowPlayingTimer = window.setInterval(() => this._refreshNowPlayingTimes(), 500);

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
    this._loopBtn.textContent = `Loop: ${this._looping ? 'On' : 'Off'}`;
    this._loopBtn.title = this._looping ? 'Disable loop' : 'Enable loop';
  }

  updateOverlapButton() {
    if (!this._overlapBtn) return;
    const enabled = !!this.plugin.settings.allowMusicOverlap;
    this._overlapBtn.textContent = `Overlap: ${enabled ? 'On' : 'Off'}`;
    this._overlapBtn.title = enabled ? 'Disable music overlap' : 'Enable music overlap';
    this._overlapBtn.classList.toggle('audio-sb-loop-on', enabled);
    this._overlapBtn.classList.toggle('audio-sb-loop-off', !enabled);
  }

  toggleContinue() {
    this.plugin.settings.continuePlayback = !this.plugin.settings.continuePlayback;
    this.plugin.saveSettings();
    this.updateContinueButton();
  }

  updateContinueButton() {
    if (!this._continueBtn) return;
    const enabled = !!this.plugin.settings.continuePlayback;
    this._continueBtn.textContent = `Continue: ${enabled ? 'On' : 'Off'}`;
    this._continueBtn.title = enabled ? 'Disable continue playback' : 'Enable continue playback';
    this._continueBtn.classList.toggle('audio-sb-loop-on', enabled);
    this._continueBtn.classList.toggle('audio-sb-loop-off', !enabled);
  }

  playNextTrack(afterAudio) {
    if (!this._trackList) return;
    const visibleAudios = Array.from(this._trackList.querySelectorAll('.audio-sb-item'))
      .filter(item => !item.classList.contains('audio-sb-hidden'))
      .map(item => item.querySelector('audio'))
      .filter(Boolean);
    const idx = visibleAudios.indexOf(afterAudio);
    if (idx === -1 || idx >= visibleAudios.length - 1) return;
    const next = visibleAudios[idx + 1];
    next.currentTime = 0;
    this.fadeInTrack(next).catch(() => {
      new Notice(`Could not play ${next.dataset.trackName || 'track'}`);
    });
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
    this._loopVolumeInput = this.createVolumeControl(volumeRow, 'Loop', 'loopVolume');
  }

  createVolumeControl(parentEl, label, settingKey) {
    const wrap = parentEl.createEl('label', { cls: 'audio-sb-volume-control' });
    const headerRow = wrap.createEl('div', { cls: 'audio-sb-volume-header' });
    headerRow.createEl('span', { text: label, cls: 'audio-sb-volume-label' });
    const valueEl = headerRow.createEl('span', {
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
      [this._sfxVolumeInput, this.plugin.settings.sfxVolume],
      [this._loopVolumeInput, this.plugin.settings.loopVolume]
    ];

    for (const [input, value] of controls) {
      if (!input) continue;
      input.value = String(value);
      const valueEl = input.parentElement?.querySelector('.audio-sb-volume-value');
      // Rounded because scene volume ramps pass through fractional values.
      if (valueEl) valueEl.textContent = `${Math.round(value)}%`;
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

  fadeOutAllTracks(clearSelection = true) {
    const activeAudios = this.getTrackAudios().filter(audio => !audio.paused && !audio.ended);
    if (activeAudios.length === 0) {
      if (clearSelection) {
        this._currentAudio = null;
        this._currentTrackName = '';
      } else {
        this.syncCurrentAudio();
      }
      this.updateNowPlaying();
      return Promise.resolve();
    }

    return Promise.all(activeAudios.map(audio => this.fadeOutAndStop(audio))).then(() => {
      if (clearSelection) {
        this._currentAudio = null;
        this._currentTrackName = '';
      } else {
        this.syncCurrentAudio();
      }
      this.updateNowPlaying();
    });
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
      }
      // Always refresh now playing — the faded track must leave the list even
      // when _currentAudio has already moved to a newer track.
      this.updateNowPlaying();
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
    this._continueBtn = header.createEl('button', {
      cls: `audio-sb-loop-btn ${this.plugin.settings.continuePlayback ? 'audio-sb-loop-on' : 'audio-sb-loop-off'}`
    });
    this._continueBtn.onclick = () => this.toggleContinue();
    this.updateContinueButton();
    this._overlapBtn = header.createEl('button', {
      cls: `audio-sb-loop-btn ${this.plugin.settings.allowMusicOverlap ? 'audio-sb-loop-on' : 'audio-sb-loop-off'}`
    });
    this._overlapBtn.onclick = () => this.toggleMusicOverlap();
    this.updateOverlapButton();

    const searchWrap = content.createEl('div', { cls: 'audio-sb-search-wrap' });
    const searchEl = searchWrap.createEl('input', { cls: 'audio-sb-search', type: 'text' });
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
          if (this.plugin.settings.continuePlayback && !this._looping) {
            this.playNextTrack(audio);
          } else {
            this.syncCurrentAudio();
          }
          this.updateNowPlaying();
        }
      });

      const copyBtn = playerRow.createEl('button', {
        cls: 'audio-sb-track-copy',
        type: 'button',
        attr: { 'aria-label': 'Copy track codeblock' }
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
    if (!this._nowPlayingListEl) return;
    this._nowPlayingListEl.empty();
    this._npTimeEls = new Map();

    const playingMusic = this.getTrackAudios().filter(a => !a.paused && !a.ended);
    const playingLoops = Array.from(this.plugin._activeLoops.values());
    const playingSfx = Array.from(this.plugin._activeSfx).filter(a => !a.ended);

    if (playingMusic.length === 0 && playingLoops.length === 0 && playingSfx.length === 0) {
      this._nowPlayingListEl.createEl('div', { text: 'Nothing playing', cls: 'audio-sb-np-empty' });
      return;
    }

    for (const audio of playingMusic) {
      this._addNowPlayingRow(audio, 'music', audio.dataset.trackName || '?');
    }
    for (const audio of playingLoops) {
      this._addNowPlayingRow(audio, 'loop', audio.dataset.loopName || '?');
    }
    for (const audio of playingSfx) {
      this._addNowPlayingRow(audio, 'sfx', audio.dataset.sfxName || '?');
    }
  }

  _addNowPlayingRow(audio, type, name) {
    const row = this._nowPlayingListEl.createEl('div', { cls: `audio-sb-np-row audio-sb-np-${type}` });

    const timeEl = row.createEl('span', {
      text: this.formatTime(audio.currentTime),
      cls: 'audio-sb-np-time'
    });
    this._npTimeEls.set(audio, timeEl);

    row.createEl('span', { text: name, cls: 'audio-sb-np-name' });

    const controls = row.createEl('div', { cls: 'audio-sb-np-controls' });

    if (type !== 'sfx') {
      const isPlaying = !audio.paused;
      const playBtn = controls.createEl('button', {
        cls: 'audio-sb-np-btn',
        type: 'button',
        attr: { 'aria-label': isPlaying ? 'Pause' : 'Play' }
      });
      setIcon(playBtn, isPlaying ? 'pause' : 'play');
      playBtn.onclick = () => {
        if (type === 'music') {
          if (audio.paused) this.fadeInTrack(audio).catch(() => {});
          else this.fadeOutAndStop(audio, { resetTime: false });
        } else {
          if (audio.paused) audio.play().catch(() => {});
          else audio.pause();
        }
        this.updateNowPlaying();
      };
    }

    const stopBtn = controls.createEl('button', {
      cls: 'audio-sb-np-btn',
      type: 'button',
      attr: { 'aria-label': 'Stop' }
    });
    setIcon(stopBtn, 'square');
    stopBtn.onclick = () => {
      if (type === 'music') {
        this.fadeOutAndStop(audio);
      } else if (type === 'loop') {
        const path = audio.dataset.loopPath;
        if (path) this.plugin.stopLoopByPath(path);
      } else {
        this.plugin.fadeSfxOut(audio);
      }
    };
  }

  _refreshNowPlayingTimes() {
    if (!this._npTimeEls) return;
    for (const [audio, timeEl] of this._npTimeEls) {
      timeEl.textContent = this.formatTime(audio.currentTime);
    }
  }

  formatTime(seconds) {
    if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
    const total = Math.floor(seconds);
    return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
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
      item.toggleClass('audio-sb-hidden', !match);
      if (match) visible++;
    });
    if (this._countEl) {
      this._countEl.textContent = `${visible} track${visible !== 1 ? 's' : ''}`;
    }
  }

  // Returns the <audio> for a track name (lowercase). An exact basename match
  // wins; otherwise the first partial match in list order.
  findTrackAudio(trackName) {
    if (!this._trackList || !trackName) return null;
    const items = Array.from(this._trackList.querySelectorAll('.audio-sb-item'));
    const item = items.find(i => i.dataset.name === trackName)
      || items.find(i => i.dataset.name.includes(trackName));
    return item ? item.querySelector('audio') : null;
  }

  // Finds a track by name and starts playing it. Used by the audiosidebar
  // codeblock processor to auto-play after loading a folder.
  playTrack(trackName) {
    const audio = this.findTrackAudio(trackName);
    if (!audio) return;
    audio.currentTime = 0;
    this.fadeInTrack(audio).catch(() => {
      new Notice(`Could not play ${audio.dataset.trackName || 'track'}`);
    });
  }

  // Scene transition for this view's music. Same track already playing: it
  // keeps going (and any fade-out on it is cancelled). Another track in the
  // loaded folder: true crossfade. Different folder: fade out, then load —
  // reloading the list removes the old <audio> elements, which would cut them.
  transitionMusicForScene(folder, trackName, isCurrent) {
    if (folder && this._loadedFolder && this._loadedFolder.path === folder.path) {
      const target = this.findTrackAudio(trackName);
      this.getTrackAudios()
        .filter(a => a !== target && !a.paused && !a.ended)
        .forEach(a => this.fadeOutAndStop(a));
      if (!target) {
        this.updateNowPlaying();
        return;
      }
      if (!target.paused && !target.ended) {
        this.startFade(target, 1, this.getFadeDurationMs());
        this._currentAudio = target;
        this._currentTrackName = target.dataset.trackName || '';
        this.updateNowPlaying();
      } else {
        target.currentTime = 0;
        this.fadeInTrack(target).catch(() => {
          new Notice(`Could not play ${target.dataset.trackName || 'track'}`);
        });
      }
      return;
    }

    this.fadeOutAllTracks().then(() => {
      if (!folder || !isCurrent()) return;
      this.loadFolder(folder);
      if (trackName) setTimeout(() => { if (isCurrent()) this.playTrack(trackName); }, 50);
    });
  }

  async onClose() {
    if (this._nowPlayingTimer) {
      window.clearInterval(this._nowPlayingTimer);
      this._nowPlayingTimer = null;
    }
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
            // Load immediately if the typed path already resolves to a folder,
            // so the sidebar updates without needing a restart.
            const folder = this.plugin.getDefaultFolder();
            if (folder) await this.plugin.loadFolderIntoLeaves(folder);
          });
        text.inputEl.addClass('audio-sb-settings-input');
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
        text.inputEl.addClass('audio-sb-settings-input');
      });

    new Setting(containerEl)
      .setName('Loops folder')
      .setDesc('Vault-relative folder path used by the looping ambient sound picker.')
      .addText(text => {
        text
          .setPlaceholder('Loops')
          .setValue(this.plugin.settings.loopFolderPath)
          .onChange(async (value) => {
            this.plugin.settings.loopFolderPath = value.trim();
            await this.plugin.saveSettings();
          });
        text.inputEl.addClass('audio-sb-settings-input');
      });

    new Setting(containerEl)
      .setName('Continue playback')
      .setDesc('Automatically play the next track when the current one ends. Stops at the end of the list. Has no effect when track loop is enabled.')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.continuePlayback)
        .onChange(async (value) => {
          this.plugin.settings.continuePlayback = value;
          await this.plugin.saveSettings();
        }));

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
      .setDesc('Overall volume applied to music, sound effects, and loops.')
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
      .setName('Loop volume')
      .setDesc('Category volume for looping ambient sound effects.')
      .addSlider(slider => slider
        .setLimits(0, 100, 1)
        .setValue(this.plugin.settings.loopVolume)
        .setDynamicTooltip()
        .onChange(async (value) => {
          await this.plugin.updateVolumeSetting('loopVolume', value);
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

    const footerEl = containerEl.createEl('div', { cls: 'audio-sb-settings-footer' });
    footerEl.createEl('span', { text: 'Made by Patriek Jeuriens' });
    footerEl.createEl('a', {
      text: 'View on Obsidian Community',
      href: 'https://community.obsidian.md/plugins/audio-sidebar',
      attr: { target: '_blank', rel: 'noopener noreferrer' },
    });
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
    let categoryValue;
    if (category === 'sfx') categoryValue = this.settings.sfxVolume;
    else if (category === 'loop') categoryValue = this.settings.loopVolume;
    else categoryValue = this.settings.musicVolume;
    return master * (this.clampVolume(categoryValue) / 100);
  }

  // Updates the in-memory setting and refreshes all live audio without saving,
  // so the slider feels responsive while dragging.
  previewVolumeSetting(key, value) {
    this.cancelVolumeRamp(key); // the user takes this slider over from a scene
    this.settings[key] = this.clampVolume(value);
    this.refreshAllViews();
    this.refreshActiveSfxVolumes();
    this.refreshActiveLoopVolumes();
  }

  async updateVolumeSetting(key, value) {
    this.previewVolumeSetting(key, value);
    await this.saveSettings();
  }

  // Applies a scene's volume presets to the category sliders, gliding over
  // rampMs so audio that keeps playing across the scene change doesn't jump.
  // Keys left null/undefined keep their current value. Saved when the ramp ends.
  applySceneVolumes({ music = null, loop = null } = {}, rampMs = 0) {
    this.cancelVolumeRamp();
    const targets = {};
    if (music !== null && music !== undefined) targets.musicVolume = this.clampVolume(music);
    if (loop !== null && loop !== undefined) targets.loopVolume = this.clampVolume(loop);
    if (Object.keys(targets).length === 0) return Promise.resolve();

    const starts = {};
    for (const key of Object.keys(targets)) starts[key] = this.clampVolume(this.settings[key]);
    const duration = this.clampFadeMs(rampMs);

    if (duration <= 0) {
      Object.assign(this.settings, targets);
      this.refreshLiveVolumes();
      return this.saveSettings();
    }

    return new Promise(resolve => {
      const ramp = { keys: new Set(Object.keys(targets)), resolve };
      const startedAt = Date.now();
      ramp.id = window.setInterval(() => {
        const progress = Math.min((Date.now() - startedAt) / duration, 1);
        for (const key of ramp.keys) {
          this.settings[key] = starts[key] + (targets[key] - starts[key]) * progress;
        }
        this.refreshLiveVolumes();
        if (progress >= 1) {
          window.clearInterval(ramp.id);
          this._volumeRamp = null;
          for (const key of ramp.keys) this.settings[key] = targets[key];
          this.saveSettings().then(resolve, resolve);
        }
      }, 50);
      this._volumeRamp = ramp;
    });
  }

  // Stops a running scene volume ramp. With a key, only that slider is released
  // (the user grabbed it); otherwise the whole ramp stops. Values are rounded so
  // nothing fractional gets saved.
  cancelVolumeRamp(key = null) {
    const ramp = this._volumeRamp;
    if (!ramp) return;
    const released = key ? [key] : Array.from(ramp.keys);
    for (const k of released) {
      if (!ramp.keys.has(k)) continue;
      ramp.keys.delete(k);
      this.settings[k] = Math.round(this.clampVolume(this.settings[k]));
    }
    if (ramp.keys.size === 0) {
      window.clearInterval(ramp.id);
      this._volumeRamp = null;
      ramp.resolve();
    }
  }

  // Pushes the current volume settings to all live music and loop audio and to
  // the sidebar sliders. Deliberately skips the overlap policy that
  // refreshAllViews runs: re-triggering it every ramp tick would keep
  // restarting the music crossfade.
  refreshLiveVolumes() {
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE)) {
      if (leaf.view instanceof AudioSidebarView) {
        leaf.view.applyMusicVolume();
        leaf.view.syncVolumeControls();
      }
    }
    this.refreshActiveLoopVolumes();
  }

  // Moves from whatever is playing to a scene. Only the differences change:
  // loops in both stay put (gliding to their new per-loop level), others fade
  // out while new ones fade in, music crossfades (see
  // transitionMusicForScene), and one-shot SFX fade out.
  // loopRefs entries are either a ref string or { ref, volume } where volume
  // is 0–100 (null/undefined = 100).
  startScene({ musicRef = null, loopRefs = [], volumes = {} } = {}) {
    const token = (this._sceneToken = (this._sceneToken || 0) + 1);
    const isCurrent = () => token === this._sceneToken;
    const fadeMs = this.clampFadeMs(this.settings.musicFadeMs);

    this.applySceneVolumes(volumes, fadeMs);

    this._activeSfx.forEach(audio => this.fadeSfxOut(audio));

    // Loops
    const wanted = new Map(); // path → { file, gain }
    for (const entry of loopRefs) {
      const ref = typeof entry === 'string' ? entry : entry.ref;
      const volume = typeof entry === 'string' ? null : entry.volume;
      const gain = volume === null || volume === undefined ? 1 : this.clampVolume(volume) / 100;
      const file = this.resolveLoopFile(ref);
      if (file) wanted.set(file.path, { file, gain });
      else new Notice(`Scene loop not found: ${ref}`);
    }
    for (const path of Array.from(this._activeLoops.keys())) {
      if (!wanted.has(path)) this.stopLoopByPath(path);
    }
    for (const [path, { file, gain }] of wanted) {
      const existing = this._activeLoops.get(path);
      if (existing) {
        this._rampLoopGain(existing, gain, fadeMs);
        this._startLoopFade(existing, 1, fadeMs); // undo a partial fade
      } else {
        this.playLoop(file, gain);
      }
    }

    // Music
    let folder = null;
    let trackName = null;
    if (musicRef) {
      const hashIdx = musicRef.indexOf('#');
      const folderPath = hashIdx !== -1 ? musicRef.slice(0, hashIdx).trim() : musicRef.trim();
      trackName = hashIdx !== -1 ? musicRef.slice(hashIdx + 1).trim().toLowerCase() : null;
      folder = this.getFolderByPath(folderPath);
      if (!folder) new Notice(`Scene music folder not found: ${folderPath}`);
    }

    const views = () => this.app.workspace.getLeavesOfType(VIEW_TYPE)
      .map(leaf => leaf.view)
      .filter(view => view instanceof AudioSidebarView);

    if (folder) {
      this.selectedFolder = folder;
      // The sidebar may be closed; open it before handing over the music.
      const ready = views().length ? Promise.resolve() : this.activateView();
      ready.then(() => {
        if (!isCurrent()) return;
        views().forEach(view => view.transitionMusicForScene(folder, trackName, isCurrent));
      });
    } else {
      views().forEach(view => view.transitionMusicForScene(null, null, isCurrent));
    }

    this.refreshNowPlaying();
  }

  async updateFadeSetting(value) {
    this.settings.musicFadeMs = this.clampFadeMs(value);
    await this.saveSettings();
  }

  getFolderByPath(path) {
    if (!path) return null;
    const target = this.app.vault.getAbstractFileByPath(normalizePath(path));
    return target instanceof TFolder ? target : null;
  }

  getDefaultFolder() {
    return this.getFolderByPath(this.settings.defaultFolderPath);
  }

  getSfxFolder() {
    return this.getFolderByPath(this.settings.sfxFolderPath);
  }

  getLoopFolder() {
    return this.getFolderByPath(this.settings.loopFolderPath);
  }

  getAudioFileByPath(path) {
    if (!path) return null;
    const target = this.app.vault.getAbstractFileByPath(normalizePath(path));
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

  // Same resolution logic as resolveSfxFile but falls back to the loop folder.
  resolveLoopFile(source) {
    const normalized = source.trim();
    if (!normalized) return null;

    const directFile = this.getAudioFileByPath(normalized);
    if (directFile) return directFile;

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

    const loopFolder = this.getLoopFolder();
    if (!loopFolder) return null;

    const lookup = normalized.toLowerCase();
    return this.findAudioInFolder(loopFolder).find(file =>
      file.basename.toLowerCase() === lookup ||
      `${file.basename}.${file.extension}`.toLowerCase() === lookup
    ) || null;
  }

  findAudioInFolder(folder) {
    return folder.children
      .filter(f => f instanceof TFile && AUDIO_EXTENSIONS.includes(f.extension.toLowerCase()))
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

  openLoopPicker() {
    const folder = this.getLoopFolder();
    if (!folder) {
      if (this.settings.loopFolderPath) {
        new Notice(`Audio Sidebar loop folder not found: ${this.settings.loopFolderPath}`);
      } else {
        new Notice('Set a loop folder in Audio Sidebar settings first.');
      }
      return;
    }

    const files = this.findAudioInFolder(folder);
    if (files.length === 0) {
      new Notice(`No audio files found in ${folder.path}`);
      return;
    }

    new AudioLoopModal(this.app, this, files).open();
  }

  openSceneCreator() {
    new CreateSceneModal(this.app, this).open();
  }

  // Creates a detached Audio element so SFX plays independently of the
  // sidebar track list. Active instances are tracked in _activeSfx so they
  // can be stopped and have their volume updated as a group.
  playSfx(file) {
    const audio = new Audio(this.app.vault.getResourcePath(file));
    audio.loop = false;
    audio.volume = this.getEffectiveVolume('sfx');
    audio.dataset.sfxName = file.basename;
    audio.addEventListener('ended', () => {
      this._activeSfx.delete(audio);
      this.refreshNowPlaying();
    });
    audio.addEventListener('pause', () => {
      if (audio.ended) this._activeSfx.delete(audio);
    });
    this._activeSfx.add(audio);
    audio.play().catch(() => {
      this._activeSfx.delete(audio);
      new Notice(`Could not play ${file.basename}`);
    });
    this.refreshNowPlaying();
  }

  fadeSfxOut(audio, durationMs = 500) {
    if (!audio || audio.paused || audio.ended) return;
    const startVolume = audio.volume;
    const interval = 50;
    const steps = Math.max(1, Math.round(durationMs / interval));
    let step = 0;
    const id = window.setInterval(() => {
      step++;
      audio.volume = Math.max(0, startVolume * (1 - step / steps));
      if (step >= steps) {
        window.clearInterval(id);
        audio.pause();
        audio.currentTime = 0;
        this._activeSfx.delete(audio);
        this.refreshNowPlaying();
      }
    }, interval);
  }

  stopAllSfx() {
    this._activeSfx.forEach(audio => {
      audio.pause();
      audio.currentTime = 0;
    });
    this._activeSfx.clear();
    this.refreshNowPlaying();
  }

  refreshActiveSfxVolumes() {
    const volume = this.getEffectiveVolume('sfx');
    this._activeSfx.forEach(audio => {
      audio.volume = volume;
    });
  }

  // Starts a looping Audio element for the given file. Keyed by file.path so
  // the same loop can't be started twice, and can be stopped individually.
  // gain (0–1) is this loop's own level on top of the Loop slider; scenes set
  // it per loop, everything else plays loops at full gain.
  playLoop(file, gain = 1) {
    if (this._activeLoops.has(file.path)) return;
    // Still fading out from a stop? Bring that one back instead of restarting
    // the file. _startLoopFade cancels the fade-out, so its pause never runs.
    const fading = this._fadingLoops.get(file.path);
    if (fading) {
      this._fadingLoops.delete(file.path);
      this._activeLoops.set(file.path, fading);
      this._rampLoopGain(fading, gain, this.settings.musicFadeMs);
      this._startLoopFade(fading, 1, this.settings.musicFadeMs);
      this.refreshNowPlaying();
      return;
    }
    const audio = new Audio(this.app.vault.getResourcePath(file));
    audio.loop = true;
    audio.volume = 0;
    audio.dataset.loopFadeLevel = '0';
    audio.dataset.loopGain = String(Math.max(0, Math.min(1, gain)));
    audio.dataset.loopName = file.basename;
    audio.dataset.loopPath = file.path;
    audio.addEventListener('ended', () => {
      this._activeLoops.delete(file.path);
      this.refreshNowPlaying();
    });
    this._activeLoops.set(file.path, audio);
    audio.play().then(() => {
      this._startLoopFade(audio, 1, this.settings.musicFadeMs);
    }).catch(() => {
      this._activeLoops.delete(file.path);
      new Notice(`Could not play ${file.basename}`);
      this.refreshNowPlaying();
    });
    this.refreshNowPlaying();
  }

  stopLoop(file) {
    this.stopLoopByPath(file.path);
  }

  stopLoopByPath(path) {
    const audio = this._activeLoops.get(path);
    if (!audio) return;
    this._activeLoops.delete(path);
    this.refreshNowPlaying();
    return this._fadeOutLoop(path, audio);
  }

  stopAllLoops() {
    const entries = Array.from(this._activeLoops.entries());
    this._activeLoops.clear();
    this.refreshNowPlaying();
    // Returned so callers (fade-out-all) can wait for the fades to end.
    return Promise.all(entries.map(([path, audio]) => this._fadeOutLoop(path, audio)));
  }

  // Fades a loop out and stops it, tracking it in _fadingLoops meanwhile so
  // playLoop can rescue it. A rescued fade never resolves (its interval is
  // cleared), so the pause below only runs for loops that really ended.
  _fadeOutLoop(path, audio) {
    this._fadingLoops.set(path, audio);
    return this._startLoopFade(audio, 0, this.settings.musicFadeMs).then(() => {
      if (this._fadingLoops.get(path) === audio) this._fadingLoops.delete(path);
      audio.pause();
      audio.currentTime = 0;
      audio.dataset.loopFadeLevel = '1';
    });
  }

  // Loop volume = master × Loop slider × this loop's own gain × fade level.
  _applyLoopVolume(audio) {
    const fadeLevel = Number(audio.dataset.loopFadeLevel || 1);
    const gain = audio.dataset.loopGain !== undefined ? Number(audio.dataset.loopGain) : 1;
    audio.volume = this.getEffectiveVolume('loop') * gain * fadeLevel;
  }

  // Glides a loop's own gain (0–1) to target, separately from its fade so a
  // loop kept across scenes can change level while staying audible.
  _rampLoopGain(audio, target, durationMs) {
    if (audio._loopGainInterval) {
      window.clearInterval(audio._loopGainInterval);
      audio._loopGainInterval = null;
    }
    const to = Math.max(0, Math.min(1, Number(target)));
    const from = audio.dataset.loopGain !== undefined ? Number(audio.dataset.loopGain) : 1;
    const duration = this.clampFadeMs(durationMs);
    if (duration <= 0 || Math.abs(from - to) < 0.005) {
      audio.dataset.loopGain = String(to);
      this._applyLoopVolume(audio);
      return;
    }
    const startedAt = Date.now();
    audio._loopGainInterval = window.setInterval(() => {
      const progress = Math.min((Date.now() - startedAt) / duration, 1);
      audio.dataset.loopGain = String(from + (to - from) * progress);
      this._applyLoopVolume(audio);
      if (progress >= 1) {
        window.clearInterval(audio._loopGainInterval);
        audio._loopGainInterval = null;
      }
    }, 50);
  }

  _startLoopFade(audio, targetFadeLevel, durationMs) {
    return new Promise(resolve => {
      if (audio._loopFadeInterval) {
        window.clearInterval(audio._loopFadeInterval);
        audio._loopFadeInterval = null;
      }
      const duration = this.clampFadeMs(durationMs);
      const startLevel = Number(audio.dataset.loopFadeLevel || 1);
      const target = Math.max(0, Math.min(1, targetFadeLevel));

      if (duration <= 0 || Math.abs(startLevel - target) < 0.01) {
        audio.dataset.loopFadeLevel = String(target);
        this._applyLoopVolume(audio);
        resolve();
        return;
      }

      const startedAt = Date.now();
      audio._loopFadeInterval = window.setInterval(() => {
        const elapsed = Date.now() - startedAt;
        const progress = Math.min(elapsed / duration, 1);
        audio.dataset.loopFadeLevel = String(startLevel + (target - startLevel) * progress);
        this._applyLoopVolume(audio);
        if (progress >= 1) {
          window.clearInterval(audio._loopFadeInterval);
          audio._loopFadeInterval = null;
          resolve();
        }
      }, 50);
    });
  }

  refreshActiveLoopVolumes() {
    this._activeLoops.forEach(audio => this._applyLoopVolume(audio));
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

  refreshNowPlaying() {
    const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE);
    for (const leaf of leaves) {
      if (leaf.view instanceof AudioSidebarView) {
        leaf.view.updateNowPlaying();
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

  fadeOutAllAudio() {
    this._sceneToken++; // cancel a scene's pending music hand-over
    const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE);
    const trackFadePromises = [];

    for (const leaf of leaves) {
      if (leaf.view instanceof AudioSidebarView) {
        trackFadePromises.push(leaf.view.fadeOutAllTracks());
      }
    }

    const loopFadePromise = Promise.resolve(this.stopAllLoops());
    this.stopAllSfx();

    return Promise.all([...trackFadePromises, loopFadePromise]).then(() => {
      this.refreshNowPlaying();
    });
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
    this._activeLoops = new Map();
    this._fadingLoops = new Map(); // path → audio still fading out after a stop
    this._sceneToken = 0;          // bumped per scene start; stale callbacks bail
    this._volumeRamp = null;
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
        menu.addItem(item => item
          .setTitle('Copy fade-out-all codeblock')
          .setIcon('square')
          .onClick(() => {
            const code = `\`\`\`audiofadeoutall\nFade out all audio\n\`\`\``;
            navigator.clipboard.writeText(code);
            new Notice('Codeblock copied');
          })
        );
      })
    );

    // File explorer context menu: audio files get an "Audio" submenu with
    // codeblock options for the music sidebar, one-shot SFX, and loops.
    this.registerEvent(
      this.app.workspace.on('file-menu', (menu, file) => {
        if (!(file instanceof TFile)) return;
        if (!AUDIO_EXTENSIONS.includes(file.extension.toLowerCase())) return;
        menu.addItem(item => {
          item.setTitle('Audio').setIcon('music');
          const submenu = item.setSubmenu();
          submenu.addItem(sub => sub
            .setTitle('Copy track codeblock')
            .setIcon('copy')
            .onClick(() => {
              const code = `\`\`\`audiosidebar\n${file.parent.path}#${file.basename}\n\`\`\``;
              navigator.clipboard.writeText(code);
              new Notice('Codeblock copied');
            })
          );
          submenu.addItem(sub => sub
            .setTitle('Copy SFX codeblock')
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
          submenu.addItem(sub => sub
            .setTitle('Copy loop codeblock')
            .setIcon('copy')
            .onClick(() => {
              const parent = file.parent;
              const folderPath = parent && parent.path !== '/' ? parent.path : null;
              const ref = folderPath ? `${folderPath}#${file.basename}` : file.basename;
              const code = `\`\`\`audioloop\n${ref}\n\`\`\``;
              navigator.clipboard.writeText(code);
              new Notice('Codeblock copied');
            })
          );
          submenu.addItem(sub => sub
            .setTitle('Copy fade-out-all codeblock')
            .setIcon('square')
            .onClick(() => {
              const code = `\`\`\`audiofadeoutall\nFade out all audio\n\`\`\``;
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

    // Clicking the button toggles the loop on/off. The icon updates to reflect
    // the current state so you can tell at a glance whether it's running.
    this.registerMarkdownCodeBlockProcessor('audioloop', (source, el) => {
      const fileSource = source.trim();
      const file = this.resolveLoopFile(fileSource);

      const btn = el.createEl('button', { cls: 'audio-sb-codeblock-btn' });
      const iconEl = btn.createEl('span', { text: '↻', cls: 'audio-sb-codeblock-icon' });
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

      const updateState = () => {
        const active = this._activeLoops.has(file.path);
        iconEl.textContent = active ? '◼' : '↻';
        btn.classList.toggle('audio-sb-codeblock-loop-active', active);
      };

      btn.onclick = () => {
        if (this._activeLoops.has(file.path)) {
          this.stopLoop(file);
        } else {
          this.playLoop(file);
        }
        updateState();
      };
    });

    this.registerMarkdownCodeBlockProcessor('audiofadeoutall', (source, el) => {
      const label = source.trim() || 'Fade out all audio';
      const btn = el.createEl('button', {
        cls: 'audio-sb-codeblock-btn audio-sb-codeblock-fadeall-btn'
      });
      const iconEl = btn.createEl('span', { cls: 'audio-sb-codeblock-icon' });
      setIcon(iconEl, 'square');
      const labelEl = btn.createEl('span', { cls: 'audio-sb-codeblock-label' });
      labelEl.createEl('span', {
        text: label,
        cls: 'audio-sb-codeblock-folder'
      });

      btn.onclick = () => {
        this.fadeOutAllAudio();
      };
    });

    // Parses name/music/loop/volume lines and renders a single scene-launch
    // button. Clicking transitions to the scene via startScene: shared loops
    // and the same music track keep playing, everything else crossfades.
    this.registerMarkdownCodeBlockProcessor('audioscene', (source, el) => {
      const lines = source.trim().split('\n').map(l => l.trim()).filter(Boolean);
      let sceneName = '';
      let musicRef = null;
      const loopRefs = [];
      const sceneVolumes = { music: null, loop: null };

      // Accepts a 0–100 number, optionally with a trailing %.
      const parseVolume = (raw) => {
        const n = parseFloat(String(raw).replace('%', '').trim());
        return Number.isFinite(n) ? this.clampVolume(Math.round(n)) : null;
      };

      for (const line of lines) {
        const colonIdx = line.indexOf(':');
        if (colonIdx === -1) continue;
        const key = line.slice(0, colonIdx).trim().toLowerCase().replace(/[\s_-]/g, '');
        const value = line.slice(colonIdx + 1).trim();
        if (key === 'name') sceneName = value;
        else if (key === 'music') musicRef = value;
        else if (key === 'loop') {
          // Optional per-loop volume after a pipe: "Loops#Rain | 40". A pipe
          // can't appear in vault file names, so it's safe as a separator.
          const pipeIdx = value.lastIndexOf('|');
          if (pipeIdx !== -1) {
            loopRefs.push({ ref: value.slice(0, pipeIdx).trim(), volume: parseVolume(value.slice(pipeIdx + 1)) });
          } else {
            loopRefs.push({ ref: value, volume: null });
          }
        }
        else if (key === 'musicvolume') sceneVolumes.music = parseVolume(value);
        else if (key === 'loopvolume') sceneVolumes.loop = parseVolume(value);
      }

      const btn = el.createEl('button', { cls: 'audio-sb-codeblock-btn audio-sb-codeblock-scene-btn' });
      const iconEl = btn.createEl('span', { cls: 'audio-sb-codeblock-icon' });
      setIcon(iconEl, 'play-circle');
      const labelEl = btn.createEl('span', { cls: 'audio-sb-codeblock-label' });
      labelEl.createEl('span', { text: sceneName || 'Scene', cls: 'audio-sb-codeblock-folder' });

      const tags = [];
      const volTag = (v) => (v !== null ? ` ${v}%` : '');
      if (musicRef) tags.push(`music${volTag(sceneVolumes.music)}`);
      if (loopRefs.length > 0) tags.push(`${loopRefs.length} loop${loopRefs.length !== 1 ? 's' : ''}${volTag(sceneVolumes.loop)}`);
      if (tags.length > 0) {
        labelEl.createEl('span', { text: ` · ${tags.join(' · ')}`, cls: 'audio-sb-codeblock-track' });
      }

      btn.onclick = () => {
        this.startScene({ musicRef, loopRefs, volumes: sceneVolumes });
      };
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

    this.addCommand({
      id: 'open-loop-picker',
      name: 'Open loop picker',
      callback: () => this.openLoopPicker()
    });

    this.addCommand({
      id: 'stop-all-loops',
      name: 'Stop all loops',
      callback: () => this.stopAllLoops()
    });

    this.addCommand({
      id: 'fade-out-all-audio',
      name: 'Fade out all audio',
      callback: () => this.fadeOutAllAudio()
    });
  }

  // Tracks which folder is selected in the file explorer by listening for
  // clicks on nav-folder-title elements. Obsidian has no public API for this.
  // registerDomEvent ensures the listener is removed automatically on unload.
  hookFileExplorer() {
    const explorerLeaf = this.app.workspace.getLeavesOfType('file-explorer')[0];
    if (!explorerLeaf) return;

    this.registerDomEvent(explorerLeaf.view.containerEl, 'click', (e) => {
      const folderTitleEl = e.target.closest('.nav-folder-title');
      if (!folderTitleEl) return;
      const folderPath = folderTitleEl.dataset.path;
      if (folderPath == null) return;
      const folder = folderPath === '/'
        ? this.app.vault.getRoot()
        : this.app.vault.getAbstractFileByPath(folderPath);
      if (folder) this.selectedFolder = folder;
    });
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
    this.cancelVolumeRamp();
    this.stopAllSfx();
    this.stopAllLoops();
    this.app.workspace.detachLeavesOfType(VIEW_TYPE);
  }
}

module.exports = AudioSidebarPlugin;

/* nosourcemap */