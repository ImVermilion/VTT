const wrapperMapa = document.getElementById('wrapper-mapa');
const imgMapa = document.getElementById('img-mapa');
const capaRejilla = document.getElementById('capa-rejilla');
const boxDados = document.getElementById('notificacion-dados-3d');
const arenaDados = document.getElementById('arena-3d-jugadores');
const elementoAudio = document.getElementById('audio-ambiente-vtt');

let temporizadorDado;

// --- GESTIÓN VISTAS JUGADOR ---
function cambiarTabJugador(idTab, btn) {
    document.querySelectorAll('.player-vista').forEach(p => p.classList.remove('activa'));
    document.querySelectorAll('.player-nav button').forEach(b => b.classList.remove('activa'));
    document.getElementById(idTab).classList.add('activa');
    btn.classList.add('activa');
}

// --- FICHA Y AUTO-GUARDADO ---
document.getElementById('nombre-jugador').value = localStorage.getItem('miNombreJugadorVTT') || '';
document.getElementById('notas-privadas-jugador').value = localStorage.getItem('misNotasJugadorVTT') || '';

function guardarNombreLocal() { localStorage.setItem('miNombreJugadorVTT', document.getElementById('nombre-jugador').value); }
function guardarNotasJugador() { localStorage.setItem('misNotasJugadorVTT', document.getElementById('notas-privadas-jugador').value); }

if(document.getElementById('upload-ficha-json')) {
    document.getElementById('upload-ficha-json').addEventListener('change', function(e) {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = function(evt) {
            try {
                const data = JSON.parse(evt.target.result);
                ['nombre','hp','ca','ini','vel'].forEach(c => {
                    if(document.getElementById(`f-${c}`)) document.getElementById(`f-${c}`).innerText = data[c] || "-";
                });
                ['fue','des','con','int','sab','car'].forEach(a => {
                    if(document.getElementById(`f-${a}`)) document.getElementById(`f-${a}`).innerText = data[a] || "10";
                    let mod = Math.floor((parseInt(data[a] || 10) - 10) / 2);
                    if(document.getElementById(`m-${a}`)) document.getElementById(`m-${a}`).innerText = mod >= 0 ? `+${mod}` : `${mod}`;
                });
                if(!document.getElementById('nombre-jugador').value) {
                    document.getElementById('nombre-jugador').value = data.nombre || "Héroe";
                    guardarNombreLocal();
                }
            } catch(err) { alert("Archivo JSON inválido."); }
        };
        reader.readAsText(file);
    });
}

// --- ENVIAR TIRADA (Supabase Realtime) ---
function procesarTiradaJugador(caras, mod, motivo) {
    const nick = document.getElementById('nombre-jugador').value || "Jugador";
    const numCaras = parseInt(caras);
    const baseRoll = Math.floor(Math.random() * numCaras) + 1;
    const modificador = parseInt(mod || 0);
    const total = baseRoll + modificador;
    
    const paquete = {
        quien: nick, caras: numCaras, resultado: baseRoll, mod: modificador, total: total, motivo: motivo, tiempo: Date.now()
    };
    
    if (typeof canalVTT !== 'undefined') {
        canalVTT.send({ type: 'broadcast', event: 'dado-jugador', payload: paquete });
    }
    mostrarDadoFlotante(paquete.quien, paquete.caras, paquete.resultado, paquete.mod, paquete.motivo, paquete.total);
}

function tirarAtributoJugador(nombreAtrib, idScore) {
    const score = document.getElementById(idScore).innerText;
    const mod = Math.floor((parseInt(score) - 10) / 2);
    procesarTiradaJugador(20, mod, `Tirada de ${nombreAtrib}`);
}

function tirarDadoGenericoJugador(caras) {
    procesarTiradaJugador(caras, 0, `d${caras}`);
}

