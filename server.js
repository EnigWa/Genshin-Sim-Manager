const express = require('express');
const zlib = require('zlib');
const fs = require('fs');
const path = require('path');
const os = require('os');
const https = require('https');
const { exec, execSync } = require('child_process');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Directories
const SETTINGS_FILE = path.join(__dirname, 'config.json');
const PROJECTS_DIR = path.join(__dirname, 'projects');
const GCSIM_DIR = path.join(__dirname, 'bin');

if (!fs.existsSync(PROJECTS_DIR)) fs.mkdirSync(PROJECTS_DIR, { recursive: true });
if (!fs.existsSync(GCSIM_DIR)) fs.mkdirSync(GCSIM_DIR, { recursive: true });
// ========== LOCAL GCSIM VIEWER SERVER ==========
let activeViewerFile = null;
const viewerApp = express();

viewerApp.get('/data', (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*'); // Allow gcsim.app to fetch this
    if (!activeViewerFile || !fs.existsSync(activeViewerFile)) {
        return res.status(404).json({ error: "No active data" });
    }
    
    const raw = fs.readFileSync(activeViewerFile);
    try {
        // gcsim sometimes gzips the JSON even if the extension isn't .gz
        const unzipped = zlib.gunzipSync(raw);
        res.setHeader('Content-Type', 'application/json');
        res.send(unzipped);
    } catch (e) {
        // If not compressed, send normally
        res.setHeader('Content-Type', 'application/json');
        res.send(raw);
    }
});

viewerApp.listen(8381, () => {
    console.log('Local gcsim viewer server running on port 8381');
}).on('error', () => {
    console.error('Port 8381 might be in use.');
});
// ========== RUNTIMES & BROWSE API ==========
// ========== AUTO-INSTALLER ON BOOT ==========
async function autoInstallLatestOfficial() {
    try {
        const runtimes = getAllRuntimes();
        if (runtimes.length > 0) return; // Skip if we already have versions installed
        
        console.log('No runtimes found. Auto-installing latest official gcsim...');
        
        // 1. Fetch latest release info
        const releaseRes = await new Promise((resolve, reject) => {
            https.get('https://api.github.com/repos/genshinsim/gcsim/releases/latest', { headers: { 'User-Agent': 'gcsim-manager' } }, (resp) => {
                let data = '';
                resp.on('data', chunk => data += chunk);
                resp.on('end', () => resolve(JSON.parse(data)));
            }).on('error', reject);
        });

        if (!releaseRes.tag_name) return;

        // 2. Find correct asset for OS
        const { assetName, execName, isWindows } = getPlatformInfo();
        const asset = releaseRes.assets.find(a => a.name === assetName);
        if (!asset) {
            console.error('No compatible asset found in latest release.');
            return;
        }

        // 3. Prepare directories
        const dir = path.join(GCSIM_DIR, releaseRes.tag_name);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        const dest = path.join(dir, execName);

        // 4. Download file handling redirects
        await new Promise((resolve, reject) => {
            const req = https.get(asset.browser_download_url, { headers: { 'User-Agent': 'gcsim-manager' } }, (resp) => {
                if (resp.statusCode === 302 || resp.statusCode === 301) {
                    https.get(resp.headers.location, { headers: { 'User-Agent': 'gcsim-manager' } }, (r) => {
                        const file = fs.createWriteStream(dest);
                        r.pipe(file);
                        file.on('finish', () => file.close(resolve));
                    }).on('error', reject);
                } else if (resp.statusCode === 200) {
                    const file = fs.createWriteStream(dest);
                    resp.pipe(file);
                    file.on('finish', () => file.close(resolve));
                } else {
                    reject(new Error(`Failed with status: ${resp.statusCode}`));
                }
            });
            req.on('error', reject);
        });

        // 5. Apply permissions & save to settings
        if (!isWindows) fs.chmodSync(dest, 0o755);
        const settings = loadSettings();
        settings.active_runtime = releaseRes.tag_name;
        saveSettings(settings);
        
        console.log(`Successfully installed official gcsim ${releaseRes.tag_name}!`);
    } catch (e) {
        console.error('Auto-install failed:', e.message);
    }
}
// Run immediately on boot
autoInstallLatestOfficial();
function getPlatformInfo() {
    const platform = os.platform();
    const arch = os.arch();
    if (platform === 'win32') return { assetName: 'gcsim_windows_amd64.exe', execName: 'gcsim.exe', isWindows: true };
    if (platform === 'linux') return { assetName: 'gcsim_linux_amd64', execName: 'gcsim', isWindows: false };
    if (platform === 'darwin') return { assetName: arch === 'arm64' ? 'gcsim_darwin_arm64' : 'gcsim_darwin_amd64', execName: 'gcsim', isWindows: false };
    throw new Error('Unsupported platform');
}

