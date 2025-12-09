import { gl, unif_vcolor, gl_prog, attr_vpos, N_DIM } from './globalvars.js';

export class Beyblade {
    constructor(centerx = 0, centery = 0, radius = 0.06, color = [1, 1, 1], vx = 0, vy = 0) {
        this.centerx = centerx;
        this.centery = centery;
        this.radius = radius;
        this.vx = vx;
        this.vy = vy;
        this.color = color;
        this.buffer = null;
        this.dotBuffer = null;
        this.segments = 28;
        this.vertCount = 0;

        this.density = 3.0;
        this.mass = Math.max(1e-6, this.density * Math.PI * this.radius * this.radius);
        this.restitution = 0.95;
        this.rimRestBoost = 0.05;

        this.initialSpeed = Math.max(1e-6, Math.hypot(this.vx, this.vy));
        this.initialEnergy = 0.5 * this.mass * this.initialSpeed * this.initialSpeed;
        if (this.initialEnergy <= 0) this.initialEnergy = 1e-8;
        this.hpPercent = 100.0;
        this.isKO = false;

        this.jitter = 0.01;
        this._noiseFreq = 0.0;
        this._noiseAmp = 0.0;

        this.spin = 0.0;
        this.spinDecay = 0.6;
        this.spinToTangential = 0.08;
        this.rimSpinTransfer = 0.06;
        this.spinFrictionOnRim = 0.35;
        this.radialAlign = 2.5;
        this.spinAngle = 0.0;

        this.collisionDamageMultiplier = 1.0;
        this.collisionDrainCap = undefined;

        this.useSI = false;
        this.M_TO_NDC = 1.0;
        this.renderRadius = undefined;
        this.collisionHPScale = 0.6;
        this.baseSpin = Math.abs(this.spin) || 1.0;
    }

