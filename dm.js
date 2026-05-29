function cambiarVista(idVista) {
    document.querySelectorAll('.dm-vista').forEach(v => v.classList.remove('activa'));
    document.getElementById(idVista).classList.add('activa');
}

// Bloquear interacciones con inputs de tipo file (evita que se abra la ventana del PC)
document.querySelectorAll('input[type="file"]').forEach(input => {
    input.addEventListener('click', function(e) {
        e.preventDefault();
        alert("Las imágenes/audios deben estar subidas en GitHub. Usa el botón de Guardar o Cargar de al lado para escribir su nombre.");
    });
});

async function actualizarEstadoVTT(payload) {
    if (typeof supabaseClient !== 'undefined') {
        const { error } = await supabaseClient.from('vtt_estado').update(payload).eq('id', 1);
        if (error) console.error("Error al sincronizar con Supabase:", error);
    }
}

// --- MAPAS, TOKENS Y GALERÍA (Archivos de GitHub) ---
let galeriaMapas = JSON.parse(localStorage.getItem('galeriaMapas')) || [];
let galeriaTokens = JSON.parse(localStorage.getItem('galeriaTokens')) || [];
let mapaEnMemoria = null; let estadoRejilla = false; let tokensEnMapa = []; 
const wrapperMapa = document.getElementById('wrapper-mapa'); let tokenActivoID = null;

document.getElementById('btn-guardar-galeria').addEventListener('click', function(e) {
    e.preventDefault();
    const tipo = document.getElementById('tipo-archivo').value;
    const nombreArchivo = prompt(`Escribe el nombre del archivo en la carpeta assets/${tipo === 'mapa' ? 'mapas' : 'tokens'}/ de tu GitHub (ej. cueva.jpg):`);
    
    if (!nombreArchivo) return;

    const urlGithub = `assets/${tipo === 'mapa' ? 'mapas' : 'tokens'}/${nombreArchivo}`;

    if (tipo === 'mapa') {
        galeriaMapas.push(urlGithub);
        localStorage.setItem('galeriaMapas', JSON.stringify(galeriaMapas));
    } else {
        galeriaTokens.push(urlGithub);
        localStorage.setItem('galeriaTokens', JSON.stringify(galeriaTokens));
    }

    renderizarGalerias();
});

function renderizarGalerias() {
    document.getElementById('galeria-mapas').innerHTML = ''; document.getElementById('galeria-tokens').innerHTML = '';
    galeriaMapas.forEach(url => {
        const img = document.createElement('div'); img.className = 'item-galeria'; img.style.backgroundImage = `url(${url})`;
        img.onclick = () => cargarMapaEnTablero(url); document.getElementById('galeria-mapas').appendChild(img);
    });
    galeriaTokens.forEach(url => {
        const img = document.createElement('div'); img.className = 'item-galeria'; img.style.backgroundImage = `url(${url})`;
        img.onclick = () => crearToken(url); document.getElementById('galeria-tokens').appendChild(img);
    });
}

function cargarMapaEnTablero(url) {
    mapaEnMemoria = url; document.getElementById('img-mapa').src = url;
    wrapperMapa.style.display = "inline-block"; cambiarVista('vista-mapa-dm');
}

function vaciarTablero() {
    if(confirm("¿Vaciar el tablero?")) {
        mapaEnMemoria = null; document.getElementById('img-mapa').src = ""; wrapperMapa.style.display = "none";
        tokensEnMapa = []; document.querySelectorAll('.token-dm').forEach(t => t.remove());
        actualizarEstadoVTT({ mapa_url: null, tokens: [] });
    }
}

if (document.getElementById('btn-toggle-rejilla')) {
    document.getElementById('btn-toggle-rejilla').addEventListener('click', () => {
        estadoRejilla = !estadoRejilla; const capa = document.getElementById('capa-rejilla');
        if(estadoRejilla) capa.classList.add('activa'); else capa.classList.remove('activa');
        actualizarEstadoVTT({ rejilla: estadoRejilla });
    });
}

