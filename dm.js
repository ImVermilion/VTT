

function cambiarVista(idVista) {
    document.querySelectorAll('.dm-vista').forEach(v => v.classList.remove('activa'));
    document.getElementById(idVista).classList.add('activa');
}

// Sincronización Doble: Base de Datos + Directo (Broadcast)
async function actualizarEstadoVTT(payload) {
    if (typeof supabaseClient !== 'undefined') {
        const { error } = await supabaseClient.from('vtt_estado').update(payload).eq('id', 1);
        if (error) console.error("Error al sincronizar con Supabase:", error);
    }
    if (typeof canalVTT !== 'undefined') {
        // Enviar por broadcast para que los jugadores lo vean al instante
        canalVTT.send({ type: 'broadcast', event: 'estado-vtt', payload: payload });
    }
}

// --- MAPAS, TOKENS Y GALERÍA (Archivos de GitHub) ---
let galeriaMapas = JSON.parse(localStorage.getItem('galeriaMapas')) || [];
let galeriaTokens = JSON.parse(localStorage.getItem('galeriaTokens')) || [];
let mapaEnMemoria = null; let estadoRejilla = false; let tokensEnMapa = []; 
const wrapperMapa = document.getElementById('wrapper-mapa'); let tokenActivoID = null;

document.getElementById('btn-guardar-galeria').addEventListener('click', function(e) {
    e.preventDefault();

    const input = document.getElementById('input-archivo');
    const archivo = input.files[0];

    if (!archivo) {
        alert('Selecciona un archivo');
        return;
    }

    const tipo = document.getElementById('tipo-archivo').value;

    const reader = new FileReader();

    reader.onload = function(evt) {
        const dataURL = evt.target.result;

        if (tipo === 'mapa') {
            if (!galeriaMapas.includes(dataURL)) {
                galeriaMapas.push(dataURL);
                localStorage.setItem('galeriaMapas', JSON.stringify(galeriaMapas));
            }
        }

        if (tipo === 'token') {
            if (!galeriaTokens.includes(dataURL)) {
                galeriaTokens.push(dataURL);
                localStorage.setItem('galeriaTokens', JSON.stringify(galeriaTokens));
            }
        }

        renderizarGalerias();
    };

    reader.readAsDataURL(archivo);
});

