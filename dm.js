function cambiarVista(idVista) {
    document.querySelectorAll('.dm-vista').forEach(v => v.classList.remove('activa'));
    document.getElementById(idVista).classList.add('activa');
}

// --- UTILIDAD SUPABASE ---
async function subirArchivoSupabase(file, bucket) {
    const nombre = `${Date.now()}-${file.name}`;

    const { data, error } = await supabaseClient
        .storage
        .from(bucket)
        .upload(nombre, file);

    if (error) {
        console.error(error);
        alert("Error subiendo archivo");
        return null;
    }

    const { data: urlData } = supabaseClient
        .storage
        .from(bucket)
        .getPublicUrl(nombre);

    return urlData.publicUrl;
}
// Función para actualizar la tabla de estado en la nube
async function actualizarEstadoVTT(payload) {
    if (typeof supabaseClient !== 'undefined') {
        // Usamos supabaseClient en lugar de supabase
        const { error } = await supabaseClient.from('vtt_estado').update(payload).eq('id', 1);
        if (error) console.error("Error al sincronizar con Supabase:", error);
    } else {
        console.warn("Supabase no está inicializado.");
    }
}

// --- MAPAS, TOKENS Y GALERÍA ---
let galeriaMapas = JSON.parse(localStorage.getItem('galeriaMapas')) || [];
let galeriaTokens = JSON.parse(localStorage.getItem('galeriaTokens')) || [];
let mapaEnMemoria = null; let estadoRejilla = false; let tokensEnMapa = []; 
const wrapperMapa = document.getElementById('wrapper-mapa'); let tokenActivoID = null;

document.getElementById('btn-guardar-galeria').addEventListener('click', async function() {

    const archivoInput = document.getElementById('input-archivo');
    const tipo = document.getElementById('tipo-archivo').value;

    if (!archivoInput.files[0]) return;

    const file = archivoInput.files[0];

    let bucket = tipo === 'mapa'
        ? 'mapas'
        : 'tokens';

    const url = await subirArchivoSupabase(file, bucket);

    if (!url) return;

    if (tipo === 'mapa') {
        galeriaMapas.push(url);
        localStorage.setItem('galeriaMapas', JSON.stringify(galeriaMapas));
    } else {
        galeriaTokens.push(url);
        localStorage.setItem('galeriaTokens', JSON.stringify(galeriaTokens));
    }

    renderizarGalerias();
    archivoInput.value = "";
});

function renderizarGalerias() {
    document.getElementById('galeria-mapas').innerHTML = ''; document.getElementById('galeria-tokens').innerHTML = '';
    galeriaMapas.forEach(imgBase64 => {
        const img = document.createElement('div'); img.className = 'item-galeria'; img.style.backgroundImage = `url(${imgBase64})`;
        img.onclick = () => cargarMapaEnTablero(imgBase64); document.getElementById('galeria-mapas').appendChild(img);
    });
    galeriaTokens.forEach(imgBase64 => {
        const img = document.createElement('div'); img.className = 'item-galeria'; img.style.backgroundImage = `url(${imgBase64})`;
        img.onclick = () => crearToken(imgBase64); document.getElementById('galeria-tokens').appendChild(img);
    });
}

function cargarMapaEnTablero(imgBase64) {
    mapaEnMemoria = imgBase64; document.getElementById('img-mapa').src = imgBase64;
    wrapperMapa.style.display = "inline-block"; cambiarVista('vista-mapa-dm');
}

function vaciarTablero() {
    if(confirm("¿Vaciar el tablero?")) {
        mapaEnMemoria = null; document.getElementById('img-mapa').src = ""; wrapperMapa.style.display = "none";
        tokensEnMapa = []; document.querySelectorAll('.token-dm').forEach(t => t.remove());
        
        // Sincronización Supabase
        actualizarEstadoVTT({ mapa_url: null, tokens: [] });
    }
}