function getAllRuntimes() {
    const runtimes = [];
    if (fs.existsSync(GCSIM_DIR)) {
        const dirs = fs.readdirSync(GCSIM_DIR, { withFileTypes: true });
        const { execName } = getPlatformInfo();
        for (const d of dirs) {
            if (d.isDirectory()) {
                const execPath = path.join(GCSIM_DIR, d.name, execName);
                if (fs.existsSync(execPath)) {
                    runtimes.push({ id: d.name, name: `Official ${d.name}`, path: execPath, type: 'official' });
                }
            }
        }
    }
    const settings = loadSettings();
    if (settings.custom_runtimes) runtimes.push(...settings.custom_runtimes);
    // Sort official versions descending, custom at bottom
    runtimes.sort((a, b) => {
        if (a.type !== b.type) return a.type === 'official' ? -1 : 1;
        return b.id.localeCompare(a.id); 
    });
    return runtimes;
}

app.get('/api/runtimes', (req, res) => {
    res.json({ runtimes: getAllRuntimes(), active: loadSettings().active_runtime || '' });
});

app.post('/api/runtimes/active', (req, res) => {
    const settings = loadSettings();
    settings.active_runtime = req.body.id;
    saveSettings(settings);
    res.json({ success: true });
});

app.post('/api/runtimes/custom', (req, res) => {
    const { name, path: execPath } = req.body;
    if (!fs.existsSync(execPath)) return res.status(400).json({ error: 'File does not exist' });
    const settings = loadSettings();
    if (!settings.custom_runtimes) settings.custom_runtimes = [];
    const newRuntime = { id: uuidv4(), name: name || 'Custom Sim', path: execPath, type: 'custom' };
    settings.custom_runtimes.push(newRuntime);
    settings.active_runtime = newRuntime.id;
    saveSettings(settings);
    res.json(newRuntime);
});

app.delete('/api/runtimes/:id', (req, res) => {
    const { id } = req.params;
    const runtimes = getAllRuntimes();
    const target = runtimes.find(r => r.id === id);
    if (!target) return res.status(404).json({ error: 'Runtime not found' });
    
    if (target.type === 'official') {
        fs.rmSync(path.join(GCSIM_DIR, target.id), { recursive: true, force: true });
    } else {
        const settings = loadSettings();
        settings.custom_runtimes = settings.custom_runtimes.filter(r => r.id !== id);
        if (settings.active_runtime === id) settings.active_runtime = '';
        saveSettings(settings);
    }
    res.json({ success: true });
});

app.get('/api/runtimes/releases', (req, res) => {
    https.get('https://api.github.com/repos/genshinsim/gcsim/releases', { headers: { 'User-Agent': 'gcsim-manager' } }, (resp) => {
        let data = '';
        resp.on('data', chunk => data += chunk);
        resp.on('end', () => res.json(JSON.parse(data).map(r => ({ tag: r.tag_name }))));
    }).on('error', e => res.status(500).json({ error: e.message }));
});