if (document.getElementById('btn-enviar-mapa')) {
    document.getElementById('btn-enviar-mapa').addEventListener('click', function() {
        if (mapaEnMemoria) {
            actualizarEstadoVTT({ mapa_url: mapaEnMemoria, rejilla: estadoRejilla });
            sincronizarTokensJugadores();
            alert("¡Tablero proyectado a los jugadores!");
        }
    });
}

function crearToken(url) {
    if(!mapaEnMemoria) return; cambiarVista('vista-mapa-dm'); 
    const idToken = 'token_' + Date.now();
    const tokenData = { id: idToken, img: url, x: '50%', y: '50%', visible: false, escala: 50, color: '#e74c3c' };
    tokensEnMapa.push(tokenData);
    const tokenEl = document.createElement('div'); tokenEl.className = 'token-dm token-oculto'; tokenEl.id = idToken;
    tokenEl.style.backgroundImage = `url(${url})`; tokenEl.style.left = tokenData.x; tokenEl.style.top = tokenData.y;
    wrapperMapa.appendChild(tokenEl); actualizarVisualToken(idToken); sincronizarTokensJugadores();

    let isDragging = false;
    tokenEl.addEventListener('mousedown', function(e) { if(e.button === 0) { isDragging = true; cerrarMenuToken(); e.preventDefault(); } });
    document.addEventListener('mousemove', function(e) {
        if (isDragging) {
            const rect = wrapperMapa.getBoundingClientRect();
            let pxX = e.clientX - rect.left; let pxY = e.clientY - rect.top;
            if(pxX < 0) pxX = 0; if(pxX > rect.width) pxX = rect.width;
            if(pxY < 0) pxY = 0; if(pxY > rect.height) pxY = rect.height;
            tokenEl.style.left = `${(pxX / rect.width) * 100}%`; tokenEl.style.top = `${(pxY / rect.height) * 100}%`;
        }
    });
    document.addEventListener('mouseup', function() {
        if (isDragging) { 
            isDragging = false; const t = tokensEnMapa.find(t => t.id === idToken);
            if (t) { t.x = tokenEl.style.left; t.y = tokenEl.style.top; sincronizarTokensJugadores(); } 
        }
    });
    tokenEl.addEventListener('dblclick', function(e) {
        tokenActivoID = idToken; const menu = document.getElementById('menu-token');
        menu.style.display = 'block'; menu.style.left = e.pageX + 'px'; menu.style.top = e.pageY + 'px';
        document.getElementById('color-token').value = tokensEnMapa.find(t => t.id === idToken).color;
    });
}

function cerrarMenuToken() { document.getElementById('menu-token').style.display = 'none'; tokenActivoID = null; }

function accionToken(accion, valor) {
    if (!tokenActivoID) return; const index = tokensEnMapa.findIndex(t => t.id === tokenActivoID);
    if (index === -1) return; let t = tokensEnMapa[index];
    if (accion === 'borrar') { document.getElementById(tokenActivoID).remove(); tokensEnMapa.splice(index, 1); cerrarMenuToken(); } 
    else if (accion === 'visibilidad') { t.visible = !t.visible; } 
    else if (accion === 'escala') { let nuevoTam = prompt("Tamaño (50=Medio):", t.escala); if (nuevoTam) t.escala = parseInt(nuevoTam); } 
    else if (accion === 'color') { t.color = valor; }
    if(accion !== 'borrar') actualizarVisualToken(tokenActivoID); sincronizarTokensJugadores();
}

function actualizarVisualToken(id) {
    const t = tokensEnMapa.find(t => t.id === id); const div = document.getElementById(id);
    if(t && div) {
        div.style.width = t.escala + 'px'; div.style.height = t.escala + 'px'; div.style.borderColor = t.color;
        if(t.visible) div.classList.remove('token-oculto'); else div.classList.add('token-oculto');
    }
}

function sincronizarTokensJugadores() { actualizarEstadoVTT({ tokens: tokensEnMapa }); }

// --- AUDIO Y MÚSICA (Archivos de GitHub) ---
let audioEnMemoria = null; const audioDM = document.getElementById('audio-ambiente-dm');

