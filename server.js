const express = require('express');
const fs = require('fs');
const path = require('path');
const { exec, execSync } = require('child_process');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Settings file
const SETTINGS_FILE = path.join(__dirname, 'config.json');
const PROJECTS_DIR = path.join(__dirname, 'projects');

// Ensure projects directory exists
if (!fs.existsSync(PROJECTS_DIR)) {
    fs.mkdirSync(PROJECTS_DIR, { recursive: true });
}

// Load/save settings
function loadSettings() {
    try {
        if (fs.existsSync(SETTINGS_FILE)) {
            const raw = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'));
            // Migrate old config format to new format
            if (raw.gcsim_path && (!raw.gcsim_paths || raw.gcsim_paths.length === 0)) {
                raw.gcsim_paths = [raw.gcsim_path];
                raw.selected_gcsim = raw.gcsim_path;
            }
            if (!raw.gcsim_paths) raw.gcsim_paths = [];
            if (!raw.selected_gcsim) raw.selected_gcsim = '';
            return raw;
        }
    } catch (e) {
        console.error('Error loading settings:', e);
    }
    return { base_dir: __dirname, gcsim_paths: [], selected_gcsim: '', project_name: '' };
}

function saveSettings(settings) {
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2), 'utf8');
}

// Running processes tracking
const runningProcesses = {};

// ========== SETTINGS API ==========
app.get('/api/settings', (req, res) => {
    res.json(loadSettings());
});

app.post('/api/settings', (req, res) => {
    const settings = req.body;
    saveSettings(settings);
    res.json({ success: true });
});

// ========== BROWSE API (FILE INSPECTOR) ==========
function getDrives() {
    const drives = [];
    if (process.platform === 'win32') {
        // Start from C (67) to avoid floppy drives (A and B) which cause hardware scan lag
        for (let i = 67; i <= 90; i++) {
            const drive = String.fromCharCode(i) + ':';
            try {
                if (fs.existsSync(drive + '\\')) {
                    drives.push(drive);
                }
            } catch (e) {}
        }
    }
    return drives;
}

