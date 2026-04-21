const { Plugin, ItemView } = require('obsidian');

const VIEW_TYPE = 'audio-sidebar';
const AUDIO_EXTENSIONS = ['mp3', 'wav', 'ogg', 'flac', 'm4a', 'webm', 'aac'];

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
    const audioFiles = this.findAudioInFolder(folder);

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

  findAudioInFolder(folder) {
    return this.app.vault.getFiles()
      .filter(f =>
        f.parent && f.parent.path === folder.path &&
        AUDIO_EXTENSIONS.includes(f.extension.toLowerCase())
      )
      .sort((a, b) => a.basename.localeCompare(b.basename));
  }

  async onClose() {}
}

class AudioSidebarPlugin extends Plugin {
  async onload() {
    this.selectedFolder = null;
    this.registerView(VIEW_TYPE, (leaf) => new AudioSidebarView(leaf, this));
    this.addRibbonIcon('music', 'Audio Sidebar', () => this.activateView());
    this.app.workspace.onLayoutReady(() => {
      this.activateView();
      this.hookFileExplorer();
    });

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

    this.addCommand({
      id: 'load-current-folder',
      name: 'Load audio from current note\'s folder',
      callback: () => {
        const activeFile = this.app.workspace.getActiveFile();
        if (!activeFile || !activeFile.parent) return;
        const folder = activeFile.parent;
        this.selectedFolder = folder;
        this.activateView().then(() => {
          const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE);
          for (const leaf of leaves) {
            if (leaf.view instanceof AudioSidebarView) {
              leaf.view.loadFolder(folder);
            }
          }
        });
      }
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
    this.app.workspace.detachLeavesOfType(VIEW_TYPE);
  }
}

module.exports = AudioSidebarPlugin;
