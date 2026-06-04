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
    res.setHeader('Access-Control-Allow-Origin', '*'); 
    if (!activeViewerFile || !fs.existsSync(activeViewerFile)) {
        return res.status(404).json({ error: "No active data" });
    }
    
    const raw = fs.readFileSync(activeViewerFile);
    try {
        // rip gunzip unzip is my new bestie
        const uncompressed = zlib.unzipSync(raw);
        res.setHeader('Content-Type', 'application/json');
        res.send(uncompressed);
    } catch (e) {
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
async function autoInstallLatestOfficial() {
    try {
        const runtimes = getAllRuntimes();
        if (runtimes.length > 0) return; 
        
        console.log('No runtimes found. Auto-installing latest official gcsim...');
        
        const releaseRes = await new Promise((resolve, reject) => {
            https.get('https://api.github.com/repos/genshinsim/gcsim/releases/latest', { headers: { 'User-Agent': 'gcsim-manager' } }, (resp) => {
                let data = '';
                resp.on('data', chunk => data += chunk);
                resp.on('end', () => resolve(JSON.parse(data)));
            }).on('error', reject);
        });

        if (!releaseRes.tag_name) return;

        const { assetName, execName, isWindows } = getPlatformInfo();
        const asset = releaseRes.assets.find(a => a.name === assetName);
        if (!asset) {
            console.error('No compatible asset found in latest release.');
            return;
        }

        const dir = path.join(GCSIM_DIR, releaseRes.tag_name);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        const dest = path.join(dir, execName);

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

        if (!isWindows) fs.chmodSync(dest, 0o755);
        const settings = loadSettings();
        settings.active_runtime = releaseRes.tag_name;
        saveSettings(settings);
        
        console.log(`Successfully installed official gcsim ${releaseRes.tag_name}!`);
    } catch (e) {
        console.error('Auto-install failed:', e.message);
    }
}
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
    runtimes.sort((a, b) => {
        if (a.type !== b.type) return a.type === 'official' ? -1 : 1;
        return b.id.localeCompare(a.id); 
    });
    return runtimes;
}

app.get('/api/runtimes', (req, res) => res.json({ runtimes: getAllRuntimes(), active: loadSettings().active_runtime || '' }));

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
        res.json({ currentPath: targetDir, parentPath: parent !== targetDir ? parent : null, directories: dirs, files, drives, isWindows: process.platform === 'win32' });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

function loadSettings() {
    try {
        if (fs.existsSync(SETTINGS_FILE)) {
            const raw = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'));
            if (!raw.custom_runtimes) raw.custom_runtimes = [];
            if (!raw.active_runtime) raw.active_runtime = '';
            if (!raw.project_name) raw.project_name = '';
            return raw;
        }
    } catch (e) { console.error('Error loading settings:', e); }
    return { project_name: '', custom_runtimes: [], active_runtime: '' };
}
function saveSettings(settings) { fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2), 'utf8'); }

app.get('/api/settings', (req, res) => res.json(loadSettings()));
app.post('/api/settings', (req, res) => {
    const newSettings = req.body;
    const currentSettings = loadSettings();
    if (newSettings.project_name !== undefined) currentSettings.project_name = newSettings.project_name;
    saveSettings(currentSettings);
    res.json({ success: true });
});