function mostrarDadoFlotante(quien, caras, base, mod, motivo, total) {
    const numCaras = parseInt(caras);
    let cl = 'forma-d' + numCaras;
    if (!numCaras || isNaN(numCaras)) cl = 'forma-d6';

    let color = "white";
    if (numCaras === 20 && base === 20) color = "gold";
    if (numCaras === 20 && base === 1) color = "red";

    let sub = mod !== 0 ? `<br><span style="font-size:0.85rem;color:#aaa;">(${base} ${mod >= 0 ? '+' : ''}${mod})</span>` : '';

    const dadoDiv = document.createElement('div');
    dadoDiv.className = 'contenedor-dado-animado';
    
    dadoDiv.innerHTML = `
        <div class="dado-visual ${cl} rodando" style="width:75px;height:75px;font-size:2.2rem;color:${color}; margin: 0 auto;">${total}</div>
        <p style="color:#2ecc71;font-size:1.1rem;margin:6px 0 2px 0;font-weight:bold;text-align:center;">${quien}</p>
        <p style="color:white;font-size:0.8rem;margin:0;text-align:center;">${motivo}${sub}</p>
    `;

    arenaDados.appendChild(dadoDiv);
    boxDados.classList.add('mostrar');

    const hist = document.getElementById('historial-tiradas');
    if (hist) {
        const item = document.createElement('div');
        item.style.padding = '6px';
        item.style.borderBottom = '1px solid #333';
        item.innerHTML = `<strong style="color:#2ecc71">${quien}</strong> tiró d${numCaras} <i>(${motivo})</i>: <b style="color:#3498db; font-size:1.2em">${total}</b>`;
        hist.prepend(item);
    }

    if(typeof reproducirSonidoDado === 'function') reproducirSonidoDado();

    setTimeout(() => {
        dadoDiv.remove();
        if (arenaDados.children.length === 0) boxDados.classList.remove('mostrar');
    }, 4500);
}

// --- CONEXIÓN SUPABASE ONLINE ---
async function inicializarProyeccionOnline() {
    if (typeof supabaseClient === 'undefined') return;

    // Carga inicial
    let resultadoDB = await supabaseClient.from('vtt_estado').select('*').eq('id', 1).single();
    if (resultadoDB.data) aplicarEstadoVTT(resultadoDB.data);

    // Escuchar la Base de Datos (Seguridad de respaldo)
    supabaseClient.channel('cambios-db')
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'vtt_estado' }, payload => {
            aplicarEstadoVTT(payload.new);
        }).subscribe();

    // Escuchar Broadcast Directo (Más rápido, evita parpadeos)
    canalVTT.on('broadcast', { event: 'estado-vtt' }, (mensaje) => {
        aplicarEstadoVTT(mensaje.payload);
    }).subscribe();

    canalVTT.on('broadcast', { event: 'dado-dm' }, (mensaje) => {
        mostrarDadoFlotante("Dungeon Master", mensaje.payload.caras, mensaje.payload.resultado, 0, "Tirada DM", mensaje.payload.total);
    }).subscribe();

    canalVTT.on('broadcast', { event: 'dado-jugador' }, (mensaje) => {
        const p = mensaje.payload;
        if (p.quien !== document.getElementById('nombre-jugador').value) {
            mostrarDadoFlotante(p.quien, p.caras, p.resultado, p.mod, p.motivo, p.total);
        }
    }).subscribe();
    
    canalVTT.on('broadcast', { event: 'audio-comando' }, (mensaje) => {
        if(elementoAudio) {
            if (mensaje.payload.cmd === 'play') {
                if (mensaje.payload.url && !elementoAudio.src.endsWith(mensaje.payload.url)) {
                    elementoAudio.src = mensaje.payload.url;
                }
                elementoAudio.play().catch(()=>{});
            }
            if (mensaje.payload.cmd === 'pause') elementoAudio.pause();
        }
    }).subscribe();
}

function aplicarEstadoVTT(estado) {
    // Solución al bug: Comprobamos si la clave existe antes de intentar aplicarla o borrarla
    if ('mapa_url' in estado) {
        if (estado.mapa_url) { imgMapa.src = estado.mapa_url; wrapperMapa.style.display = "inline-block"; }
        else { imgMapa.src = ""; wrapperMapa.style.display = "none"; }
    }
    
    if ('rejilla' in estado && capaRejilla) capaRejilla.style.display = estado.rejilla ? 'block' : 'none';
    if ('tokens' in estado) renderizarTokens(estado.tokens);

    if ('audio_url' in estado && elementoAudio && estado.audio_url) {
        if (!elementoAudio.src.endsWith(estado.audio_url)) elementoAudio.src = estado.audio_url;
    }
    if ('audio_volumen' in estado && elementoAudio) {
        elementoAudio.volume = estado.audio_volumen;
    }
}

function renderizarTokens(tokens) {
    document.querySelectorAll('.token-jugador').forEach(t => t.remove());
    if(!tokens) return;
    tokens.forEach(t => {
        if (!t.visible) return;
        const tokenEl = document.createElement('div');
        tokenEl.className = 'token-jugador';
        tokenEl.style.width = t.escala + 'px';
        tokenEl.style.height = t.escala + 'px';
        tokenEl.style.border = `3px solid ${t.color}`;
        tokenEl.style.backgroundImage = `url(${t.img})`;
        tokenEl.style.left = t.x;
        tokenEl.style.top = t.y;
        wrapperMapa.appendChild(tokenEl);
    });
}

inicializarProyeccionOnline();