app.post('/api/runtimes/download', async (req, res) => {
    const { tag } = req.body;
    try {
        const releaseRes = await new Promise((resolve, reject) => {
            https.get(`https://api.github.com/repos/genshinsim/gcsim/releases/tags/${tag}`, { headers: { 'User-Agent': 'gcsim-manager' } }, (resp) => {
                let data = '';
                resp.on('data', chunk => data += chunk);
                resp.on('end', () => resolve(JSON.parse(data)));
            }).on('error', reject);
        });

        const { assetName, execName, isWindows } = getPlatformInfo();
        const asset = releaseRes.assets.find(a => a.name === assetName);
        if (!asset) return res.status(404).json({ error: 'Asset not found for platform' });

        const dir = path.join(GCSIM_DIR, tag);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        const dest = path.join(dir, execName);

        // Standard http download logic
        await new Promise((resolve, reject) => {
            const req = https.get(asset.browser_download_url, { headers: { 'User-Agent': 'gcsim-manager' } }, (resp) => {
                if (resp.statusCode === 302 || resp.statusCode === 301) {
                    https.get(resp.headers.location, { headers: { 'User-Agent': 'gcsim-manager' } }, (r) => {
                        const file = fs.createWriteStream(dest);
                        r.pipe(file);
                        file.on('finish', () => file.close(resolve));
                    }).on('error', reject);
                }
            });
            req.on('error', reject);
        });

        if (!isWindows) fs.chmodSync(dest, 0o755);
        
        const settings = loadSettings();
        settings.active_runtime = tag;
        saveSettings(settings);

        res.json({ success: true, tag });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/browse', (req, res) => {
    let targetDir = req.body.path;
    if (!targetDir || !fs.existsSync(targetDir)) targetDir = os.homedir();
    
    try {
        targetDir = path.resolve(targetDir);
        
        let items = [];
        try {
            items = fs.readdirSync(targetDir, { withFileTypes: true });
        } catch (err) {
            // Prevent crashes if the app tries to read a protected/admin folder
            if (err.code === 'EPERM' || err.code === 'EACCES') {
                return res.status(403).json({ error: 'Permission denied to open this folder' });
            }
            throw err;
        }

        const dirs = [], files = [];
        for (const item of items) {
            try {
                if (item.isDirectory()) dirs.push({ name: item.name, path: path.join(targetDir, item.name) });
                else if (item.isFile()) files.push({ name: item.name, path: path.join(targetDir, item.name) });
            } catch (e) {}
        }
        dirs.sort((a,b) => a.name.localeCompare(b.name));
        files.sort((a,b) => a.name.localeCompare(b.name));
        
        let drives = ['/'];
        if (process.platform === 'win32') {
            drives = [];
            for (let i = 67; i <= 90; i++) {
                try { if (fs.existsSync(`${String.fromCharCode(i)}:\\`)) drives.push(`${String.fromCharCode(i)}:\\`); } catch(e){}
            }
        }
        
        const parent = path.dirname(targetDir);
        res.json({ 
            currentPath: targetDir, 
            parentPath: parent !== targetDir ? parent : null, 
            directories: dirs, 
            files, 
            drives,
            isWindows: process.platform === 'win32'
        });
    } catch (e) { 
        res.status(500).json({ error: e.message }); 
    }
});

// ========== SETTINGS API ==========
function loadSettings() {
    try {
        if (fs.existsSync(SETTINGS_FILE)) {
            const raw = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'));
            // Ensure arrays/strings exist to prevent crashes
            if (!raw.custom_runtimes) raw.custom_runtimes = [];
            if (!raw.active_runtime) raw.active_runtime = '';
            if (!raw.project_name) raw.project_name = '';
            return raw;
        }
    } catch (e) {
        console.error('Error loading settings:', e);
    }
    return { project_name: '', custom_runtimes: [], active_runtime: '' };
}

function saveSettings(settings) {
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2), 'utf8');
}

app.get('/api/settings', (req, res) => {
    res.json(loadSettings());
});

app.post('/api/settings', (req, res) => {
    const newSettings = req.body;
    const currentSettings = loadSettings();
    
    // Only update project_name from the frontend UI save, keep runtimes intact!
    if (newSettings.project_name !== undefined) {
        currentSettings.project_name = newSettings.project_name;
    }
    
    saveSettings(currentSettings);
    res.json({ success: true });
});


