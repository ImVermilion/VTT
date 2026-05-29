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

// --- FICHA Y AUTO-GUARDADO (Local) ---
document.getElementById('nombre-jugador').value = localStorage.getItem('miNombreJugadorVTT') || '';
document.getElementById('notas-privadas-jugador').value = localStorage.getItem('misNotasJugadorVTT') || '';

function guardarNombreLocal() {
    localStorage.setItem('miNombreJugadorVTT', document.getElementById('nombre-jugador').value);
}

function guardarNotasJugador() {
    localStorage.setItem('misNotasJugadorVTT', document.getElementById('notas-privadas-jugador').value);
}

document.getElementById('upload-ficha-json').addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();

    reader.onload = function(evt) {
        try {
            const data = JSON.parse(evt.target.result);

            ['nombre','hp','ca','ini','vel'].forEach(c => {
                if(document.getElementById(`f-${c}`))
                    document.getElementById(`f-${c}`).innerText = data[c] || "-";
            });

            ['fue','des','con','int','sab','car'].forEach(a => {
                if(document.getElementById(`f-${a}`))
                    document.getElementById(`f-${a}`).innerText = data[a] || "10";
                let mod = Math.floor((parseInt(data[a] || 10) - 10) / 2);
                if(document.getElementById(`m-${a}`))
                    document.getElementById(`m-${a}`).innerText = mod >= 0 ? `+${mod}` : `${mod}`;
            });

            if(!document.getElementById('nombre-jugador').value) {
                document.getElementById('nombre-jugador').value = data.nombre || "Héroe";
                guardarNombreLocal();
            }

        } catch(err) {
            alert("Archivo JSON inválido.");
        }
    };
    reader.readAsText(file);
});

// --- ENVIAR TIRADA (A través de Supabase) ---
function procesarTiradaJugador(caras, mod, motivo) {
    const nick = document.getElementById('nombre-jugador').value || "Jugador";
    const baseRoll = Math.floor(Math.random() * caras) + 1;
    
    const paquete = {
        quien: nick,
        caras: caras,
        resultado: baseRoll,
        mod: parseInt(mod || 0),
        total: baseRoll + parseInt(mod || 0),
        motivo: motivo,
        tiempo: Date.now()
    };
    
    // Enviar al canal VTT para que el DM y los demás lo vean
    if (typeof canalVTT !== 'undefined') {
        canalVTT.send({
            type: 'broadcast',
            event: 'dado-jugador',
            payload: paquete
        });
    }

    // Mostrárnoslo a nosotros mismos directamente
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

// --- RECIBIR DEL DM Y SINCRONIZAR (SUPABASE) ---
async function inicializarProyeccionOnline() {
    if (typeof supabaseClient === 'undefined') {
        console.warn("Supabase no está configurado. El mapa no funcionará online.");
        return;
    }

    
    let { data, error } = await supabaseClient.from('vtt_estado').select('*').eq('id', 1).single();
    if (data) aplicarEstadoVTT(data);

    
    supabaseClient.channel('cambios-db')
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'vtt_estado' }, payload => {
            aplicarEstadoVTT(payload.new);
        })
        .subscribe();

    // 1. Cargar el estado inicial de la base de datos
    let { data, error } = await supabase.from('vtt_estado').select('*').eq('id', 1).single();
    if (data) aplicarEstadoVTT(data);

    // 2. Escuchar cambios de la base de datos en tiempo real (Movimientos, Mapas...)
    supabase.channel('cambios-db')
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'vtt_estado' }, payload => {
            aplicarEstadoVTT(payload.new);
        })
        .subscribe();

    // 3. Escuchar eventos Broadcast (Tiradas de dados y Play/Pause de música)
    canalVTT.on('broadcast', { event: 'dado-dm' }, (mensaje) => {
        const info = mensaje.payload;
        mostrarDadoFlotante("Dungeon Master", info.caras, info.resultado, 0, `Tirada del DM`, info.resultado);
    }).subscribe();

    canalVTT.on('broadcast', { event: 'dado-jugador' }, (mensaje) => {
        const info = mensaje.payload;
        // Solo lo mostramos si es de OTRO jugador (porque si somos nosotros, ya lo pintamos al hacer clic)
        if (info.quien !== (document.getElementById('nombre-jugador').value || "Jugador")) {
            mostrarDadoFlotante(info.quien, info.caras, info.resultado, info.mod, info.motivo, info.total);
        }
    }).subscribe();

    canalVTT.on('broadcast', { event: 'audio-comando' }, (mensaje) => {
        if (mensaje.payload.cmd === 'play') {
            elementoAudio.play().catch(err => console.log('El navegador bloqueó el autoplay. Debes conectar el audio.', err));
        } else if (mensaje.payload.cmd === 'pause') {
            elementoAudio.pause();
        }
    }).subscribe();
}

function aplicarEstadoVTT(estado) {
    // Mapa
    if (estado.mapa_url !== undefined) {
        if (estado.mapa_url) {
            imgMapa.src = estado.mapa_url;
            wrapperMapa.style.display = "inline-block";
        } else {
            imgMapa.src = "";
            wrapperMapa.style.display = "none";
        }
    }
    // Rejilla
    if (estado.rejilla !== undefined) {
        if(estado.rejilla) capaRejilla.classList.add('activa');
        else capaRejilla.classList.remove('activa');
    }
    // Tokens
    if (estado.tokens !== undefined) {
        renderizarTokens(estado.tokens || []);
    }
    // Audio (Solo URL y Volumen, el Play/Pause va por broadcast)
    if (estado.audio_url !== undefined && estado.audio_url !== elementoAudio.src) {
        elementoAudio.src = estado.audio_url;
    }
    if (estado.audio_volumen !== undefined) {
        elementoAudio.volume = parseFloat(estado.audio_volumen);
    }
}

inicializarProyeccionOnline();

function mostrarDadoFlotante(quien, caras, base, mod, motivo, total) {
    let cl = `forma-d${caras}`;
    boxDados.classList.add('mostrar');

    arenaDados.innerHTML =
        `<div class="contenedor-dado-animado">
            <div class="dado-visual ${cl} rodando" style="width:75px;height:75px;font-size:1.8rem;">?</div>
        </div>`;

    setTimeout(() => {
        let color = "white";
        if (caras === 20 && base === 20) color = "gold";
        if (caras === 20 && base === 1) color = "red";

        let sub = mod !== 0 ? `<br><span style="font-size:0.85rem;color:#aaa;">(${base} ${mod >= 0 ? '+' : ''}${mod})</span>` : '';

        arenaDados.innerHTML =
            `<div class="contenedor-dado-animado">
                <div class="dado-visual ${cl}" style="width:75px;height:75px;font-size:2.2rem;color:${color};">${total}</div>
                <p style="color:#2ecc71;font-size:1.1rem;margin:6px 0 2px 0;font-weight:bold;text-align:center;">${quien}</p>
                <p style="color:white;font-size:0.8rem;margin:0;text-align:center;">${motivo}${sub}</p>
            </div>`;

        clearTimeout(temporizadorDado);
        temporizadorDado = setTimeout(() => {
            boxDados.classList.remove('mostrar');
        }, 3500);
    }, 600);
}

function renderizarTokens(tokens) {
    document.querySelectorAll('.token-jugador').forEach(t => t.remove());

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