app.post('/api/browse', (req, res) => {
    let targetDir = req.body.path;
    
    const settings = loadSettings();
    const defaultDir = settings.selected_gcsim && fs.existsSync(settings.selected_gcsim)
        ? path.dirname(settings.selected_gcsim)
        : __dirname;
    
    // Fallback if no path is provided or if directory does not exist
    if (!targetDir || !fs.existsSync(targetDir)) {
        targetDir = defaultDir;
    }
    
    try {
        // Resolve absolute path
        targetDir = path.resolve(targetDir);
        
        // Final sanity check
        if (!fs.existsSync(targetDir) || !fs.statSync(targetDir).isDirectory()) {
            targetDir = path.resolve(defaultDir);
        }
        
        const items = fs.readdirSync(targetDir, { withFileTypes: true });
        
        const dirs = [];
        const files = [];
        
        for (const item of items) {
            try {
                const itemPath = path.join(targetDir, item.name);
                if (item.isDirectory()) {
                    dirs.push({
                        name: item.name,
                        path: itemPath
                    });
                } else if (item.isFile()) {
                    files.push({
                        name: item.name,
                        path: itemPath
                    });
                }
            } catch (e) {
                // Ignore items that can't be read (e.g. permission issues)
            }
        }
        
        // Sort directories and files alphabetically
        dirs.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
        files.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
        
        const parent = path.dirname(targetDir);
        
        res.json({
            currentPath: targetDir,
            parentPath: parent !== targetDir ? parent : null,
            directories: dirs,
            files: files,
            drives: getDrives()
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
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
    if (!name) {
        return res.status(400).json({ error: 'Project name required' });
    }
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
        if (!fs.existsSync(oldDir)) {
            return res.status(404).json({ error: 'Project not found' });
        }
        if (fs.existsSync(newDir)) {
            return res.status(400).json({ error: 'A project with that name already exists' });
        }
        fs.renameSync(oldDir, newDir);
        res.json({ success: true, name: newName });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.delete('/api/projects/:project', (req, res) => {
    const projectDir = path.join(PROJECTS_DIR, req.params.project);
    try {
        if (!fs.existsSync(projectDir)) {
            return res.status(404).json({ error: 'Project not found' });
        }
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
    try {
        if (fs.existsSync(sortPath)) {
            return JSON.parse(fs.readFileSync(sortPath, 'utf8'));
        }
    } catch (e) {}
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
            
            // Get or initialize sort order
            var sortOrder = loadSortOrder(configsDir);
            if (sortOrder.length === 0 && allFiles.length > 0) {
                sortOrder = allFiles.map(function(f) { return f.name; });
                saveSortOrder(configsDir, sortOrder);
            }
            
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
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/projects/:project/configs/swap', (req, res) => {
    const { nameA, nameB } = req.body;
    if (!nameA || !nameB) return res.status(400).json({ error: 'Two filenames required (nameA, nameB)' });
    
    const configsDir = getProjectPath(req.params.project);
    const pathA = path.join(configsDir, nameA);
    const pathB = path.join(configsDir, nameB);
    
    try {
        if (!fs.existsSync(pathA) || !fs.existsSync(pathB)) {
            return res.status(404).json({ error: 'One or both files not found' });
        }
        
        // Ensure sort order exists, initialize from filesystem if not
        var sortOrder = loadSortOrder(configsDir);
        if (sortOrder.length === 0) {
            sortOrder = fs.readdirSync(configsDir).filter(f => f.endsWith('.txt'));
        }
        
        var idxA = sortOrder.indexOf(nameA);
        var idxB = sortOrder.indexOf(nameB);
        if (idxA !== -1 && idxB !== -1) {
            sortOrder[idxA] = nameB;
            sortOrder[idxB] = nameA;
            saveSortOrder(configsDir, sortOrder);
            return res.json({ success: true });
        }
        
        res.status(500).json({ error: 'Could not find files in sort order' });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/projects/:project/configs/:filename', (req, res) => {
    const filePath = path.join(getProjectPath(req.params.project), req.params.filename);
    try {
        if (fs.existsSync(filePath)) {
            const content = fs.readFileSync(filePath, 'utf8');
            res.json({ content, name: req.params.filename });
        } else {
            res.status(404).json({ error: 'File not found' });
        }
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/projects/:project/configs/:filename', (req, res) => {
    const filePath = path.join(getProjectPath(req.params.project), req.params.filename);
    const { content } = req.body;
    try {
        const dir = path.dirname(filePath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(filePath, content || '', 'utf8');
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.put('/api/projects/:project/configs', (req, res) => {
    const { filename } = req.body;
    if (!filename) {
        return res.status(400).json({ error: 'Filename required' });
    }
    let fname = filename;
    if (!fname.endsWith('.txt')) fname += '.txt';
    const filePath = path.join(getProjectPath(req.params.project), fname);
    try {
        const dir = path.dirname(filePath);
        if (!fs.existsSync(dir)) {
            return res.status(400).json({ error: 'Project does not exist' });
        }
        if (fs.existsSync(filePath)) {
            return res.status(400).json({ error: 'File already exists' });
        }
        fs.writeFileSync(filePath, '', 'utf8');
        res.json({ success: true, name: fname });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.delete('/api/projects/:project/configs/:filename', (req, res) => {
    const filePath = path.join(getProjectPath(req.params.project), req.params.filename);
    try {
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            res.json({ success: true });
        } else {
            res.status(404).json({ error: 'File not found' });
        }
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.put('/api/projects/:project/configs/:filename/rename', (req, res) => {
    const { newName } = req.body;
    if (!newName) return res.status(400).json({ error: 'New name required' });
    
    let newFname = newName;
    if (!newFname.endsWith('.txt')) newFname += '.txt';
    
    const oldPath = path.join(getProjectPath(req.params.project), req.params.filename);
    const newPath = path.join(getProjectPath(req.params.project), newFname);
    
    try {
        if (fs.existsSync(newPath)) {
            return res.status(400).json({ error: 'File already exists' });
        }
        if (!fs.existsSync(oldPath)) {
            return res.status(404).json({ error: 'File not found' });
        }
        fs.renameSync(oldPath, newPath);
        res.json({ success: true, name: newFname });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/projects/:project/configs/:filename/duplicate', (req, res) => {
    const filePath = path.join(getProjectPath(req.params.project), req.params.filename);
    try {
        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ error: 'File not found' });
        }
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
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ========== EXPORT / IMPORT ==========
app.get('/api/projects/:project/export', (req, res) => {
    const configsDir = getProjectPath(req.params.project);
    try {
        if (!fs.existsSync(configsDir)) {
            return res.status(400).json({ error: 'Project not found' });
        }
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
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/projects/:project/import', (req, res) => {
    const { content } = req.body;
    if (!content) return res.status(400).json({ error: 'No content provided' });
    
    const configsDir = getProjectPath(req.params.project);
    try {
        if (!fs.existsSync(configsDir)) {
            return res.status(400).json({ error: 'Project not found' });
        }
        
        const fileRegex = /# ======== START:\s*(.+?) ========\n([\s\S]*?)\n# ======== END:\s*\1 ========/g;
        let match;
        let imported = 0;
        let skipped = 0;
        
        while ((match = fileRegex.exec(content)) !== null) {
            const filename = match[1].trim();
            const fileContent = match[2];
            
            if (!filename.endsWith('.txt')) {
                skipped++;
                continue;
            }
            
            const filePath = path.join(configsDir, filename);
            fs.writeFileSync(filePath, fileContent, 'utf8');
            imported++;
        }
        
        res.json({ success: true, imported, skipped });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ========== SIMULATION API ==========
// Run a single config (just simulation, no optimization)
app.post('/api/projects/:project/run', (req, res) => {
    const { filename, gcsimPath } = req.body;
    const settings = loadSettings();
    const gcsim = gcsimPath || settings.selected_gcsim;
    
    if (!gcsim) {
        return res.status(400).json({ error: 'No sim executable selected' });
    }
    if (!gcsim.endsWith('.exe')) {
        return res.status(400).json({ error: 'Selected path is not an executable (.exe)' });
    }
    
    const projectDir = path.join(PROJECTS_DIR, req.params.project);
    const configsDir = path.join(projectDir, 'configs');
    const outputsDir = path.join(projectDir, 'outputs');
    
    if (!fs.existsSync(outputsDir)) {
        fs.mkdirSync(outputsDir, { recursive: true });
    }
    
    const runId = uuidv4();
    
    const filesToRun = filename 
        ? [path.join(configsDir, filename)]
        : fs.readdirSync(configsDir).filter(f => f.endsWith('.txt')).map(f => path.join(configsDir, f));
    
    if (filesToRun.length === 0) {
        return res.status(400).json({ error: 'No config files found' });
    }
    
    res.json({ runId, message: `Starting ${filesToRun.length} simulation(s)` });
    
    runSimulations(filesToRun, gcsim, outputsDir, runId, 'run');
});

// Run optimization (substat optimization only)
app.post('/api/projects/:project/optimize', (req, res) => {
    const { filename, gcsimPath } = req.body;
    const settings = loadSettings();
    const gcsim = gcsimPath || settings.selected_gcsim;
    
    if (!gcsim) {
        return res.status(400).json({ error: 'No sim executable selected' });
    }
    if (!gcsim.endsWith('.exe')) {
        return res.status(400).json({ error: 'Selected path is not an executable (.exe)' });
    }
    
    const projectDir = path.join(PROJECTS_DIR, req.params.project);
    const configsDir = path.join(projectDir, 'configs');
    const outputsDir = path.join(projectDir, 'outputs');
    
    if (!fs.existsSync(outputsDir)) {
        fs.mkdirSync(outputsDir, { recursive: true });
    }
    
    const runId = uuidv4();
    
    const filesToRun = filename 
        ? [path.join(configsDir, filename)]
        : fs.readdirSync(configsDir).filter(f => f.endsWith('.txt')).map(f => path.join(configsDir, f));
    
    if (filesToRun.length === 0) {
        return res.status(400).json({ error: 'No config files found' });
    }
    
    res.json({ runId, message: `Starting ${filesToRun.length} optimization(s)` });
    
    runSimulations(filesToRun, gcsim, outputsDir, runId, 'optimize');
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

function runSimulations(files, gcsimPath, outputsDir, runId, mode) {
    let index = 0;
    runningProcesses[runId] = { status: 'running', current: '', log: [], mode, hasOpenedViewer: false, childProcess: null };
    
    function runNext() {
        // Stop processing if terminated
        if (runningProcesses[runId] && runningProcesses[runId].status === 'terminated') {
            runningProcesses[runId].log.push(`All remaining ${files.length - index} ${mode === 'optimize' ? 'optimizations' : 'simulations'} cancelled\n`);
            return;
        }
        
        if (index >= files.length) {
            runningProcesses[runId].status = 'completed';
            runningProcesses[runId].log.push(`All ${mode === 'optimize' ? 'optimizations' : 'simulations'} completed\n`);
            return;
        }
        
        const filePath = files[index];
        const fileName = path.basename(filePath);
        runningProcesses[runId].current = fileName;
        runningProcesses[runId].log.push(`Starting ${fileName}...\n`);
        
        // Reset viewer flag for each new simulation file
        runningProcesses[runId].hasOpenedViewer = false;
        
        let cmd;
        if (mode === 'optimize') {
            // Optimization: ./sim.exe -c config.txt -s -substatOptimFull
            const optOutPath = path.join(outputsDir, fileName.replace('.txt', '_opt.txt'));
            cmd = `"${gcsimPath}" -c "${filePath}" -out "${optOutPath}" -s -substatOptimFull`;
        } else {
            // Run only: ./sim.exe -c config.txt -s
            const outPath = path.join(outputsDir, fileName.replace('.txt', '_out.txt'));
            cmd = `"${gcsimPath}" -c "${filePath}" -out "${outPath}" -s`;
        }
        
        const proc = exec(cmd, { timeout: 300000, maxBuffer: 1024 * 1024 * 50 }, (err, stdout, stderr) => {
            // Clear child process reference when it finishes
            if (runningProcesses[runId]) {
                runningProcesses[runId].childProcess = null;
            }
            if (err) {
                runningProcesses[runId].log.push(`${mode === 'optimize' ? 'Optimization' : 'Run'} error for ${fileName}: ${stderr}\n`);
            } else {
                runningProcesses[runId].log.push(`Completed ${fileName}\n`);
            }
            index++;
            runNext();
        });

        // Helper to check for share link in real-time stream data
        function handleRealtimeData(data) {
            const text = data.toString();
            runningProcesses[runId].log.push(text);
            
            // Only open ONE URL per simulation run - immediately detach listeners after opening
            const urlRegex = /https?:\/\/(?:[a-zA-Z0-9-]+\.)*gcsim\.app\/\S+/i;
            const match = text.match(urlRegex);
            if (match && !runningProcesses[runId].hasOpenedViewer) {
                runningProcesses[runId].hasOpenedViewer = true;
                // Detach listeners immediately to prevent any second URL from being opened
                proc.stdout.removeListener('data', handleRealtimeData);
                proc.stderr.removeListener('data', handleRealtimeData);
                const url = match[0].trim().replace(/[.,;:!)]$/, '');
                openUrl(url);
            }
        }

        // Store reference to child process for termination
        if (runningProcesses[runId]) {
            runningProcesses[runId].childProcess = proc;
        }

        proc.stdout.on('data', handleRealtimeData);
        proc.stderr.on('data', handleRealtimeData);
    }
    
    runNext();
}

app.get('/api/runs/:runId', (req, res) => {
    const run = runningProcesses[req.params.runId];
    if (!run) {
        return res.status(404).json({ error: 'Run not found' });
    }
    res.json({
        status: run.status,
        current: run.current,
        mode: run.mode,
        log: run.log
    });
});

app.post('/api/runs/:runId/terminate', (req, res) => {
    const run = runningProcesses[req.params.runId];
    if (run) {
        run.status = 'terminated';
        run.log.push('Terminated by user\n');
        // Kill the actual child process if it exists
        if (run.childProcess) {
            try {
                // On Windows, need to kill the process tree
                const pid = run.childProcess.pid;
                if (pid) {
                    execSync(`taskkill /F /T /PID ${pid}`, { timeout: 5000 });
                }
            } catch (e) {
                // Fallback to regular kill
                try { run.childProcess.kill('SIGKILL'); } catch (e2) {}
            }
            run.childProcess = null;
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
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/projects/:project/outputs/:filename', (req, res) => {
    const filePath = path.join(PROJECTS_DIR, req.params.project, 'outputs', req.params.filename);
    try {
        if (fs.existsSync(filePath)) {
            const content = fs.readFileSync(filePath, 'utf8');
            res.json({ content, name: req.params.filename });
        } else {
            res.status(404).json({ error: 'File not found' });
        }
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.listen(PORT, () => {
    console.log(`gcsim Manager running on http://localhost:${PORT}`);
});