    move(arenaRadius, bowlK = 0, dt = 1 / 60) {
        if (this.isKO) {
            this.vx = 0;
            this.vy = 0;
            return;
        }

        if (bowlK && bowlK !== 0) {
            let kx;
            if (this.bowlKx !== undefined) {
                kx = this.bowlKx;
            } else {
                kx = bowlK;
            }
            let ky;
            if (this.bowlKy !== undefined) {
                ky = this.bowlKy;
            } else {
                ky = bowlK;
            }
            if (this.useSI) {
                const ax = -(kx / this.mass) * this.centerx;
                const ay = -(ky / this.mass) * this.centery;
                this.vx += ax * dt;
                this.vy += ay * dt;
            } else {
                const ax = -kx * this.centerx;
                const ay = -ky * this.centery;
                this.vx += ax * dt;
                this.vy += ay * dt;
            }
        }

        if (this._noiseFreq && this._noiseAmp) {
            let now;
            if (typeof performance !== 'undefined') {
                now = performance.now() / 1000.0;
            } else {
                now = Date.now() / 1000.0;
            }
            const nf = Math.sin(now * this._noiseFreq + (this._noisePhase || 0));
            const nf2 = Math.cos(now * this._noiseFreq + (this._noisePhase || 0));
            this.vx += nf * this._noiseAmp * dt;
            this.vy += nf2 * this._noiseAmp * dt;
        }
        if (this.jitter) {
            this.vx += (Math.random() - 0.5) * this.jitter * dt;
            this.vy += (Math.random() - 0.5) * this.jitter * dt;
        }

        if (this.spin && Math.abs(this.spin) > 1e-6) {
            const distForTang = Math.hypot(this.centerx, this.centery) || 1e-6;
            const tx = -this.centery / distForTang;
            const ty = this.centerx / distForTang;
            const at = this.spin * this.spinToTangential;
            this.vx += tx * at * dt;
            this.vy += ty * at * dt;
            let spinDecayRate;
            if (this.hpPercent > 0) {
                spinDecayRate = 0.0;
            } else {
                spinDecayRate = this.spinDecay;
            }
            this.spin *= Math.exp(-spinDecayRate * dt);
        } else if (this.spin) {
            let spinDecayRate;
            if (this.hpPercent > 0) {
                spinDecayRate = 0.0;
            } else {
                spinDecayRate = this.spinDecay;
            }
            this.spin *= Math.exp(-spinDecayRate * dt);
            if (Math.abs(this.spin) < 1e-4) this.spin = 0.0;
        }

        this.centerx += this.vx * dt;
        this.centery += this.vy * dt;

        const radDist = Math.hypot(this.centerx, this.centery) || 1e-6;
        const nxr = this.centerx / radDist;
        const nyr = this.centery / radDist;
        const txr = -nyr;
        const tyr = nxr;
        let vr = this.vx * nxr + this.vy * nyr;
        let vt = this.vx * txr + this.vy * tyr;
        vr *= Math.exp(-this.radialAlign * dt);
        this.vx = nxr * vr + txr * vt;
        this.vy = nyr * vr + tyr * vt;

        if (this.spin && Math.abs(this.spin) > 1e-8) {
            this.spinAngle += this.spin * dt;
        }

        const dist = Math.hypot(this.centerx, this.centery) || 1e-6;
        if (dist + this.radius >= arenaRadius) {
            const nx = this.centerx / dist;
            const ny = this.centery / dist;
            const tx = -ny;
            const ty = nx;
            let vrn = this.vx * nx + this.vy * ny;
            let vtn = this.vx * tx + this.vy * ty;

            vrn = -vrn * 0.6;

            vtn *= 0.9;

            if (this.spin) {
                const rideForce = this.spin * this.rimSpinTransfer * dt * 50.0;
                vtn += rideForce;
            }

            let kickAmp;
            if (this.rimKick !== undefined) {
                kickAmp = this.rimKick;
            } else {
                kickAmp = 0.01;
            }
            const kick = (Math.random() - 0.5) * 2.0 * kickAmp;
            vtn += kick;

            this.vx = nx * vrn + tx * vtn;
            this.vy = ny * vrn + ty * vtn;
            const overlap = (dist + this.radius) - arenaRadius;
            this.centerx -= nx * overlap;
            this.centery -= ny * overlap;
            const postDist = Math.hypot(this.centerx, this.centery) || 1e-6;
            if (postDist > 0) {
                const maxr = arenaRadius - this.radius - 1e-9;
                if (postDist > maxr) {
                    this.centerx = (this.centerx / postDist) * maxr;
                    this.centery = (this.centery / postDist) * maxr;
                }
            }
        }
    }

    drainHP(amount) {
        if (this.hpPercent <= 0) return;
        this.hpPercent = Math.max(0, this.hpPercent - amount);
        if (this.hpPercent <= 0) {
            this.isKO = true;
            this.vx = 0;
            this.vy = 0;
            this.spin = 0.0;
            return;
        }
        try {
            const minSpinFactor = 0.3;
            const factor = Math.max(minSpinFactor, this.hpPercent / 100.0);
            let sgn;
            if (this.spin >= 0) {
                sgn = 1;
            } else {
                sgn = -1;
            }
            this.spin = sgn * (Math.abs(this.baseSpin) * factor);
        } catch (e) { }
    }

    draw() {
        if (!gl) return;
        const verts = [];
        if (!this.buffer) this.buffer = gl.createBuffer();

        let drawCx = this.centerx;
        let drawCy = this.centery;
        let drawR = this.radius;
        if (this.useSI && this.M_TO_NDC) {
            drawCx = this.centerx * this.M_TO_NDC;
            drawCy = this.centery * this.M_TO_NDC;
            if (this.renderRadius !== undefined) {
                drawR = this.renderRadius;
            } else {
                drawR = this.radius * this.M_TO_NDC;
            }
        }

        verts.push(drawCx, drawCy);
        for (let i = 0; i <= this.segments; ++i) {
            const a = i * 2 * Math.PI / this.segments;
            verts.push(drawCx + drawR * Math.cos(a), drawCy + drawR * Math.sin(a));
        }

        this.vertCount = verts.length / 2;
        gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(verts), gl.DYNAMIC_DRAW);
        const loc = attr_vpos;
        gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
        gl.enableVertexAttribArray(loc);
        gl.uniform4f(unif_vcolor, this.color[0], this.color[1], this.color[2], 1);
        gl.drawArrays(gl.TRIANGLE_FAN, 0, this.vertCount);

