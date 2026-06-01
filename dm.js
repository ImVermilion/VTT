function cambiarVista(idVista) {
    document.querySelectorAll('.dm-vista').forEach(v => v.classList.remove('activa'));
    document.getElementById(idVista).classList.add('activa');
}

async function actualizarEstadoVTT(payload) {
    if (typeof supabaseClient !== 'undefined') {
        const { error } = await supabaseClient.from('vtt_estado').update(payload).eq('id', 1);
        if (error) console.error("Error al sincronizar con Supabase:", error);
    }
    if (typeof canalVTT !== 'undefined') {
        canalVTT.send({ type: 'broadcast', event: 'estado-vtt', payload: payload });
    }
}

// --- MAPAS, TOKENS Y GALERÍA ---
let galeriaMapas = JSON.parse(localStorage.getItem('galeriaMapas')) || [];
let galeriaTokens = JSON.parse(localStorage.getItem('galeriaTokens')) || [];
let mapaEnMemoria = null; let estadoRejilla = false; let tokensEnMapa = []; 
const wrapperMapa = document.getElementById('wrapper-mapa'); let tokenActivoID = null;

document.getElementById('btn-guardar-galeria').addEventListener('click', function(e) {
    e.preventDefault();
    const input = document.getElementById('input-archivo');
    const archivo = input.files[0];
    if (!archivo) return alert('Selecciona un archivo');
    
    const tipo = document.getElementById('tipo-archivo').value;
    const reader = new FileReader();

    reader.onload = function(evt) {
        const dataURL = evt.target.result;
        if (tipo === 'mapa' && !galeriaMapas.includes(dataURL)) {
            galeriaMapas.push(dataURL);
            localStorage.setItem('galeriaMapas', JSON.stringify(galeriaMapas));
        }
        if (tipo === 'token' && !galeriaTokens.includes(dataURL)) {
            galeriaTokens.push(dataURL);
            localStorage.setItem('galeriaTokens', JSON.stringify(galeriaTokens));
        }
        renderizarGalerias();
    };
    reader.readAsDataURL(archivo);
});

function renderizarGalerias() {
    const gm = document.getElementById('galeria-mapas');
    const gt = document.getElementById('galeria-tokens');
    gm.innerHTML = ''; gt.innerHTML = '';

    galeriaMapas.forEach((url, index) => {
        const cont = document.createElement('div');
        cont.style.position = 'relative';
        const img = document.createElement('div');
        img.className = 'item-galeria';
        img.style.backgroundImage = `url(${url})`;
        img.onclick = () => cargarMapaEnTablero(url);
        const del = document.createElement('button');
        del.innerText = '❌'; del.style.position = 'absolute'; del.style.top = '0'; del.style.right = '0';
        del.onclick = (e) => { e.stopPropagation(); galeriaMapas.splice(index, 1); localStorage.setItem('galeriaMapas', JSON.stringify(galeriaMapas)); renderizarGalerias(); };
        cont.appendChild(img); cont.appendChild(del); gm.appendChild(cont);
    });

    galeriaTokens.forEach((url, index) => {
        const cont = document.createElement('div');
        cont.style.position = 'relative';
        const img = document.createElement('div');
        img.className = 'item-galeria';
        img.style.backgroundImage = `url(${url})`;
        img.onclick = () => crearToken(url);
        const del = document.createElement('button');
        del.innerText = '❌'; del.style.position = 'absolute'; del.style.top = '0'; del.style.right = '0';
        del.onclick = (e) => { e.stopPropagation(); galeriaTokens.splice(index, 1); localStorage.setItem('galeriaTokens', JSON.stringify(galeriaTokens)); renderizarGalerias(); };
        cont.appendChild(img); cont.appendChild(del); gt.appendChild(cont);
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

// --- AUDIO Y MÚSICA ---
let audioEnMemoria = null; const audioDM = document.getElementById('audio-ambiente-dm');

// Cargar Audio local (Convirtiéndolo a Base64 como las imágenes)
document.getElementById('input-audio').addEventListener('change', function(e) {
    const archivo = e.target.files[0];
    if (!archivo) return;
    const reader = new FileReader();
    reader.onload = function(evt) {
        audioEnMemoria = evt.target.result;
        document.getElementById('status-audio').innerText = "Audio local cargado listo para Play";
    };
    reader.readAsDataURL(archivo);
});

// Botón GitHub
const btnAudioDirecto = document.createElement('button');
btnAudioDirecto.innerText = "🎵 Añadir Pista desde GitHub";
btnAudioDirecto.className = "btn-dado";
btnAudioDirecto.style.marginBottom = "10px";
btnAudioDirecto.onclick = function() {
    const nombreArchivo = prompt(`Escribe el nombre del audio en la carpeta assets/musica/ de tu GitHub (ej. taberna.mp3):`);
    if (!nombreArchivo) return;
    audioEnMemoria = `assets/musica/${nombreArchivo}`;
    document.getElementById('status-audio').innerText = "Audio GitHub listo: " + nombreArchivo;
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
            canalVTT.send({ type: 'broadcast', event: 'audio-comando', payload: { cmd: 'play', url: audioEnMemoria } });
        }
        document.getElementById('status-audio').innerText = "Reproduciendo...";
    } catch(err) {
        document.getElementById('status-audio').innerText = "Error reproduciendo";
    }
});