// Botón de carga genérico, ya que hemos bloqueado el "input-audio" arriba
const btnCargarAudio = document.getElementById('btn-play-audio').parentElement; // Tomamos el contenedor por si acaso
btnCargarAudio.addEventListener('contextmenu', function(e) {
    // Si necesitas un botón explícito, es mejor crear uno, pero con esto interceptamos un clic derecho por si acaso
});

// Para facilitar la carga de audio sin input type file:
const btnAudioDirecto = document.createElement('button');
btnAudioDirecto.innerText = "🎵 Seleccionar Pista GitHub";
btnAudioDirecto.className = "btn-dado";
btnAudioDirecto.style.marginBottom = "10px";
btnAudioDirecto.onclick = function() {
    const nombreArchivo = prompt(`Escribe el nombre del audio en la carpeta assets/musica/ de tu GitHub (ej. taberna.mp3):`);
    if (!nombreArchivo) return;
    audioEnMemoria = `assets/musica/${nombreArchivo}`;
    document.getElementById('status-audio').innerText = "Audio listo: " + nombreArchivo;
};
// Lo insertamos encima de los controles de audio
if (document.getElementById('status-audio')) {
    document.getElementById('status-audio').parentNode.insertBefore(btnAudioDirecto, document.getElementById('status-audio'));
}

document.getElementById('btn-play-audio').addEventListener('click', async function() {
    if (!audioEnMemoria) return;
    audioDM.src = audioEnMemoria;
    try {
        await audioDM.play();
        actualizarEstadoVTT({ audio_url: audioEnMemoria });
        if (typeof canalVTT !== 'undefined') {
            canalVTT.send({ type: 'broadcast', event: 'audio-comando', payload: { cmd: 'play' } });
        }
        document.getElementById('status-audio').innerText = "Reproduciendo";
    } catch(err) {
        console.error(err);
        document.getElementById('status-audio').innerText = "Error reproduciendo";
    }
});

document.getElementById('btn-pause-audio').addEventListener('click', function() {
    if (typeof canalVTT !== 'undefined') {
        canalVTT.send({ type: 'broadcast', event: 'audio-comando', payload: { cmd: 'pause' } });
    }
    audioDM.pause(); document.getElementById('status-audio').innerText = "Pausado";
});

document.getElementById('volume-audio').addEventListener('input', function(e) {
    audioDM.volume = e.target.value;
    actualizarEstadoVTT({ audio_volumen: e.target.value });
});

// --- DADOS, HISTORIAL Y WIKI (DM) ---
function reproducirSonidoDado() {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    for (let i = 0; i < 4; i++) {
        setTimeout(() => {
            const osc = ctx.createOscillator(); const gainNode = ctx.createGain();
            osc.connect(gainNode); gainNode.connect(ctx.destination); osc.type = 'square';
            osc.frequency.setValueAtTime(100 + Math.random() * 50, ctx.currentTime);
            gainNode.gain.setValueAtTime(0.1, ctx.currentTime); gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.05);
            osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.05);
        }, i * 120);
    }
}

