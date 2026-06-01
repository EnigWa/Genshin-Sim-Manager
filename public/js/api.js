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
