const wrapperMapa = document.getElementById('wrapper-mapa');
const imgMapa = document.getElementById('img-mapa');
const capaRejilla = document.getElementById('capa-rejilla');
const boxDados = document.getElementById('notificacion-dados-3d');
const arenaDados = document.getElementById('arena-3d-jugadores');
const elementoAudio = document.getElementById('audio-ambiente-vtt');

// Mapa de referencia para saber qué atributo usa cada habilidad de 5e
const mapaSkills5e = {
    acrobacias: 'des', arcano: 'int', atletismo: 'fue', engaño: 'car', historia: 'int',
    interpretacion: 'car', intimidacion: 'car', investigacion: 'int', juego_manos: 'des',
    medicina: 'sab', naturaleza: 'int', percepcion: 'sab', perspicacia: 'sab',
    persuasion: 'car', religion: 'int', sigilo: 'des', supervivencia: 'sab', trato_animales: 'sab'
};

// --- ZOOM Y PAN (Arrastrar mapa) ---
let zoomMapa = 1; let mapaPoscX = 0; let mapaPoscY = 0;
let arrastrandoMapa = false; let startX, startY;
const contMapa = document.getElementById('contenedor-mapa-scroll');

if(contMapa) {
    contMapa.addEventListener('wheel', (e) => {
        e.preventDefault();
        const zoomPaso = 0.1;
        if(e.deltaY < 0) zoomMapa += zoomPaso;
        else zoomMapa = Math.max(0.2, zoomMapa - zoomPaso);
        document.getElementById('wrapper-mapa').style.transform = `scale(${zoomMapa})`;
    });

    document.getElementById('wrapper-mapa').addEventListener('mousedown', (e) => {
        if(e.target.classList.contains('token-jugador')) return; 
        arrastrandoMapa = true;
        startX = e.clientX - mapaPoscX;
        startY = e.clientY - mapaPoscY;
    });

    window.addEventListener('mousemove', (e) => {
        if(!arrastrandoMapa) return;
        mapaPoscX = e.clientX - startX;
        mapaPoscY = e.clientY - startY;
        document.getElementById('wrapper-mapa').style.left = mapaPoscX + 'px';
        document.getElementById('wrapper-mapa').style.top = mapaPoscY + 'px';
    });

    window.addEventListener('mouseup', () => { arrastrandoMapa = false; });
}

// --- FICHA Y AUTO-GUARDADO ---
document.getElementById('nombre-jugador').value = localStorage.getItem('miNombreJugadorVTT') || '';
document.getElementById('notas-privadas-jugador').value = localStorage.getItem('misNotasJugadorVTT') || '';

function guardarNombreLocal() { localStorage.setItem('miNombreJugadorVTT', document.getElementById('nombre-jugador').value); }
function guardarNotasJugador() { localStorage.setItem('misNotasJugadorVTT', document.getElementById('notas-privadas-jugador').value); }

let miPersonajeActual = null;

function actualizarInputsDeInterfaz() {
    if(!miPersonajeActual) return;
    
    document.getElementById('f-nombre').value = miPersonajeActual.nombre || "Héroe";
    document.getElementById('f-hp').value = miPersonajeActual.hp_actual || 0;
    document.getElementById('f-ca').value = miPersonajeActual.ca || 10;
    document.getElementById('f-oro').value = miPersonajeActual.oro || 0;

    ['fue','des','con','int','sab','car'].forEach(a => {
        const valor = miPersonajeActual.atributos[a] || 10;
        document.getElementById(`f-${a}`).value = valor;
        const mod = miPersonajeActual.obtenerModificador(a);
        document.getElementById(`m-${a}`).innerText = mod >= 0 ? `+${mod}` : `${mod}`;
    });

    (miPersonajeActual);
}

function actualizarDatoJugador(clave, valor) {
    if(!miPersonajeActual) return;
    if(clave === 'nombre') miPersonajeActual[clave] = valor;
    else miPersonajeActual[clave] = parseInt(valor) || 0;
}

function actualizarDatoJugadorAtributo(atrib, valor) {
    if(!miPersonajeActual) return;
    miPersonajeActual.atributos[atrib] = parseInt(valor) || 10;
    actualizarInputsDeInterfaz(); 
}

function descargarFichaJugador() {
    if(!miPersonajeActual) { alert("Carga una ficha primero."); return; }
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(miPersonajeActual.exportarJSON()); 
    const a = document.createElement('a'); 
    a.href = dataStr; 
    a.download = `${miPersonajeActual.nombre}_actualizado.json`; 
    a.click(); 
}