document.getElementById('btn-pause-audio').addEventListener('click', function() {
    if (typeof canalVTT !== 'undefined') canalVTT.send({ type: 'broadcast', event: 'audio-comando', payload: { cmd: 'pause' } });
    audioDM.pause(); document.getElementById('status-audio').innerText = "Pausado";
});

document.getElementById('volume-audio').addEventListener('input', function(e) {
    audioDM.volume = e.target.value;
    actualizarEstadoVTT({ audio_volumen: e.target.value });
});

// --- DADOS, HISTORIAL Y WIKI ---
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

// NUEVO: Adaptado para mostrar el modificador en pantalla
function mostrarDadoDM(quien, caras, base, mod, motivo, total) {
    cambiarVista('vista-dados'); 
    reproducirSonidoDado();
    
    const arena = document.getElementById('arena-3d');
    const numCaras = parseInt(caras);
    let cl = 'forma-d' + numCaras;
    if (!numCaras || isNaN(numCaras)) cl = 'forma-d6';

    let color = "white";
    if (numCaras === 20 && base === 20) color = "gold";
    if (numCaras === 20 && base === 1) color = "red";

    // Mostramos el texto pequeñito si hay un modificador (igual que a los jugadores)
    let sub = mod !== 0 ? `<br><span style="font-size:0.85rem;color:#aaa;">(${base} ${mod >= 0 ? '+' : ''}${mod})</span>` : '';

    const dadoDiv = document.createElement('div');
    dadoDiv.className = 'contenedor-dado-animado';
    dadoDiv.innerHTML = `
        <div class="dado-visual ${cl} rodando" style="width:100px;height:100px;font-size:2.5rem;color:${color}; margin: 0 auto;">${total}</div>
        <p style="color:#2ecc71; font-size:1.2rem; font-weight:bold; margin:10px 0 5px 0; text-align:center;">${quien}</p>
        <p style="color:#aaa; font-size:0.9rem; margin:0; text-align:center;">${motivo}${sub}</p>
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
    if (typeof canalVTT !== 'undefined') canalVTT.send({ type: 'broadcast', event: 'dado-dm', payload: pkt });
    // Usamos el nuevo formato que incluye el modificador
    mostrarDadoDM(pkt.quien, pkt.caras, pkt.resultado, pkt.mod, pkt.motivo, pkt.total);
}

if (typeof canalVTT !== 'undefined') {
    canalVTT.on('broadcast', { event: 'dado-jugador' }, (mensaje) => {
        const info = mensaje.payload;
        // Ahora el DM lee correctamente el modificador del jugador que se envía por Supabase
        mostrarDadoDM(info.quien, info.caras, info.resultado, info.mod, info.motivo, info.total);
    }).subscribe();
}

// WIKI
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
function renderizarWiki() { document.getElementById('arbol-glosario').innerHTML = construirArbolHTML('root'); }
function crearElemento(idPadre, tipo) { const titulo = prompt(`Nombre:`); if (titulo) { const nid = generarID(); wikiDB[nid] = { id: nid, tipo: tipo, titulo: titulo, padre: idPadre, hijos: tipo === 'carpeta' ? [] : undefined, contenido: "" }; wikiDB[idPadre].hijos.push(nid); guardarWiki(); } }
function borrarElemento(id, idPadre) { if (confirm("¿Borrar?")) { wikiDB[idPadre].hijos = wikiDB[idPadre].hijos.filter(h => h !== id); delete wikiDB[id]; guardarWiki(); } }
function abrirArticulo(id) { document.getElementById('editor-titulo').value = wikiDB[id].titulo; document.getElementById('editor-contenido').value = wikiDB[id].contenido || ""; cambiarVista('vista-editor'); }

// --- MOTOR DE FICHAS DEL DM (REESCRITO Y ORDENADO) ---
let fichasDB = JSON.parse(localStorage.getItem('fichasDM')) || {}; 
let fichaActualID = null;

function renderizarFichasUI() { 
    const lista = document.getElementById('lista-fichas-ui'); 
    lista.innerHTML = ''; 
    for(let id in fichasDB) { 
        const div = document.createElement('div'); 
        div.className = `item-lista-ficha ${id === fichaActualID ? 'activa' : ''}`; 
        div.innerText = fichasDB[id].nombre || "Sin nombre"; 
        div.onclick = () => cargarFichaEnEditor(id); 
        lista.appendChild(div); 
    } 
}

function crearFichaNueva() {
    let nuevoPJ;
    if (typeof Personaje !== 'undefined') { nuevoPJ = new Personaje(); } 
    else { alert("Asegúrate de que fichas.js está cargado"); return; }
    fichasDB[nuevoPJ.id] = nuevoPJ;
    guardarFichaActual();
    renderizarFichasUI();
    cargarFichaEnEditor(nuevoPJ.id);
}

function cargarFichaEnEditor(id) {
    fichaActualID = id;
    const f = fichasDB[id];
    const editor = document.getElementById('editor-ficha-ui');
    editor.style.display = 'block';

    // Compatibilidad por si abres una ficha creada antes del sistema de monedas/conjuros
    if (!f.atributos) f.atributos = { fue: 10, des: 10, con: 10, int: 10, sab: 10, car: 10 };
    if (!f.skills) f.skills = {};
    if (!f.inventario) f.inventario = [];
    if (!f.monedas) f.monedas = { oro: f.oro || 0, plata: 0, bronce: 0 };
    if (!f.conjuros) f.conjuros = { trucos: [], nivel1: {max:0,usados:0,lista:[]}, nivel2: {max:0,usados:0,lista:[]}, nivel3: {max:0,usados:0,lista:[]}, nivel4: {max:0,usados:0,lista:[]}, nivel5: {max:0,usados:0,lista:[]}, nivel6: {max:0,usados:0,lista:[]}, nivel7: {max:0,usados:0,lista:[]}, nivel8: {max:0,usados:0,lista:[]}, nivel9: {max:0,usados:0,lista:[]} };

    // Generar bloque de Conjuros HTML
    let conjurosHTML = `
        <div style="margin-bottom:8px;">
            <strong>Trucos:</strong>
            <input type="text" style="width:100%; background:rgba(0,0,0,0.4); color:white; border:1px solid #444; border-radius:4px; padding:3px; margin-top:3px;" value="${f.conjuros.trucos.join(', ')}" onchange="actualizarListaConjuros('trucos', this.value)" placeholder="Ej: Luz, Ilusión...">
        </div>
    `;
    for(let i=1; i<=9; i++) {
        const nivel = f.conjuros[`nivel${i}`] || {max:0, usados:0, lista:[]};
        conjurosHTML += `
            <div style="margin-bottom:8px; border-top:1px solid #333; padding-top:5px;">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <strong>Nivel ${i}</strong>
                    <span style="font-size:0.85rem; color:#aaa;">
                        Usados: <input type="number" style="width:30px; background:#222; color:white; border:1px solid #444; text-align:center;" value="${nivel.usados}" onchange="actualizarConjuroSlots('nivel${i}', 'usados', this.value)"> / 
                        Max: <input type="number" style="width:30px; background:#222; color:white; border:1px solid #444; text-align:center;" value="${nivel.max}" onchange="actualizarConjuroSlots('nivel${i}', 'max', this.value)">
                    </span>
                </div>
                <input type="text" style="width:100%; background:rgba(0,0,0,0.4); color:white; border:1px solid #444; border-radius:4px; padding:3px; margin-top:3px;" value="${nivel.lista.join(', ')}" onchange="actualizarListaConjuros('nivel${i}', this.value)" placeholder="Conjuros separados por coma...">
            </div>
        `;
    }

    // Pinta el editor entero
    editor.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px;">
            <input type="text" class="input-ficha" style="font-size:1.5rem; color:#2ecc71; text-align:left; font-weight:bold; width:50%; border:none; border-bottom:1px solid #555; background:transparent;" value="${f.nombre}" onchange="actualizarCampoFicha('nombre', this.value)">
            <div>
                <button onclick="exportarFichaSeleccionada()" style="background:#3498db; color:white; padding: 5px 10px;">📥 Exportar</button>
                <button onclick="borrarFichaActual()" style="background:#e74c3c; color:white; padding: 5px 10px;">🗑️ Borrar</button>
            </div>
        </div>

        <div style="display:grid; grid-template-columns: repeat(3, 1fr); gap:10px; margin-bottom:15px;">
            <div class="stat-box" style="background:#111; padding:10px; border-radius:6px;">
                <label style="color:#e74c3c; font-weight:bold;">❤️ HP</label>
                <div style="display:flex; gap:5px; margin-top:5px;">
                    <input type="number" class="input-ficha" style="width:100%; text-align:center;" value="${f.hp_actual || 0}" onchange="actualizarCampoFicha('hp_actual', this.value)" title="Actual"> 
                    <input type="number" class="input-ficha" style="width:100%; text-align:center;" value="${f.hp_max || 0}" onchange="actualizarCampoFicha('hp_max', this.value)" title="Máximo">
                </div>
            </div>
            <div class="stat-box" style="background:#111; padding:10px; border-radius:6px; text-align:center;">
                <label style="color:#3498db; font-weight:bold;">🛡️ CA</label>
                <input type="number" class="input-ficha" style="width:100%; text-align:center; margin-top:5px;" value="${f.ca || 10}" onchange="actualizarCampoFicha('ca', this.value)">
            </div>
            <div class="stat-box" style="background:#111; padding:10px; border-radius:6px;">
                <label style="color:#f1c40f; font-weight:bold;">💰 Monedas</label>
                <div style="display:flex; justify-content:space-around; margin-top:5px;">
                    <div style="text-align:center;"><span style="color:gold; font-size:0.8rem;">O</span><br><input type="number" style="width:35px; background:rgba(0,0,0,0.5); color:white; border:none; text-align:center;" value="${f.monedas.oro}" onchange="actualizarMonedaDM('oro', this.value)"></div>
                    <div style="text-align:center;"><span style="color:silver; font-size:0.8rem;">P</span><br><input type="number" style="width:35px; background:rgba(0,0,0,0.5); color:white; border:none; text-align:center;" value="${f.monedas.plata}" onchange="actualizarMonedaDM('plata', this.value)"></div>
                    <div style="text-align:center;"><span style="color:#cd7f32; font-size:0.8rem;">B</span><br><input type="number" style="width:35px; background:rgba(0,0,0,0.5); color:white; border:none; text-align:center;" value="${f.monedas.bronce}" onchange="actualizarMonedaDM('bronce', this.value)"></div>
                </div>
            </div>
        </div>

        <h4 style="margin-top:0; color:#aaa; border-bottom:1px solid #333; padding-bottom:5px;">Atributos Base</h4>
        <div class="grid-atributos-dm" style="margin-bottom:15px;">
            ${['fue','des','con','int','sab','car'].map(atrib => `
                <div style="text-align:center; background:#111; padding:5px; border-radius:4px;">
                    <label style="font-size:0.8rem;">${atrib.toUpperCase()}</label>
                    <input type="number" class="input-ficha" style="width:100%; text-align:center; margin-top:3px;" value="${f.atributos[atrib]}" onchange="actualizarAtributoFicha('${atrib}', this.value)">
                </div>
            `).join('')}
        </div>

        <div style="display:grid; grid-template-columns:1fr 1fr; gap:15px;">
            
            <!-- Habilidades e Inventario -->
            <div>
                <h4 style="color:#f1c40f; margin-top:0; margin-bottom:5px;">🎯 Habilidades</h4>
                <div style="display:grid; gap:3px; background:#111; padding:10px; border-radius:6px; max-height:220px; overflow-y:auto; margin-bottom: 10px;">
                    ${['acrobacias','arcano','atletismo','engaño','historia','interpretacion','intimidacion','investigacion','juego_manos','medicina','naturaleza','percepcion','perspicacia','persuasion','religion','sigilo','supervivencia','trato_animales'].map(skill => `
                        <div style="display:flex; justify-content:space-between; align-items:center;">
                            <span style="font-size:0.85rem; color:#ccc;">${skill.replace('_', ' ')}</span>
                            <input type="number" style="width:40px; background:rgba(0,0,0,0.4); color:white; border:1px solid #444; text-align:center; border-radius:4px;" value="${f.skills[skill] || 0}" onchange="actualizarSkill('${skill}', this.value)">
                        </div>
                    `).join('')}
                </div>

                <h4 style="color:#3498db; margin-top:0; margin-bottom:5px;">🎒 Inventario <button onclick="añadirItemInventario()" style="background:#222; color:white; padding:2px 5px; font-size:0.8rem; border-radius:3px; float:right;">+ Item</button></h4>
                <div style="background:#111; padding:10px; border-radius:6px; max-height:150px; overflow-y:auto;">
                    ${f.inventario.length === 0 ? '<p style="color:#666; font-size:0.8rem; text-align:center;">Vacío</p>' : f.inventario.map((item, idx) => `
                        <div style="display:flex; justify-content:space-between; background:#222; padding:5px; margin-bottom:3px; border-radius:3px;">
                            <span style="font-size:0.85rem;">${item.nombre} (x${item.cantidad})</span>
                            <button onclick="borrarItemInventario(${idx})" style="background:transparent; color:#e74c3c; padding:0;">❌</button>
                        </div>
                    `).join('')}
                </div>
            </div>

            <!-- Conjuros y Notas -->
            <div>
                <h4 style="color:#9b59b6; margin-top:0; margin-bottom:5px;">🔮 Conjuros</h4>
                <div style="background:#111; padding:10px; border-radius:6px; max-height:220px; overflow-y:auto; margin-bottom: 10px;">
                    ${conjurosHTML}
                </div>

                <h4 style="color:#2ecc71; margin-top:0; margin-bottom:5px;">📝 Notas Secretas</h4>
                <textarea style="width:100%; height:150px; background:#111; color:white; border:1px solid #333; padding:10px; border-radius:4px; outline:none; box-sizing: border-box;" onchange="actualizarCampoFicha('notas', this.value)">${f.notas || ''}</textarea>
            </div>
        </div>
    `;
    renderizarFichasUI();
}