// Lógica unificada para mostrar dados y registrar historial para el DM
function mostrarDadoDM(quien, caras, base, total, motivo) {
    cambiarVista('vista-dados'); 
    reproducirSonidoDado();
    
    const arena = document.getElementById('arena-3d');
    const numCaras = parseInt(caras);
    let cl = 'forma-d' + numCaras;
    if (!numCaras || isNaN(numCaras)) cl = 'forma-d6';

    let color = "white";
    if (numCaras === 20 && base === 20) color = "gold";
    if (numCaras === 20 && base === 1) color = "red";

    const dadoDiv = document.createElement('div');
    dadoDiv.className = 'contenedor-dado-animado';
    dadoDiv.innerHTML = `
        <div class="dado-visual ${cl} rodando" style="width:100px;height:100px;font-size:2.5rem;color:${color}; margin: 0 auto;">${total}</div>
        <p style="color:#2ecc71; font-size:1.2rem; font-weight:bold; margin:10px 0 5px 0; text-align:center;">${quien}</p>
        <p style="color:#aaa; font-size:0.9rem; margin:0; text-align:center;">${motivo}</p>
    `;
    
    arena.appendChild(dadoDiv);

    // Crear/Usar Historial DM Automático
    let hist = document.getElementById('historial-tiradas-dm');
    if (!hist) {
        hist = document.createElement('div');
        hist.id = 'historial-tiradas-dm';
        hist.style.background = '#1e1e1e';
        hist.style.border = '1px solid #333';
        hist.style.padding = '10px';
        hist.style.height = '300px';
        hist.style.overflowY = 'auto';
        hist.style.marginTop = '20px';
        hist.style.width = '100%';
        arena.parentElement.appendChild(hist);
    }
    
    const item = document.createElement('div');
    item.style.padding = '8px';
    item.style.borderBottom = '1px solid #333';
    item.innerHTML = `<strong style="color:#2ecc71">${quien}</strong> tiró d${numCaras} <i>(${motivo})</i>: <b style="color:#3498db; font-size:1.2em">${total}</b>`;
    hist.prepend(item);

    setTimeout(() => { dadoDiv.remove(); }, 4500);
}

function lanzarDado(caras) {
    const base = Math.floor(Math.random() * caras) + 1;
    const pkt = { quien: "Dungeon Master", caras: caras, resultado: base, mod: 0, total: base, motivo: `Tirada DM`, tiempo: Date.now() };
    
    if (typeof canalVTT !== 'undefined') {
        canalVTT.send({ type: 'broadcast', event: 'dado-dm', payload: pkt });
    }
    mostrarDadoDM(pkt.quien, pkt.caras, pkt.resultado, pkt.total, pkt.motivo);
}

// ESCUCHAR DADOS JUGADORES (Supabase Realtime)
if (typeof canalVTT !== 'undefined') {
    canalVTT.on('broadcast', { event: 'dado-jugador' }, (mensaje) => {
        const info = mensaje.payload;
        mostrarDadoDM(info.quien, info.caras, info.resultado, info.total, info.motivo);
    }).subscribe();
}

