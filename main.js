const { Modal, Notice, Plugin, ItemView, PluginSettingTab, Setting, TFolder, TFile } = require('obsidian');

const VIEW_TYPE = 'audio-sidebar';
const AUDIO_EXTENSIONS = ['mp3', 'wav', 'ogg', 'flac', 'm4a', 'webm', 'aac'];
const DEFAULT_SETTINGS = {
  defaultFolderPath: '',
  sfxFolderPath: ''
};

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
      const itemEl = listEl.createEl('button', {
        cls: 'audio-sb-sfx-item',
        type: 'button'
      });
      itemEl.createEl('span', { text: '♪', cls: 'audio-sb-sfx-icon' });
      itemEl.createEl('div', { text: file.basename, cls: 'audio-sb-sfx-name' });
      itemEl.onclick = () => {
        this.close();
        this.plugin.playSfx(file);
      };
    }
  }

  onClose() {
    this.contentEl.empty();
  }
}

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

  draw(folder) {
    this._looping = true;
    const content = this.containerEl.children[1];
    content.empty();

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

    this._loopBtn = null;

    if (!this._loadedFolder) return;
    this.renderTracks(content, this._loadedFolder);
  }

  toggleLoop() {
    this._looping = !this._looping;
    this._loopBtn.textContent = `⟳ Loop: ${this._looping ? 'On' : 'Off'}`;
    this._loopBtn.classList.toggle('audio-sb-loop-on', this._looping);
    this._loopBtn.classList.toggle('audio-sb-loop-off', !this._looping);
    const content = this.containerEl.children[1];
    content.querySelectorAll('audio').forEach(a => a.loop = this._looping);
  }

  loadFolder(folder) {
    this._loadedFolder = folder;
    const content = this.containerEl.children[1];
    // Keep the toolbar, re-render below it
    while (content.children.length > 1) content.removeChild(content.lastChild);
    this.renderTracks(content, folder);
  }

  renderTracks(content, folder) {
    const audioFiles = this.plugin.findAudioInFolder(folder);

    const header = content.createEl('div', { cls: 'audio-sb-header' });
    header.createEl('span', { text: folder.name || 'Root', cls: 'audio-sb-folder-name' });
    this._countEl = header.createEl('span', { text: `${audioFiles.length} track${audioFiles.length !== 1 ? 's' : ''}`, cls: 'audio-sb-count' });
    this._loopBtn = header.createEl('button', { text: '⟳', cls: `audio-sb-loop-btn ${this._looping !== false ? 'audio-sb-loop-on' : 'audio-sb-loop-off'}` });
    this._loopBtn.title = 'Toggle loop';
    this._loopBtn.onclick = () => this.toggleLoop();

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
      const audio = item.createEl('audio');
      audio.controls = true;
      audio.loop = this._looping !== false;
      audio.src = this.app.vault.getResourcePath(af);
      audio.addEventListener('play', () => {
        this._trackList.querySelectorAll('audio').forEach(a => {
          if (a !== audio) a.pause();
        });
      });
    }
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

  playTrack(trackName) {
    if (!this._trackList) return;
    const items = this._trackList.querySelectorAll('.audio-sb-item');
    for (const item of items) {
      if (item.dataset.name.includes(trackName)) {
        const audio = item.querySelector('audio');
        if (audio) {
          this._trackList.querySelectorAll('audio').forEach(a => a.pause());
          audio.currentTime = 0;
          audio.play();
        }
        break;
      }
    }
  }
  async onClose() {}
}

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
  }
}

class AudioSidebarPlugin extends Plugin {
  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
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

  resolveSfxFile(source) {
    const normalized = source.trim();
    if (!normalized) return null;

    const directFile = this.getAudioFileByPath(normalized);
    if (directFile) return directFile;

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

  playSfx(file) {
    const audio = new Audio(this.app.vault.getResourcePath(file));
    audio.loop = false;
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

    this.registerEvent(
      this.app.workspace.on('file-menu', (menu, file) => {
        if (!(file instanceof TFile)) return;
        if (!AUDIO_EXTENSIONS.includes(file.extension.toLowerCase())) return;
        menu.addItem(item => item
          .setTitle('Copy Audio Sidebar link')
          .setIcon('music')
          .onClick(() => {
            const code = `\`\`\`audiosidebar\n${file.parent.path}#${file.basename}\n\`\`\``;
            navigator.clipboard.writeText(code);
          })
        );
      })
    );

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