function renderizarGalerias() {

    const gm = document.getElementById('galeria-mapas');
    const gt = document.getElementById('galeria-tokens');

    gm.innerHTML = '';
    gt.innerHTML = '';

    galeriaMapas.forEach((url, index) => {

        const cont = document.createElement('div');
        cont.style.position = 'relative';

        const img = document.createElement('div');
        img.className = 'item-galeria';
        img.style.backgroundImage = `url(${url})`;
        img.onclick = () => cargarMapaEnTablero(url);

        const del = document.createElement('button');
        del.innerText = '❌';
        del.style.position = 'absolute';
        del.style.top = '0';
        del.style.right = '0';
        del.onclick = (e) => {
            e.stopPropagation();

            galeriaMapas.splice(index, 1);
            localStorage.setItem('galeriaMapas', JSON.stringify(galeriaMapas));
            renderizarGalerias();
        };

        cont.appendChild(img);
        cont.appendChild(del);

        gm.appendChild(cont);
    });

    galeriaTokens.forEach((url, index) => {

        const cont = document.createElement('div');
        cont.style.position = 'relative';

        const img = document.createElement('div');
        img.className = 'item-galeria';
        img.style.backgroundImage = `url(${url})`;
        img.onclick = () => crearToken(url);

        const del = document.createElement('button');
        del.innerText = '❌';
        del.style.position = 'absolute';
        del.style.top = '0';
        del.style.right = '0';

        del.onclick = (e) => {
            e.stopPropagation();

            galeriaTokens.splice(index, 1);
            localStorage.setItem('galeriaTokens', JSON.stringify(galeriaTokens));
            renderizarGalerias();
        };

        cont.appendChild(img);
        cont.appendChild(del);

        gt.appendChild(cont);
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
            // Mandamos todo junto para que el jugador tenga el contexto completo
            actualizarEstadoVTT({ mapa_url: mapaEnMemoria, rejilla: estadoRejilla, tokens: tokensEnMapa });
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

// Creamos un botón limpio para la música y lo inyectamos
const btnAudioDirecto = document.createElement('button');
btnAudioDirecto.innerText = "🎵 Añadir Pista desde GitHub";
btnAudioDirecto.className = "btn-dado";
btnAudioDirecto.style.marginBottom = "10px";
btnAudioDirecto.onclick = function() {
    const nombreArchivo = prompt(`Escribe el nombre del audio en la carpeta assets/musica/ de tu GitHub (ej. taberna.mp3):`);
    if (!nombreArchivo) return;
    audioEnMemoria = `assets/musica/${nombreArchivo}`;
    document.getElementById('status-audio').innerText = "Audio listo: " + nombreArchivo;
};

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
            // Mandamos la URL en el propio comando para evitar esperas
            canalVTT.send({ type: 'broadcast', event: 'audio-comando', payload: { cmd: 'play', url: audioEnMemoria } });
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
            renderizarWiki(); renderizarFichasUI(); renderizarGalerias();renderizarInventario();
renderizarSkills();
renderizarConjuros();
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
function crearFichaNueva() {
    const id = generarID();

    fichasDB[id] = {
        id,
        nombre: "Nuevo Personaje",
        clase: "",
        nivel: 1,
        raza: "",
        trasfondo: "",
        alineamiento: "",
        xp: 0,
        competencia: 2,

        hp_actual: 10,
        hp_max: 10,
        ca: 10,
        ini: 0,
        vel: 30,

        fue: 10,
        des: 10,
        con: 10,
        int: 10,
        sab: 10,
        car: 10,

        skills: {
            atletismo: 0,
            acrobacias: 0,
            sigilo: 0,
            percepcion: 0,
            investigacion: 0,
            persuasion: 0,
            engaño: 0,
            arcano: 0,
            historia: 0,
            religion: 0,
            medicina: 0,
            naturaleza: 0,
            supervivencia: 0
        },

        conjuros: {
            nivel1: { max: 2, usados: 0 },
            nivel2: { max: 0, usados: 0 },
            nivel3: { max: 0, usados: 0 }
        },

        inventario: [],

        oro: 0,

        notas: ""
    };

    localStorage.setItem('fichasDM', JSON.stringify(fichasDB));
    cargarFichaEnEditor(id);
}
function cargarFichaEnEditor(id) { fichaActualID = id; document.getElementById('editor-ficha-ui').style.display = 'block'; const f = fichasDB[id]; ['nombre','hp','ca','ini','vel','fue','des','con','int','sab','car','notas'].forEach(c => document.getElementById(`ficha-${c}`).value = f[c] || ""); renderizarFichasUI(); }
function guardarFichaActual() { if(!fichaActualID) return; const f = fichasDB[fichaActualID]; ['nombre','hp','ca','ini','vel','fue','des','con','int','sab','car','notas'].forEach(c => f[c] = document.getElementById(`ficha-${c}`).value); localStorage.setItem('fichasDM', JSON.stringify(fichasDB)); renderizarFichasUI(); }
function exportarFichaSeleccionada() { if(!fichaActualID) return; const f = fichasDB[fichaActualID]; const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(f)); const a = document.createElement('a'); a.href = dataStr; a.download = `${f.nombre}_ficha.json`; a.click(); }
function añadirItemInventario() {
    if (!fichaActualID) return;

    const nombre = prompt("Nombre del objeto:");
    if (!nombre) return;

    const cantidad = parseInt(prompt("Cantidad:", "1")) || 1;

    fichasDB[fichaActualID].inventario.push({
        nombre,
        cantidad
    });

    guardarFichaActual();
    renderizarInventario();
}

function borrarItemInventario(index) {
    if (!fichaActualID) return;

    fichasDB[fichaActualID].inventario.splice(index, 1);

    guardarFichaActual();
    renderizarInventario();
}

function renderizarInventario() {
    if (!fichaActualID) return;

    const contenedor = document.getElementById('lista-inventario');

    if (!contenedor) return;

    contenedor.innerHTML = '';

    const items = fichasDB[fichaActualID].inventario || [];

    items.forEach((item, index) => {
        const div = document.createElement('div');

        div.style.display = 'flex';
        div.style.justifyContent = 'space-between';
        div.style.marginBottom = '5px';
        div.style.background = '#111';
        div.style.padding = '8px';
        div.style.borderRadius = '4px';

        div.innerHTML = `
            <span>${item.nombre} x${item.cantidad}</span>
            <button onclick="borrarItemInventario(${index})">❌</button>
        `;

        contenedor.appendChild(div);
    });
}
function renderizarSkills() {
    if (!fichaActualID) return;

    const contenedor = document.getElementById('lista-skills');
    if (!contenedor) return;

    contenedor.innerHTML = '';

    const skills = fichasDB[fichaActualID].skills || {};

    Object.keys(skills).forEach(skill => {
        const fila = document.createElement('div');

        fila.style.display = 'flex';
        fila.style.justifyContent = 'space-between';
        fila.style.marginBottom = '5px';

        fila.innerHTML = `
            <span>${skill}</span>
            <input
                type="number"
                value="${skills[skill]}"
                onchange="actualizarSkill('${skill}', this.value)"
                style="width:60px;"
            >
        `;

        contenedor.appendChild(fila);
    });
}

function actualizarSkill(skill, valor) {
    if (!fichaActualID) return;

    fichasDB[fichaActualID].skills[skill] = parseInt(valor) || 0;

    guardarFichaActual();
}
function renderizarConjuros() {
    if (!fichaActualID) return;

    const contenedor = document.getElementById('lista-conjuros');

    if (!contenedor) return;

    contenedor.innerHTML = '';

    const datos = fichasDB[fichaActualID].conjuros;

    Object.keys(datos).forEach(nivel => {
        const c = datos[nivel];

        const div = document.createElement('div');

        div.style.display = 'flex';
        div.style.justifyContent = 'space-between';
        div.style.marginBottom = '8px';
        div.style.background = '#111';
        div.style.padding = '8px';

        div.innerHTML = `
            <span>${nivel}</span>
            <span>${c.usados} / ${c.max}</span>
        `;

        contenedor.appendChild(div);
    });
}
renderizarWiki(); renderizarGalerias(); renderizarFichasUI();
window.addEventListener('DOMContentLoaded', renderizarGalerias);
