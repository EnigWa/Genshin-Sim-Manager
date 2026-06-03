var state = {
    currentProject: '',
    currentFile: null,
    currentFile2: null,     // Track secondary file for compare mode
    splitMode: 'none',      // 'none', 'split-active', 'compare'
    dirty2: false,
    editorTimeout2: null,
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
    editorFontSize: parseInt(localStorage.getItem('gcsim_fontsize')) || 13,
    autoOpenViewer: localStorage.getItem('gcsim_auto_open_viewer') === 'true',
    configDps: {},
    sortMode: 'original'
};

var SECTION_NAMES = new Set([
    'options', 'characters', 'target', 'team', 'settings',
    'energy', 'active', 'simulation', 'enemy', 'hash', 'gcsl'
]);
window.aceEditor = ace.edit("editor");
    
    window.aceEditor.session.setMode("ace/mode/gcsim");
    window.aceEditor.setOptions({
        fontSize: (state.editorFontSize || 13) + "px", 
        showPrintMargin: false,
        wrap: true,
        indentedSoftWrap: false
    });

    window.aceEditor2 = ace.edit("editor2");
    
    window.aceEditor2.session.setMode("ace/mode/gcsim");
    window.aceEditor2.setOptions({
        fontSize: (state.editorFontSize || 13) + "px",
        showPrintMargin: false,
        wrap: true,
        indentedSoftWrap: false
    });

    // Bind Autosave to Ace's change event for Pane 1
    function onEditorChange() {
        if (window.aceEditor) window.aceEditor.session.clearAnnotations(); 
        state.dirty = true;
        if (state.editorTimeout) clearTimeout(state.editorTimeout);
        if (typeof autosaveEnabled !== 'undefined' && autosaveEnabled) {
            state.editorTimeout = setTimeout(function() { 
                if (state.currentFile) saveCurrentConfig(); 
            }, 1000);
        }
    }
    
    // Bind Autosave for Pane 2
    function onEditor2Change() {
        if (window.aceEditor2) window.aceEditor2.session.clearAnnotations();
        if (state.splitMode === 'compare') {
            state.dirty2 = true;
            if (state.editorTimeout2) clearTimeout(state.editorTimeout2);
            if (typeof autosaveEnabled !== 'undefined' && autosaveEnabled) {
                state.editorTimeout2 = setTimeout(function() {
                    if (state.currentFile2) saveConfig2();
                }, 1000);
            }
        } else if (state.splitMode === 'split-active') {
            // In split-active, modifying pane 2 dirties the single combined file
            state.dirty = true;
            if (state.editorTimeout) clearTimeout(state.editorTimeout);
            if (typeof autosaveEnabled !== 'undefined' && autosaveEnabled) {
                state.editorTimeout = setTimeout(function() { 
                    if (state.currentFile) saveCurrentConfig(); 
                }, 1000);
            }
        }
    }
    
    window.aceEditor.session.on('change', onEditorChange);
    window.aceEditor2.session.on('change', onEditor2Change);

// ========== THEME SYSTEM ==========
var ACE_THEME_MAP = {
    'default':     'ace/theme/tomorrow_night',
    'pitch-black': 'ace/theme/idle_fingers',
    'red':         'ace/theme/tomorrow_night',
    'blue':        'ace/theme/tomorrow_night_blue',
    'silver':      'ace/theme/chrome',
};

var ACE_TEXT_MAP = {
    'light-text':  null,
    'light-blue':  null,
    'crimson':     null,  
    'dark-text':   'ace/theme/chrome',
};