document.getElementById('btn-toggle-rejilla').addEventListener('click', () => {
    estadoRejilla = !estadoRejilla; const capa = document.getElementById('capa-rejilla');
    if(estadoRejilla) capa.classList.add('activa'); else capa.classList.remove('activa');
    
    // Sincronización Supabase
    actualizarEstadoVTT({ rejilla: estadoRejilla });
});

document.getElementById('btn-enviar-mapa').addEventListener('click', function() {
    if (mapaEnMemoria) {
        // Sincronización Supabase
        actualizarEstadoVTT({ mapa_url: mapaEnMemoria, rejilla: estadoRejilla });
        sincronizarTokensJugadores();
        alert("¡Tablero proyectado a los jugadores!");
    }
});

function crearToken(imagenBase64) {
    if(!mapaEnMemoria) return; cambiarVista('vista-mapa-dm'); 
    const idToken = 'token_' + Date.now();
    const tokenData = { id: idToken, img: imagenBase64, x: '50%', y: '50%', visible: false, escala: 50, color: '#e74c3c' };
    tokensEnMapa.push(tokenData);
    const tokenEl = document.createElement('div'); tokenEl.className = 'token-dm token-oculto'; tokenEl.id = idToken;
    tokenEl.style.backgroundImage = `url(${imagenBase64})`; tokenEl.style.left = tokenData.x; tokenEl.style.top = tokenData.y;
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

// Sincronización Supabase
function sincronizarTokensJugadores() { 
    actualizarEstadoVTT({ tokens: tokensEnMapa }); 
}

// --- AUDIO Y MÚSICA ---
let audioEnMemoria = null; const audioDM = document.getElementById('audio-ambiente-dm');
document.getElementById('input-audio').addEventListener('change', async function(e) {

    const archivo = e.target.files[0];

    if (!archivo) return;

    const url = await subirArchivoSupabase(archivo, 'audio');

    if (!url) return;

    audioEnMemoria = url;

    document.getElementById('status-audio').innerText =
        "Audio cargado";
});

document.getElementById('btn-play-audio').addEventListener('click', async function() {
    if (!audioEnMemoria) return;
    audioDM.src = audioEnMemoria;
    try {
        await audioDM.play();
        // Sincronización Supabase: Guardar el audio y enviar comando de play
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

// --- DADOS Y WIKI ---
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

const colaDados = [];
let procesandoDado = false;

function mostrarDadoFlotante(quien, caras, base, mod, motivo, total) {

    colaDados.push({
        quien,
        caras,
        base,
        mod,
        motivo,
        total
    });

    if (!procesandoDado) {
        procesarColaDados();
    }
}

async function procesarColaDados() {

    if (colaDados.length === 0) {
        procesandoDado = false;
        return;
    }

    procesandoDado = true;

    const dado = colaDados.shift();

    let cl = `forma-d${dado.caras}`;

    let color = "white";

    if (dado.caras === 20 && dado.base === 20)
        color = "gold";

    if (dado.caras === 20 && dado.base === 1)
        color = "red";

    const div = document.createElement('div');

    div.className = 'dado-historial';

    div.innerHTML = `
        <div class="contenedor-dado-animado">

            <div class="dado-visual ${cl} rodando"
                style="
                    width:75px;
                    height:75px;
                    font-size:2rem;
                ">
                ?
            </div>

        </div>
    `;

    arenaDados.prepend(div);

    boxDados.classList.add('mostrar');

    await new Promise(r => setTimeout(r, 600));

    let sub =
        dado.mod !== 0
        ? `<br><span style="font-size:0.85rem;color:#aaa;">
            (${dado.base} ${dado.mod >= 0 ? '+' : ''}${dado.mod})
           </span>`
        : '';

    div.innerHTML = `
        <div class="contenedor-dado-animado">

            <div class="dado-visual ${cl}"
                style="
                    width:75px;
                    height:75px;
                    font-size:2rem;
                    color:${color};
                ">
                ${dado.total}
            </div>

            <p style="
                color:#2ecc71;
                font-weight:bold;
                text-align:center;
                margin:5px 0;
            ">
                ${dado.quien}
            </p>

            <p style="
                color:#ccc;
                font-size:0.8rem;
                text-align:center;
            ">
                ${dado.motivo}
                ${sub}
            </p>

        </div>
    `;

    while (arenaDados.children.length > 8) {
        arenaDados.removeChild(arenaDados.lastChild);
    }

    setTimeout(() => {
        div.style.opacity = '0.3';
    }, 5000);

    setTimeout(() => {
        div.remove();

        if (arenaDados.children.length === 0) {
            boxDados.classList.remove('mostrar');
        }

    }, 12000);

    setTimeout(() => {
        procesarColaDados();
    }, 1200);
}
// ESCUCHAR DADOS JUGADORES (Supabase Realtime)
if (typeof canalVTT !== 'undefined') {
    canalVTT.on('broadcast', { event: 'dado-jugador' }, (mensaje) => {
        const info = mensaje.payload;
        cambiarVista('vista-dados'); reproducirSonidoDado();
        const arena = document.getElementById('arena-3d'); let c = `forma-d${info.caras}`;
        arena.innerHTML = `<div class="contenedor-dado-animado"><div class="dado-visual ${c} rodando" style="width:120px;height:120px;font-size:3rem;">?</div></div>`;
        setTimeout(() => {
            let color = "white"; if (info.caras === 20 && info.resultado === 20) color = "gold"; if (info.caras === 20 && info.resultado === 1) color = "red";
            arena.innerHTML = `<div class="contenedor-dado-animado"><div class="dado-visual ${c}" style="width:120px;height:120px;font-size:3rem;color: ${color};">${info.total}</div><p style="color:#2ecc71; font-size:1.5rem; font-weight:bold; margin:5px 0;">${info.quien}</p><p style="color:#aaa;">${info.motivo}</p></div>`;
        }, 600);
    }).subscribe();
}

// WIKI Y FICHAS (Esto se queda local en el PC del DM)
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

    const campaña = {

        wikiDB,
        fichasDB,
        galeriaMapas,
        galeriaTokens

    };

    const dataStr =
        "data:text/json;charset=utf-8," +
        encodeURIComponent(JSON.stringify(campaña));

    const a = document.createElement('a');

    a.href = dataStr;

    a.download = "campaña_vtt.json";

    a.click();
}
function importarCampañaCompleta(file) {

    const reader = new FileReader();

    reader.onload = function(e) {

        try {

            const data = JSON.parse(e.target.result);

            wikiDB = data.wikiDB || {};
            fichasDB = data.fichasDB || {};
            galeriaMapas = data.galeriaMapas || [];
            galeriaTokens = data.galeriaTokens || [];

            localStorage.setItem('wikiDM', JSON.stringify(wikiDB));
            localStorage.setItem('fichasDM', JSON.stringify(fichasDB));
            localStorage.setItem('galeriaMapas', JSON.stringify(galeriaMapas));
            localStorage.setItem('galeriaTokens', JSON.stringify(galeriaTokens));

            renderizarWiki();
            renderizarFichasUI();
            renderizarGalerias();

            alert("Campaña importada");

        } catch(err) {

            alert("Archivo inválido");
        }
    };

    reader.readAsText(file);
}
function renderizarWiki() { document.getElementById('arbol-glosario').innerHTML = construirArbolHTML('root'); }
function crearElemento(idPadre, tipo) { const titulo = prompt(`Nombre:`); if (titulo) { const nid = generarID(); wikiDB[nid] = { id: nid, tipo: tipo, titulo: titulo, padre: idPadre, hijos: tipo === 'carpeta' ? [] : undefined, contenido: "" }; wikiDB[idPadre].hijos.push(nid); guardarWiki(); } }
function borrarElemento(id, idPadre) { if (confirm("¿Borrar?")) { wikiDB[idPadre].hijos = wikiDB[idPadre].hijos.filter(h => h !== id); delete wikiDB[id]; guardarWiki(); } }


// Guardamos el artículo actualmente abierto para poder actualizarlo desde el editor
let articuloActualID = null;
function abrirArticulo(id) {
    articuloActualID = id;
    document.getElementById('editor-titulo').value = wikiDB[id].titulo;
    document.getElementById('editor-contenido').value = wikiDB[id].contenido || "";
    cambiarVista('vista-editor');
}

function guardarArticuloActual() {
    if (!articuloActualID) return;
    const titulo = document.getElementById('editor-titulo').value;
    const contenido = document.getElementById('editor-contenido').value;
    wikiDB[articuloActualID].titulo = titulo;
    wikiDB[articuloActualID].contenido = contenido;
    guardarWiki();
}

let fichasDB = JSON.parse(localStorage.getItem('fichasDM')) || {}; let fichaActualID = null;
function renderizarFichasUI() { const lista = document.getElementById('lista-fichas-ui'); lista.innerHTML = ''; for(let id in fichasDB) { const div = document.createElement('div'); div.className = `item-lista-ficha ${id === fichaActualID ? 'activa' : ''}`; div.innerText = fichasDB[id].nombre || "Sin nombre"; div.onclick = () => cargarFichaEnEditor(id); lista.appendChild(div); } }
function crearFichaNueva() { const id = generarID(); fichasDB[id] = { id: id, nombre: "Nuevo", hp: "10", ca: "10", ini: "0", vel: "30", fue: "10", des: "10", con: "10", int: "10", sab: "10", car: "10", notas: "" }; localStorage.setItem('fichasDM', JSON.stringify(fichasDB)); cargarFichaEnEditor(id); }
function cargarFichaEnEditor(id) { fichaActualID = id; document.getElementById('editor-ficha-ui').style.display = 'block'; const f = fichasDB[id]; ['nombre','hp','ca','ini','vel','fue','des','con','int','sab','car','notas'].forEach(c => document.getElementById(`ficha-${c}`).value = f[c] || ""); renderizarFichasUI(); }
function guardarFichaActual() { if(!fichaActualID) return; const f = fichasDB[fichaActualID]; ['nombre','hp','ca','ini','vel','fue','des','con','int','sab','car','notas'].forEach(c => f[c] = document.getElementById(`ficha-${c}`).value); localStorage.setItem('fichasDM', JSON.stringify(fichasDB)); renderizarFichasUI(); }
function exportarFichaSeleccionada() { if(!fichaActualID) return; const f = fichasDB[fichaActualID]; const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(f)); const a = document.createElement('a'); a.href = dataStr; a.download = `${f.nombre}_ficha.json`; a.click(); }

function borrarFichaActual() {
    if (!fichaActualID) return;
    if (!confirm("¿Borrar esta ficha?")) return;
    delete fichasDB[fichaActualID];
    fichaActualID = null;
    localStorage.setItem('fichasDM', JSON.stringify(fichasDB));
    document.getElementById('editor-ficha-ui').style.display = 'none';
    renderizarFichasUI();
}

// Lanzar dado desde el DM y notificar a los jugadores
function lanzarDado(caras) {
    const baseRoll = Math.floor(Math.random() * caras) + 1;
    const paquete = { quien: 'Dungeon Master', caras: caras, resultado: baseRoll, mod: 0, total: baseRoll, motivo: '', tiempo: Date.now() };

    if (typeof canalVTT !== 'undefined') {
        canalVTT.send({ type: 'broadcast', event: 'dado-dm', payload: paquete });
    }

    // Mostrar localmente en la interfaz del DM
    mostrarDadoFlotante(paquete.quien, paquete.caras, paquete.resultado, paquete.mod, paquete.motivo, paquete.total);
}

renderizarWiki(); renderizarGalerias(); renderizarFichasUI();