        const dotR = drawR * 0.22;
        const dotDist = drawR * 0.6;
        const dax = Math.cos(this.spinAngle) * dotDist;
        const day = Math.sin(this.spinAngle) * dotDist;
        const dotCx = drawCx + dax;
        const dotCy = drawCy + day;
        const dotSegments = 12;
        const dotVerts = [dotCx, dotCy];
        for (let i = 0; i <= dotSegments; ++i) {
            const a = i * 2 * Math.PI / dotSegments;
            dotVerts.push(dotCx + dotR * Math.cos(a), dotCy + dotR * Math.sin(a));
        }
        if (!this.dotBuffer) this.dotBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.dotBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(dotVerts), gl.DYNAMIC_DRAW);
        gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
        gl.enableVertexAttribArray(loc);
        gl.uniform4f(unif_vcolor, 0.05, 0.05, 0.05, 1.0);
        gl.drawArrays(gl.TRIANGLE_FAN, 0, (dotVerts.length / 2));
    }

    checkCollision(other) {
        if (this.isKO || other.isKO) return;
        const dx = this.centerx - other.centerx;
        const dy = this.centery - other.centery;
        let distance = Math.hypot(dx, dy);
        const minDist = this.radius + other.radius;
        if (distance >= minDist || distance === 0) return;

        const nx = dx / distance;
        const ny = dy / distance;
        const overlap = minDist - distance;
        const m1 = this.mass;
        const m2 = other.mass;
        const total = m1 + m2;

        this.centerx += nx * overlap * (m2 / total);
        this.centery += ny * overlap * (m2 / total);
        other.centerx -= nx * overlap * (m1 / total);
        other.centery -= ny * overlap * (m1 / total);

        const dvx = this.vx - other.vx;
        const dvy = this.vy - other.vy;
        const dvn = dvx * nx + dvy * ny;
        if (dvn >= 0) return;

        const relSpeed = Math.hypot(dvx, dvy);
        const baseE = 0.5 * (this.restitution + other.restitution);
        const speedRestitutionBoost = Math.min(0.05, relSpeed * 0.01);
        const e = Math.min(0.85, baseE + speedRestitutionBoost);

        let impulse = -(1 + e) * dvn / ((1 / m1) + (1 / m2));

        if (Math.abs(dvn) < 0.2) {
            const minPop = 0.15;
            const requiredImpulse = -(minPop - dvn) / ((1 / m1) + (1 / m2));
            if (requiredImpulse > impulse) impulse = requiredImpulse;
        }

        let maxImpulse = Math.max(1e-6, relSpeed * Math.min(m1, m2) * 2.0);
        if (!isFinite(maxImpulse) || maxImpulse <= 0) maxImpulse = 1e-6;
        if (Math.abs(impulse) > maxImpulse) impulse = Math.sign(impulse) * Math.max(maxImpulse, impulse);

        const keBeforeThis = 0.5 * m1 * (this.vx * this.vx + this.vy * this.vy);
        const keBeforeOther = 0.5 * m2 * (other.vx * other.vx + other.vy * other.vy);

        this.vx += (impulse / m1) * nx;
        this.vy += (impulse / m1) * ny;
        other.vx -= (impulse / m2) * nx;
        other.vy -= (impulse / m2) * ny;

        const tx = -ny;
        const ty = nx;
        const vtx = dvx * tx + dvy * ty;
        const invMassSum = (1.0 / m1) + (1.0 / m2);
        let jt = 0.0;
        if (Math.abs(vtx) > 1e-6) {
            jt = -vtx / invMassSum;
            const mu = 0.35;
            const jn = Math.abs(impulse) || 1e-6;
            const maxJt = mu * jn;
            if (Math.abs(jt) > maxJt) jt = Math.sign(jt) * maxJt;
        }
        if (Math.abs(jt) > 1e-12) {
            this.vx += (jt / m1) * tx;
            this.vy += (jt / m1) * ty;
            other.vx -= (jt / m2) * tx;
            other.vy -= (jt / m2) * ty;

            const I1 = 0.5 * m1 * this.radius * this.radius;
            const I2 = 0.5 * m2 * other.radius * other.radius;
            if (isFinite(I1) && I1 > 0) {
                this.spin -= (jt * this.radius) / I1;
            }
            if (isFinite(I2) && I2 > 0) {
                other.spin += (jt * other.radius) / I2;
            }
        }

        const keAfterThis = 0.5 * m1 * (this.vx * this.vx + this.vy * this.vy);
        const keAfterOther = 0.5 * m2 * (other.vx * other.vx + other.vy * other.vy);

        const MIN_KE = 1e-6;
        let DEFAULT_CAP;
        if (this.collisionDrainCap !== undefined) {
            DEFAULT_CAP = this.collisionDrainCap;
        } else {
            DEFAULT_CAP = 6.0;
        }

        if (keBeforeThis > 0) {
            const dThis = Math.max(0, keBeforeThis - keAfterThis);
            const denom = Math.max(keBeforeThis, MIN_KE);
            let pct = (dThis / denom) * 100.0;
            if (!isFinite(pct)) pct = 0;
            const speedDamageScale = 1.0 / (1.0 + relSpeed * 0.12);
            pct *= speedDamageScale;
            if (this.collisionHPScale !== undefined) {
                pct *= this.collisionHPScale;
            } else {
                pct *= 1.0;
            }
            let attackMul;
            if (other.collisionDamageMultiplier !== undefined) {
                attackMul = other.collisionDamageMultiplier;
            } else {
                attackMul = 1.0;
            }
            pct *= attackMul;
            const cap = (this.collisionDrainCap !== undefined) ? this.collisionDrainCap : DEFAULT_CAP;
            pct = Math.min(pct, cap);
            if (pct > 0) this.drainHP(pct);
        }

        if (keBeforeOther > 0) {
            const dOther = Math.max(0, keBeforeOther - keAfterOther);
            const denom2 = Math.max(keBeforeOther, MIN_KE);
            let pct2 = (dOther / denom2) * 100.0;
            if (!isFinite(pct2)) pct2 = 0;
            const speedDamageScale2 = 1.0 / (1.0 + relSpeed * 0.12);
            pct2 *= speedDamageScale2;
            if (other.collisionHPScale !== undefined) {
                pct2 *= other.collisionHPScale;
            } else {
                pct2 *= 1.0;
            }
            let attackMul2;
            if (this.collisionDamageMultiplier !== undefined) {
                attackMul2 = this.collisionDamageMultiplier;
            } else {
                attackMul2 = 1.0;
            }
            pct2 *= attackMul2;
            const cap2 = (other.collisionDrainCap !== undefined) ? other.collisionDrainCap : DEFAULT_CAP;
            pct2 = Math.min(pct2, cap2);
            if (pct2 > 0) other.drainHP(pct2);
        }
    }
}

