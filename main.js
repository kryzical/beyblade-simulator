import { Game } from './Game.js';
import { gl, magenta_color, cyan_color } from './globalvars.js';

const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const resetBtn = document.getElementById('resetBtn');
const energyEl = document.getElementById('energy');
const energy2El = document.getElementById('energy2');
const winnerEl = document.getElementById('winner');

const bey1TypeEl = document.getElementById('bey1Type');
const bey2TypeEl = document.getElementById('bey2Type');
const togglePyramidBtn = document.getElementById('togglePyramidBtn');

let game = new Game();

function updateBeyStats(prefix, bey) {
    if (!bey) return;

    const stats = bey._typeStats || { def: '-', spd: '-', atk: '-' };

    const defEl = document.getElementById(prefix + '_def');
    const spdEl = document.getElementById(prefix + '_spd');
    const atkEl = document.getElementById(prefix + '_display');

    if (defEl) defEl.textContent = stats.def;
    if (spdEl) spdEl.textContent = stats.spd;
    if (atkEl) atkEl.textContent = stats.atk;

    const defPhysEl = document.getElementById(prefix + '_def_phys');
    const spdPhysEl = document.getElementById(prefix + '_spd_phys');
    const atkPhysEl = document.getElementById(prefix + '_atk_phys');

    if (defPhysEl) defPhysEl.textContent = `( ${(bey.mass || 0).toFixed(4)} kg )`;

    let speedVal = 0;
    if (bey._type && bey._type !== 'random') {
        speedVal = stats.spd * 0.8;
    } else {
        if (bey.baseSpeed) speedVal = bey.baseSpeed;
        else speedVal = Math.hypot(bey.vx, bey.vy);
    }

    if (spdPhysEl) spdPhysEl.textContent = `( ${speedVal.toFixed(3)} m/s )`;

    const cdm = bey.collisionDamageMultiplier || 1.0;
    if (atkPhysEl) atkPhysEl.textContent = `( x${cdm.toFixed(2)} )`;
}

function updateUI() {
    if (game.bey1) {
        energyEl.textContent = game.bey1.hpPercent.toFixed(1) + "%";
        updateBeyStats('bey1', game.bey1);
    }
    if (game.bey2) {
        energy2El.textContent = game.bey2.hpPercent.toFixed(1) + "%";
        updateBeyStats('bey2', game.bey2);
    }

    if (game.bey1 && game.bey1.color) {
        const c = game.bey1.color;
        const r = Math.floor(c[0] * 255);
        const g = Math.floor(c[1] * 255);
        const b = Math.floor(c[2] * 255);
        const el = document.getElementById('bey1_hp_swatch');
        if (el) el.style.backgroundColor = `rgb(${r},${g},${b})`;
    }
    if (game.bey2 && game.bey2.color) {
        const c = game.bey2.color;
        const r = Math.floor(c[0] * 255);
        const g = Math.floor(c[1] * 255);
        const b = Math.floor(c[2] * 255);
        const el = document.getElementById('bey2_hp_swatch');
        if (el) el.style.backgroundColor = `rgb(${r},${g},${b})`;
    }
}

function onGameOver(winner) {
    if (winner) winnerEl.textContent = "Winner: " + winner;
    else winnerEl.textContent = "Winner: —";
}

function init() {
    game.onUpdateUI = updateUI;
    game.onGameOver = onGameOver;

    if (game.init()) {
        console.log("Game Initialized");
    } else {
        console.error("Game Init Failed");
    }

    startBtn.onclick = () => game.start();
    stopBtn.onclick = () => game.stop();
    resetBtn.onclick = () => {
        let t1;
        if (bey1TypeEl) {
            t1 = bey1TypeEl.value;
        } else {
            t1 = 'achilles';
        }
        let t2;
        if (bey2TypeEl) {
            t2 = bey2TypeEl.value;
        } else {
            t2 = 'achilles';
        }
        game.reset(t1, t2);
        updateUI();
    };

    if (togglePyramidBtn) {
        togglePyramidBtn.onclick = () => {
            game.arena.pyramid.enabled = !game.arena.pyramid.enabled;
            if (game.arena.pyramid.enabled) {
                togglePyramidBtn.textContent = 'Hide Triangles';
            } else {
                togglePyramidBtn.textContent = 'Show Triangles';
            }
            game.draw();
        };
    }

    if (bey1TypeEl) {
        bey1TypeEl.onchange = () => {
            game.setBeyType(1, bey1TypeEl.value);
            game.draw();
            updateUI();
        };
    }
    if (bey2TypeEl) {
        bey2TypeEl.onchange = () => {
            game.setBeyType(2, bey2TypeEl.value);
            game.draw();
            updateUI();
        };
    }

    game.setBeyType(1, 'pegasus');
    game.setBeyType(2, 'wyvern');
    updateUI();

    setupSwatches();
}

function hexToRgb(hex) {
    if (hex.startsWith('#')) hex = hex.slice(1);
    const bigint = parseInt(hex, 16);
    const r = ((bigint >> 16) & 255) / 255.0;
    const g = ((bigint >> 8) & 255) / 255.0;
    const b = (bigint & 255) / 255.0;
    return [r, g, b];
}

function setupSwatches() {
    const swatches1 = document.querySelectorAll('.swatch.bey1');
    const swatches2 = document.querySelectorAll('.swatch.bey2');

    swatches1.forEach(s => {
        s.onclick = () => {
            const hex = s.getAttribute('data-color');
            if (game.bey1 && hex) {
                game.bey1.color = hexToRgb(hex);
                game.draw();
            }
        };
    });

    swatches2.forEach(s => {
        s.onclick = () => {
            const hex = s.getAttribute('data-color');
            if (game.bey2 && hex) {
                game.bey2.color = hexToRgb(hex);
                game.draw();
            }
        };
    });
}

init();