function getAceTheme() {
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
    if (state.splitMode === 'split-active') {
        toast('Cannot format while in Split-Active mode. Close split first.', 'warning');
        return;
    }
    
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
    result = result.replace(/(\w[\w.%]*)\s*=\s*([^\s;]+)/g, '$1=$2');
    result = result.replace(/(\w[\w.%]*)\s*:\s*(\d+(?:\.\d+)?)/g, '$1:$2');
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
    window.aceEditor.session.setValue(result);
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
            const opt = document.createElement('option');
            opt.value = r.id;
            opt.textContent = r.name;
            if (r.id === data.active) opt.selected = true;
            select.appendChild(opt);

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

const oldShowSettings = showSettingsModal;
showSettingsModal = function() {
    oldShowSettings();
    loadRuntimes();
    loadOfficialReleases();
};

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
        
        list.innerHTML = res.directories.map(d => `
            <div style="padding:4px; cursor:pointer; color:var(--text-secondary);" onclick="navigateBrowseToPath(decodeURIComponent('${encodeURIComponent(d.path)}'))">
                📁 ${escapeHtml(d.name)}
            </div>
        `).join('');
        
        list.innerHTML += res.files.map(f => {
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
        window.aceEditor.setValue('');
        closeSplit(true);

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
        
        window.aceEditor.setValue('');
        closeSplit(true);

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
    window.aceEditor.setValue('');
    closeSplit(true);

    document.getElementById('fileIndicator').textContent = 'No file loaded';
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
        await loadProjectDps();
        renderFileList();
    } catch (e) { list.innerHTML = '<div class="no-configs-msg">Error loading configs</div>'; }
}

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

function matchesSearch(config) {
    var q = (document.getElementById('configSearch').value || '').toLowerCase().trim();
    if (!q) return true;
    if (config.name.toLowerCase().includes(q)) return true;
    var meta = getMeta(config.name);
    if ((meta.tags || []).some(function(t) { return t.includes(q); })) return true;
    if (q === 'pinned' && meta.pinned) return true;
    var content = (config.content || '').toLowerCase();
    return content.includes(q);
}

async function loadProjectDps() {
    if (!state.currentProject) return;
    try {
        const results = await api('GET', '/api/projects/' + encodeURIComponent(state.currentProject) + '/results');
        state.configDps = {};
        results.forEach(function(r) {
            state.configDps[r.configName] = r.dps;
        });
    } catch(e) {}
}

function onSortModeChange() {
    var select = document.getElementById('sortSelect');
    state.sortMode = select.value;
    var modeText = {
        'original': 'original order',
        'alphabetical': 'alphabetical (A-Z)',
        'dps': 'DPS (descending)'
    }[state.sortMode] || 'original order';
    toast('Sorting by ' + modeText, 'info');
    renderFileList();
}

function getDpsDisplay(name) {
    var key = name.replace('.txt', '');
    var dps = state.configDps[key];
    if (dps !== undefined && dps > 0) {
        return '<span class="dps-badge">' + Math.round(dps).toLocaleString() + '</span>';
    }
    return '';
}

function renderFileList() {
    var list = document.getElementById('fileList');
    if (!state.configs || state.configs.length === 0) {
        list.innerHTML = '<div class="no-configs-msg">No config files.</div>';
        return;
    }

    var sorted = state.configs.slice();
    
    if (state.sortMode === 'dps') {
        sorted.sort(function(a, b) {
            var ap = getMeta(a.name).pinned ? 0 : 1;
            var bp = getMeta(b.name).pinned ? 0 : 1;
            if (ap !== bp) return ap - bp;
            var keyA = a.name.replace('.txt', '');
            var keyB = b.name.replace('.txt', '');
            var dpsA = state.configDps[keyA] || 0;
            var dpsB = state.configDps[keyB] || 0;
            return dpsB - dpsA;
        });
    } else if (state.sortMode === 'alphabetical') {
        sorted.sort(function(a, b) {
            var ap = getMeta(a.name).pinned ? 0 : 1;
            var bp = getMeta(b.name).pinned ? 0 : 1;
            if (ap !== bp) return ap - bp;
            return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
        });
    } else {
        sorted.sort(function(a, b) {
            var ap = getMeta(a.name).pinned ? 0 : 1;
            var bp = getMeta(b.name).pinned ? 0 : 1;
            return ap - bp;
        });
    }

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
            getDpsDisplay(f.name) +
            renderTagChips(f.name) +
            '<span class="file-actions">' +
                '<button onclick="event.stopPropagation();openToSide(\'' + escName + '\')" title="Compare (Open in side pane)">◫</button>' +
                '<button onclick="event.stopPropagation();togglePin(\'' + escName + '\')" title="Pin">' + (meta.pinned ? '📌' : '📍') + '</button>' +
                '<button onclick="event.stopPropagation();showTagMenu(\'' + escName + '\', this)" title="Tag">🏷</button>' +
                '<button onclick="event.stopPropagation();duplicateConfigByName(\'' + escName + '\')" title="Duplicate">⧉</button>' +
                '<button onclick="event.stopPropagation();renameConfigByName(\'' + escName + '\')" title="Rename">✎</button>' +
                '<button onclick="event.stopPropagation();deleteConfigByName(\'' + escName + '\')" title="Delete">✕</button>' +
            '</span>';

        if (!state.selectMode) {
            div.onclick = (function(n) { return function() { loadConfig(n); }; })(f.name);
        }

        div.addEventListener('dragstart', onDragStart);
        div.addEventListener('dragover',  onDragOver);
        div.addEventListener('dragleave', onDragLeave);
        div.addEventListener('drop',      onDrop);
        div.addEventListener('dragend',   onDragEnd);

        list.appendChild(div);
    });
}

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
        
        window.aceEditor.session.off('change', onEditorChange);
        window.aceEditor.setValue(data.content, -1);
        window.aceEditor.session.on('change', onEditorChange);

        document.getElementById('fileIndicator').textContent = 'File: ' + data.name;
        document.getElementById('saveStatus').textContent = '';
        state.dirty = false;
        
        if (state.splitMode === 'compare') {
            document.getElementById('pane1Label').textContent = data.name;
        } else if (state.splitMode === 'split-active') {
            closeSplit(true);
        }

        renderFileList();
    } catch (e) { toast('Error loading config: ' + e.message, 'error'); }
}

