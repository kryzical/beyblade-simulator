import { gl, unif_vcolor, attr_vpos } from './globalvars.js';

export class Arena {
    constructor(radius = 0.8, segments = 64) {
        this.radius = radius;
        this.segments = segments;
        this.buffers = [];
        this.ringData = [];
        this.rimBuffer = null;
        this.rimVertCount = 0;

        this.pyramid = {
            enabled: true,
            angle: Math.PI * 0.5,
            baseHalfAngle: (18 * Math.PI / 180),
            outerR: 0.92,
            depth: 0.150,
            extendBase: 0.06,
            restitution: 0.12,
            mu: 0.45,
            color: [0.9, 0.35, 0.25]
        };

        this.init();
    }

    init() {
        if (!gl) return;

        const bowlRings = 8;
        this.ringData = [];
        for (let ring = 0; ring <= bowlRings; ring++) {
            const t = ring / bowlRings;
            const r = this.radius * t;
            const ringVerts = [];
            ringVerts.push(0, 0);
            for (let i = 0; i <= this.segments; i++) {
                const angle = i * Math.PI * 2 / this.segments;
                ringVerts.push(Math.cos(angle) * r);
                ringVerts.push(Math.sin(angle) * r);
            }
            this.ringData.push({ verts: ringVerts, radius: r, t: t });
        }

        this.buffers = this.ringData.map(ring => {
            const buffer = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
            gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(ring.verts), gl.STATIC_DRAW);
            return buffer;
        });

