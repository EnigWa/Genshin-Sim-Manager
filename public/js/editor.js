function escapeHtml(str) {
    return String(str).replace(/[&]/g, '&' + 'amp;').replace(/[<]/g, '&' + 'lt;').replace(/[>]/g, '&' + 'gt;');
}

function tokenize(text) {
    if (!text) return '';
    var lines = text.split('\n');
    var result = [];
    for (var li = 0; li < lines.length; li++) {
        var line = lines[li];
        if (line.trim() === '') { result.push('\n'); continue; }
        var trimmed = line.trim();
        if (trimmed.startsWith('#') || trimmed.startsWith('//')) {
            result.push('<span class="hl-comment">' + escapeHtml(line) + '</span>\n');
            continue;
        }
        var sectionMatch = trimmed.match(/^(\w[\w]*)(?:\s*\{?)\s*$/);
        if (sectionMatch && SECTION_NAMES.has(sectionMatch[1].toLowerCase())) {
            var indent = line.match(/^\s*/)[0];
            result.push(escapeHtml(indent) + '<span class="hl-section">' + escapeHtml(sectionMatch[1]) + '</span>' + escapeHtml(line.substring(indent.length + sectionMatch[1].length)) + '\n');
            continue;
        }
        result.push(tokenizeLine(line) + '\n');
    }
    return result.join('');
}

function tokenizeLine(line) {
    if (!line.trim()) return '';
    var tokens = [];
    var i = 0;
    while (i < line.length) {
        if (line[i] === ' ' || line[i] === '\t') {
            var ws = '';
            while (i < line.length && (line[i] === ' ' || line[i] === '\t')) { ws += line[i]; i++; }
            tokens.push(escapeHtml(ws));
            continue;
        }
        if (line[i] === '#' || (line[i] === '/' && line[i+1] === '/')) {
            tokens.push('<span class="hl-comment">' + escapeHtml(line.substring(i)) + '</span>');
            i = line.length;
            break;
        }
        if (line[i] === '{' || line[i] === '}' || line[i] === '(' || line[i] === ')') {
            tokens.push('<span class="hl-bracket">' + escapeHtml(line[i]) + '</span>');
            i++;
            continue;
        }
        if (/\d/.test(line[i])) {
            var num = '';
            while (i < line.length && (/\d/.test(line[i]) || line[i] === '.')) { num += line[i]; i++; }
            tokens.push('<span class="hl-number">' + escapeHtml(num) + '</span>');
            continue;
        }
        if (line[i] === '"' || line[i] === "'") {
            var quote = line[i];
            var str = quote;
            i++;
            while (i < line.length && line[i] !== quote) {
                if (line[i] === '\\') { str += line[i]; i++; if (i < line.length) { str += line[i]; i++; } }
                else { str += line[i]; i++; }
            }
            if (i < line.length) { str += line[i]; i++; }
            tokens.push('<span class="hl-string">' + escapeHtml(str) + '</span>');
            continue;
        }
        if (line[i] === ':') { tokens.push('<span class="hl-op">:</span>'); i++; continue; }
        if (line[i] === '=') { tokens.push('<span class="hl-op">=</span>'); i++; if (line[i] === ' ') { tokens.push(' '); i++; } continue; }
        if (line[i] === ',') { tokens.push('<span class="hl-op">,</span>'); i++; continue; }
        if (line[i] === '|' && line[i+1] === '|') { tokens.push('<span class="hl-op">||</span>'); i += 2; continue; }
        if (line[i] === '|') { tokens.push('<span class="hl-op">|</span>'); i++; continue; }
        if (/[a-zA-Z_]/.test(line[i]) || line[i] === '%') {
            var word = '';
            while (i < line.length && /[a-zA-Z0-9_\-\.%]/.test(line[i])) { word += line[i]; i++; }
            var nextChar = line[i] || '';
            if (nextChar === '=' || nextChar === ':') {
                tokens.push('<span class="hl-key">' + escapeHtml(word) + '</span>');
            } else if (SECTION_NAMES.has(word.toLowerCase())) {
                tokens.push('<span class="hl-section">' + escapeHtml(word) + '</span>');
            } else if (/^\d/.test(word)) {
                tokens.push('<span class="hl-number">' + escapeHtml(word) + '</span>');
            } else if (word.endsWith('%') || word.endsWith('_')) {
                tokens.push('<span class="hl-stat">' + escapeHtml(word) + '</span>');
            } else {
                tokens.push('<span class="hl-val">' + escapeHtml(word) + '</span>');
            }
            continue;
        }
        tokens.push(escapeHtml(line[i]));
        i++;
    }
    return tokens.join('');
}

function updateHighlight() {
    var editor = document.getElementById('editor');
    var highlight = document.getElementById('editorHighlight');
    highlight.innerHTML = tokenize(editor.value);
}

function syncEditorScroll() {
    var editor = document.getElementById('editor');
    var highlight = document.getElementById('editorHighlight');
    highlight.scrollTop = editor.scrollTop;
    highlight.scrollLeft = editor.scrollLeft;
}

function formatConfig() {
    var editor = document.getElementById('editor');
    var raw = editor.value;
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
    document.getElementById('saveStatus').textContent = 'Formatted (unsaved)';
    updateHighlight();
    toast('Config formatted', 'info');
}

var autosaveEnabled = true;

function toggleAutosave() {
    autosaveEnabled = document.getElementById('autosaveToggle').checked;
    localStorage.setItem('gcsim_autosave', autosaveEnabled);
}

function loadAutosavePreference() {
    var stored = localStorage.getItem('gcsim_autosave');
    if (stored !== null) {
        autosaveEnabled = stored === 'true';
        document.getElementById('autosaveToggle').checked = autosaveEnabled;
    }
}