// ========== PROJECTS API ==========
app.get('/api/projects', (req, res) => {
    try {
        if (fs.existsSync(PROJECTS_DIR)) {
            const projects = fs.readdirSync(PROJECTS_DIR).filter(d => fs.statSync(path.join(PROJECTS_DIR, d)).isDirectory());
            res.json(projects);
        } else { res.json([]); }
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/projects', (req, res) => {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'Project name required' });
    const projectDir = path.join(PROJECTS_DIR, name);
    try {
        fs.mkdirSync(path.join(projectDir, 'configs'), { recursive: true });
        fs.mkdirSync(path.join(projectDir, 'outputs'), { recursive: true });
        res.json({ success: true, path: projectDir });
    } catch (e) { res.status(500).json({ error: e.message }); }
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
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/projects/:project', (req, res) => {
    const projectDir = path.join(PROJECTS_DIR, req.params.project);
    try {
        if (!fs.existsSync(projectDir)) return res.status(404).json({ error: 'Project not found' });
        fs.rmSync(projectDir, { recursive: true, force: true });
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// ========== CONFIGS API ==========
function getProjectPath(projectName) { return path.join(PROJECTS_DIR, projectName, 'configs'); }
function getSortOrderPath(configsDir) { return path.join(configsDir, '.sortorder.json'); }
function loadSortOrder(configsDir) {
    const sortPath = getSortOrderPath(configsDir);
    try { if (fs.existsSync(sortPath)) return JSON.parse(fs.readFileSync(sortPath, 'utf8')); } catch (e) {}
    return [];
}
function saveSortOrder(configsDir, order) { fs.writeFileSync(getSortOrderPath(configsDir), JSON.stringify(order, null, 2), 'utf8'); }

app.get('/api/projects/:project/configs', (req, res) => {
    const configsDir = getProjectPath(req.params.project);
    try {
        if (fs.existsSync(configsDir)) {
            var allFiles = fs.readdirSync(configsDir).filter(f => f.endsWith('.txt')).map(f => ({
                name: f, path: path.join(configsDir, f), size: fs.statSync(path.join(configsDir, f)).size, modified: fs.statSync(path.join(configsDir, f)).mtime
            }));
            
            var sortOrder = loadSortOrder(configsDir);
            let needsSave = false;
            const actualFileNames = allFiles.map(f => f.name);
            const initialLength = sortOrder.length;
            sortOrder = sortOrder.filter(name => actualFileNames.includes(name));
            if (sortOrder.length !== initialLength) needsSave = true;
            actualFileNames.forEach(name => {
                if (!sortOrder.includes(name)) { sortOrder.push(name); needsSave = true; }
            });
            if (needsSave) saveSortOrder(configsDir, sortOrder);
            
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
        } else { res.json([]); }
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/projects/:project/configs/swap', (req, res) => {
    const { nameA, nameB } = req.body;
    const configsDir = getProjectPath(req.params.project);
    try {
        var sortOrder = loadSortOrder(configsDir);
        const actualFiles = fs.readdirSync(configsDir).filter(f => f.endsWith('.txt'));
        sortOrder = sortOrder.filter(f => actualFiles.includes(f));
        actualFiles.forEach(f => { if (!sortOrder.includes(f)) sortOrder.push(f); });
        
        var idxA = sortOrder.indexOf(nameA);
        var idxB = sortOrder.indexOf(nameB);
        if (idxA !== -1 && idxB !== -1) {
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
        if (fs.existsSync(filePath)) { res.json({ content: fs.readFileSync(filePath, 'utf8'), name: req.params.filename }); } 
        else { res.status(404).json({ error: 'File not found' }); }
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/projects/:project/configs/:filename', (req, res) => {
    const filePath = path.join(getProjectPath(req.params.project), req.params.filename);
    try {
        if (!fs.existsSync(path.dirname(filePath))) fs.mkdirSync(path.dirname(filePath), { recursive: true });
        fs.writeFileSync(filePath, req.body.content || '', 'utf8');
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/projects/:project/configs', (req, res) => {
    const { filename } = req.body;
    let fname = filename.endsWith('.txt') ? filename : filename + '.txt';
    const filePath = path.join(getProjectPath(req.params.project), fname);
    try {
        fs.writeFileSync(filePath, '', 'utf8');
        res.json({ success: true, name: fname });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/projects/:project/configs/:filename', (req, res) => {
    const filePath = path.join(getProjectPath(req.params.project), req.params.filename);
    if (fs.existsSync(filePath)) { fs.unlinkSync(filePath); res.json({ success: true }); } 
    else res.status(404).json({ error: 'File not found' });
});

app.put('/api/projects/:project/configs/:filename/rename', (req, res) => {
    const { newName } = req.body;
    let newFname = newName.endsWith('.txt') ? newName : newName + '.txt';
    const oldPath = path.join(getProjectPath(req.params.project), req.params.filename);
    const newPath = path.join(getProjectPath(req.params.project), newFname);
    if (fs.existsSync(newPath)) return res.status(400).json({ error: 'File already exists' });
    fs.renameSync(oldPath, newPath);
    res.json({ success: true, name: newFname });
});

app.post('/api/projects/:project/configs/:filename/duplicate', (req, res) => {
    const filePath = path.join(getProjectPath(req.params.project), req.params.filename);
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
});

// ========== EXPORT / IMPORT ==========
app.get('/api/projects/:project/export', (req, res) => {
    const configsDir = getProjectPath(req.params.project);
    const files = fs.readdirSync(configsDir).filter(f => f.endsWith('.txt'));
    let exportContent = `# gcsim Config Export - Project: ${req.params.project}\n# Exported: ${new Date().toISOString()}\n# Total configs: ${files.length}\n# ========================================\n\n`;
    for (const file of files) {
        const content = fs.readFileSync(path.join(configsDir, file), 'utf8');
        exportContent += `# ======== START: ${file} ========\n${content}${!content.endsWith('\n') ? '\n' : ''}# ======== END: ${file} ========\n\n`;
    }
    res.json({ content: exportContent, filename: `${req.params.project}_configs_export.txt` });
});

app.post('/api/projects/:project/import', (req, res) => {
    const configsDir = getProjectPath(req.params.project);
    const fileRegex = /# ======== START:\s*(.+?) ========\n([\s\S]*?)\n# ======== END:\s*\1 ========/g;
    let match, imported = 0, skipped = 0;
    while ((match = fileRegex.exec(req.body.content)) !== null) {
        if (!match[1].trim().endsWith('.txt')) { skipped++; continue; }
        fs.writeFileSync(path.join(configsDir, match[1].trim()), match[2], 'utf8');
        imported++;
    }
    res.json({ success: true, imported, skipped });
});

// ========== SIMULATION API ==========
const runningProcesses = {};

app.post('/api/projects/:project/validate', (req, res) => {
    const runtimes = getAllRuntimes();
    const settings = loadSettings();
    const activeRuntime = runtimes.find(r => r.id === settings.active_runtime);
    if (!activeRuntime) return res.status(400).json({ error: 'No runtime found. Please check Settings.' });

    const filePath = path.join(PROJECTS_DIR, req.params.project, 'configs', req.body.filename);
    const tmpOut = path.join(os.tmpdir(), `gcsim_validate_${uuidv4()}.json`);

    exec(`"${activeRuntime.path}" -c "${filePath}" -out "${tmpOut}"`, { timeout: 15000 }, (err, stdout, stderr) => {
        try { if (fs.existsSync(tmpOut)) fs.unlinkSync(tmpOut); } catch(e) {}
        if (err) return res.json({ valid: false, output: (stderr + '\n' + stdout).trim() || 'Unknown syntax error.' });
        res.json({ valid: true, output: 'Config is valid. No syntax errors detected.' });
    });
});

function openUrl(url) {
    let cmd = process.platform === 'win32' ? `start "" "${url}"` : (process.platform === 'darwin' ? `open "${url}"` : `xdg-open "${url}"`);
    exec(cmd, () => {});
}

function runSimulations(files, gcsimPath, outputsDir, runId, mode, settings) {
    const maxWorkers = Math.max(1, os.cpus().length - 1); 
    runningProcesses[runId] = { status: 'running', current: files.length > 1 ? 'Running Multiple...' : path.basename(files[0]), log: [], mode, childProcesses: new Set() };
    
    let index = 0, activeWorkers = 0;
    
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
        const baseName = path.basename(filePath).replace('.txt', '');
        activeWorkers++;
        runningProcesses[runId].log.push(`\n[${baseName}] Starting...\n`);
        
        let cmd, execOptions = { timeout: 300000, maxBuffer: 1024 * 1024 * 50 };
        
        if (mode === 'optimize') {
            const optOutPath = path.join(outputsDir, `${baseName}_opt.json`);
            const optParams = [
                `total_liquid_substats=${settings.opt_liquid || 20}`,
                `indiv_liquid_cap=${settings.opt_cap || 10}`,
                `fixed_substats_count=${settings.opt_fixed || 2}`,
                `fine_tune=${settings.opt_tune !== undefined ? settings.opt_tune : 1}`,
                `show_substat_scalars=1`
            ].join(';');
            cmd = `"${gcsimPath}" -c "${filePath}" -out "${optOutPath}" -substatOptimFull -options="${optParams}"`;
        } else {
            // Updated so bulk runs don't overwrite the same sample.json
            const outPath = path.join(outputsDir, `${baseName}.json`);
            const samplePath = path.join(outputsDir, `${baseName}_sample.json`);
            cmd = `"${gcsimPath}" -c "${filePath}" -out "${outPath}" -sample="${samplePath}" -gz`;
        }
        
        const proc = exec(cmd, execOptions, (err, stdout, stderr) => {
            if (runningProcesses[runId]) runningProcesses[runId].childProcesses.delete(proc);
            if (err) runningProcesses[runId].log.push(`\n[${baseName}] Error: ${stderr}\n`);
            else runningProcesses[runId].log.push(`\n[${baseName}] Completed\n`);
            activeWorkers--;
            worker(); 
        });

        if (runningProcesses[runId]) runningProcesses[runId].childProcesses.add(proc);
        const logData = (data) => {
            const text = data.toString().split('\n').filter(l => l.trim()).map(l => `[${baseName}] ${l}\n`).join('');
            if (text && runningProcesses[runId]) runningProcesses[runId].log.push(text);
        };
        proc.stdout.on('data', logData);
        proc.stderr.on('data', logData);
    }
    for (let i = 0; i < Math.min(maxWorkers, files.length); i++) worker();
}

app.post('/api/projects/:project/run', (req, res) => {
    const runtimes = getAllRuntimes();
    const settings = loadSettings();
    const activeRuntime = runtimes.find(r => r.id === settings.active_runtime);
    if (!activeRuntime) return res.status(400).json({ error: 'Selected runtime executable not found.' });
    
    const projectDir = path.join(PROJECTS_DIR, req.params.project);
    const configsDir = path.join(projectDir, 'configs');
    const outputsDir = path.join(projectDir, 'outputs');
    if (!fs.existsSync(outputsDir)) fs.mkdirSync(outputsDir, { recursive: true });
    
    const filesToRun = req.body.filename ? [path.join(configsDir, req.body.filename)] : fs.readdirSync(configsDir).filter(f => f.endsWith('.txt')).map(f => path.join(configsDir, f));
    if (filesToRun.length === 0) return res.status(400).json({ error: 'No config files found' });
    
    const runId = uuidv4();
    res.json({ runId, message: `Starting ${filesToRun.length} simulation(s)` });
    runSimulations(filesToRun, activeRuntime.path, outputsDir, runId, 'run', settings);
});

app.post('/api/projects/:project/optimize', (req, res) => {
    const runtimes = getAllRuntimes();
    const settings = loadSettings();
    const activeRuntime = runtimes.find(r => r.id === settings.active_runtime);
    if (!activeRuntime) return res.status(400).json({ error: 'Selected runtime executable not found.' });
    
    const projectDir = path.join(PROJECTS_DIR, req.params.project);
    const configsDir = path.join(projectDir, 'configs');
    const outputsDir = path.join(projectDir, 'outputs');
    if (!fs.existsSync(outputsDir)) fs.mkdirSync(outputsDir, { recursive: true });
    
    const filesToRun = req.body.filename ? [path.join(configsDir, req.body.filename)] : fs.readdirSync(configsDir).filter(f => f.endsWith('.txt')).map(f => path.join(configsDir, f));
    if (filesToRun.length === 0) return res.status(400).json({ error: 'No config files found' });
    
    const runId = uuidv4();
    res.json({ runId, message: `Starting ${filesToRun.length} optimization(s)` });
    runSimulations(filesToRun, activeRuntime.path, outputsDir, runId, 'optimize', settings);
});

app.get('/api/runs/:runId', (req, res) => {
    const run = runningProcesses[req.params.runId];
    if (!run) return res.status(404).json({ error: 'Run not found' });
    res.json({ status: run.status, current: run.current, mode: run.mode, log: run.log });
});

app.post('/api/runs/:runId/terminate', (req, res) => {
    const run = runningProcesses[req.params.runId];
    if (run) {
        run.status = 'terminated';
        run.log.push('\nTerminated by user\n');
        if (run.childProcesses) {
            run.childProcesses.forEach(proc => {
                try { if (process.platform === 'win32' && proc.pid) execSync(`taskkill /F /T /PID ${proc.pid}`, { timeout: 5000 }); else proc.kill('SIGKILL'); } catch (e) { try { proc.kill('SIGKILL'); } catch(e2){} }
            });
            run.childProcesses.clear();
        }
    }
    res.json({ success: true });
});

function readGcsimJson(filePath) {
    const raw = fs.readFileSync(filePath);
    try { 
        //ZLIP GOO BUUUUUUUUUURRRRRRRRRRRRRR
        return JSON.parse(zlib.unzipSync(raw).toString('utf8')); 
    } 
    catch (e1) { 
        try {
            //fallback maybe the file is just raw uncompressed JSON ewww
            return JSON.parse(raw.toString('utf8')); 
        } catch (e2) {
            //Prevent total server crash if a file got corrupted also how tf did it...
            throw new Error(`Failed to parse ${path.basename(filePath)}. File may be corrupted.`);
        }
    }
}



// Fetch specific result JSON directly to the frontend for Native Viewer
app.get('/api/projects/:project/results/:filename', (req, res) => {
    const outputsDir = path.join(PROJECTS_DIR, req.params.project, 'outputs');
    let requestedName = req.params.filename;
    let filePath = path.join(outputsDir, requestedName);
    
    // MATCH MATCH matching: if the exact file doesn't exist, check alternative extensions
    if (!fs.existsSync(filePath)) {
        if (requestedName.endsWith('.gz')) {
            // Requested .gz, but maybe it saved as uncompressed .json
            const noGz = filePath.replace('.gz', '');
            if (fs.existsSync(noGz)) filePath = noGz;
        } else {
            // Requested .json, but maybe it saved as compressed .json.gz
            const withGz = filePath + '.gz';
            if (fs.existsSync(withGz)) filePath = withGz;
        }
    }
    
    try {
        if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Result file not found' });
        res.json(readGcsimJson(filePath));
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/projects/:project/results', (req, res) => {
    const outputsDir = path.join(PROJECTS_DIR, req.params.project, 'outputs');
    if (!fs.existsSync(outputsDir)) return res.json([]);
    
    // Look for both .json and .json.gz, while ignoring _sample files
    const files = fs.readdirSync(outputsDir).filter(f => 
        (f.endsWith('.json') || f.endsWith('.json.gz')) && 
        !f.includes('_sample.json')
    );
    const results = [];
    
    for (const f of files) {
        try {
            const filePath = path.join(outputsDir, f);
            const stat = fs.statSync(filePath);
            const data = readGcsimJson(filePath);
            
            results.push({
                filename: f,
                // Clean up the config name for the UI depending on extension
                configName: f.replace('_opt.json.gz', '').replace('_opt.json', '').replace('.json.gz', '').replace('.json', ''),
                mode: f.includes('_opt') ? 'Optimize' : 'Run',
                dps: data.statistics?.dps?.mean || 0,
                date: stat.mtimeMs
            });
        } catch(e) {
            console.error(`Skipping unreadable result file ${f}:`, e.message);
        }
    }
    results.sort((a,b) => b.date - a.date);
    res.json(results);
});

// Update the clear endpoint to delete .gz files as well
app.post('/api/projects/:project/results/clear', (req, res) => {
    const outputsDir = path.join(PROJECTS_DIR, req.params.project, 'outputs');
    try {
        if (fs.existsSync(outputsDir)) {
            const files = fs.readdirSync(outputsDir).filter(f => f.endsWith('.json') || f.endsWith('.json.gz'));
            for (const f of files) fs.unlinkSync(path.join(outputsDir, f));
            res.json({ success: true, deleted: files.length });
        } else {
            res.json({ success: true, deleted: 0 });
        }
    } catch (e) { res.status(500).json({ error: e.message }); }
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

app.listen(PORT, () => {
    console.log(`gcsim Manager running on http://localhost:${PORT}`);
});