// WIKI Y FICHAS 
let wikiDB = JSON.parse(localStorage.getItem('wikiDM')) || { "root": { id: "root", tipo: "carpeta", titulo: "Campaña", hijos: [] } };
function guardarWiki() { localStorage.setItem('wikiDM', JSON.stringify(wikiDB)); renderizarWiki(); }
function generarID() { return '_' + Math.random().toString(36).substr(2, 9); }
function construirArbolHTML(idElemento) {
    const el = wikiDB[idElemento]; if (!el) return ''; let html = `<div class="item-wiki">`;
    if (el.tipo === 'articulo') { 
        html += `<span class="nombre-wiki" onclick="abrirArticulo('${el.id}')">📄 ${el.titulo}</span><div><button class="btn-mini" onclick="borrarElemento('${el.id}', '${el.padre}')">X</button></div></div>`; 
        return `<li>${html}</li>`; 
    } else { 
        html += `<span class="nombre-wiki" style="font-weight:bold; cursor:pointer;" onclick="let ul = document.getElementById('ul-${el.id}'); ul.style.display = (ul.style.display === 'none') ? 'block' : 'none';">📁 ${el.titulo}</span>`; 
        if (el.id !== 'root') html += `<div><button class="btn-mini" onclick="borrarElemento('${el.id}', '${el.padre}')">X</button></div>`; 
        html += `</div><div style="margin-left: 20px;"><button class="btn-mini" onclick="crearElemento('${el.id}', 'carpeta')" style="background:#2ecc71;">+ Carp</button><button class="btn-mini" onclick="crearElemento('${el.id}', 'articulo')" style="background:#3498db;">+ Art</button></div><ul id="ul-${el.id}">`; 
        el.hijos.forEach(hijoID => { html += construirArbolHTML(hijoID); }); 
        html += `</ul>`; return `<li>${html}</li>`; 
    }
}
function exportarCampañaCompleta() {
    const campaña = { wikiDB, fichasDB, galeriaMapas, galeriaTokens };
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(campaña));
    const a = document.createElement('a'); a.href = dataStr; a.download = "campaña_vtt.json"; a.click();
}
function importarCampañaCompleta(file) {
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const data = JSON.parse(e.target.result);
            wikiDB = data.wikiDB || {}; fichasDB = data.fichasDB || {}; galeriaMapas = data.galeriaMapas || []; galeriaTokens = data.galeriaTokens || [];
            localStorage.setItem('wikiDM', JSON.stringify(wikiDB)); localStorage.setItem('fichasDM', JSON.stringify(fichasDB)); localStorage.setItem('galeriaMapas', JSON.stringify(galeriaMapas)); localStorage.setItem('galeriaTokens', JSON.stringify(galeriaTokens));
            renderizarWiki(); renderizarFichasUI(); renderizarGalerias();
            alert("Campaña importada");
        } catch(err) { alert("Archivo inválido"); }
    };
    reader.readAsText(file);
}
function renderizarWiki() { document.getElementById('arbol-glosario').innerHTML = construirArbolHTML('root'); }
function crearElemento(idPadre, tipo) { const titulo = prompt(`Nombre:`); if (titulo) { const nid = generarID(); wikiDB[nid] = { id: nid, tipo: tipo, titulo: titulo, padre: idPadre, hijos: tipo === 'carpeta' ? [] : undefined, contenido: "" }; wikiDB[idPadre].hijos.push(nid); guardarWiki(); } }
function borrarElemento(id, idPadre) { if (confirm("¿Borrar?")) { wikiDB[idPadre].hijos = wikiDB[idPadre].hijos.filter(h => h !== id); delete wikiDB[id]; guardarWiki(); } }
function abrirArticulo(id) { document.getElementById('editor-titulo').value = wikiDB[id].titulo; document.getElementById('editor-contenido').value = wikiDB[id].contenido || ""; cambiarVista('vista-editor'); }

let fichasDB = JSON.parse(localStorage.getItem('fichasDM')) || {}; let fichaActualID = null;
function renderizarFichasUI() { const lista = document.getElementById('lista-fichas-ui'); lista.innerHTML = ''; for(let id in fichasDB) { const div = document.createElement('div'); div.className = `item-lista-ficha ${id === fichaActualID ? 'activa' : ''}`; div.innerText = fichasDB[id].nombre || "Sin nombre"; div.onclick = () => cargarFichaEnEditor(id); lista.appendChild(div); } }
function crearFichaNueva() { const id = generarID(); fichasDB[id] = { id: id, nombre: "Nuevo", hp: "10", ca: "10", ini: "0", vel: "30", fue: "10", des: "10", con: "10", int: "10", sab: "10", car: "10", notas: "" }; localStorage.setItem('fichasDM', JSON.stringify(fichasDB)); cargarFichaEnEditor(id); }
function cargarFichaEnEditor(id) { fichaActualID = id; document.getElementById('editor-ficha-ui').style.display = 'block'; const f = fichasDB[id]; ['nombre','hp','ca','ini','vel','fue','des','con','int','sab','car','notas'].forEach(c => document.getElementById(`ficha-${c}`).value = f[c] || ""); renderizarFichasUI(); }
function guardarFichaActual() { if(!fichaActualID) return; const f = fichasDB[fichaActualID]; ['nombre','hp','ca','ini','vel','fue','des','con','int','sab','car','notas'].forEach(c => f[c] = document.getElementById(`ficha-${c}`).value); localStorage.setItem('fichasDM', JSON.stringify(fichasDB)); renderizarFichasUI(); }
function exportarFichaSeleccionada() { if(!fichaActualID) return; const f = fichasDB[fichaActualID]; const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(f)); const a = document.createElement('a'); a.href = dataStr; a.download = `${f.nombre}_ficha.json`; a.click(); }

renderizarWiki(); renderizarGalerias(); renderizarFichasUI();
window.addEventListener('DOMContentLoaded', renderizarGalerias);