        const rimVerts = [];
        for (let i = 0; i <= this.segments; i++) {
            const angle = i * Math.PI * 2 / this.segments;
            rimVerts.push(Math.cos(angle) * this.radius);
            rimVerts.push(Math.sin(angle) * this.radius);
        }
        this.rimBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.rimBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(rimVerts), gl.STATIC_DRAW);
        this.rimVertCount = rimVerts.length / 2;
    }

    buildPyramidVertsWorld(a) {
        const left = a - this.pyramid.baseHalfAngle;
        const right = a + this.pyramid.baseHalfAngle;
        const outer = this.pyramid.outerR;
        const outerExtended = outer + (this.pyramid.extendBase || 0.0);
        const apexR = this.pyramid.outerR - this.pyramid.depth;

        const vx1 = Math.cos(left) * outerExtended;
        const vy1 = Math.sin(left) * outerExtended;
        const vx2 = Math.cos(right) * outerExtended;
        const vy2 = Math.sin(right) * outerExtended;
        const ax = Math.cos(a) * apexR;
        const ay = Math.sin(a) * apexR;
        return [[vx1, vy1], [vx2, vy2], [ax, ay]];
    }

    closestPointOnSegment(x1, y1, x2, y2, px, py) {
        const vx = x2 - x1, vy = y2 - y1;
        const wx = px - x1, wy = py - y1;
        const l2 = vx * vx + vy * vy;
        if (l2 <= 1e-12) return [x1, y1];
        let t = (wx * vx + wy * vy) / l2;
        t = Math.max(0, Math.min(1, t));
        return [x1 + vx * t, y1 + vy * t];
    }

    checkCollisions(b) {
        if (!b || !this.pyramid.enabled) return;
        const tris = 4;
        const cx = b.centerx, cy = b.centery;
        let minDist = 1e9, closest = null, edgeNormal = null;

        for (let tri = 0; tri < tris; ++tri) {
            const a = this.pyramid.angle + tri * (Math.PI * 0.5);
            const verts = this.buildPyramidVertsWorld(a);
            for (let i = 0; i < 3; i++) {
                const va = verts[i];
                const vb = verts[(i + 1) % 3];
                const cp = this.closestPointOnSegment(va[0], va[1], vb[0], vb[1], cx, cy);
                const dx = cx - cp[0], dy = cy - cp[1];
                const d2 = dx * dx + dy * dy;
                if (d2 < minDist) {
                    minDist = d2; closest = cp;
                    let nx = -(vb[1] - va[1]); let ny = (vb[0] - va[0]);
                    const len = Math.hypot(nx, ny) || 1e-6; nx /= len; ny /= len;
                    const tx = cx - cp[0], ty = cy - cp[1];
                    if ((tx * nx + ty * ny) < 0) { nx = -nx; ny = -ny; }
                    edgeNormal = [nx, ny];
                }
            }
        }

        if (!closest || !edgeNormal) return;
        const dist = Math.sqrt(minDist);
        const penetration = Math.max(0, b.radius - dist);
        if (penetration <= 1e-6) return;

        const nx = edgeNormal[0], ny = edgeNormal[1];
        b.centerx += nx * penetration;
        b.centery += ny * penetration;
        const vn = b.vx * nx + b.vy * ny;
        if (vn < 0) {
            const e = this.pyramid.restitution;
            const jn = -(1 + e) * vn * b.mass;
            b.vx += (jn / b.mass) * nx;
            b.vy += (jn / b.mass) * ny;
            const tx = -ny, ty = nx;
            let vt = b.vx * tx + b.vy * ty;
            let jt = -vt * b.mass;
            const jtMax = Math.abs((this.pyramid.mu || 0) * jn);
            if (Math.abs(jt) > jtMax) jt = Math.sign(jt) * jtMax;
            b.vx += (jt / b.mass) * tx;
            b.vy += (jt / b.mass) * ty;
            b.vx *= 0.998; b.vy *= 0.998;
        }
    }

    draw(M_TO_NDC = 1.0) {
        if (!gl || !this.buffers.length) return;

        for (let i = this.ringData.length - 1; i >= 0; i--) {
            const ring = this.ringData[i];
            const buffer = this.buffers[i];
            const baseColor = 0.3 - ring.t * 0.25;
            gl.uniform4f(unif_vcolor, baseColor, baseColor, baseColor, 1.0);
            gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
            gl.vertexAttribPointer(attr_vpos, 2, gl.FLOAT, false, 0, 0);
            gl.enableVertexAttribArray(attr_vpos);
            gl.drawArrays(gl.TRIANGLE_FAN, 0, ring.verts.length / 2);
        }

        if (this.rimBuffer && this.rimVertCount) {
            const rimColor = 0.05;
            gl.uniform4f(unif_vcolor, rimColor, rimColor, rimColor, 1.0);
            gl.bindBuffer(gl.ARRAY_BUFFER, this.rimBuffer);
            gl.vertexAttribPointer(attr_vpos, 2, gl.FLOAT, false, 0, 0);
            gl.enableVertexAttribArray(attr_vpos);
            gl.drawArrays(gl.LINE_LOOP, 0, this.rimVertCount);
        }

        if (this.pyramid.enabled) {
            const fillCol = this.pyramid.color;
            const outlineCol = [0.55, 0.25, 0.05];
            for (let k = 0; k < 4; ++k) {
                const a = this.pyramid.angle + k * (Math.PI * 0.5);
                const vertsWorld = this.buildPyramidVertsWorld(a);
                const verts = [];
                for (let i = 0; i < vertsWorld.length; i++)
                    verts.push(vertsWorld[i][0] * M_TO_NDC, vertsWorld[i][1] * M_TO_NDC);

                const buf = gl.createBuffer();
                gl.bindBuffer(gl.ARRAY_BUFFER, buf);
                gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(verts), gl.STATIC_DRAW);
                gl.vertexAttribPointer(attr_vpos, 2, gl.FLOAT, false, 0, 0);
                gl.enableVertexAttribArray(attr_vpos);
                gl.uniform4f(unif_vcolor, fillCol[0], fillCol[1], fillCol[2], 1.0);
                gl.drawArrays(gl.TRIANGLES, 0, 3);
                gl.deleteBuffer(buf);

                const outlineBuf = gl.createBuffer();
                gl.bindBuffer(gl.ARRAY_BUFFER, outlineBuf);
                gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(verts), gl.STATIC_DRAW);
                gl.vertexAttribPointer(attr_vpos, 2, gl.FLOAT, false, 0, 0);
                gl.enableVertexAttribArray(attr_vpos);
                gl.uniform4f(unif_vcolor, outlineCol[0], outlineCol[1], outlineCol[2], 1.0);
                gl.drawArrays(gl.LINE_LOOP, 0, 3);
                gl.deleteBuffer(outlineBuf);
            }
        }
    }
}
