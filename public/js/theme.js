// ========== THEME SYSTEM ==========
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
}

function applyTextTheme(themeName) {
    document.documentElement.setAttribute('data-text', themeName);
    state.currentTextTheme = themeName;
    localStorage.setItem('gcsim_text', themeName);

    document.querySelectorAll('#textThemeGrid .text-theme-card').forEach(function(card) {
        card.classList.toggle('active', card.getAttribute('data-text-val') === themeName);
    });
}

function applyFontSize(size) {
    document.documentElement.style.setProperty('--editor-font-size', size + 'px');
    state.editorFontSize = size;
    localStorage.setItem('gcsim_fontsize', size.toString());
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
    // Highlight active bg theme
    document.querySelectorAll('#bgThemeGrid .theme-card').forEach(function(card) {
        card.classList.toggle('active', card.getAttribute('data-bg-val') === state.currentBgTheme);
    });
    // Highlight active text theme
    document.querySelectorAll('#textThemeGrid .text-theme-card').forEach(function(card) {
        card.classList.toggle('active', card.getAttribute('data-text-val') === state.currentTextTheme);
    });
    // Set font size slider
    document.getElementById('fontSizeSlider').value = state.editorFontSize;
    document.getElementById('fontSizeLabel').textContent = state.editorFontSize;
    document.getElementById('settingsModal').classList.add('show');
}

function showHelpModal() {
    document.getElementById('helpModal').classList.add('show');
}