Beyblade.TYPE_STATS = {
    'pegasus': { def: 1, spd: 5, atk: 5 },
    'wyvern': { def: 5, spd: 1, atk: 2 },
    'phoenix': { def: 2, spd: 4, atk: 2 },
    'achilles': { def: 3, spd: 3, atk: 3 }
};

Beyblade.prototype.getTypeStats = function (type) {
    const base = Beyblade.TYPE_STATS[type] || { def: 3, spd: 3, atk: 3 };
    const s = Object.assign({}, base);
    if (type === 'random') {
        s.def = 1 + Math.floor(Math.random() * 5);
        s.spd = 1 + Math.floor(Math.random() * 5);
        s.atk = 1 + Math.floor(Math.random() * 5);
    }
    return s;
};

Beyblade.prototype.getTypeModifiers = function (type, opts) {
    opts = opts || {};
    let BEY_SCALE;
    if (typeof opts.BEY_SCALE === 'number') {
        BEY_SCALE = opts.BEY_SCALE;
    } else {
        BEY_SCALE = 1.0;
    }
    const TYPE_RADIUS = {
        'pegasus': 0.035 * BEY_SCALE,
        'wyvern': 0.038 * BEY_SCALE,
        'phoenix': 0.037 * BEY_SCALE,
        'achilles': 0.036 * BEY_SCALE
    };
    let massMultiplier = 1.0;
    let collisionDamageMultiplier = 1.0;
    let collisionDrainCap = 6.0;
    let hpDrainPerSecMultiplier = 1.0;
    let restitutionMod = 0.0;
    let radius = TYPE_RADIUS[type] || TYPE_RADIUS['achilles'];

    switch (type) {
        case 'random':
            collisionDamageMultiplier = 0.8 + Math.random() * 0.4;
            collisionDrainCap = 5.0 + Math.random() * 5.0;
            hpDrainPerSecMultiplier = 0.8 + Math.random() * 0.4;
            massMultiplier = 0.9 + Math.random() * 0.2;
            restitutionMod = (Math.random() - 0.5) * 0.05;
            radius = (0.033 + Math.random() * 0.007) * BEY_SCALE;
            break;
        case 'pegasus':
            collisionDamageMultiplier = 1.8;
            collisionDrainCap = 10.0;
            restitutionMod = 0.05;
            massMultiplier = 1.0;
            break;
        case 'wyvern':
            collisionDamageMultiplier = 0.7;
            collisionDrainCap = 6.0;
            hpDrainPerSecMultiplier = 1.0;
            restitutionMod = -0.05;
            massMultiplier = 1.35;
            break;
        case 'phoenix':
            collisionDamageMultiplier = 0.85;
            collisionDrainCap = 5.0;
            hpDrainPerSecMultiplier = 0.5;
            massMultiplier = 1.05;
            restitutionMod = 0.03;
            break;
        case 'achilles':
        default:
            collisionDamageMultiplier = 1.0;
            collisionDrainCap = 6.0;
            restitutionMod = 0.0;
            massMultiplier = 1.0;
            break;
    }

    return {
        radius,
        massMultiplier,
        collisionDamageMultiplier,
        collisionDrainCap,
        hpDrainPerSecMultiplier,
        restitutionMod
    };
};