// --- ACTUALIZACIONES DE LA FICHA ---
function guardarFichaActual() { localStorage.setItem('fichasDM', JSON.stringify(fichasDB)); renderizarFichasUI(); }

function borrarFichaActual() {
    if(confirm("¿Borrar personaje por completo?")) {
        delete fichasDB[fichaActualID]; fichaActualID = null; document.getElementById('editor-ficha-ui').style.display = 'none'; guardarFichaActual();
    }
}

function actualizarCampoFicha(campo, valor) {
    if (!fichaActualID) return;
    if (campo === 'nombre' || campo === 'notas') fichasDB[fichaActualID][campo] = valor;
    else fichasDB[fichaActualID][campo] = parseInt(valor) || 0;
    guardarFichaActual();
}

function actualizarAtributoFicha(atrib, valor) {
    if (!fichaActualID) return; fichasDB[fichaActualID].atributos[atrib] = parseInt(valor) || 10; guardarFichaActual();
}

function actualizarSkill(skill, valor) {
    if (!fichaActualID) return; fichasDB[fichaActualID].skills[skill] = parseInt(valor) || 0; guardarFichaActual();
}

function actualizarMonedaDM(tipo, valor) {
    if (!fichaActualID) return; fichasDB[fichaActualID].monedas[tipo] = parseInt(valor) || 0; guardarFichaActual();
}