if(document.getElementById('upload-ficha-json')) {
    document.getElementById('upload-ficha-json').addEventListener('change', function(e) {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = function(evt) {
            if (typeof Personaje !== 'undefined') {
                miPersonajeActual = Personaje.importarJSON(evt.target.result);
                if (miPersonajeActual) {
                    if(!document.getElementById('nombre-jugador').value) {
                        document.getElementById('nombre-jugador').value = miPersonajeActual.nombre || "Héroe";
                        guardarNombreLocal();
                    }
                    actualizarInputsDeInterfaz();
                } else {
                    alert("Error al importar la ficha.");
                }
            } else {
                alert("Error: Faltan las reglas (ficha.js).");
            }
        };
        reader.readAsText(file);
    });
}

function renderizarFichaCompletaJugador(pj) {
    // 1. Sincronizar datos básicos
    document.getElementById('f-hp').value = pj.hp_actual || 0;
    document.getElementById('f-ca').value = pj.ca || 10;
    
    // 2. Monedas (Oro, Plata, Bronce)
    if(pj.monedas) {
        document.getElementById('f-oro').value = pj.monedas.oro || 0;
        document.getElementById('f-plata').value = pj.monedas.plata || 0;
        document.getElementById('f-bronce').value = pj.monedas.bronce || 0;
    }

    // 3. Renderizar Conjuros de forma limpia (sin agobiar)
    const container = document.getElementById('p-conjuros') || crearContenedorConjuros();
    container.innerHTML = `<h4 style="color:#9b59b6;">🔮 Conjuros</h4>`;
    
    // Trucos
    container.innerHTML += `<p><strong>Trucos:</strong> ${pj.conjuros.trucos.join(', ')}</p>`;
    
    // Niveles 1-9
    for(let i=1; i<=9; i++) {
        const nivel = pj.conjuros[`nivel${i}`];
        if(nivel && nivel.max > 0) {
            container.innerHTML += `
                <div style="font-size: 0.85rem; border-bottom: 1px solid #333; padding: 2px;">
                    <strong>Nivel ${i}:</strong> ${nivel.usados}/${nivel.max} usados | ${nivel.lista.join(', ')}
                </div>`;
        }
    }
}

// Función auxiliar para que el HTML de jugador tenga donde pintar conjuros
function crearContenedorConjuros() {
    const div = document.createElement('div');
    div.id = 'p-conjuros';
    document.querySelector('.player-ficha-container').appendChild(div);
    return div;
}

// --- ENVIAR TIRADA (Supabase Realtime) ---
function procesarTiradaJugador(caras, mod, motivo) {
    const nick = document.getElementById('nombre-jugador').value || "Jugador";
    const numCaras = parseInt(caras);
    const baseRoll = Math.floor(Math.random() * numCaras) + 1;
    const modificador = parseInt(mod || 0);
    const total = baseRoll + modificador;
    
    const paquete = { quien: nick, caras: numCaras, resultado: baseRoll, mod: modificador, total: total, motivo: motivo, tiempo: Date.now() };
    
    if (typeof canalVTT !== 'undefined') {
        canalVTT.send({ type: 'broadcast', event: 'dado-jugador', payload: paquete });
    }
    mostrarDadoFlotante(paquete.quien, paquete.caras, paquete.resultado, paquete.mod, paquete.motivo, paquete.total);
}

function tirarAtributoJugador(nombreAtrib, idScore) {
    const inputEl = document.getElementById(idScore);
    // Solución al Bug: Lee el .value si es input, o .innerText si es div antiguo, o 10 por defecto
    const score = inputEl.value || inputEl.innerText || 10; 
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

    if(typeof reproducirSonidoDado === 'function') reproducirSonidoDado();

    setTimeout(() => {
        dadoDiv.remove();
        if (arenaDados.children.length === 0) boxDados.classList.remove('mostrar');
    }, 4500);
}

// --- CONEXIÓN SUPABASE ONLINE ---
async function inicializarProyeccionOnline() {
    if (typeof supabaseClient === 'undefined') return;

    let resultadoDB = await supabaseClient.from('vtt_estado').select('*').eq('id', 1).single();
    if (resultadoDB.data) aplicarEstadoVTT(resultadoDB.data);

    supabaseClient.channel('cambios-db')
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'vtt_estado' }, payload => {
            aplicarEstadoVTT(payload.new);
        }).subscribe();

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
                if (mensaje.payload.url && !elementoAudio.src.endsWith(mensaje.payload.url)) elementoAudio.src = mensaje.payload.url;
                elementoAudio.play().catch(()=>{});
            }
            if (mensaje.payload.cmd === 'pause') elementoAudio.pause();
        }
    }).subscribe();
}

function aplicarEstadoVTT(estado) {
    if ('mapa_url' in estado) {
        if (estado.mapa_url) { 
            imgMapa.src = estado.mapa_url; 
            wrapperMapa.style.display = "block"; // Asegura que el contenedor se muestra
        } else { 
            imgMapa.src = ""; 
            wrapperMapa.style.display = "none"; 
        }
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