// ========== PROJECTS API ==========
app.get('/api/projects', (req, res) => {
    try {
        if (fs.existsSync(PROJECTS_DIR)) {
            const projects = fs.readdirSync(PROJECTS_DIR)
                .filter(d => fs.statSync(path.join(PROJECTS_DIR, d)).isDirectory());
            res.json(projects);
        } else {
            res.json([]);
        }
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/projects', (req, res) => {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'Project name required' });
    const projectDir = path.join(PROJECTS_DIR, name);
    try {
        fs.mkdirSync(path.join(projectDir, 'configs'), { recursive: true });
        fs.mkdirSync(path.join(projectDir, 'outputs'), { recursive: true });
        res.json({ success: true, path: projectDir });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.put('/api/projects/:project/rename', (req, res) => {
    const { newName } = req.body;
    if (!newName) return res.status(400).json({ error: 'New name required' });
    const oldDir = path.join(PROJECTS_DIR, req.params.project);
    const newDir = path.join(PROJECTS_DIR, newName);
    try {
        if (!fs.existsSync(oldDir)) return res.status(404).json({ error: 'Project not found' });
        if (fs.existsSync(newDir)) return res.status(400).json({ error: 'A project with that name already exists' });
        fs.renameSync(oldDir, newDir);
        res.json({ success: true, name: newName });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.delete('/api/projects/:project', (req, res) => {
    const projectDir = path.join(PROJECTS_DIR, req.params.project);
    try {
        if (!fs.existsSync(projectDir)) return res.status(404).json({ error: 'Project not found' });
        fs.rmSync(projectDir, { recursive: true, force: true });
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ========== CONFIGS API ==========
function getProjectPath(projectName) {
    return path.join(PROJECTS_DIR, projectName, 'configs');
}
function getSortOrderPath(configsDir) {
    return path.join(configsDir, '.sortorder.json');
}
function loadSortOrder(configsDir) {
    const sortPath = getSortOrderPath(configsDir);
    try { if (fs.existsSync(sortPath)) return JSON.parse(fs.readFileSync(sortPath, 'utf8')); } catch (e) {}
    return [];
}
function saveSortOrder(configsDir, order) {
    fs.writeFileSync(getSortOrderPath(configsDir), JSON.stringify(order, null, 2), 'utf8');
}

app.get('/api/projects/:project/configs', (req, res) => {
    const configsDir = getProjectPath(req.params.project);
    try {
        if (fs.existsSync(configsDir)) {
            var allFiles = fs.readdirSync(configsDir)
                .filter(f => f.endsWith('.txt'))
                .map(f => ({
                    name: f,
                    path: path.join(configsDir, f),
                    size: fs.statSync(path.join(configsDir, f)).size,
                    modified: fs.statSync(path.join(configsDir, f)).mtime
                }));
            
            var sortOrder = loadSortOrder(configsDir);
            let needsSave = false;

            // --- NEW AUTO-REPAIR LOGIC ---
            const actualFileNames = allFiles.map(f => f.name);
            
            // 1. Clean up deleted/renamed files from the sort list
            const initialLength = sortOrder.length;
            sortOrder = sortOrder.filter(name => actualFileNames.includes(name));
            if (sortOrder.length !== initialLength) needsSave = true;

            // 2. Add newly created files to the bottom of the sort list
            actualFileNames.forEach(name => {
                if (!sortOrder.includes(name)) {
                    sortOrder.push(name);
                    needsSave = true;
                }
            });

            // Save the repaired list
            if (needsSave) {
                saveSortOrder(configsDir, sortOrder);
            }
            // -----------------------------
            
            if (sortOrder.length > 0) {
                var orderMap = {};
                sortOrder.forEach(function(name, idx) { orderMap[name] = idx; });
                allFiles.sort(function(a, b) {
                    var ai = (orderMap[a.name] !== undefined) ? orderMap[a.name] : 999999;
                    var bi = (orderMap[b.name] !== undefined) ? orderMap[b.name] : 999999;
                    return ai - bi;
                });
            }
            res.json(allFiles);
        } else {
            res.json([]);
        }
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/projects/:project/configs/swap', (req, res) => {
    const { nameA, nameB } = req.body;
    if (!nameA || !nameB) return res.status(400).json({ error: 'Two filenames required' });
    const configsDir = getProjectPath(req.params.project);
    const pathA = path.join(configsDir, nameA);
    const pathB = path.join(configsDir, nameB);
    
    try {
        if (!fs.existsSync(pathA) || !fs.existsSync(pathB)) return res.status(404).json({ error: 'Files not found' });
        
        var sortOrder = loadSortOrder(configsDir);
        
        // Final safety catch: ensure sortOrder is synced right before swapping
        const actualFiles = fs.readdirSync(configsDir).filter(f => f.endsWith('.txt'));
        sortOrder = sortOrder.filter(f => actualFiles.includes(f));
        actualFiles.forEach(f => { if (!sortOrder.includes(f)) sortOrder.push(f); });
        
        var idxA = sortOrder.indexOf(nameA);
        var idxB = sortOrder.indexOf(nameB);
        
        if (idxA !== -1 && idxB !== -1) {
            // Swap array items
            sortOrder[idxA] = nameB;
            sortOrder[idxB] = nameA;
            
            saveSortOrder(configsDir, sortOrder);
            return res.json({ success: true });
        }
        res.status(500).json({ error: 'Could not find files in sort order' });
    } catch (e) { res.status(500).json({ error: e.message }); }
});
app.get('/api/projects/:project/configs/:filename', (req, res) => {
    const filePath = path.join(getProjectPath(req.params.project), req.params.filename);
    try {
        if (fs.existsSync(filePath)) {
            const content = fs.readFileSync(filePath, 'utf8');
            res.json({ content, name: req.params.filename });
        } else { res.status(404).json({ error: 'File not found' }); }
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/projects/:project/configs/:filename', (req, res) => {
    const filePath = path.join(getProjectPath(req.params.project), req.params.filename);
    const { content } = req.body;
    try {
        const dir = path.dirname(filePath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(filePath, content || '', 'utf8');
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/projects/:project/configs', (req, res) => {
    const { filename } = req.body;
    if (!filename) return res.status(400).json({ error: 'Filename required' });
    let fname = filename.endsWith('.txt') ? filename : filename + '.txt';
    const filePath = path.join(getProjectPath(req.params.project), fname);
    try {
        const dir = path.dirname(filePath);
        if (!fs.existsSync(dir)) return res.status(400).json({ error: 'Project does not exist' });
        if (fs.existsSync(filePath)) return res.status(400).json({ error: 'File already exists' });
        fs.writeFileSync(filePath, '', 'utf8');
        res.json({ success: true, name: fname });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/projects/:project/configs/:filename', (req, res) => {
    const filePath = path.join(getProjectPath(req.params.project), req.params.filename);
    try {
        if (fs.existsSync(filePath)) { fs.unlinkSync(filePath); res.json({ success: true }); } 
        else res.status(404).json({ error: 'File not found' });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/projects/:project/configs/:filename/rename', (req, res) => {
    const { newName } = req.body;
    if (!newName) return res.status(400).json({ error: 'New name required' });
    let newFname = newName.endsWith('.txt') ? newName : newName + '.txt';
    const oldPath = path.join(getProjectPath(req.params.project), req.params.filename);
    const newPath = path.join(getProjectPath(req.params.project), newFname);
    try {
        if (fs.existsSync(newPath)) return res.status(400).json({ error: 'File already exists' });
        if (!fs.existsSync(oldPath)) return res.status(404).json({ error: 'File not found' });
        fs.renameSync(oldPath, newPath);
        res.json({ success: true, name: newFname });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/projects/:project/configs/:filename/duplicate', (req, res) => {
    const filePath = path.join(getProjectPath(req.params.project), req.params.filename);
    try {
        if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found' });
        const ext = path.extname(req.params.filename);
        const base = path.basename(req.params.filename, ext);
        let copyName = `${base}_copy${ext}`;
        let copyPath = path.join(getProjectPath(req.params.project), copyName);
        let counter = 1;
        while (fs.existsSync(copyPath)) {
            copyName = `${base}_copy_${counter}${ext}`;
            copyPath = path.join(getProjectPath(req.params.project), copyName);
            counter++;
        }
        fs.copyFileSync(filePath, copyPath);
        res.json({ success: true, name: copyName });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// ========== EXPORT / IMPORT ==========
app.get('/api/projects/:project/export', (req, res) => {
    const configsDir = getProjectPath(req.params.project);
    try {
        if (!fs.existsSync(configsDir)) return res.status(400).json({ error: 'Project not found' });
        const files = fs.readdirSync(configsDir).filter(f => f.endsWith('.txt'));
        let exportContent = `# gcsim Config Export - Project: ${req.params.project}\n`;
        exportContent += `# Exported: ${new Date().toISOString()}\n`;
        exportContent += `# Total configs: ${files.length}\n`;
        exportContent += `# ========================================\n\n`;
        for (const file of files) {
            const content = fs.readFileSync(path.join(configsDir, file), 'utf8');
            exportContent += `# ======== START: ${file} ========\n`;
            exportContent += content;
            if (!content.endsWith('\n')) exportContent += '\n';
            exportContent += `# ======== END: ${file} ========\n\n`;
        }
        res.json({ content: exportContent, filename: `${req.params.project}_configs_export.txt` });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/projects/:project/import', (req, res) => {
    const { content } = req.body;
    if (!content) return res.status(400).json({ error: 'No content provided' });
    const configsDir = getProjectPath(req.params.project);
    try {
        if (!fs.existsSync(configsDir)) return res.status(400).json({ error: 'Project not found' });
        const fileRegex = /# ======== START:\s*(.+?) ========\n([\s\S]*?)\n# ======== END:\s*\1 ========/g;
        let match;
        let imported = 0;
        let skipped = 0;
        while ((match = fileRegex.exec(content)) !== null) {
            const filename = match[1].trim();
            const fileContent = match[2];
            if (!filename.endsWith('.txt')) { skipped++; continue; }
            const filePath = path.join(configsDir, filename);
            fs.writeFileSync(filePath, fileContent, 'utf8');
            imported++;
        }
        res.json({ success: true, imported, skipped });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// ========== SIMULATION API ==========
const runningProcesses = {};
app.post('/api/projects/:project/validate', (req, res) => {
    const { filename } = req.body;

    const runtimes = getAllRuntimes();
    const settings = loadSettings();
    const activeRuntime = runtimes.find(r => r.id === settings.active_runtime);

    if (!activeRuntime || !fs.existsSync(activeRuntime.path)) {
        return res.status(400).json({ error: 'No runtime found. Please check Settings.' });
    }

    const filePath = path.join(PROJECTS_DIR, req.params.project, 'configs', filename);
    if (!fs.existsSync(filePath)) return res.status(400).json({ error: 'Config file not found' });

    // Use a temp output path so validate never writes a real result file
    const tmpOut = path.join(os.tmpdir(), `gcsim_validate_${uuidv4()}.json`);

    // Run with iteration count of 1 and silent flags — fastest way to get parse errors
    const cmd = `"${activeRuntime.path}" -c "${filePath}" -out "${tmpOut}"`;

    exec(cmd, { timeout: 15000 }, (err, stdout, stderr) => {
        // Clean up temp file if it was created
        try { if (fs.existsSync(tmpOut)) fs.unlinkSync(tmpOut); } catch(e) {}

        const output = (stderr + '\n' + stdout).trim();

        if (err) {
            // err.code 1 = gcsim printed errors and exited non-zero
            return res.json({ valid: false, output: output || 'Unknown syntax error.' });
        }
        res.json({ valid: true, output: 'Config is valid. No syntax errors detected.' });
    });
});
app.post('/api/projects/:project/run', (req, res) => {
    const { filename } = req.body;
    
    const runtimes = getAllRuntimes();
    const settings = loadSettings();
    const activeRuntime = runtimes.find(r => r.id === settings.active_runtime);
    
    if (!activeRuntime || !fs.existsSync(activeRuntime.path)) {
        return res.status(400).json({ error: 'Selected runtime executable not found. Please check Settings.' });
    }
    const gcsim = activeRuntime.path;
    
    const projectDir = path.join(PROJECTS_DIR, req.params.project);
    const configsDir = path.join(projectDir, 'configs');
    const outputsDir = path.join(projectDir, 'outputs');
    if (!fs.existsSync(outputsDir)) fs.mkdirSync(outputsDir, { recursive: true });
    
    const runId = uuidv4();
    const filesToRun = filename 
        ? [path.join(configsDir, filename)]
        : fs.readdirSync(configsDir).filter(f => f.endsWith('.txt')).map(f => path.join(configsDir, f));
    
    if (filesToRun.length === 0) return res.status(400).json({ error: 'No config files found' });
    
    res.json({ runId, message: `Starting ${filesToRun.length} simulation(s)` });
    runSimulations(filesToRun, gcsim, outputsDir, runId, 'run', settings);
});

app.post('/api/projects/:project/optimize', (req, res) => {
    const { filename } = req.body;
    
    const runtimes = getAllRuntimes();
    const settings = loadSettings();
    const activeRuntime = runtimes.find(r => r.id === settings.active_runtime);
    
    if (!activeRuntime || !fs.existsSync(activeRuntime.path)) {
        return res.status(400).json({ error: 'Selected runtime executable not found. Please check Settings.' });
    }
    const gcsim = activeRuntime.path;
    
    const projectDir = path.join(PROJECTS_DIR, req.params.project);
    const configsDir = path.join(projectDir, 'configs');
    const outputsDir = path.join(projectDir, 'outputs');
    if (!fs.existsSync(outputsDir)) fs.mkdirSync(outputsDir, { recursive: true });
    
    const runId = uuidv4();
    const filesToRun = filename 
        ? [path.join(configsDir, filename)]
        : fs.readdirSync(configsDir).filter(f => f.endsWith('.txt')).map(f => path.join(configsDir, f));
    
    if (filesToRun.length === 0) return res.status(400).json({ error: 'No config files found' });
    
    res.json({ runId, message: `Starting ${filesToRun.length} optimization(s)` });
    runSimulations(filesToRun, gcsim, outputsDir, runId, 'optimize', settings);
});

function openUrl(url) {
    let cmd;
    if (process.platform === 'win32') {
        cmd = `start "" "${url}"`;
    } else if (process.platform === 'darwin') {
        cmd = `open "${url}"`;
    } else {
        cmd = `xdg-open "${url}"`;
    }
    exec(cmd, (err) => {
        if (err) console.error('Error opening URL:', err);
    });
}

function runSimulations(files, gcsimPath, outputsDir, runId, mode,settings) {
    const maxWorkers = Math.max(1, os.cpus().length - 1); 
    runningProcesses[runId] = { status: 'running', current: files.length > 1 ? 'Running Multiple...' : path.basename(files[0]), log: [], mode, childProcesses: new Set() };
    
    let index = 0;
    let activeWorkers = 0;
    
    function worker() {
        if (runningProcesses[runId] && runningProcesses[runId].status === 'terminated') return;
        
        if (index >= files.length) {
            if (activeWorkers === 0 && runningProcesses[runId].status !== 'terminated') {
                runningProcesses[runId].status = 'completed';
                runningProcesses[runId].log.push(`\nAll ${mode === 'optimize' ? 'optimizations' : 'simulations'} completed\n`);
            }
            return;
        }
        
        const filePath = files[index++];
        const fileName = path.basename(filePath);
        const baseName = fileName.replace('.txt', '');
        activeWorkers++;
        
        runningProcesses[runId].log.push(`\n[${baseName}] Starting...\n`);
        
        let cmd;
        if (mode === 'optimize') {
    const optOutPath = path.join(outputsDir, `${baseName}_opt.json`);
    
    // Construct the options string
    const s = settings; // Assuming you passed settings into this function
    const optParams = [
        `total_liquid_substats=${s.opt_liquid || 20}`,
        `indiv_liquid_cap=${s.opt_cap || 10}`,
        `fixed_substats_count=${s.opt_fixed || 2}`,
        `fine_tune=${s.opt_tune !== undefined ? s.opt_tune : 1}`,
        `show_substat_scalars=1` // Defaulting to 1 as per docs
    ].join(';');

    cmd = `"${gcsimPath}" -c "${filePath}" -out "${optOutPath}" -substatOptimFull -options="${optParams}"`;
} else {
            const outPath = path.join(outputsDir, `${baseName}.json`);
            cmd = `"${gcsimPath}" -c "${filePath}" -out "${outPath}"`;
        }
        
        const proc = exec(cmd, { timeout: 300000, maxBuffer: 1024 * 1024 * 50 }, (err, stdout, stderr) => {
            if (runningProcesses[runId]) runningProcesses[runId].childProcesses.delete(proc);
            if (err) runningProcesses[runId].log.push(`\n[${baseName}] Error: ${stderr}\n`);
            else runningProcesses[runId].log.push(`\n[${baseName}] Completed\n`);
            activeWorkers--;
            worker(); 
        });

        if (runningProcesses[runId]) runningProcesses[runId].childProcesses.add(proc);

        proc.stdout.on('data', (data) => {
            const text = data.toString().split('\n').filter(l => l.trim()).map(l => `[${baseName}] ${l}\n`).join('');
            if (text && runningProcesses[runId]) runningProcesses[runId].log.push(text);
        });
        proc.stderr.on('data', (data) => {
            const text = data.toString().split('\n').filter(l => l.trim()).map(l => `[${baseName}] ${l}\n`).join('');
            if (text && runningProcesses[runId]) runningProcesses[runId].log.push(text);
        });
    }

    const concurrency = Math.min(maxWorkers, files.length);
    for (let i = 0; i < concurrency; i++) worker();
}

app.get('/api/runs/:runId', (req, res) => {
    const run = runningProcesses[req.params.runId];
    if (!run) return res.status(404).json({ error: 'Run not found' });
    res.json({ status: run.status, current: run.current, mode: run.mode, log: run.log });
});
function readGcsimJson(filePath) {
    const raw = fs.readFileSync(filePath);
    try { return JSON.parse(zlib.gunzipSync(raw).toString('utf8')); } 
    catch (e) { return JSON.parse(raw.toString('utf8')); }
}

app.get('/api/projects/:project/results', (req, res) => {
    const outputsDir = path.join(PROJECTS_DIR, req.params.project, 'outputs');
    if (!fs.existsSync(outputsDir)) return res.json([]);
    
    const files = fs.readdirSync(outputsDir).filter(f => f.endsWith('.json'));
    const results = [];
    
    for (const f of files) {
        try {
            const filePath = path.join(outputsDir, f);
            const stat = fs.statSync(filePath);
            const data = readGcsimJson(filePath);
            
            results.push({
                filename: f,
                configName: f.replace('_opt.json', '').replace('.json', ''),
                mode: f.endsWith('_opt.json') ? 'Optimize' : 'Run',
                dps: data.statistics?.dps?.mean || 0,
                date: stat.mtimeMs
            });
        } catch(e) {} // Skip broken/incomplete JSON files
    }
    results.sort((a,b) => b.date - a.date); // Sort newest first
    res.json(results);
});

app.post('/api/view/:project/:filename', (req, res) => {
    const filePath = path.join(PROJECTS_DIR, req.params.project, 'outputs', req.params.filename);
    if (fs.existsSync(filePath)) {
        activeViewerFile = filePath;
        openUrl('https://gcsim.app/local');
        res.json({ success: true });
    } else {
        res.status(404).json({ error: 'File not found' });
    }
});
app.post('/api/runs/:runId/terminate', (req, res) => {
    const run = runningProcesses[req.params.runId];
    if (run) {
        run.status = 'terminated';
        run.log.push('\nTerminated by user\n');
        
        if (run.childProcesses) {
            run.childProcesses.forEach(proc => {
                try {
                    if (process.platform === 'win32') {
                        const pid = proc.pid;
                        if (pid) execSync(`taskkill /F /T /PID ${pid}`, { timeout: 5000 });
                    } else {
                        proc.kill('SIGKILL');
                    }
                } catch (e) {
                    try { proc.kill('SIGKILL'); } catch (e2) {}
                }
            });
            run.childProcesses.clear();
        }
    }
    res.json({ success: true });
});

// ========== OUTPUT FILES API ==========
app.get('/api/projects/:project/outputs', (req, res) => {
    const outputsDir = path.join(PROJECTS_DIR, req.params.project, 'outputs');
    try {
        if (fs.existsSync(outputsDir)) {
            const files = fs.readdirSync(outputsDir).filter(f => f.endsWith('.txt'));
            res.json(files);
        } else {
            res.json([]);
        }
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/projects/:project/outputs/:filename', (req, res) => {
    const filePath = path.join(PROJECTS_DIR, req.params.project, 'outputs', req.params.filename);
    try {
        if (fs.existsSync(filePath)) {
            const content = fs.readFileSync(filePath, 'utf8');
            res.json({ content, name: req.params.filename });
        } else { res.status(404).json({ error: 'File not found' }); }
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.listen(PORT, () => {
    console.log(`gcsim Manager running on http://localhost:${PORT}`);
});