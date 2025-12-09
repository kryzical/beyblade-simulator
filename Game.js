import { gl, unif_vcolor, attr_vpos, init_gl } from './globalvars.js';
import { Beyblade } from './Beyblade.js';
import { Arena } from './Arena.js';

export class Game {
    constructor() {
        this.running = false;
        this.reqId = null;
        this.lastTs = null;

        this.PHYSICS_SI = true;
        this.ARENA_RADIUS_NDC = 0.9;
        this.ARENA_RADIUS_M = 1.0;
        this.M_TO_NDC = this.ARENA_RADIUS_NDC / this.ARENA_RADIUS_M;
        this.BOWL_K = 20.0;
        this.EXTRA_DAMPING = 1.0;

        this.bey1 = null;
        this.bey2 = null;
        this.arena = null;

        this.onUpdateUI = null;
        this.onGameOver = null;
    }

    init() {
        if (!init_gl()) return false;
        this.arena = new Arena(this.ARENA_RADIUS_NDC);
        this.arena.pyramid.outerR = 0.92 * this.ARENA_RADIUS_M;

        this.createBeys();
        this.draw();
        return true;
    }

    createBeys(type1 = 'achilles', type2 = 'achilles') {
        const BEY_SCALE = 2.5;
        const radius_m = 0.085 * BEY_SCALE;
        const x_m = 0.38 * this.ARENA_RADIUS_M;
        const y_m = 0.10 * this.ARENA_RADIUS_M;

        this.bey1 = new Beyblade(x_m, y_m, radius_m, [0.4, 0.2, 0.8]);
        this.setupBey(this.bey1, 1, type1);

        this.bey2 = new Beyblade(-x_m, -y_m, radius_m, [0.2, 0.7, 0.2]);
        this.setupBey(this.bey2, -1, type2);

        if (this.onUpdateUI) this.onUpdateUI();
    }

    setupBey(bey, sign, type) {
        bey.useSI = this.PHYSICS_SI;
        bey.M_TO_NDC = this.M_TO_NDC;
        bey.renderRadius = bey.radius * this.M_TO_NDC;

        const tempBey = new Beyblade();
        const stats = tempBey.getTypeStats(type);
        const speedMult = 0.5 + (stats.spd / 5.0);

        const v_input = 0.8 * speedMult;

        const dist = Math.hypot(bey.centerx, bey.centery);
        const tx = -bey.centery / dist;
        const ty = bey.centerx / dist;
        const rx = bey.centerx / dist;
        const ry = bey.centery / dist;

        bey.vx = 0; bey.vy = 0;

        if (sign > 0) {
            const tSpeed = v_input * 0.5;
            bey.vx = tx * tSpeed;
            bey.vy = ty * tSpeed;
        } else {
            const tangentialMultiplier2 = 0.22;
            let signMult;
            if (sign > 0) {
                signMult = 1;
            } else {
                signMult = -1;
            }
            const tangentialSpeed2 = v_input * tangentialMultiplier2 * signMult;
            const radialAmp2 = 1.0;
            const radialComp2 = radialAmp2 * v_input;

            bey.vx = tx * tangentialSpeed2 * (-1) - rx * radialComp2;
            bey.vy = ty * tangentialSpeed2 * (-1) - ry * radialComp2;
        }

        const spinSign = sign;
        const SPIN_BOOST = 32.0;
        bey.spin = 1.2 * 4.0 * 0.9 * SPIN_BOOST * spinSign * speedMult;
        bey.baseSpin = Math.abs(bey.spin);
        bey.spinDecay = 0.6;

        let beyIndex;
        if (sign === 1) {
            beyIndex = 1;
        } else {
            beyIndex = 2;
        }
        this.setBeyType(beyIndex, type);
    }

    setBeyType(index, type) {
        let b;
        if (index === 1) {
            b = this.bey1;
        } else {
            b = this.bey2;
        }
        if (b) {
            const BEY_SCALE = 2.5;
            b.applyType(type, { BEY_SCALE });
            b.renderRadius = Math.min(b.radius * this.M_TO_NDC, 0.4 * this.ARENA_RADIUS_NDC);
            b.baseMass = Math.max(1e-6, (b.density || 1.0) * Math.PI * b.radius * b.radius);
            b.mass = b.baseMass * (b.massMultiplier || 1.0);

            const speed = Math.hypot(b.vx, b.vy);
            b.initialEnergy = 0.5 * b.mass * speed * speed;
            b.baseSpeed = speed;
        }
    }

    start() {
        if (this.running) return;
        this.running = true;
        this.lastTs = null;
        this.loop = (ts) => this.step(ts);
        this.reqId = requestAnimationFrame(this.loop);
    }

    stop() {
        this.running = false;
        if (this.reqId) cancelAnimationFrame(this.reqId);
    }

    reset(type1 = 'achilles', type2 = 'achilles') {
        this.stop();
        this.createBeys(type1, type2);
        this.draw();
        if (this.onGameOver) this.onGameOver(null);
    }

    step(ts) {
        if (!this.running) return;
        if (!this.lastTs) this.lastTs = ts;
        let dt = (ts - this.lastTs) / 1000.0;
        if (dt > 0.05) dt = 0.05;
        this.lastTs = ts;

        let arenaR;
        if (this.PHYSICS_SI) {
            arenaR = this.ARENA_RADIUS_M;
        } else {
            arenaR = this.ARENA_RADIUS_NDC;
        }
        const bowlK = 20.0 * 0.12;

        if (this.bey1) this.bey1.move(arenaR, bowlK, dt);
        if (this.bey2) this.bey2.move(arenaR, bowlK, dt);

        if (this.bey1) this.arena.checkCollisions(this.bey1);
        if (this.bey2) this.arena.checkCollisions(this.bey2);

        if (this.bey1 && this.bey2) this.bey1.checkCollision(this.bey2);

        [this.bey1, this.bey2].forEach(b => {
            if (b) {
                b.drainHP(1.0 * dt);
                const dist = Math.hypot(b.centerx, b.centery);
                if (dist + b.radius >= arenaR - 1e-6) {
                }

                if (b.hpPercent <= 0) {
                    b.isKO = true;
                    b.vx = 0; b.vy = 0;
                }
            }
        });

        if (this.onUpdateUI) this.onUpdateUI();

        if (this.bey1.isKO || this.bey2.isKO) {
            let winner = '';
            if (this.bey1.isKO && this.bey2.isKO) winner = 'Draw';
            else if (this.bey1.isKO) winner = 'Bey 2 Wins';
            else winner = 'Bey 1 Wins';

            if (this.onGameOver) this.onGameOver(winner);
            this.stop();
        }

        this.draw();
        this.reqId = requestAnimationFrame(this.loop);
    }

    draw() {
        gl.clear(gl.COLOR_BUFFER_BIT);
        this.arena.draw(this.M_TO_NDC);
        if (this.bey1) this.bey1.draw();
        if (this.bey2) this.bey2.draw();
    }
}
