
var state = {
    currentProject: '',
    currentFile: null,
    configs: [],
    settings: { project_name: '' },
    configMeta: JSON.parse(localStorage.getItem('gcsim_meta') || '{}'),
    selectMode: false,
    selectedConfigs: new Set(),
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
window.aceEditor = ace.edit("editor");
    
    window.aceEditor.session.setMode("ace/mode/gcsim");
    window.aceEditor.setOptions({
        // Fallback to 13 if state.editorFontSize isn't loaded yet
        fontSize: (state.editorFontSize || 13) + "px", 
        showPrintMargin: false,
        wrap: true
    });

    window.aceEditor2 = ace.edit("editor2");
    
    window.aceEditor2.session.setMode("ace/mode/gcsim");
    window.aceEditor2.setOptions({
        fontSize: (state.editorFontSize || 13) + "px",
        showPrintMargin: false,
        wrap: true
    });

    // Bind Autosave to Ace's change event
    function onEditorChange() {
    // Clear any red error warnings when the user starts typing again
    window.aceEditor.session.clearAnnotations(); 
    
    state.dirty = true;
    if (state.editorTimeout) clearTimeout(state.editorTimeout);
    if (typeof autosaveEnabled !== 'undefined' && autosaveEnabled) {
        state.editorTimeout = setTimeout(function() { 
            if (state.currentFile) saveCurrentConfig(); 
        }, 1000);
    }
}
    
    window.aceEditor.session.on('change', onEditorChange);
    window.aceEditor2.session.on('change', onEditorChange);
// ========== THEME SYSTEM ==========
var ACE_THEME_MAP = {
    // bg theme -> ace theme (fallback base)
    'default':     'ace/theme/tomorrow_night',
    'pitch-black': 'ace/theme/idle_fingers',
    'red':         'ace/theme/tomorrow_night',
    'blue':        'ace/theme/tomorrow_night_blue',
    'silver':      'ace/theme/chrome',
};

var ACE_TEXT_MAP = {
    'light-text':  null,          // use bg default
    'light-blue':  null,          // use bg default
    'crimson':     null,          // use bg default  
    'dark-text':   'ace/theme/chrome', // light editor for dark text
};

function getAceTheme() {
    // Text theme takes priority if it has an override
    var textOverride = ACE_TEXT_MAP[state.currentTextTheme];
    if (textOverride) return textOverride;
    return ACE_THEME_MAP[state.currentBgTheme] || 'ace/theme/tomorrow_night';
}

function applyAceTheme() {
    var theme = getAceTheme();
    if (window.aceEditor)  window.aceEditor.setTheme(theme);
    if (window.aceEditor2) window.aceEditor2.setTheme(theme);
}

function applyBgTheme(themeName) {
    var root = document.documentElement;
    if (themeName === 'default') {
        root.removeAttribute('data-bg');
    } else {
        root.setAttribute('data-bg', themeName);
    }
    state.currentBgTheme = themeName;
    localStorage.setItem('gcsim_bg', themeName);

    document.querySelectorAll('#bgThemeGrid .theme-card').forEach(function(card) {
        card.classList.toggle('active', card.getAttribute('data-bg-val') === themeName);
    });

    applyAceTheme();
}

function applyTextTheme(themeName) {
    document.documentElement.setAttribute('data-text', themeName);
    state.currentTextTheme = themeName;
    localStorage.setItem('gcsim_text', themeName);

    document.querySelectorAll('#textThemeGrid .text-theme-card').forEach(function(card) {
        card.classList.toggle('active', card.getAttribute('data-text-val') === themeName);
    });

    applyAceTheme();
}

function applyFontSize(size) {
    state.editorFontSize = size;
    localStorage.setItem('gcsim_fontsize', size.toString());
    
    // Tell Ace to update
    if (typeof window.aceEditor !== 'undefined') window.aceEditor.setFontSize(size + "px");
    if (typeof window.aceEditor2 !== 'undefined') window.aceEditor2.setFontSize(size + "px");
}

function selectBgTheme(themeName) {
    applyBgTheme(themeName);
    toast('Background theme changed', 'success');
}

function selectTextTheme(themeName) {
    applyTextTheme(themeName);
    toast('Text color theme changed', 'success');
}

function updateFontSize(size) {
    applyFontSize(parseInt(size));
    document.getElementById('fontSizeLabel').textContent = size;
}

function showSettingsModal() {
    document.querySelectorAll('#bgThemeGrid .theme-card').forEach(function(card) {
        card.classList.toggle('active', card.getAttribute('data-bg-val') === state.currentBgTheme);
    });
    document.querySelectorAll('#textThemeGrid .text-theme-card').forEach(function(card) {
        card.classList.toggle('active', card.getAttribute('data-text-val') === state.currentTextTheme);
    });
    document.getElementById('fontSizeSlider').value = state.editorFontSize;
    document.getElementById('fontSizeLabel').textContent = state.editorFontSize;
    document.getElementById('settingsModal').classList.add('show');
}

function showHelpModal() {
    document.getElementById('helpModal').classList.add('show');
}

function escapeHtml(str) {
    return String(str).replace(/[&]/g, '&' + 'amp;').replace(/[<]/g, '&' + 'lt;').replace(/[>]/g, '&' + 'gt;');
}



async function api(method, url, body) {
    var opts = { method: method, headers: { 'Content-Type': 'application/json' } };
    if (body) opts.body = JSON.stringify(body);
    var resp = await fetch(url, opts);
    if (!resp.ok) {
        var err = await resp.json().catch(function() { return { error: resp.statusText }; });
        throw new Error(err.error || resp.statusText);
    }
    return resp.json();
}

function toast(msg, type) {
    if (!type) type = 'info';
    var container = document.getElementById('toastContainer');
    var el = document.createElement('div');
    el.className = 'toast ' + type;
    el.textContent = msg;
    container.appendChild(el);
    setTimeout(function() { el.style.opacity = '0'; el.style.transition = 'opacity 0.3s'; setTimeout(function() { el.remove(); }, 300); }, 4000);
}

function toggleSidebar() { document.getElementById('sidebar').classList.toggle('collapsed'); }

var toolbarVisible = true;
function toggleToolbar() {
    toolbarVisible = !toolbarVisible;
    document.getElementById('toolbarContent').classList.toggle('collapsed');
    document.getElementById('toolbarToggleBtn').textContent = toolbarVisible ? '\u25B2' : '\u25BC';
}

var logVisible = true;
function toggleLog() {
    logVisible = !logVisible;
    document.getElementById('logArea').classList.toggle('collapsed');
    document.getElementById('logToggleBtn').textContent = logVisible ? '\u25BC' : '\u25B2';
}

function formatConfig() {
    var editor = document.getElementById('editor');
    var raw = window.aceEditor.getValue();
    if (!raw.trim()) return;
    var result = raw;
    result = result.split('\n').map(function(l) { return l.replace(/\s+$/, ''); }).join('\n');
    result = result.replace(/\n{3,}/g, '\n\n');
    var sectionHeaders = /^(options|characters|target|team|settings|energy|active|simulation|enemy)\b/im;
    result = result.split('\n').map(function(line, i, arr) {
        if (i > 0 && sectionHeaders.test(line) && arr[i-1].trim() !== '') return '\n' + line;
        return line;
    }).join('\n');
    result = result.replace(/(\w[\w.%]*):\s*(\d+(?:\.\d+)?)/g, '$1:$2');
    var indentLevel = 0;
    var lines = result.split('\n');
    var formatted = [];
    for (var i = 0; i < lines.length; i++) {
        var trimmed = lines[i].trim();
        if (trimmed.startsWith('#') || trimmed.startsWith('//')) { formatted.push(lines[i].replace(/^\s*/, '')); continue; }
        if (trimmed === '') { formatted.push(''); continue; }
        if (trimmed.startsWith('}')) indentLevel = Math.max(0, indentLevel - 1);
        formatted.push('  '.repeat(indentLevel) + trimmed);
        if (trimmed.endsWith('{') || ((trimmed.match(/\{/g) || []).length > (trimmed.match(/\}/g) || []).length && !trimmed.startsWith('}'))) indentLevel++;
    }
    result = formatted.join('\n');
    result = result.replace(/\n+$/, '\n');
    editor.value = result;
    state.dirty = true;
    toast('Config formatted', 'info');
}

async function saveSettings() {
    state.settings.project_name = state.currentProject;
    state.settings.opt_liquid = parseInt(document.getElementById('opt_liquid').value);
state.settings.opt_cap = parseInt(document.getElementById('opt_cap').value);
state.settings.opt_fixed = parseInt(document.getElementById('opt_fixed').value);
state.settings.opt_tune = parseInt(document.getElementById('opt_tune').value);
    try { await api('POST', '/api/settings', state.settings); } catch (e) { console.error('Settings save error:', e); }
}

async function loadSettings() {
    try {
        document.getElementById('opt_liquid').value = state.settings.opt_liquid ?? 20;
document.getElementById('opt_cap').value = state.settings.opt_cap ?? 10;
document.getElementById('opt_fixed').value = state.settings.opt_fixed ?? 2;
document.getElementById('opt_tune').value = state.settings.opt_tune ?? 1;
        state.settings = await api('GET', '/api/settings');
    } catch (e) { console.error('Settings load error:', e); }
}

// --- RUNTIMES MANAGEMENT ---
async function loadRuntimes() {
    try {
        const data = await api('GET', '/api/runtimes');
        const select = document.getElementById('runtimeSelect');
        const list = document.getElementById('runtimeList');
        
        select.innerHTML = '';
        list.innerHTML = '';
        
        if (data.runtimes.length === 0) {
            select.innerHTML = '<option value="">No runtimes installed</option>';
            list.innerHTML = '<div style="padding:8px; color:var(--text-muted); text-align:center;">No runtimes found.</div>';
            return;
        }

        data.runtimes.forEach(r => {
            // Populate Toolbar Dropdown
            const opt = document.createElement('option');
            opt.value = r.id;
            opt.textContent = r.name;
            if (r.id === data.active) opt.selected = true;
            select.appendChild(opt);

            // Populate Settings List
            const div = document.createElement('div');
            div.style.cssText = 'display:flex; justify-content:space-between; align-items:center; padding:6px; border-bottom:1px solid var(--border-color);';
            div.innerHTML = `
                <div style="display:flex; flex-direction:column; overflow:hidden;">
                    <span style="font-weight:bold; color:var(--text-primary); font-size:12px;">
                        ${r.type === 'custom' ? '🛠️' : '📦'} ${escapeHtml(r.name)}
                        ${r.id === data.active ? '<span style="color:var(--toast-success-border); font-size:10px; margin-left:4px;">(Active)</span>' : ''}
                    </span>
                    <span style="font-size:10px; color:var(--text-muted); white-space:nowrap; text-overflow:ellipsis; overflow:hidden;">${escapeHtml(r.path)}</span>
                </div>
                <button class="btn-danger" style="padding:2px 6px; font-size:11px;" onclick="deleteRuntime('${r.id}')">Del</button>
            `;
            list.appendChild(div);
        });
    } catch (e) { toast('Failed to load runtimes', 'error'); }
}

async function changeRuntime() {
    const id = document.getElementById('runtimeSelect').value;
    if (!id) return;
    try {
        await api('POST', '/api/runtimes/active', { id });
        toast('Active runtime updated', 'success');
        loadRuntimes();
    } catch(e) { toast('Error changing runtime', 'error'); }
}

async function deleteRuntime(id) {
    if (!confirm('Are you sure you want to delete this runtime?')) return;
    try {
        await api('DELETE', `/api/runtimes/${id}`);
        toast('Runtime deleted', 'info');
        loadRuntimes();
    } catch(e) { toast('Failed to delete runtime', 'error'); }
}

async function loadOfficialReleases() {
    try {
        const releases = await api('GET', '/api/runtimes/releases');
        const sel = document.getElementById('officialReleaseSelect');
        sel.innerHTML = releases.map(r => `<option value="${r.tag}">${r.tag}</option>`).join('');
    } catch (e) {
        document.getElementById('officialReleaseSelect').innerHTML = '<option value="">Error loading</option>';
    }
}

async function downloadOfficialRuntime() {
    const tag = document.getElementById('officialReleaseSelect').value;
    if (!tag) return;
    toast(`Downloading ${tag} (This may take a minute...)`, 'info');
    try {
        await api('POST', '/api/runtimes/download', { tag });
        toast(`Successfully downloaded ${tag}!`, 'success');
        loadRuntimes();
    } catch (e) { toast('Download failed: ' + e.message, 'error'); }
}

// Ensure loadOfficialReleases is called when Settings modal opens
const oldShowSettings = showSettingsModal;
showSettingsModal = function() {
    oldShowSettings();
    loadRuntimes();
    loadOfficialReleases();
};

// --- BROWSE LOGIC FOR CUSTOM BINARIES ---
let browseState = { path: '', file: null, parent: null };

async function openBrowseModal() {
    document.getElementById('browseModal').classList.add('show');
    await navigateBrowseToPath('');
}

async function navigateBrowseToPath(pathStr) {
    try {
        const res = await api('POST', '/api/browse', { path: pathStr });
        browseState.path = res.currentPath;
        browseState.parent = res.parentPath;
        browseState.file = null;
        
        document.getElementById('browseCurrentPathInput').value = res.currentPath;
        document.getElementById('browseUpBtn').disabled = !res.parentPath;
        document.getElementById('confirmBrowseBtn').disabled = true;
        document.getElementById('selectedFilePathText').textContent = 'No file selected';
        
        const driveSel = document.getElementById('browseDriveSelect');
        driveSel.innerHTML = res.drives.map(d => `<option value="${d}" ${res.currentPath.startsWith(d) ? 'selected' : ''}>${d}</option>`).join('');
        
        const list = document.getElementById('browseList');
        
        // Safely encode paths to prevent single-quotes and backslashes from breaking the HTML
        list.innerHTML = res.directories.map(d => `
            <div style="padding:4px; cursor:pointer; color:var(--text-secondary);" onclick="navigateBrowseToPath(decodeURIComponent('${encodeURIComponent(d.path)}'))">
                📁 ${escapeHtml(d.name)}
            </div>
        `).join('');
        
        list.innerHTML += res.files.map(f => {
            // Use the backend's OS check instead of process.platform
            const isExec = res.isWindows ? f.name.toLowerCase().endsWith('.exe') : !f.name.includes('.');
            return `
            <div style="padding:4px; cursor:${isExec ? 'pointer' : 'default'}; color:${isExec ? 'var(--toast-success-border)' : 'var(--text-muted)'};" 
                 onclick="${isExec ? `selectBrowseFile(decodeURIComponent('${encodeURIComponent(f.path)}'))` : ''}">
                📄 ${escapeHtml(f.name)}
            </div>`;
        }).join('');
        
    } catch (e) { 
        toast('Browse error: ' + e.message, 'error'); 
        console.error('Browse Error:', e);
    }
}

function navigateBrowseUp() { if (browseState.parent) navigateBrowseToPath(browseState.parent); }
function selectBrowseFile(filePath) {
    browseState.file = filePath;
    document.getElementById('selectedFilePathText').textContent = filePath;
    document.getElementById('confirmBrowseBtn').disabled = false;
}

async function confirmCustomRuntime() {
    if (!browseState.file) return;
    const name = prompt('Enter a recognizable name for this runtime (e.g. wfpsim, beta-build):', 'Custom Sim');
    if (!name) return;
    try {
        await api('POST', '/api/runtimes/custom', { name, path: browseState.file });
        toast('Custom runtime added!', 'success');
        closeModal('browseModal');
        loadRuntimes();
    } catch(e) { toast('Failed to add runtime', 'error'); }
}
// ===========================================

async function loadProjects() {
    try {
        state.projects = await api('GET', '/api/projects');
        var sel = document.getElementById('projectSelect');
        sel.innerHTML = '';
        if (state.projects.length === 0) {
            var opt = document.createElement('option'); opt.textContent = 'No projects'; opt.disabled = true; sel.appendChild(opt);
        } else {
            state.projects.forEach(function(p) { var opt = document.createElement('option'); opt.value = p; opt.textContent = p; sel.appendChild(opt); });
        }
        if (state.settings.project_name && state.projects.indexOf(state.settings.project_name) !== -1) sel.value = state.settings.project_name;
        else if (state.projects.length > 0) sel.value = state.projects[0];
        state.currentProject = sel.value || '';
        if (state.currentProject) loadConfigs();
        else document.getElementById('fileList').innerHTML = '<div class="no-configs-msg">Create or select a project to begin</div>';
    } catch (e) { console.error('Projects load error:', e); }
}

async function createProject() {
    var name = prompt('Enter project name:');
    if (!name) return;
    try {
        await api('POST', '/api/projects', { name: name });
        toast('Project "' + name + '" created', 'success');
        await loadProjects();
        document.getElementById('projectSelect').value = name;
        state.currentProject = name;
        await saveSettings(); await loadConfigs();
    } catch (e) { toast('Error creating project: ' + e.message, 'error'); }
}

async function renameProject() {
    if (!state.currentProject) { toast('No project selected', 'error'); return; }
    var newName = prompt('Rename project "' + state.currentProject + '" to:', state.currentProject);
    if (!newName || newName === state.currentProject) return;
    try {
        await api('PUT', '/api/projects/' + encodeURIComponent(state.currentProject) + '/rename', { newName: newName });
        toast('Project renamed to "' + newName + '"', 'success');
        state.currentProject = newName;
        state.currentFile = null;
        document.getElementById('editor').value = '';
        document.getElementById('fileIndicator').textContent = 'No file loaded';
        document.getElementById('saveStatus').textContent = '';

        state.dirty = false;
        await saveSettings();
        await loadProjects();
        document.getElementById('projectSelect').value = newName;
    } catch (e) { toast('Error renaming project: ' + e.message, 'error'); }
}

async function deleteProject() {
    if (!state.currentProject) { toast('No project selected', 'error'); return; }
    if (!confirm('Are you sure you want to permanently delete the project "' + state.currentProject + '" and all its configs/outputs?')) return;
    try {
        await api('DELETE', '/api/projects/' + encodeURIComponent(state.currentProject));
        toast('Project "' + state.currentProject + '" deleted', 'info');
        state.currentProject = '';
        state.currentFile = null;
        document.getElementById('editor').value = '';
        document.getElementById('fileIndicator').textContent = 'No file loaded';
        document.getElementById('saveStatus').textContent = '';

        state.dirty = false;
        state.settings.project_name = '';
        await saveSettings();
        await loadProjects();
    } catch (e) { toast('Error deleting project: ' + e.message, 'error'); }
}

async function onProjectChange() {
    state.currentProject = document.getElementById('projectSelect').value;
    state.currentFile = null;
    document.getElementById('fileIndicator').textContent = 'No file loaded';
    document.getElementById('editor').value = '';
    document.getElementById('saveStatus').textContent = '';

    state.dirty = false;
    await saveSettings(); await loadConfigs();
}

async function loadConfigs() {
    var list = document.getElementById('fileList');
    if (!state.currentProject) { list.innerHTML = '<div class="no-configs-msg">Select a project</div>'; return; }
    try {
        state.configs = await api('GET', '/api/projects/' + encodeURIComponent(state.currentProject) + '/configs');
        document.getElementById('configCount').textContent = state.configs.length + ' file' + (state.configs.length !== 1 ? 's' : '');
        if (state.configs.length === 0) { list.innerHTML = '<div class="no-configs-msg">No config files. Click "+ New" to create one.</div>'; return; }
        renderFileList();
    } catch (e) { list.innerHTML = '<div class="no-configs-msg">Error loading configs</div>'; }
}
// ========== META (tags, pins) ==========
function saveMeta() {
    localStorage.setItem('gcsim_meta', JSON.stringify(state.configMeta));
}

function getMeta(name) {
    var key = state.currentProject + '/' + name;
    if (!state.configMeta[key]) state.configMeta[key] = { tags: [], pinned: false, keywords: '' };
    return state.configMeta[key];
}

function toggleTag(name, tag) {
    var meta = getMeta(name);
    var idx = meta.tags.indexOf(tag);
    if (idx === -1) meta.tags.push(tag); else meta.tags.splice(idx, 1);
    saveMeta();
    renderFileList();
}

function togglePin(name) {
    var meta = getMeta(name);
    meta.pinned = !meta.pinned;
    saveMeta();
    renderFileList();
}

function renderTagChips(name) {
    var meta = getMeta(name);
    var html = '';
    if (meta.pinned) html += '<span class="tag-chip tag-pinned">📌</span>';
    var tagMap = { wip: 'tag-wip', best: 'tag-best', archive: 'tag-archive' };
    (meta.tags || []).forEach(function(t) {
        if (tagMap[t]) html += '<span class="tag-chip ' + tagMap[t] + '">' + t.toUpperCase() + '</span>';
    });
    return html;
}

// ========== SEARCH / FILTER ==========
function matchesSearch(config) {
    var q = (document.getElementById('configSearch').value || '').toLowerCase().trim();
    if (!q) return true;
    // Match filename
    if (config.name.toLowerCase().includes(q)) return true;
    // Match tags & pin
    var meta = getMeta(config.name);
    if ((meta.tags || []).some(function(t) { return t.includes(q); })) return true;
    if (q === 'pinned' && meta.pinned) return true;
    // Match content (characters / weapons)
    var content = (config.content || '').toLowerCase();
    return content.includes(q);
}

// ========== RENDER FILE LIST ==========
function renderFileList() {
    var list = document.getElementById('fileList');
    if (!state.configs || state.configs.length === 0) {
        list.innerHTML = '<div class="no-configs-msg">No config files.</div>';
        return;
    }

    // Sort: pinned first
    var sorted = state.configs.slice().sort(function(a, b) {
        var ap = getMeta(a.name).pinned ? 0 : 1;
        var bp = getMeta(b.name).pinned ? 0 : 1;
        return ap - bp;
    });

    var filtered = sorted.filter(matchesSearch);
    if (filtered.length === 0) {
        list.innerHTML = '<div class="no-configs-msg">No matches found.</div>';
        return;
    }

    list.innerHTML = '';
    filtered.forEach(function(f, idx) {
        var origIdx = state.configs.indexOf(f);
        var div = document.createElement('div');
        div.className = 'file-item';
        div.draggable = true;
        div.dataset.name = f.name;
        div.dataset.idx = origIdx;

        if (state.currentFile && state.currentFile.name === f.name) div.classList.add('active');

        var escName = f.name.replace(/'/g, "\\'");
        var meta = getMeta(f.name);

        var checkboxHtml = state.selectMode
            ? '<input type="checkbox" ' + (state.selectedConfigs.has(f.name) ? 'checked' : '') +
              ' onclick="event.stopPropagation();toggleSelectConfig(\'' + escName + '\', this)">'
            : '';

        div.innerHTML =
            checkboxHtml +
            '<span class="icon">📄</span>' +
            '<span class="filename">' + f.name.replace('.txt', '') + '</span>' +
            renderTagChips(f.name) +
            '<span class="file-actions">' +
                '<button onclick="event.stopPropagation();togglePin(\'' + escName + '\')" title="Pin">' + (meta.pinned ? '📌' : '📍') + '</button>' +
                '<button onclick="event.stopPropagation();showTagMenu(\'' + escName + '\', this)" title="Tag">🏷</button>' +
                '<button onclick="event.stopPropagation();moveConfigUp(\'' + escName + '\', ' + origIdx + ')" title="Up">▲</button>' +
                '<button onclick="event.stopPropagation();moveConfigDown(\'' + escName + '\', ' + origIdx + ')" title="Down">▼</button>' +
                '<button onclick="event.stopPropagation();duplicateConfigByName(\'' + escName + '\')" title="Duplicate">⧉</button>' +
                '<button onclick="event.stopPropagation();renameConfigByName(\'' + escName + '\')" title="Rename">✎</button>' +
                '<button onclick="event.stopPropagation();deleteConfigByName(\'' + escName + '\')" title="Delete">✕</button>' +
            '</span>';

        if (!state.selectMode) {
            div.onclick = (function(n) { return function() { loadConfig(n); }; })(f.name);
        }

        // Drag events
        div.addEventListener('dragstart', onDragStart);
        div.addEventListener('dragover',  onDragOver);
        div.addEventListener('dragleave', onDragLeave);
        div.addEventListener('drop',      onDrop);
        div.addEventListener('dragend',   onDragEnd);

        list.appendChild(div);
    });
}

// ========== TAG MENU (inline popover) ==========
var _tagMenuOpen = null;
function showTagMenu(name, btn) {
    if (_tagMenuOpen) { _tagMenuOpen.remove(); _tagMenuOpen = null; }
    var meta = getMeta(name);
    var menu = document.createElement('div');
    menu.style.cssText = 'position:fixed;z-index:3000;background:var(--bg-modal);border:1px solid var(--border-color);border-radius:6px;padding:6px;display:flex;flex-direction:column;gap:4px;min-width:120px;box-shadow:0 4px 12px rgba(0,0,0,0.4);';
    ['wip','best','archive'].forEach(function(tag) {
        var active = meta.tags.indexOf(tag) !== -1;
        var item = document.createElement('button');
        item.style.cssText = 'padding:4px 10px;border:none;border-radius:4px;cursor:pointer;font-size:12px;text-align:left;background:' + (active ? 'var(--bg-active)' : 'var(--bg-button)') + ';color:var(--text-primary);';
        item.textContent = (active ? '✓ ' : '  ') + tag.toUpperCase();
        item.onclick = function(e) { e.stopPropagation(); toggleTag(name, tag); menu.remove(); _tagMenuOpen = null; };
        menu.appendChild(item);
    });

    var rect = btn.getBoundingClientRect();
    menu.style.top = rect.bottom + 4 + 'px';
    menu.style.left = rect.left + 'px';
    document.body.appendChild(menu);
    _tagMenuOpen = menu;

    setTimeout(function() {
        document.addEventListener('click', function handler() { menu.remove(); _tagMenuOpen = null; document.removeEventListener('click', handler); }, { once: true });
    }, 0);
}

// ========== DRAG TO REORDER ==========
var _dragSrc = null;

function onDragStart(e) {
    _dragSrc = this;
    this.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
}
function onDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (this !== _dragSrc) this.classList.add('drag-over');
}
function onDragLeave() { this.classList.remove('drag-over'); }
function onDragEnd() {
    document.querySelectorAll('.file-item').forEach(function(el) {
        el.classList.remove('dragging', 'drag-over');
    });
}
async function onDrop(e) {
    e.preventDefault();
    this.classList.remove('drag-over');
    if (!_dragSrc || _dragSrc === this) return;
    var srcName = _dragSrc.dataset.name;
    var dstName = this.dataset.name;
    if (!srcName || !dstName) return;
    try {
        await api('POST', '/api/projects/' + encodeURIComponent(state.currentProject) + '/configs/swap', { nameA: srcName, nameB: dstName });
        await loadConfigs();
    } catch (e) { toast('Drag reorder failed', 'error'); }
}

// ========== SELECT MODE ==========
function toggleSelectMode() {
    state.selectMode = !state.selectMode;
    state.selectedConfigs.clear();
    document.getElementById('selectModeBtn').textContent = state.selectMode ? '✕ Cancel' : '☑ Select';
    document.getElementById('bulkActions').classList.toggle('show', state.selectMode);
    renderFileList();
}

function toggleSelectConfig(name, checkbox) {
    if (checkbox.checked) state.selectedConfigs.add(name);
    else state.selectedConfigs.delete(name);
}

function bulkSelectAll() {
    state.configs.forEach(function(c) { state.selectedConfigs.add(c.name); });
    renderFileList();
}

function bulkSelectNone() {
    state.selectedConfigs.clear();
    renderFileList();
}

async function bulkRun() {
    if (state.selectedConfigs.size === 0) { toast('No configs selected', 'error'); return; }
    var names = Array.from(state.selectedConfigs);
    try {
        var data = await api('POST', '/api/projects/' + encodeURIComponent(state.currentProject) + '/run', { filenames: names });
        state.runId = data.runId;
        setSimButtonsLoading(true);
        log('▶ Bulk run: ' + names.join(', '));
        startPolling();
        toggleSelectMode();
    } catch (e) { toast('Bulk run error: ' + e.message, 'error'); }
}

async function bulkOptimize() {
    if (state.selectedConfigs.size === 0) { toast('No configs selected', 'error'); return; }
    var names = Array.from(state.selectedConfigs);
    try {
        var data = await api('POST', '/api/projects/' + encodeURIComponent(state.currentProject) + '/optimize', { filenames: names });
        state.runId = data.runId;
        setSimButtonsLoading(true);
        log('⧃ Bulk optimize: ' + names.join(', '));
        startPolling();
        toggleSelectMode();
    } catch (e) { toast('Bulk optimize error: ' + e.message, 'error'); }
}

// ========== SHORTCUTS MODAL ==========
function showShortcutsModal() {
    document.getElementById('shortcutsModal').classList.add('show');
}

async function loadConfig(name) {
    if (state.dirty) {
        var save = confirm('Save changes to "' + state.currentFile.name + '" before switching?');
        if (save) {
            await saveCurrentConfig();
        } else {
            if (!confirm('Discard changes and switch?')) return;
        }
    }
    try {
        var data = await api('GET', '/api/projects/' + encodeURIComponent(state.currentProject) + '/configs/' + encodeURIComponent(name));
        state.currentFile = { name: data.name, content: data.content };
        window.aceEditor.setValue(data.content, -1); // -1 moves cursor to the start

        document.getElementById('fileIndicator').textContent = 'File: ' + data.name;
        document.getElementById('saveStatus').textContent = '';
        state.dirty = false;
        document.querySelectorAll('.file-item').forEach(function(el) {
            el.classList.remove('active');
            var fn = el.querySelector('.filename');
            if (fn && fn.textContent === name.replace('.txt', '')) el.classList.add('active');
        });
    } catch (e) { toast('Error loading config: ' + e.message, 'error'); }
}

async function saveCurrentConfig() {
    if (!state.currentFile) return;
    try {
        await api('POST', '/api/projects/' + encodeURIComponent(state.currentProject) + '/configs/' + encodeURIComponent(state.currentFile.name), { content: window.aceEditor.getValue() });
        state.currentFile.content = document.getElementById('editor').value;
        state.dirty = false;
        document.getElementById('saveStatus').textContent = '';
    } catch (e) { toast('Error saving: ' + e.message, 'error'); }
}

async function newConfig() {
    if (!state.currentProject) { toast('Select a project first', 'error'); return; }
    var name = prompt('Enter config name (e.g., Klee Nicole OL):');
    if (!name) return;
    try {
        var data = await api('PUT', '/api/projects/' + encodeURIComponent(state.currentProject) + '/configs', { filename: name });
        toast('Config "' + data.name + '" created', 'success');
        await loadConfigs(); await loadConfig(data.name);
    } catch (e) { toast('Error creating config: ' + e.message, 'error'); }
}

async function deleteConfigByName(name) {
    if (!confirm('Delete "' + name + '"?')) return;
    try {
        await api('DELETE', '/api/projects/' + encodeURIComponent(state.currentProject) + '/configs/' + encodeURIComponent(name));
        toast('Deleted "' + name + '"', 'info');
        if (state.currentFile && state.currentFile.name === name) {
            state.currentFile = null;
            document.getElementById('editor').value = '';

            document.getElementById('fileIndicator').textContent = 'No file loaded';
            document.getElementById('saveStatus').textContent = '';
            state.dirty = false;
        }
        await loadConfigs();
    } catch (e) { toast('Error deleting: ' + e.message, 'error'); }
}
function deleteConfig() { if (!state.currentFile) { toast('No file selected', 'error'); return; } deleteConfigByName(state.currentFile.name); }

async function renameConfigByName(name) {
    var newName = prompt('New name:', name.replace('.txt', ''));
    if (!newName) return;
    try {
        var data = await api('PUT', '/api/projects/' + encodeURIComponent(state.currentProject) + '/configs/' + encodeURIComponent(name) + '/rename', { newName: newName });
        toast('Renamed to "' + data.name + '"', 'success');
        if (state.currentFile && state.currentFile.name === name) state.currentFile.name = data.name;
        await loadConfigs();
    } catch (e) { toast('Error renaming: ' + e.message, 'error'); }
}
function renameConfig() { if (!state.currentFile) { toast('No file selected', 'error'); return; } renameConfigByName(state.currentFile.name); }

async function moveConfigUp(name, idx) {
    if (idx <= 0) { toast('Already at the top', 'info'); return; }
    var prevName = state.configs[idx - 1].name;
    try {
        await api('POST', '/api/projects/' + encodeURIComponent(state.currentProject) + '/configs/swap', { nameA: prevName, nameB: name });
        toast('Moved up', 'success');
        await loadConfigs();
    } catch (e) { toast('Error moving: ' + e.message, 'error'); }
}

async function moveConfigDown(name, idx) {
    if (idx >= state.configs.length - 1) { toast('Already at the bottom', 'info'); return; }
    var nextName = state.configs[idx + 1].name;
    try {
        await api('POST', '/api/projects/' + encodeURIComponent(state.currentProject) + '/configs/swap', { nameA: name, nameB: nextName });
        toast('Moved down', 'success');
        await loadConfigs();
    } catch (e) { toast('Error moving: ' + e.message, 'error'); }
}

async function duplicateConfigByName(name) {
    try { var data = await api('POST', '/api/projects/' + encodeURIComponent(state.currentProject) + '/configs/' + encodeURIComponent(name) + '/duplicate'); toast('Duplicated to "' + data.name + '"', 'success'); await loadConfigs(); }
    catch (e) { toast('Error duplicating: ' + e.message, 'error'); }
}
function duplicateConfig() { if (!state.currentFile) { toast('No file selected', 'error'); return; } duplicateConfigByName(state.currentFile.name); }

async function showExportModal() {
    if (!state.currentProject) { toast('Select a project first', 'error'); return; }
    closeModal('importModal');
    document.getElementById('exportModal').classList.add('show');
    document.getElementById('exportText').value = 'Loading...';
    try { var data = await api('GET', '/api/projects/' + encodeURIComponent(state.currentProject) + '/export'); document.getElementById('exportText').value = data.content; }
    catch (e) { document.getElementById('exportText').value = 'Error loading export: ' + e.message; toast('Export error: ' + e.message, 'error'); }
}
function copyExport() { var text = document.getElementById('exportText'); text.select(); document.execCommand('copy'); toast('Copied to clipboard!', 'success'); }
function downloadExport() {
    var blob = new Blob([document.getElementById('exportText').value], { type: 'text/plain' });
    var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = state.currentProject + '_configs_export.txt'; a.click(); URL.revokeObjectURL(blob);
    toast('Download started', 'success');
}
function showImportModal() {
    if (!state.currentProject) { toast('Select a project first', 'error'); return; }
    closeModal('exportModal'); document.getElementById('importModal').classList.add('show'); document.getElementById('importText').value = '';
}
async function importConfigs() {
    var content = document.getElementById('importText').value;
    if (!content) { toast('No content to import', 'error'); return; }
    try { var data = await api('POST', '/api/projects/' + encodeURIComponent(state.currentProject) + '/import', { content: content }); toast('Imported ' + data.imported + ' configs' + (data.skipped > 0 ? ' (' + data.skipped + ' skipped)' : ''), 'success'); closeModal('importModal'); await loadConfigs(); }
    catch (e) { toast('Import error: ' + e.message, 'error'); }
}
function closeModal(id) { document.getElementById(id).classList.remove('show'); }

async function validateSelected() {
    let filename = state.currentFile ? state.currentFile.name : null;
    if (!filename) {
        const activeItem = document.querySelector('.file-item.active');
        if (activeItem) { const nameEl = activeItem.querySelector('.filename'); if (nameEl) filename = nameEl.textContent + '.txt'; }
    }
    if (!filename) { toast('Select a config from the sidebar first', 'error'); return; }
    
    // Save the file first so the backend parses your latest typing
    if (state.dirty) await saveCurrentConfig();
    
    toast('Checking syntax...', 'info');
    try {
        const data = await api('POST', '/api/projects/' + encodeURIComponent(state.currentProject) + '/validate', { filename: filename });
        
        if (data.valid) {
            toast('No syntax errors found!', 'success');
            log(`\n[${filename}] Check: \n<span class="log-success">${escapeHtml(data.output)}</span>\n`);
            // Clear any old red errors from the editor
            if (window.aceEditor) window.aceEditor.session.clearAnnotations();
        } else {
            toast('Syntax errors found', 'error');
            
            // Try to extract the line number from gcsim's error output
            const lineMatch = data.output.match(/line\s+(\d+)|:(\d+):/i);
            if (lineMatch && window.aceEditor) {
                const lineNum = parseInt(lineMatch[1] || lineMatch[2]) - 1; // Ace lines are 0-indexed
                
                // Add a red X directly on the line in Ace Editor!
                window.aceEditor.session.setAnnotations([{
                    row: lineNum,
                    column: 0,
                    text: data.output,
                    type: "error"
                }]);
            }
            log(`\n[${filename}] Check Error: \n<span class="log-error">${escapeHtml(data.output)}</span>\n`);
        }
    } catch(e) {
        toast('Validation error: ' + e.message, 'error');
    }
}
// ========== SIM BUTTON LOADING SPINNERS ==========
var SIM_BUTTON_SELECTORS = [
    'button[onclick*="runSelected"]',
    'button[onclick*="runAll"]',
    'button[onclick*="optimizeSelected"]',
    'button[onclick*="optimizeAll"]'
];

function getActionButtons() {
    var toolbar = document.getElementById('toolbarContent');
    if (!toolbar) return [];
    var buttons = [];
    SIM_BUTTON_SELECTORS.forEach(function(sel) {
        var btn = toolbar.querySelector(sel);
        if (btn) buttons.push(btn);
    });
    return buttons;
}

function setSimButtonsLoading(loading) {
    var buttons = getActionButtons();
    buttons.forEach(function(btn) {
        if (loading) {
            if (btn.classList.contains('btn-loading')) return;
            btn.setAttribute('data-orig-text', btn.innerHTML);
            btn.classList.add('btn-loading');
            btn.innerHTML = '<span class="btn-loader"></span>';
        } else {
            btn.classList.remove('btn-loading');
            var origText = btn.getAttribute('data-orig-text');
            if (origText) {
                btn.innerHTML = origText;
            }
        }
    });
}

async function runSelected() {
    var filename = state.currentFile ? state.currentFile.name : null;
    if (!filename) {
        var activeItem = document.querySelector('.file-item.active');
        if (activeItem) { var nameEl = activeItem.querySelector('.filename'); if (nameEl) filename = nameEl.textContent + '.txt'; }
    }
    if (!filename) { toast('Select a config from the sidebar first', 'error'); return; }
    try { 
        var data = await api('POST', '/api/projects/' + encodeURIComponent(state.currentProject) + '/run', { filename: filename }); 
        state.runId = data.runId; 
        setSimButtonsLoading(true); 
        log('\u25B6 Run started: ' + filename); 
        startPolling(); 
    } catch (e) { toast('Run error: ' + e.message, 'error'); }
}

async function runAll() {
    if (!state.currentProject) { toast('Select a project', 'error'); return; }
    try { 
        var data = await api('POST', '/api/projects/' + encodeURIComponent(state.currentProject) + '/run', {}); 
        state.runId = data.runId; 
        setSimButtonsLoading(true); 
        log('\u25B6\u25B6 Running all configs sequentially...'); 
        startPolling(); 
    } catch (e) { toast('Run error: ' + e.message, 'error'); }
}

async function optimizeSelected() {
    var filename = state.currentFile ? state.currentFile.name : null;
    if (!filename) {
        var activeItem = document.querySelector('.file-item.active');
        if (activeItem) { var nameEl = activeItem.querySelector('.filename'); if (nameEl) filename = nameEl.textContent + '.txt'; }
    }
    if (!filename) { toast('Select a config from the sidebar first', 'error'); return; }
    try { 
        var data = await api('POST', '/api/projects/' + encodeURIComponent(state.currentProject) + '/optimize', { filename: filename }); 
        state.runId = data.runId; 
        setSimButtonsLoading(true); 
        log('\u29E3 Optimize started: ' + filename); 
        startPolling(); 
    } catch (e) { toast('Optimize error: ' + e.message, 'error'); }
}

async function optimizeAll() {
    if (!state.currentProject) { toast('Select a project', 'error'); return; }
    try { 
        var data = await api('POST', '/api/projects/' + encodeURIComponent(state.currentProject) + '/optimize', {}); 
        state.runId = data.runId; 
        setSimButtonsLoading(true); 
        log('\u29E3\u29E3 Optimizing all configs sequentially...'); 
        startPolling(); 
    } catch (e) { toast('Optimize error: ' + e.message, 'error'); }
}

async function terminateProcesses() {
    if (!state.runId) { log('No running processes'); return; }
    try { await api('POST', '/api/runs/' + state.runId + '/terminate'); log('\u25A0 Terminated'); if (state.pollInterval) { clearInterval(state.pollInterval); state.pollInterval = null; } state.runId = null; setSimButtonsLoading(false); }
    catch (e) { toast('Terminate error: ' + e.message, 'error'); }
}

let renderedLogLength = 0; // Tracks exactly how many log lines we've printed

function clearLog() { 
    document.getElementById('logContent').innerHTML = ''; 
    renderedLogLength = 0;
}

function log(msg, isHtml = false) { 
    var el = document.getElementById('logContent'); 
    if (isHtml) {
        el.insertAdjacentHTML('beforeend', msg + '\n');
    } else {
        el.insertAdjacentHTML('beforeend', escapeHtml(msg) + '\n');
    }
    el.scrollTop = el.scrollHeight; 
}

function startPolling() {
    if (state.pollInterval) clearInterval(state.pollInterval);
    
    // Auto-clear the UI log safely on new runs
    clearLog();

    state.pollInterval = setInterval(async function() {
        if (!state.runId) { clearInterval(state.pollInterval); state.pollInterval = null; return; }
        try {
            var data = await api('GET', '/api/runs/' + state.runId);
            var logEl = document.getElementById('logContent');
            
            // Only parse NEW logs that haven't been rendered yet
            if (data.log.length > renderedLogLength) {
                var newEntries = data.log.slice(renderedLogLength);
                renderedLogLength = data.log.length;
                
                var newText = newEntries.join('');
                var formattedLog = escapeHtml(newText);
                
                // Color formatting
                formattedLog = formattedLog.replace(/^(.*(?:error|panic|failed|invalid|exited with code).*)$/gmi, '<span class="log-error">$1</span>');
                formattedLog = formattedLog.replace(/^(.*Completed.*)$/gmi, '<span class="log-success">$1</span>');
                
                logEl.insertAdjacentHTML('beforeend', formattedLog);
                logEl.scrollTop = logEl.scrollHeight;
            }
            
            if (data.status === 'completed' || data.status === 'terminated') { 
                clearInterval(state.pollInterval); 
                state.pollInterval = null; 
                setSimButtonsLoading(false); 
                if (data.status === 'completed') toast('All ' + (data.mode === 'optimize' ? 'optimizations' : 'simulations') + ' completed', 'success'); 
                state.runId = null; 
            }
        } catch (e) { console.error('Poll error:', e); }
    }, 500);
}

var autosaveEnabled = true;

function toggleAutosave() {
    autosaveEnabled = document.getElementById('autosaveToggle').checked;
    localStorage.setItem('gcsim_autosave', autosaveEnabled);
    if (autosaveEnabled && state.currentFile && state.dirty) {
        saveCurrentConfig();
    }
}

function loadAutosavePreference() {
    var stored = localStorage.getItem('gcsim_autosave');
    if (stored !== null) {
        autosaveEnabled = stored === 'true';
        document.getElementById('autosaveToggle').checked = autosaveEnabled;
    }
}

var splitViewActive = false;
var splitLine = -1;
var isResizing = false;
var startX = 0;
var startWidth = 0;

function findSplitLine(text) {
    var lines = text.split('\n');
    for (var i = 0; i < lines.length; i++) {
        var line = lines[i];
        var activePos = line.indexOf('active');
        if (activePos !== -1) {
            var semicolonPos = line.indexOf(';', activePos);
            if (semicolonPos !== -1) {
                return { line: i, col: semicolonPos + 1 };
            }
        }
    }
    return -1;
}

function toggleSplitView() {
    var wrapper = document.getElementById('editorWrapper');
    var pane2 = document.getElementById('pane2');
    var editor2 = document.getElementById('editor2');
    
    if (splitViewActive) {
        // Merge back
        var text1 = document.getElementById('editor').value;
        var text2 = editor2.value;
        document.getElementById('editor').value = text2 + text1;
        pane2.style.display = 'none';
        wrapper.classList.remove('split');
        splitViewActive = false;

        state.dirty = true;
        toast('Split view closed', 'info');
        return;
    }
    
    var text = document.getElementById('editor').value;
    var splitInfo = findSplitLine(text);
    if (splitInfo < 0) {
        toast('No active(...); line found to split at', 'error');
        return;
    }
    
    var splitIndex = 0;
    var lines = text.split('\n');
    for (var i = 0; i < splitInfo.line; i++) {
        splitIndex += lines[i].length + 1;
    }
    splitIndex += splitInfo.col;
    
    var part1 = text.substring(0, splitIndex);
    var part2 = text.substring(splitIndex);
    
    document.getElementById('editor').value = part2;
    editor2.value = part1;
    
    pane2.style.display = 'block';
    wrapper.classList.add('split');
    splitViewActive = true;
    

    state.dirty = true;
    toast('Split view opened', 'info');
}
async function showResultsModal() {
    if (!state.currentProject) { toast('Select a project first', 'error'); return; }
    document.getElementById('resultsModal').classList.add('show');
    const tbody = document.getElementById('resultsTableBody');
    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding: 15px;">Loading...</td></tr>';
    
    try {
        const results = await api('GET', '/api/projects/' + encodeURIComponent(state.currentProject) + '/results');
        tbody.innerHTML = '';
        if (results.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding: 15px; color: var(--text-muted);">No results found. Run a simulation first.</td></tr>';
            return;
        }
        results.forEach(r => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${escapeHtml(r.configName)}</td>
                <td><span style="padding: 2px 6px; border-radius: 3px; background: ${r.mode === 'Optimize' ? 'var(--bg-btn-opt)' : 'var(--bg-active)'}; font-size: 10px;">${r.mode}</span></td>
                <td style="font-family: monospace; font-size: 14px; font-weight: bold; color: var(--toast-success-border);">${Math.round(r.dps).toLocaleString()}</td>
                <td style="text-align:right;">
                    <button class="action-btn" onclick="openGcsimViewer('${escapeHtml(r.filename)}')">View Web Data</button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    } catch(e) {
        tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; padding:15px; color: var(--toast-error-border);">Error loading results</td></tr>`;
    }
}

async function openGcsimViewer(filename) {
    toast('Opening in gcsim.app...', 'info');
    try {
        await api('POST', '/api/view/' + encodeURIComponent(state.currentProject) + '/' + encodeURIComponent(filename));
    } catch(e) {
        toast('Failed to open viewer', 'error');
    }
}




document.addEventListener('keydown', function(e) {
    var ctrl = e.ctrlKey || e.metaKey;

    // Don't fire when typing in an input/textarea outside the editor
    var tag = document.activeElement.tagName;
    var inInput = (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') && !document.activeElement.classList.contains('editor-textarea');

    if (ctrl && e.key === 's')                         { e.preventDefault(); if (state.currentFile) saveCurrentConfig(); return; }
    if (ctrl && e.shiftKey && e.key === 'F')           { e.preventDefault(); formatConfig(); return; }
    if (ctrl && e.shiftKey && e.key === 'V')           { e.preventDefault(); toggleSplitView(); return; }
    if (ctrl && e.shiftKey && e.key === 'K')           { e.preventDefault(); validateSelected(); return; }
    if (ctrl && e.shiftKey && e.key === 'N' && !inInput) { e.preventDefault(); newConfig(); return; }
    if (ctrl && e.key === 'd' && !inInput)             { e.preventDefault(); duplicateConfig(); return; }
    if (ctrl && e.key === 'b' && !inInput)             { e.preventDefault(); toggleSidebar(); return; }
    if (ctrl && e.key === 'l' && !inInput)             { e.preventDefault(); toggleLog(); return; }
    if (ctrl && e.key === '/')                         { e.preventDefault(); showShortcutsModal(); return; }
    if (ctrl && e.key === 'Enter' && !e.shiftKey)      { e.preventDefault(); runSelected(); return; }
    if (ctrl && e.shiftKey && e.key === 'Enter')       { e.preventDefault(); runAll(); return; }
    if (ctrl && e.shiftKey && e.key === 'O')           { e.preventDefault(); optimizeSelected(); return; }
    if (e.key === 'Escape')                            { terminateProcesses(); return; }

    // Navigate configs with Ctrl+Up / Ctrl+Down
    if (ctrl && (e.key === 'ArrowUp' || e.key === 'ArrowDown') && !inInput) {
        e.preventDefault();
        if (!state.configs || state.configs.length === 0) return;
        var idx = state.currentFile ? state.configs.findIndex(function(c) { return c.name === state.currentFile.name; }) : -1;
        if (e.key === 'ArrowUp')   idx = Math.max(0, idx - 1);
        if (e.key === 'ArrowDown') idx = Math.min(state.configs.length - 1, idx + 1);
        if (idx >= 0) loadConfig(state.configs[idx].name);
    }
});

// Resizer functionality
document.getElementById('resizer').addEventListener('mousedown', function(e) {
    isResizing = true;
    startX = e.clientX;
    startWidth = document.getElementById('pane1').getBoundingClientRect().width;
    document.body.style.cursor = 'col-resize';
    e.preventDefault();
});

document.addEventListener('mousemove', function(e) {
    if (!isResizing) return;
    var diff = e.clientX - startX;
    var newWidth = startWidth + diff;
    var wrapper = document.getElementById('editorWrapper');
    var wrapperWidth = wrapper.getBoundingClientRect().width;
    var minWidth = 100;
    var maxWidth = wrapperWidth - 100;
    
    if (newWidth < minWidth) newWidth = minWidth;
    if (newWidth > maxWidth) newWidth = maxWidth;
    
    document.getElementById('pane1').style.width = newWidth + 'px';
    document.getElementById('pane2').style.width = (wrapperWidth - newWidth - 4) + 'px'; // 4px for resizer
});

document.addEventListener('mouseup', function() {
    if (isResizing) {
        isResizing = false;
        document.body.style.cursor = 'default';
    }
});

async function init() {
    loadAutosavePreference();
    // Apply saved themes and fonts
    applyBgTheme(state.currentBgTheme);
    applyTextTheme(state.currentTextTheme);
    applyFontSize(state.editorFontSize);
    
    // Load state
    await loadSettings();
    await loadProjects();

    
    // Load runtimes into the dropdown immediately
    await loadRuntimes();
    
    const select = document.getElementById('runtimeSelect');
    if (!select.value) {
        select.innerHTML = '<option value="">Checking for installation...</option>';
        setTimeout(loadRuntimes, 3000);
        setTimeout(loadRuntimes, 8000);
    }
}

// Make sure init is called
init();