Beyblade.prototype.applyType = function (type, opts) {
    opts = opts || {};
    let BEY_SCALE;
    if (typeof opts.BEY_SCALE === 'number') {
        BEY_SCALE = opts.BEY_SCALE;
    } else {
        BEY_SCALE = 1.0;
    }
    if (this.baseRestitution === undefined) this.baseRestitution = this.restitution || 0.9;
    if (this.baseMass === undefined) this.baseMass = this.mass || Math.max(1e-6, (this.density || 1.0) * Math.PI * this.radius * this.radius);

    const mods = this.getTypeModifiers(type, { BEY_SCALE });
    if (mods.radius !== undefined) {
        this.radius = mods.radius;
    }
    if (mods.collisionDamageMultiplier !== undefined) {
        this.collisionDamageMultiplier = mods.collisionDamageMultiplier;
    }
    if (mods.collisionDrainCap !== undefined) {
        this.collisionDrainCap = mods.collisionDrainCap;
    }
    if (mods.hpDrainPerSecMultiplier !== undefined) {
        this.hpDrainPerSecMultiplier = mods.hpDrainPerSecMultiplier;
    }

    this.restitution = 0.5 + (mods.restitutionMod || 0);

    this.baseMass = Math.max(1e-6, (this.density || 1.0) * Math.PI * this.radius * this.radius);
    this.mass = (this.baseMass || this.mass) * (mods.massMultiplier || 1.0);

    if (this.useSI && this.M_TO_NDC) this.renderRadius = this.radius * this.M_TO_NDC;

    this._type = type;
    this._typeStats = this.getTypeStats(type);
    return this._typeStats;
};