function actualizarListaConjuros(nivel, texto) {
    if (!fichaActualID) return;
    const arrayLimpio = texto.split(',').map(s => s.trim()).filter(s => s !== "");
    if(nivel === 'trucos') fichasDB[fichaActualID].conjuros.trucos = arrayLimpio;
    else fichasDB[fichaActualID].conjuros[nivel].lista = arrayLimpio;
    guardarFichaActual();
}

function actualizarConjuroSlots(nivel, tipo, valor) {
    if (!fichaActualID) return; fichasDB[fichaActualID].conjuros[nivel][tipo] = parseInt(valor) || 0; guardarFichaActual();
}

function añadirItemInventario() {
    if (!fichaActualID) return;
    const nombre = prompt("Nombre del objeto:"); if (!nombre) return;
    const cantidad = parseInt(prompt("Cantidad:", "1")) || 1;
    fichasDB[fichaActualID].inventario.push({ nombre, cantidad });
    guardarFichaActual(); cargarFichaEnEditor(fichaActualID); 
}

function borrarItemInventario(index) {
    if (!fichaActualID) return; fichasDB[fichaActualID].inventario.splice(index, 1);
    guardarFichaActual(); cargarFichaEnEditor(fichaActualID);
}

function exportarFichaSeleccionada() { 
    if(!fichaActualID) return; 
    const f = fichasDB[fichaActualID]; 
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(f)); 
    const a = document.createElement('a'); a.href = dataStr; a.download = `${f.nombre}_ficha.json`; a.click(); 
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

renderizarWiki(); renderizarGalerias(); renderizarFichasUI();
window.addEventListener('DOMContentLoaded', renderizarGalerias);