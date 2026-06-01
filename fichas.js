// fichas.js (Reglas de D&D 5e y motor de personajes)

class Personaje {
    constructor(datos = {}) {
        this.id = datos.id || '_' + Math.random().toString(36).substr(2, 9);
        this.nombre = datos.nombre || "Nuevo Personaje";
        this.clase = datos.clase || "";
        this.nivel = datos.nivel || 1;
        this.competencia = datos.competencia || 2;
        
        this.atributos = datos.atributos || { fue: 10, des: 10, con: 10, int: 10, sab: 10, car: 10 };
        this.hp_max = datos.hp_max || 10;
        this.hp_actual = datos.hp_actual !== undefined ? datos.hp_actual : this.hp_max;
        this.ca = datos.ca || 10;
        
        // NUEVO: Sistema de 3 monedas (mantiene el oro antiguo si importas una ficha vieja)
        this.monedas = datos.monedas || { oro: datos.oro || 0, plata: 0, bronce: 0 };

        this.inventario = datos.inventario || [];

        this.skills = datos.skills || {
            acrobacias: 0, arcano: 0, atletismo: 0, engaño: 0, historia: 0,
            interpretacion: 0, intimidacion: 0, investigacion: 0, juego_manos: 0,
            medicina: 0, naturaleza: 0, percepcion: 0, perspicacia: 0,
            persuasion: 0, religion: 0, sigilo: 0, supervivencia: 0, trato_animales: 0
        };

        // Sistema de Conjuros 5e completo
        this.conjuros = datos.conjuros || {
            trucos: [],
            nivel1: { max: 0, usados: 0, lista: [] },
            nivel2: { max: 0, usados: 0, lista: [] },
            nivel3: { max: 0, usados: 0, lista: [] },
            nivel4: { max: 0, usados: 0, lista: [] },
            nivel5: { max: 0, usados: 0, lista: [] },
            nivel6: { max: 0, usados: 0, lista: [] },
            nivel7: { max: 0, usados: 0, lista: [] },
            nivel8: { max: 0, usados: 0, lista: [] },
            nivel9: { max: 0, usados: 0, lista: [] }
        };
    }

    obtenerModificador(stat) {
        return Math.floor((this.atributos[stat] - 10) / 2);
    }

    obtenerTotalSkill(skill, statAsociado) {
        let modBase = this.obtenerModificador(statAsociado);
        if (this.skills[skill] > 0) {
            modBase += this.competencia;
        }
        return modBase;
    }

    exportarJSON() {
        return JSON.stringify(this);
    }

    static importarJSON(jsonString) {
        try {
            const datos = JSON.parse(jsonString);
            return new Personaje(datos);
        } catch (error) {
            console.error("Error al importar la ficha", error);
            return null;
        }
    }
}