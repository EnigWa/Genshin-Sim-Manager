var state = {
    currentProject: '',
    currentFile: null,
    configs: [],
    settings: { base_dir: '', gcsim_paths: [], selected_gcsim: '', project_name: '' },
    projects: [],
    dirty: false,
    runId: null,
    pollInterval: null,
    editorTimeout: null,
    currentBgTheme: localStorage.getItem('gcsim_bg') || 'default',
    currentTextTheme: localStorage.getItem('gcsim_text') || 'light-text',
    editorFontSize: parseInt(localStorage.getItem('gcsim_fontsize')) || 13
};

var SECTION_NAMES = new Set([
    'options', 'characters', 'target', 'team', 'settings',
    'energy', 'active', 'simulation', 'enemy', 'hash', 'gcsl'
]);