async function saveCurrentConfig() {
    if (!state.currentFile) return;
    try {
        var contentToSave = window.aceEditor.getValue();
        if (state.splitMode === 'split-active' && window.aceEditor2) {
            var text1 = window.aceEditor.getValue();
            var text2 = window.aceEditor2.getValue();
            contentToSave = text2 + text1;
        }
        await api('POST', '/api/projects/' + encodeURIComponent(state.currentProject) + '/configs/' + encodeURIComponent(state.currentFile.name), { content: contentToSave });
        state.currentFile.content = contentToSave;
        state.dirty = false;
        document.getElementById('saveStatus').textContent = '';
    } catch (e) { toast('Error saving: ' + e.message, 'error'); }
}

async function saveConfig2() {
    if (!state.currentFile2 || state.splitMode !== 'compare') return;
    try {
        var contentToSave = window.aceEditor2.getValue();
        await api('POST', '/api/projects/' + encodeURIComponent(state.currentProject) + '/configs/' + encodeURIComponent(state.currentFile2.name), { content: contentToSave });
        state.currentFile2.content = contentToSave;
        state.dirty2 = false;
    } catch (e) { toast('Error saving secondary config: ' + e.message, 'error'); }
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
            window.aceEditor.setValue('');
            document.getElementById('fileIndicator').textContent = 'No file loaded';
            document.getElementById('saveStatus').textContent = '';
            state.dirty = false;
        }
        if (state.currentFile2 && state.currentFile2.name === name) {
            closeSplit(true);
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
        if (state.currentFile2 && state.currentFile2.name === name) state.currentFile2.name = data.name;
        
        if (state.currentFile) document.getElementById('fileIndicator').textContent = 'File: ' + state.currentFile.name;
        if (state.splitMode === 'compare') {
            if (state.currentFile) document.getElementById('pane1Label').textContent = state.currentFile.name;
            if (state.currentFile2) document.getElementById('pane2Label').textContent = state.currentFile2.name;
        }
        
        await loadConfigs();
    } catch (e) { toast('Error renaming: ' + e.message, 'error'); }
}
function renameConfig() { if (!state.currentFile) { toast('No file selected', 'error'); return; } renameConfigByName(state.currentFile.name); }

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
    
    if (state.dirty) await saveCurrentConfig();
    if (state.splitMode === 'compare' && state.dirty2) await saveConfig2();
    
    toast('Checking syntax...', 'info');
    try {
        const data = await api('POST', '/api/projects/' + encodeURIComponent(state.currentProject) + '/validate', { filename: filename });
        
        if (data.valid) {
            toast('No syntax errors found!', 'success');
            log(`\n[${filename}] Check: \n<span class="log-success">${escapeHtml(data.output)}</span>\n`);
            if (window.aceEditor) window.aceEditor.session.clearAnnotations();
        } else {
            toast('Syntax errors found', 'error');
            const lineMatch = data.output.match(/line\s+(\d+)|:(\d+):/i);
            if (lineMatch && window.aceEditor) {
                const lineNum = parseInt(lineMatch[1] || lineMatch[2]) - 1; 
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

let renderedLogLength = 0; 

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
    clearLog();

    state.pollInterval = setInterval(async function() {
        if (!state.runId) { clearInterval(state.pollInterval); state.pollInterval = null; return; }
        try {
            var data = await api('GET', '/api/runs/' + state.runId);
            var logEl = document.getElementById('logContent');
            
            if (data.log.length > renderedLogLength) {
                var newEntries = data.log.slice(renderedLogLength);
                renderedLogLength = data.log.length;
                
                var newText = newEntries.join('');
                var formattedLog = escapeHtml(newText);
                
                formattedLog = formattedLog.replace(/^(.*(?:error|panic|failed|invalid|exited with code).*)$/gmi, '<span class="log-error">$1</span>');
                formattedLog = formattedLog.replace(/^(.*Completed.*)$/gmi, '<span class="log-success">$1</span>');
                
                logEl.insertAdjacentHTML('beforeend', formattedLog);
                logEl.scrollTop = logEl.scrollHeight;
            }
            
            if (data.status === 'completed' || data.status === 'terminated') { 
                clearInterval(state.pollInterval); 
                state.pollInterval = null; 
                setSimButtonsLoading(false); 
                if (data.status === 'completed') {
                    toast('All ' + (data.mode === 'optimize' ? 'optimizations' : 'simulations') + ' completed', 'success');
                    setTimeout(function() {
                        loadProjectDps().then(function() {
                            renderFileList();
                        });
                    }, 500);
                    if (state.autoOpenViewer) {
                        setTimeout(function() {
                            api('GET', '/api/projects/' + encodeURIComponent(state.currentProject) + '/results').then(function(results) {
                                if (results.length > 0) {
                                    openGcsimViewer(results[0].filename);
                                }
                            }).catch(function() {});
                        }, 500);
                    }
                }
                state.runId = null; 
            }
        } catch (e) { console.error('Poll error:', e); }
    }, 500);
}

var autosaveEnabled = true;

function toggleAutosave() {
    autosaveEnabled = document.getElementById('autosaveToggle').checked;
    localStorage.setItem('gcsim_autosave', autosaveEnabled);
    if (autosaveEnabled) {
        if (state.currentFile && state.dirty) saveCurrentConfig();
        if (state.splitMode === 'compare' && state.currentFile2 && state.dirty2) saveConfig2();
    }
}

function loadAutosavePreference() {
    var stored = localStorage.getItem('gcsim_autosave');
    if (stored !== null) {
        autosaveEnabled = stored === 'true';
        document.getElementById('autosaveToggle').checked = autosaveEnabled;
    }
}

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

// Opens the requested file in the secondary editor pane (Side-by-Side compare)
async function openToSide(name) {
    if (state.splitMode === 'split-active') {
        closeSplit();
    } else if (state.splitMode === 'compare') {
        if (state.dirty2) {
            if(confirm('Save changes to "' + state.currentFile2.name + '"?')) await saveConfig2();
        }
    }

    try {
        var data = await api('GET', '/api/projects/' + encodeURIComponent(state.currentProject) + '/configs/' + encodeURIComponent(name));
        state.currentFile2 = { name: data.name, content: data.content };
        
        window.aceEditor2.session.off('change', onEditor2Change);
        window.aceEditor2.setValue(data.content, -1);
        window.aceEditor2.session.on('change', onEditor2Change);
        
        state.dirty2 = false;

        document.getElementById('pane2').style.display = 'block';
        document.getElementById('resizer').style.display = 'block';
        document.getElementById('editorWrapper').classList.add('split');
        state.splitMode = 'compare';
        document.getElementById('closeSplitBtn').style.display = 'inline-block';

        document.getElementById('pane1Label').textContent = state.currentFile ? state.currentFile.name : 'Editor 1';
        document.getElementById('pane2Label').textContent = data.name;

        if (window.aceEditor) window.aceEditor.resize();
        if (window.aceEditor2) window.aceEditor2.resize();
        
        toast('Opened ' + name + ' side-by-side', 'success');
    } catch (e) { toast('Error loading config to side: ' + e.message, 'error'); }
}

function closeSplit(force = false) {
    if (state.splitMode === 'none') return;
    
    if (state.splitMode === 'split-active') {
        var text1 = window.aceEditor.getValue();
        var text2 = window.aceEditor2.getValue();
        window.aceEditor.session.off('change', onEditorChange);
        window.aceEditor.setValue(text2 + text1, -1);
        window.aceEditor.session.on('change', onEditorChange);
        state.dirty = true;
        if (state.currentFile) saveCurrentConfig();
    } else if (state.splitMode === 'compare') {
        if (state.dirty2 && !force) {
            if(confirm('Save changes to "' + state.currentFile2.name + '"?')) saveConfig2();
        }
    }
    
    document.getElementById('pane2').style.display = 'none';
    document.getElementById('resizer').style.display = 'none';
    document.getElementById('editorWrapper').classList.remove('split');
    state.splitMode = 'none';
    state.currentFile2 = null;
    document.getElementById('closeSplitBtn').style.display = 'none';
    document.getElementById('pane1Label').textContent = '';
    document.getElementById('pane2Label').textContent = '';
    
    if (window.aceEditor) window.aceEditor.resize();
}

function toggleSplitView() {
    if (state.splitMode !== 'none') {
        closeSplit();
        toast('Split view closed', 'info');
        return;
    }
    
    var text = window.aceEditor.getValue();
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
    
    window.aceEditor.session.off('change', onEditorChange);
    window.aceEditor2.session.off('change', onEditor2Change);
    
    window.aceEditor.setValue(part2, -1);
    window.aceEditor2.setValue(part1, -1);
    
    window.aceEditor.session.on('change', onEditorChange);
    window.aceEditor2.session.on('change', onEditor2Change);
    
    document.getElementById('pane2').style.display = 'block';
    document.getElementById('resizer').style.display = 'block';
    document.getElementById('editorWrapper').classList.add('split');
    state.splitMode = 'split-active';
    document.getElementById('closeSplitBtn').style.display = 'inline-block';
    
    document.getElementById('pane1Label').textContent = 'Action List (after active)';
    document.getElementById('pane2Label').textContent = 'Characters / Team (before active)';
    
    state.dirty = true;
    
    if (window.aceEditor) window.aceEditor.resize();
    if (window.aceEditor2) window.aceEditor2.resize();
    
    toast('Split view opened', 'info');
}

function onAutoOpenChange() {
    state.autoOpenViewer = document.getElementById('autoOpenViewer').checked;
    localStorage.setItem('gcsim_auto_open_viewer', state.autoOpenViewer);
    toast(state.autoOpenViewer ? 'Auto-open viewer enabled' : 'Auto-open viewer disabled', 'info');
}

async function showResultsModal() {
    if (!state.currentProject) { toast('Select a project first', 'error'); return; }
    document.getElementById('resultsModal').classList.add('show');
    document.getElementById('autoOpenViewer').checked = state.autoOpenViewer;
    const tbody = document.getElementById('resultsTableBody');
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding: 15px;">Loading...</td></tr>';
    
    try {
        const results = await api('GET', '/api/projects/' + encodeURIComponent(state.currentProject) + '/results');
        tbody.innerHTML = '';
        document.getElementById('resultCount').textContent = results.length + ' result' + (results.length !== 1 ? 's' : '');
        if (results.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding: 15px; color: var(--text-muted);">No results found. Run a simulation first.</td></tr>';
            return;
        }
        results.forEach(r => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td style="padding-right:0;"><input type="checkbox" class="result-checkbox" value="${escapeHtml(r.filename)}"></td>
                <td>${escapeHtml(r.configName)}</td>
                <td><span style="padding: 2px 6px; border-radius: 3px; background: ${r.mode === 'Optimize' ? 'var(--bg-btn-opt)' : 'var(--bg-active)'}; font-size: 10px;">${r.mode}</span></td>
                <td style="font-family: monospace; font-size: 14px; font-weight: bold; color: var(--toast-success-border);">${Math.round(r.dps).toLocaleString()}</td>
                <td style="text-align:right;">
                    <button class="action-btn" onclick="openGcsimViewer('${escapeHtml(r.filename)}')">Open Viewer</button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    } catch(e) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:15px; color: var(--toast-error-border);">Error loading results</td></tr>`;
    }
}

function toggleAllResults(source) {
    document.querySelectorAll('.result-checkbox').forEach(cb => cb.checked = source.checked);
}

// Opens multiple selected runs in viewer tabs
async function viewSelectedResults() {
    const cbs = document.querySelectorAll('.result-checkbox:checked');
    if (cbs.length === 0) {
        toast('No results selected', 'error');
        return;
    }
    toast(`Opening ${cbs.length} viewers...`, 'info');
    for (let cb of cbs) {
        openGcsimViewer(cb.value);
        await new Promise(r => setTimeout(r, 300)); // small delay to prevent browser tab drop
    }
}

async function openGcsimViewer(filename) {
    toast('Opening in gcsim.app viewer...', 'info');
    try {
        await api('POST', '/api/view/' + encodeURIComponent(state.currentProject) + '/' + encodeURIComponent(filename));
    } catch(e) {
        toast('Failed to open viewer', 'error');
    }
}

async function clearResults() {
    if (!state.currentProject) return;
    if (!confirm('Are you sure you want to delete ALL result files for this project?')) return;
    try {
        const data = await api('POST', '/api/projects/' + encodeURIComponent(state.currentProject) + '/results/clear');
        toast('Cleared ' + data.deleted + ' result file(s)', 'info');
        showResultsModal(); 
    } catch(e) {
        toast('Failed to clear results: ' + e.message, 'error');
    }
}

document.addEventListener('keydown', function(e) {
    var ctrl = e.ctrlKey || e.metaKey;
    var tag = document.activeElement.tagName;
    var inInput = (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') && !document.activeElement.classList.contains('editor-textarea');

    if (ctrl && e.key === 's')                         { e.preventDefault(); if (state.currentFile) saveCurrentConfig(); if (state.splitMode === 'compare' && state.currentFile2) saveConfig2(); return; }
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
    document.getElementById('pane2').style.width = (wrapperWidth - newWidth - 4) + 'px'; 
});

document.addEventListener('mouseup', function() {
    if (isResizing) {
        isResizing = false;
        document.body.style.cursor = 'default';
    }
});

async function init() {
    loadAutosavePreference();
    applyBgTheme(state.currentBgTheme);
    applyTextTheme(state.currentTextTheme);
    applyFontSize(state.editorFontSize);
    
    await loadSettings();
    await loadProjects();

    await loadRuntimes();
    
    const select = document.getElementById('runtimeSelect');
    if (!select.value) {
        select.innerHTML = '<option value="">Checking for installation...</option>';
        setTimeout(loadRuntimes, 3000);
        setTimeout(loadRuntimes, 8000);
    }
}
// ========== NATIVE TIMELINE VIEWER & FILTERS ==========
// Define layout exactly like the gcsim.app screenshot
const TL_EVENT_CATEGORIES = [
    ["action", "warning", "element", "player", "hurt", "calc", "weapon", "debug", "hook", "reaction"],
    ["damage", "status", "shield", "user", "pre_damage_mods", "snapshot", "enemy", "sim", "procs", "snapshot_mods"],
    ["energy", "cooldown", "construct", "heal", "icd", "character", "artifact", "hitlag", "task", "queue"]
];

const TIMELINE_PRESETS = {
    'Simple': ["action","damage","energy","status","element","shield","construct","cooldown"],
    'Advanced': ["action","damage","energy","status","element","shield","construct","cooldown","icd","reaction","calc","snapshot","snapshot_mods","procs","weapon","artifact","character","heal"],
    'Verbose': TL_EVENT_CATEGORIES.flat(),
    'Debug': TL_EVENT_CATEGORIES.flat(),
    'Clear': []
};

// Store current data in memory so we don't have to re-fetch when clicking filters
state.activeTimelineData = [];
state.timelineFilters = new Set(JSON.parse(localStorage.getItem('gcsim_timeline_filters') || JSON.stringify(TIMELINE_PRESETS['Simple'])));

function initFilterUI() {
    const grid = document.getElementById('tlFilterGrid');
    // FIX: Check for actual child elements instead of raw innerHTML to ignore whitespace/comments
    if (grid.children.length > 0) return; 
    
    let html = '';
    for (let i = 0; i < 3; i++) {
        html += `<div style="display:flex; flex-direction:column; gap:6px;">`;
        TL_EVENT_CATEGORIES[i].forEach(ev => {
            let colorClass = '';
            if (['action', 'calc', 'enemy'].includes(ev)) colorClass = 'tl-color-red';
            else if (['damage', 'element', 'snapshot'].includes(ev)) colorClass = 'tl-color-blue';
            else if (['status'].includes(ev)) colorClass = 'tl-color-purple';
            else if (['energy', 'cooldown', 'icd'].includes(ev)) colorClass = 'tl-color-teal';
            else if (['hitlag'].includes(ev)) colorClass = 'tl-color-orange';
            
            const isChecked = state.timelineFilters.has(ev) ? 'checked' : '';
            html += `<label class="tl-filter-label ${colorClass}">
                <input type="checkbox" value="${ev}" class="tl-filter-cb" onchange="toggleTimelineFilter('${ev}', this.checked)" ${isChecked}>
                ${ev}
            </label>`;
        });
        html += `</div>`;
    }
    grid.innerHTML = html;
}


function toggleFilterPanel() {
    initFilterUI();
    const p = document.getElementById('timelineFilterPanel');
    p.style.display = p.style.display === 'none' ? 'block' : 'none';
}

function toggleTimelineFilter(eventName, checked) {
    if (checked) state.timelineFilters.add(eventName);
    else state.timelineFilters.delete(eventName);
    localStorage.setItem('gcsim_timeline_filters', JSON.stringify(Array.from(state.timelineFilters)));
    updateTimelineView();
}

function applyTimelinePreset(presetName) {
    state.timelineFilters = new Set(TIMELINE_PRESETS[presetName] || []);
    localStorage.setItem('gcsim_timeline_filters', JSON.stringify(Array.from(state.timelineFilters)));
    document.querySelectorAll('.tl-filter-cb').forEach(cb => {
        cb.checked = state.timelineFilters.has(cb.value);
    });
    updateTimelineView();
}

async function viewNativeSamples() {
    const cbs = document.querySelectorAll('.result-checkbox:checked');
    if (cbs.length === 0) { toast('No results selected', 'error'); return; }
    
    document.getElementById('sampleModal').classList.add('show');
    const container = document.getElementById('sampleModalContent');
    container.innerHTML = '<div style="padding: 20px; color: #aeb5be; font-size: 14px;">Fetching and parsing debug data...</div>';
    
    state.activeTimelineData = [];
    
    for (let cb of cbs) {
        const isOpt = cb.value.includes('_opt');
        const mainFilename = cb.value;
        let sampleFilename = mainFilename;
        if (!isOpt) sampleFilename = mainFilename.replace(/\.json(\.gz)?$/, '_sample.json$1');

        try {
            let mainData = await api('GET', '/api/projects/' + encodeURIComponent(state.currentProject) + '/results/' + encodeURIComponent(mainFilename));
            let sampleData = mainData;
            if (!isOpt) {
                try { sampleData = await api('GET', '/api/projects/' + encodeURIComponent(state.currentProject) + '/results/' + encodeURIComponent(sampleFilename)); } 
                catch(e) { console.warn("No separate sample file found, falling back to main file logs."); }
            }
            const cleanTitle = mainFilename.replace('_opt.json.gz', '').replace('_opt.json', '').replace('.json.gz', '').replace('.json', '');
            
            // Save to memory
            state.activeTimelineData.push({ filename: cleanTitle, mainData, sampleData });
        } catch(e) {
            state.activeTimelineData.push({ filename: mainFilename, error: e.message });
        }
    }
    
    initFilterUI();
    updateTimelineView();
}

function updateTimelineView() {
    const container = document.getElementById('sampleModalContent');
    const samplesHTML = state.activeTimelineData.map(obj => {
        if (obj.error) {
            return `<div class="sample-timeline-wrapper"><div class="sample-timeline-title">${escapeHtml(obj.filename)}</div><div style="padding: 20px; color: var(--toast-error-border);">Failed to parse JSON: ${escapeHtml(obj.error)}</div></div>`;
        }
        return renderSampleTimeline(obj);
    });
    
    container.innerHTML = `<div class="sample-modal-flex-container">${samplesHTML.join('')}</div>`;
    
    // Bind the synchronized scrolling immediately after rendering
    bindSyncScroll();
}

let isSyncingScroll = false;
function bindSyncScroll() {
    const scrollAreas = document.querySelectorAll('.timeline-scroll-area');
    
    scrollAreas.forEach(area => {
        area.addEventListener('scroll', function(e) {
            const cb = document.getElementById('syncScrollCb');
            // Do nothing if checkbox is off
            if (!cb || !cb.checked) return; 
            
            // Prevent infinite echo loops between scroll areas
            if (isSyncingScroll) return;
            isSyncingScroll = true;
            
            const targetScroll = e.target.scrollTop;
            
            scrollAreas.forEach(otherArea => {
                if (otherArea !== e.target && otherArea.scrollTop !== targetScroll) {
                    otherArea.scrollTop = targetScroll;
                }
            });
            
            // Release the lock on the next frame after DOM paints the scroll
            requestAnimationFrame(() => {
                isSyncingScroll = false;
            });
        });
    });
}

function renderSampleTimeline(obj) {
    const { filename, mainData, sampleData } = obj;
    let eventsArr = sampleData.logs || sampleData.debug || mainData.logs || mainData.debug;
    if (!eventsArr && Array.isArray(sampleData)) eventsArr = sampleData;
    
    if (!eventsArr || eventsArr.length === 0) {
        return `<div class="sample-timeline-wrapper"><div class="sample-timeline-title">${escapeHtml(filename)}</div><div style="padding: 20px; color: #aeb5be;">No timeline events found. (Optimization runs do not generate timelines).</div></div>`;
    }

    // Apply Filters here!
    eventsArr = eventsArr.filter(ev => {
        let eType = ev.event || 'debug';
        return state.timelineFilters.has(eType);
    });

    const chars = mainData.character_details || sampleData.character_details || [];
    const charNames = [
        chars.length > 0 ? chars[0].name : 'Char 1',
        chars.length > 1 ? chars[1].name : 'Char 2',
        chars.length > 2 ? chars[2].name : 'Char 3',
        chars.length > 3 ? chars[3].name : 'Char 4'
    ];

    let html = `<div class="sample-timeline-wrapper">`;
    html += `<div class="sample-timeline-title">${escapeHtml(filename)} ${sampleData.sample_seed ? `(Seed: ${sampleData.sample_seed})` : ''}</div>`;
    html += `<div class="timeline-scroll-area">`;
    html += `<div class="timeline-header">
        <div>F | Sec</div>
        <div>Sim</div>`;
    for (let i = 0; i < 4; i++) {
        let name = charNames[i] || '';
        name = name.charAt(0).toUpperCase() + name.slice(1);
        html += `<div>${escapeHtml(name)}</div>`;
    }
    html += `</div>`;

    if (eventsArr.length === 0) {
        html += `<div style="padding: 20px; color: #aeb5be; text-align:center;">All events have been filtered out. Adjust Log Options to see data.</div></div></div>`;
        return html;
    }

    const frames = {};
    eventsArr.forEach(ev => {
        if (!frames[ev.frame]) frames[ev.frame] = [];
        frames[ev.frame].push(ev);
    });

    const sortedFrames = Object.keys(frames).map(Number).sort((a,b) => a - b);

    sortedFrames.forEach(f => {
        const sec = (f / 60).toFixed(2);
        html += `<div class="timeline-row">
            <div class="timeline-col frame-col">${f} | ${sec}s</div>`;
        
        const simEvents = [];
        const charEvents = [[], [], [], []];
        
        frames[f].forEach(ev => {
            let cIdx = -1;
            if ('char' in ev) cIdx = parseInt(ev.char);
            else if ('char_index' in ev) cIdx = parseInt(ev.char_index);
            else if ('character' in ev) cIdx = parseInt(ev.character);
            else if ('c' in ev) cIdx = parseInt(ev.c);
            else if ('target' in ev && ev.event !== 'damage') cIdx = parseInt(ev.target);
            else if (ev.logs) {
                if ('char' in ev.logs) cIdx = parseInt(ev.logs.char);
                else if ('target' in ev.logs && ev.event !== 'damage') cIdx = parseInt(ev.logs.target);
            }
            
            if (cIdx >= 0 && cIdx < 4) charEvents[cIdx].push(ev);
            else simEvents.push(ev);
        });

        html += `<div class="timeline-col">${renderEvents(simEvents)}</div>`;
        for (let i = 0; i < 4; i++) {
            html += `<div class="timeline-col">${renderEvents(charEvents[i])}</div>`;
        }
        html += `</div>`;
    });

    html += `</div></div>`;
    return html;
}

function renderEvents(events) {
    return events.map(ev => {
        let bgColor = '#4f5b66'; 
        let msg = ev.msg || '';
        let isDamage = ev.event === 'damage' || msg.includes('damage') || msg.includes('crit');
        let element = (ev.logs && ev.logs.element) ? ev.logs.element.toLowerCase() : null;
        
        if (element) {
            const colors = {
                hydro: '#2f6bcf', pyro: '#ec4923', electro: '#b44ac0', 
                cryo: '#46a8ba', anemo: '#359697', geo: '#deaf33', 
                dendro: '#73a726', physical: '#757575'
            };
            bgColor = colors[element] || '#2f6bcf';
        } else if (ev.event === 'action') bgColor = '#b05c36'; 
        else if (ev.event === 'status') bgColor = '#96287c'; 
        else if (ev.event === 'energy') bgColor = '#3c7a3c'; 
        else if (isDamage) bgColor = '#2f6bcf'; 

        let logsHTML = '';
        if (ev.logs) {
            let prefix = ev.logs.key ? `${ev.logs.key} ` : '';
            let suffix = ev.logs.expiry !== undefined ? ` [${ev.logs.expiry}]` : '';
            if (prefix || suffix) msg = `${prefix}${msg}${suffix}`;

            let parts = [];
            for (let k in ev.logs) {
                if (k === 'key' || k === 'expiry' || (k === 'element' && ev.event === 'damage')) continue;
                let v = ev.logs[k];
                if (typeof v === 'number' && v > 0 && v % 1 !== 0) v = v.toFixed(2);
                if (typeof v === 'object' && v !== null) {
                    try { v = JSON.stringify(v); } catch(e) { v = String(v); }
                }
                parts.push(`${escapeHtml(k)}: ${escapeHtml(String(v))}`);
            }
            if (parts.length) logsHTML = `<div class="event-logs">[${parts.join(' | ')}]</div>`;
        }
        
        return `<div class="timeline-event" style="background-color: ${bgColor};">
            <div style="font-weight:bold;">${escapeHtml(msg)}</div>
            ${logsHTML}
        </div>`;
    }).join('');
}
init();