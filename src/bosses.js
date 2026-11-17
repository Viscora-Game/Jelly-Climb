(function (global) {
  'use strict';

  const JellyGame = (global.JellyGame = global.JellyGame || {});
  const C = JellyGame.CONSTANTS;

  const BOSS_ARCHETYPES = Object.freeze([
    {
      id: 'craggo',
      nameKey: 'bossCraggo',
      defaultName: 'CRAGGO THE GOLEM',
      baseHp: 5,
      maxPhases: 1,
      hitRadius: 34,
      rewardGems: 30,
      boltType: 'rock',
      primaryColor: '#36f5b0',
      secondaryColor: '#1e2b42',
      enrageColor: '#ff9f43'
    },
    {
      id: 'ignis',
      nameKey: 'bossIgnis',
      defaultName: 'IGNIS THE WYRM',
      baseHp: 7,
      maxPhases: 2,
      hitRadius: 35,
      rewardGems: 45,
      boltType: 'fireball',
      primaryColor: '#ff793f',
      secondaryColor: '#4b161b',
      enrageColor: '#ffd32a'
    },
    {
      id: 'aether',
      nameKey: 'bossAether',
      defaultName: 'AETHER THE STORM',
      baseHp: 9,
      maxPhases: 2,
      hitRadius: 33,
      rewardGems: 65,
      boltType: 'volt',
      primaryColor: '#48dbfb',
      secondaryColor: '#1c284d',
      enrageColor: '#ffeaa7'
    },
    {
      id: 'glacius',
      nameKey: 'bossGlacius',
      defaultName: 'GLACIUS EMPRESS',
      baseHp: 11,
      maxPhases: 3,
      hitRadius: 35,
      rewardGems: 90,
      boltType: 'iceSpear',
      primaryColor: '#74f2ff',
      secondaryColor: '#103b4a',
      enrageColor: '#f472b6'
    },
    {
      id: 'voidon',
      nameKey: 'bossVoidon',
      defaultName: 'VOIDON EMPEROR',
      baseHp: 14,
      maxPhases: 4,
      hitRadius: 37,
      rewardGems: 125,
      boltType: 'voidComet',
      primaryColor: '#c56cf0',
      secondaryColor: '#170f2e',
      enrageColor: '#ff4757'
    }
  ]);

  function clamp(val, min, max) {
    return val < min ? min : val > max ? max : val;
  }

  function getMilestoneMeters(bossIndex) {
    return 250 * Math.pow(2, Math.max(0, bossIndex));
  }

  function getBossDefForIndex(bossIndex) {
    const idx = Math.max(0, Math.floor(bossIndex));
    const arch = BOSS_ARCHETYPES[idx % BOSS_ARCHETYPES.length];
    const cycle = Math.floor(idx / BOSS_ARCHETYPES.length) + 1;
    const extraHp = (cycle - 1) * 4;
    return {
      index: idx,
      cycle,
      archetype: arch,
      maxHp: arch.baseHp + extraHp,
      maxPhases: Math.min(4, arch.maxPhases + (cycle - 1)),
      hitRadius: arch.hitRadius,
      rewardGems: arch.rewardGems + (cycle - 1) * 50,
      milestoneMeters: getMilestoneMeters(idx)
    };
  }

  /**
   * Themed Boss projectile compatible with the main game projectile & near-miss systems.
   */
  class BossBoltProjectile {
    constructor(x, y, vx, vy, boltType = 'rock', radius = 9, arenaBounds = null) {
      this.x = x;
      this.y = y;
      this.vx = vx;
      this.vy = vy;
      this.boltType = boltType;
      this.radius = radius;
      this.arenaBounds = arenaBounds;
      this.alive = true;
      this.spin = Math.random() * Math.PI * 2;
      this.age = 0;
      this._wasInHalo = false;
      this._nearMissDone = false;
    }

    update(dt, context) {
      if (!this.alive) return;
      this.age += dt;
      this.spin += dt * 7;

      // Subtle gravity on rock/fireball arcs; straight vector on volt/ice/void
      if (this.boltType === 'rock') {
        this.vy += 210 * dt;
      }

      this.x += this.vx * dt;
      this.y += this.vy * dt;

      if (this.x <= C.WALL_WIDTH + 2 || this.x >= C.WIDTH - C.WALL_WIDTH - 2) {
        this.alive = false;
        const impactX = this.x <= C.WALL_WIDTH + 2 ? C.WALL_WIDTH : C.WIDTH - C.WALL_WIDTH;
        if (context && context.particles) {
          context.particles.spawnSparkBurst(
            impactX,
            this.y,
            this.vx > 0 ? -1 : 1,
            this._getSparkColor(),
            5
          );
        }
        return;
      }

      const topLim = (this.arenaBounds ? this.arenaBounds.topY : context.cameraY) - 180;
      const botLim = (this.arenaBounds ? this.arenaBounds.floorY : context.cameraY + C.HEIGHT) + 180;
      if (this.y < topLim || this.y > botLim || this.age > 6.5) {
        this.alive = false;
      }
    }

    _getSparkColor() {
      if (this.boltType === 'fireball') return '#ff9b26';
      if (this.boltType === 'volt') return '#74f2ff';
      if (this.boltType === 'iceSpear') return '#b8f2ff';
      if (this.boltType === 'voidComet') return '#e08aff';
      return '#36f5b0';
    }

    checkPointCollision(px, py, r) {
      if (!this.alive) return false;
      const dx = px - this.x;
      const dy = py - this.y;
      const hitR = r + this.radius * 0.85;
      return dx * dx + dy * dy <= hitR * hitR;
    }

    checkPlayerCollision(player) {
      return this.checkPointCollision(
        player.positionX,
        player.positionY,
        C.HITBOX.PLAYER_HURT_RADIUS
      );
    }

    checkNearMiss(player) {
      if (this._nearMissDone || !this.alive || !player.alive) return false;
      const haloR = C.HITBOX.PLAYER_HURT_RADIUS + (C.HITBOX.CLOSE_CALL_MARGIN_PX || 11);
      const inHalo = !player.isAttached() && this.checkPointCollision(player.positionX, player.positionY, haloR);
      if (inHalo) {
        this._wasInHalo = true;
        return false;
      }
      if (this._wasInHalo && player.alive) {
        this._nearMissDone = true;
        this._wasInHalo = false;
        return true;
      }
      return false;
    }

    draw(ctx, cameraY) {
      if (!this.alive) return;
      const sx = this.x;
      const sy = this.y - cameraY;
      if (sy < -40 || sy > C.HEIGHT + 40) return;

      ctx.save();
      ctx.translate(sx, sy);

      if (this.boltType === 'fireball') {
        const g = ctx.createRadialGradient(0, 0, 2, 0, 0, this.radius * 1.4);
        g.addColorStop(0, '#fff5bd');
        g.addColorStop(0.5, '#ff793f');
        g.addColorStop(1, 'rgba(255, 71, 87, 0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(0, 0, this.radius * 1.4, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#fff3a1';
        ctx.beginPath();
        ctx.arc(0, 0, this.radius * 0.55, 0, Math.PI * 2);
        ctx.fill();
      } else if (this.boltType === 'volt') {
        ctx.rotate(Math.atan2(this.vy, this.vx));
        ctx.fillStyle = 'rgba(72, 219, 251, 0.32)';
        ctx.beginPath();
        ctx.ellipse(0, 0, this.radius * 1.6, this.radius * 0.9, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = '#48dbfb';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(this.radius + 3, 0);
        ctx.lineTo(-this.radius * 0.3, -this.radius * 0.55);
        ctx.lineTo(-this.radius, 0);
        ctx.lineTo(-this.radius * 0.3, this.radius * 0.55);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      } else if (this.boltType === 'iceSpear') {
        ctx.rotate(Math.atan2(this.vy, this.vx));
        ctx.fillStyle = '#b8f2ff';
        ctx.strokeStyle = '#0abde3';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(this.radius * 1.5, 0);
        ctx.lineTo(-this.radius * 0.8, -this.radius * 0.6);
        ctx.lineTo(-this.radius * 1.2, 0);
        ctx.lineTo(-this.radius * 0.8, this.radius * 0.6);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      } else if (this.boltType === 'voidComet') {
        ctx.rotate(this.spin);
        const vg = ctx.createRadialGradient(0, 0, 2, 0, 0, this.radius * 1.5);
        vg.addColorStop(0, '#ffd1ff');
        vg.addColorStop(0.55, '#a855f7');
        vg.addColorStop(1, 'rgba(168, 85, 247, 0)');
        ctx.fillStyle = vg;
        ctx.beginPath();
        ctx.arc(0, 0, this.radius * 1.5, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#120824';
        ctx.strokeStyle = '#e08aff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, this.radius * 0.62, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      } else {
        // Cavern Rock Shard
        ctx.rotate(this.spin);
        ctx.fillStyle = '#36f5b0';
        ctx.strokeStyle = '#091526';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2;
          const r = i % 2 === 0 ? this.radius : this.radius * 0.68;
          const px = Math.cos(a) * r;
          const py = Math.sin(a) * r;
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }

      ctx.restore();
    }
  }

  /**
   * Multi-phase Boss entity framed inside a vertical slingshot arena chamber.
   */
  class BossEntity {
    constructor(def, anchorBottomY) {
      this.def = def;
      this.index = def.index;
      this.cycle = def.cycle;
      this.archetype = def.archetype;
      this.id = def.archetype.id;
      this.maxHp = def.maxHp;
      this.hp = def.maxHp;
      this.maxPhases = def.maxPhases;
      this.phase = 1;
      this.hitRadius = def.hitRadius;
      this.rewardGems = def.rewardGems;
      this.milestoneMeters = def.milestoneMeters;

      this.arenaBottomY = anchorBottomY;
      this.arenaTopY = anchorBottomY - 490;
      this.arenaFloorY = anchorBottomY + 60;
      this.cameraTargetY = this.arenaTopY - 70;

      this.homeX = C.WIDTH * 0.5;
      this.homeY = this.arenaTopY + 210;
      this.x = this.homeX;
      this.y = this.arenaTopY - 60;

      this.time = 0;
      this.introTimer = 1.35;
      this.hurtFlashTimer = 0;
      this.playerBounceCooldown = 0;
      this.attackTimer = 1.6;
      this.telegraphTimer = 0;
      this.pendingAttack = null;

      // Teleport anchor state (used by Aether)
      this.anchorIdx = 1;
      this.anchors = [
        { x: C.WIDTH * 0.34, y: this.homeY - 12 },
        { x: C.WIDTH * 0.5, y: this.homeY + 12 },
        { x: C.WIDTH * 0.66, y: this.homeY - 12 }
      ];

      // Rotating shield / flame / void orbs (non-lethal, bounce player cleanly to test aim timing!)
      this.orbitAngle = 0;
      this.orbitOrbs = [];

      // Telegraphed wall zap strip (Aether/Glacius Phase 2+)
      this.wallZap = {
        side: -1,
        centerY: this.homeY + 55,
        halfH: 64,
        warningTimer: 0,
        activeTimer: 0,
        cooldown: 3.6
      };

      this.phaseBannerTimer = 0;
      this.defeated = false;
      this._refreshOrbitOrbs();
    }

    _refreshOrbitOrbs() {
      this.orbitOrbs = [];
      if (this.id === 'ignis' && this.phase >= 2) {
        this.orbitOrbs = [
          { angleOffset: 0, dist: 60, r: 10, color: '#ff9f43' },
          { angleOffset: Math.PI, dist: 60, r: 10, color: '#ff9f43' }
        ];
      } else if (this.id === 'glacius') {
        const count = this.phase === 1 ? 2 : 3;
        for (let i = 0; i < count; i++) {
          this.orbitOrbs.push({
            angleOffset: (i * Math.PI * 2) / count,
            dist: 62,
            r: 10.5,
            color: '#74f2ff'
          });
        }
      } else if (this.id === 'voidon' && this.phase >= 2) {
        const count = this.phase === 3 ? 4 : 3;
        for (let i = 0; i < count; i++) {
          this.orbitOrbs.push({
            angleOffset: (i * Math.PI * 2) / count,
            dist: 65,
            r: 10,
            color: '#c56cf0'
          });
        }
      }
    }

    _getOrbitOrbPosition(orb) {
      const a = this.orbitAngle + orb.angleOffset;
      return {
        x: this.x + Math.cos(a) * orb.dist,
        y: this.y + Math.sin(a) * orb.dist
      };
    }

    _computeExpectedPhase() {
      if (this.maxPhases <= 1) return 1;
      const lostFraction = 1 - this.hp / this.maxHp;
      const computed = Math.min(this.maxPhases, Math.floor(lostFraction * this.maxPhases) + 1);
      return Math.max(this.phase, computed);
    }

    update(dt, context) {
      if (this.defeated) return;
      this.time += dt;

      if (this.hurtFlashTimer > 0) this.hurtFlashTimer = Math.max(0, this.hurtFlashTimer - dt);
      if (this.playerBounceCooldown > 0) {
        this.playerBounceCooldown = Math.max(0, this.playerBounceCooldown - dt);
      }
      if (this.phaseBannerTimer > 0) {
        this.phaseBannerTimer = Math.max(0, this.phaseBannerTimer - dt);
      }

      if (this.introTimer > 0) {
        this.introTimer = Math.max(0, this.introTimer - dt);
        const progress = 1 - this.introTimer / 1.35;
        const ease = 1 - Math.pow(1 - progress, 3);
        this.x = this.homeX;
        this.y = this.arenaTopY - 60 + (this.homeY - (this.arenaTopY - 60)) * ease;
        return;
      }

      // Spin orbit shields faster on higher phases & prestige cycles
      const spinSpeed = (1.55 + (this.phase - 1) * 0.65) * (1 + (this.cycle - 1) * 0.15);
      this.orbitAngle += dt * spinSpeed;

      // Archetype movement pattern
      const spdMult = 1 + (this.phase - 1) * 0.28 + (this.cycle - 1) * 0.12;
      if (this.id === 'aether') {
        const target = this.anchors[this.anchorIdx];
        this.x += (target.x - this.x) * Math.min(1, dt * 5.2);
        this.y += (target.y + Math.sin(this.time * 3.5) * 14 - this.y) * Math.min(1, dt * 5.2);
      } else if (this.id === 'craggo') {
        this.x = this.homeX + Math.sin(this.time * 1.15 * spdMult) * 78;
        this.y = this.homeY + Math.cos(this.time * 2.1 * spdMult) * 24;
      } else if (this.id === 'ignis') {
        this.x = this.homeX + Math.sin(this.time * 1.55 * spdMult) * 92;
        this.y = this.homeY + Math.sin(this.time * 2.9 * spdMult) * 34;
      } else if (this.id === 'glacius') {
        this.x = this.homeX + Math.sin(this.time * 1.3 * spdMult) * 86;
        this.y = this.homeY + Math.cos(this.time * 1.9 * spdMult) * 30;
      } else {
        // Voidon figure-8 infinity drift
        this.x = this.homeX + Math.sin(this.time * 1.45 * spdMult) * 90;
        this.y = this.homeY + Math.sin(this.time * 2.9 * spdMult) * 34;
      }

      // Telegraphed wall zap logic on Aether & Glacius Phase 2+
      if ((this.id === 'aether' || this.id === 'glacius') && this.phase >= 2) {
        const z = this.wallZap;
        if (z.warningTimer > 0) {
          z.warningTimer = Math.max(0, z.warningTimer - dt);
          if (z.warningTimer === 0) {
            z.activeTimer = 1.45;
            if (context.audio) context.audio.playArrowFire();
          }
        } else if (z.activeTimer > 0) {
          z.activeTimer = Math.max(0, z.activeTimer - dt);
          if (z.activeTimer === 0) {
            z.cooldown = this.phase === 3 ? 2.4 : 3.2;
          }
        } else {
          z.cooldown -= dt;
          if (z.cooldown <= 0) {
            z.side = context.player && context.player.wallAttached !== 0
              ? context.player.wallAttached
              : -z.side;
            z.centerY = clamp(
              (context.player ? context.player.positionY : this.homeY + 60),
              this.arenaTopY + 95,
              this.arenaFloorY - 95
            );
            z.warningTimer = 1.15;
          }
        }
      }

      // Attack cycle with brief visible windup flash (telegraphTimer)
      if (this.telegraphTimer > 0) {
        this.telegraphTimer -= dt;
        if (this.telegraphTimer <= 0) {
          this._executeAttack(context);
          const baseCadence = Math.max(1.15, 2.25 - this.index * 0.08 - (this.phase - 1) * 0.34);
          this.attackTimer = baseCadence / (1 + (this.cycle - 1) * 0.14);
        }
      } else {
        this.attackTimer -= dt;
        if (this.attackTimer <= 0) {
          this.telegraphTimer = 0.45;
        }
      }
    }

    _spawnAimedBolt(context, speed, angleOffset = 0, radius = 9) {
      const targetX = context.player ? context.player.positionX : C.WIDTH * 0.5;
      const targetY = context.player ? context.player.positionY : this.homeY + 120;
      const baseAngle = Math.atan2(targetY - this.y, targetX - this.x) + angleOffset;
      const bounds = { topY: this.arenaTopY, floorY: this.arenaFloorY };
      context.projectiles.push(
        new BossBoltProjectile(
          this.x + Math.cos(baseAngle) * (this.hitRadius * 0.7),
          this.y + Math.sin(baseAngle) * (this.hitRadius * 0.7),
          Math.cos(baseAngle) * speed,
          Math.sin(baseAngle) * speed,
          this.archetype.boltType,
          radius,
          bounds
        )
      );
    }

    _executeAttack(context) {
      if (!context || !context.projectiles) return;
      if (context.audio) context.audio.playArrowFire();

      const speedBoost = 1 + (this.phase - 1) * 0.16 + (this.cycle - 1) * 0.1;

      if (this.id === 'craggo') {
        if (this.phase === 1) {
          this._spawnAimedBolt(context, 255 * speedBoost, 0, 10);
        } else {
          this._spawnAimedBolt(context, 275 * speedBoost, -0.22, 9.5);
          this._spawnAimedBolt(context, 275 * speedBoost, 0.22, 9.5);
        }
      } else if (this.id === 'ignis') {
        const spread = this.phase === 1 ? [-0.26, 0, 0.26] : [-0.38, -0.13, 0.13, 0.38];
        for (const a of spread) {
          this._spawnAimedBolt(context, 265 * speedBoost, a, 9);
        }
      } else if (this.id === 'aether') {
        this.anchorIdx = (this.anchorIdx + 1) % this.anchors.length;
        const count = this.phase === 1 ? 1 : this.phase === 2 ? 2 : 3;
        const step = 0.28;
        const start = -((count - 1) * step) * 0.5;
        for (let i = 0; i < count; i++) {
          this._spawnAimedBolt(context, 310 * speedBoost, start + i * step, 8.5);
        }
      } else if (this.id === 'glacius') {
        const count = this.phase >= 2 ? 3 : 2;
        const step = 0.3;
        const start = -((count - 1) * step) * 0.5;
        for (let i = 0; i < count; i++) {
          this._spawnAimedBolt(context, 295 * speedBoost, start + i * step, 9);
        }
      } else {
        // Voidon Emperor: spiral burst or aimed twin comets
        if (this.phase === 1) {
          for (let i = -1; i <= 1; i++) {
            this._spawnAimedBolt(context, 285 * speedBoost, i * 0.32, 9.5);
          }
        } else {
          const ringCount = this.phase >= 4 ? 7 : this.phase === 3 ? 6 : 4;
          const rot = this.time * 1.3;
          const bounds = { topY: this.arenaTopY, floorY: this.arenaFloorY };
          for (let i = 0; i < ringCount; i++) {
            const ang = rot + (i / ringCount) * Math.PI * 2;
            const sp = (this.phase >= 4 ? 270 : this.phase === 3 ? 255 : 230) * speedBoost;
            context.projectiles.push(
              new BossBoltProjectile(
                this.x,
                this.y,
                Math.cos(ang) * sp,
                Math.sin(ang) * sp,
                'voidComet',
                9,
                bounds
              )
            );
          }
        }
      }
    }

    /**
     * Checks if an airborne Jelly slams into an orbiting shield or the Boss's core.
     */
    checkPlayerSlam(player, tempoTier, particles, audio) {
      if (this.defeated || this.introTimer > 0.25 || player.isAttached() || !player.alive) {
        return null;
      }
      if (this.playerBounceCooldown > 0) return null;

      // 1. Orbiting Shield Orbs deflect player cleanly without taking HP or hurting player
      for (let i = 0; i < this.orbitOrbs.length; i++) {
        const orb = this.orbitOrbs[i];
        const pos = this._getOrbitOrbPosition(orb);
        const dx = player.positionX - pos.x;
        const dy = player.positionY - pos.y;
        const dist = Math.hypot(dx, dy);
        if (dist <= orb.r + player.radius * 0.85) {
          this.playerBounceCooldown = 0.22;
          const nx = dist > 0.1 ? dx / dist : (player.positionX < this.x ? -1 : 1);
          const ny = dist > 0.1 ? dy / dist : 0.4;
          player.velocityX = nx * 360;
          player.velocityY = Math.min(-180, ny * 320);
          player.invulnTimer = Math.max(player.invulnTimer, 0.3);
          if (audio) audio.playCrack();
          if (particles) {
            particles.spawnSparkBurst(pos.x, pos.y, nx, orb.color, 8);
          }
          return { event: 'clang' };
        }
      }

      // 2. Direct Slingshot Core Hit!
      const dx = player.positionX - this.x;
      const dy = player.positionY - this.y;
      const dist = Math.hypot(dx, dy);
      if (dist > this.hitRadius + player.radius * 0.92) {
        return null;
      }

      const isCrit = tempoTier >= 4;
      const dmg = isCrit ? 2 : 1;
      this.hp = Math.max(0, this.hp - dmg);
      this.hurtFlashTimer = 0.24;
      this.playerBounceCooldown = 0.26;

      // Rebound player cleanly outward toward opposite wall to keep combat flowing
      const nx = dist > 1 ? dx / dist : (player.velocityX >= 0 ? -1 : 1);
      const outDir = Math.abs(nx) < 0.35 ? (player.positionX < C.WIDTH * 0.5 ? -1 : 1) : Math.sign(nx);
      player.velocityX = outDir * 350;
      player.velocityY = dy > 0 ? 180 : -320;
      player.stretchAmount = 0.35;
      player.invulnTimer = Math.max(player.invulnTimer, 0.55);

      if (particles) {
        particles.spawnSparkBurst(this.x, this.y, outDir, isCrit ? '#ffd166' : this.archetype.primaryColor, isCrit ? 16 : 11);
      }

      if (this.hp <= 0) {
        this.defeated = true;
        this.wallZap.activeTimer = 0;
        this.wallZap.warningTimer = 0;
        if (audio) audio.playBossDefeat();
        if (particles) {
          particles.spawnCollectBurst(this.x, this.y, 4);
        }
        return {
          event: 'defeat',
          dmg,
          isCrit,
          rewardGems: this.rewardGems
        };
      }

      const nextPhase = this._computeExpectedPhase();
      if (nextPhase > this.phase) {
        this.phase = nextPhase;
        this.phaseBannerTimer = 2.0;
        this._refreshOrbitOrbs();
        if (audio) audio.playBossPhaseShift();
        return {
          event: 'phase',
          dmg,
          isCrit,
          newPhase: this.phase
        };
      }

      if (audio) audio.playBossHit(isCrit);
      return {
        event: 'hit',
        dmg,
        isCrit
      };
    }

    checkWallZapHazard(player) {
      if (this.defeated || this.wallZap.activeTimer <= 0 || !player.alive) return false;
      const z = this.wallZap;
      const wallEdgeX = z.side < 0 ? C.WALL_WIDTH : C.WIDTH - C.WALL_WIDTH;
      const px = player.positionX;
      const py = player.positionY;
      const r = C.HITBOX.PLAYER_HURT_RADIUS;
      const reach = 20;
      const minX = z.side < 0 ? wallEdgeX - 2 : wallEdgeX - reach;
      const maxX = z.side < 0 ? wallEdgeX + reach : wallEdgeX + 2;
      return px + r >= minX && px - r <= maxX && py + r >= z.centerY - z.halfH && py - r <= z.centerY + z.halfH;
    }

    checkTrajectoryHitsBoss(simX, simY) {
      if (this.defeated || this.introTimer > 0.25) return false;
      const dx = simX - this.x;
      const dy = simY - this.y;
      return dx * dx + dy * dy <= (this.hitRadius + C.PLAYER_RADIUS * 0.85) ** 2;
    }

    draw(ctx, cameraY) {
      if (this.defeated) return;
      const sy = this.y - cameraY;
      const sx = this.x;
      const r = this.hitRadius;
      const t = this.time;
      const enraged = this.phase >= 2;
      const accent = enraged ? this.archetype.enrageColor : this.archetype.primaryColor;

      ctx.save();

      // 1. Arena Energy Ceiling & Floor Seals framing the duel
      this._drawArenaSeals(ctx, cameraY, accent, t);

      // 2. Telegraphed Wall Zap Hazard (Aether & Glacius Phase 2+)
      if (this.wallZap.warningTimer > 0 || this.wallZap.activeTimer > 0) {
        this._drawWallZap(ctx, cameraY, accent, t);
      }

      // 3. Boss Main Character Artwork
      ctx.save();
      ctx.translate(sx, sy);

      // Telegraph windup ring just before firing projectiles
      if (this.telegraphTimer > 0) {
        const pulse = 1 - this.telegraphTimer / 0.45;
        ctx.strokeStyle = '#ff5e57';
        ctx.lineWidth = 3;
        ctx.globalAlpha = 0.85;
        ctx.beginPath();
        ctx.arc(0, 0, r + 6 + pulse * 14, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }

      // Soft outer aura
      const aura = ctx.createRadialGradient(0, 0, r * 0.2, 0, 0, r * 1.85);
      aura.addColorStop(0, enraged ? 'rgba(255, 110, 80, 0.4)' : 'rgba(54, 245, 176, 0.28)');
      aura.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = aura;
      ctx.beginPath();
      ctx.arc(0, 0, r * 1.85, 0, Math.PI * 2);
      ctx.fill();

      this._drawArchetypeBody(ctx, r, accent, enraged, t);

      // Hit white flash overlay
      if (this.hurtFlashTimer > 0) {
        ctx.globalAlpha = (this.hurtFlashTimer / 0.24) * 0.65;
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(0, 0, r + 2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();

      // 4. Orbiting Shield Petals / Flame Orbs / Void Spheres
      for (let i = 0; i < this.orbitOrbs.length; i++) {
        const orb = this.orbitOrbs[i];
        const pos = this._getOrbitOrbPosition(orb);
        const oy = pos.y - cameraY;
        ctx.save();
        ctx.translate(pos.x, oy);
        ctx.fillStyle = orb.color;
        ctx.strokeStyle = '#091526';
        ctx.lineWidth = 2;
        ctx.beginPath();
        if (this.id === 'glacius') {
          ctx.rotate(this.orbitAngle + orb.angleOffset);
          ctx.moveTo(0, -orb.r - 2);
          ctx.lineTo(orb.r, 0);
          ctx.lineTo(0, orb.r + 2);
          ctx.lineTo(-orb.r, 0);
          ctx.closePath();
        } else {
          ctx.arc(0, 0, orb.r, 0, Math.PI * 2);
        }
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = 'rgba(255, 255, 255, 0.72)';
        ctx.beginPath();
        ctx.arc(-2.5, -2.5, 2.8, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      ctx.restore();
    }

    _drawArenaSeals(ctx, cameraY, accent, t) {
      const topSy = this.arenaTopY - cameraY;
      const floorSy = this.arenaFloorY - cameraY;
      const pulse = 0.45 + 0.3 * Math.sin(t * 5);

      ctx.save();
      ctx.strokeStyle = accent;
      ctx.lineWidth = 3;
      ctx.setLineDash([12, 8]);
      ctx.lineDashOffset = -t * 28;
      ctx.globalAlpha = pulse;

      if (topSy > -20 && topSy < C.HEIGHT + 20) {
        ctx.beginPath();
        ctx.moveTo(C.WALL_WIDTH, topSy);
        ctx.lineTo(C.WIDTH - C.WALL_WIDTH, topSy);
        ctx.stroke();
      }
      if (floorSy > -20 && floorSy < C.HEIGHT + 20) {
        ctx.beginPath();
        ctx.moveTo(C.WALL_WIDTH, floorSy);
        ctx.lineTo(C.WIDTH - C.WALL_WIDTH, floorSy);
        ctx.stroke();
      }
      ctx.restore();
    }

    _drawWallZap(ctx, cameraY, accent, t) {
      const z = this.wallZap;
      const wallEdgeX = z.side < 0 ? C.WALL_WIDTH : C.WIDTH - C.WALL_WIDTH;
      const dir = z.side < 0 ? 1 : -1;
      const sy = z.centerY - cameraY;
      const top = sy - z.halfH;

      ctx.save();
      if (z.warningTimer > 0) {
        ctx.globalAlpha = 0.45 + 0.45 * Math.sin(t * 20);
        ctx.fillStyle = '#ff5e57';
        ctx.fillRect(z.side < 0 ? wallEdgeX : wallEdgeX - 8, top, 8, z.halfH * 2);
      } else if (z.activeTimer > 0) {
        ctx.fillStyle = this.id === 'glacius' ? 'rgba(116, 242, 255, 0.72)' : 'rgba(255, 94, 87, 0.85)';
        ctx.fillRect(z.side < 0 ? wallEdgeX : wallEdgeX - 18, top, 18, z.halfH * 2);
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (let i = 0; i <= 6; i++) {
          const py = top + (i / 6) * (z.halfH * 2);
          const px = wallEdgeX + dir * (6 + Math.sin(t * 28 + i * 2) * 8);
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.stroke();
      }
      ctx.restore();
    }

    _drawArchetypeBody(ctx, r, accent, enraged, t) {
      if (this.id === 'craggo') {
        // Obsidian Cave Golem with jagged rock silhouette + glowing core rune
        ctx.fillStyle = '#24344d';
        ctx.strokeStyle = '#09111f';
        ctx.lineWidth = 2.6;
        ctx.beginPath();
        for (let i = 0; i < 8; i++) {
          const ang = (i / 8) * Math.PI * 2;
          const rad = i % 2 === 0 ? r + 3 : r - 3;
          const px = Math.cos(ang) * rad;
          const py = Math.sin(ang) * rad;
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Stone horns & fierce glowing eyes
        ctx.fillStyle = accent;
        ctx.beginPath();
        ctx.moveTo(-14, -4);
        ctx.lineTo(-4, 0);
        ctx.lineTo(-14, 3);
        ctx.moveTo(14, -4);
        ctx.lineTo(4, 0);
        ctx.lineTo(14, 3);
        ctx.fill();

        // Chest crystal weak core
        ctx.fillStyle = accent;
        ctx.beginPath();
        ctx.moveTo(0, 7);
        ctx.lineTo(8, 15);
        ctx.lineTo(0, 23);
        ctx.lineTo(-8, 15);
        ctx.closePath();
        ctx.fill();
      } else if (this.id === 'ignis') {
        // Volcanic Magma Dragon Core with blazing flame crown
        const g = ctx.createRadialGradient(0, 0, 5, 0, 0, r);
        g.addColorStop(0, '#fff3a1');
        g.addColorStop(0.55, '#ff5e36');
        g.addColorStop(1, '#6b1218');
        ctx.fillStyle = g;
        ctx.strokeStyle = '#2b080c';
        ctx.lineWidth = 2.6;
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Curved obsidian horns
        ctx.fillStyle = '#1f0b10';
        for (const side of [-1, 1]) {
          ctx.beginPath();
          ctx.moveTo(side * 12, -r * 0.65);
          ctx.quadraticCurveTo(side * 24, -r * 1.25, side * 32, -r * 0.85);
          ctx.quadraticCurveTo(side * 20, -r * 0.55, side * 18, -r * 0.35);
          ctx.closePath();
          ctx.fill();
        }

        // Blazing eyes
        ctx.fillStyle = '#fff9d6';
        ctx.beginPath();
        ctx.ellipse(-10, -3, 5, 3.2, 0.3, 0, Math.PI * 2);
        ctx.ellipse(10, -3, 5, 3.2, -0.3, 0, Math.PI * 2);
        ctx.fill();
      } else if (this.id === 'aether') {
        // Electric Storm Sentinel + Twin Rotating Neon Rings
        ctx.save();
        ctx.rotate(t * 2.2);
        ctx.strokeStyle = accent;
        ctx.lineWidth = 2.4;
        ctx.beginPath();
        ctx.ellipse(0, 0, r + 10, r * 0.52, 0.35, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.ellipse(0, 0, r + 10, r * 0.52, -0.35, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();

        const aGrad = ctx.createRadialGradient(0, 0, 4, 0, 0, r);
        aGrad.addColorStop(0, '#ffffff');
        aGrad.addColorStop(0.45, accent);
        aGrad.addColorStop(1, '#12224d');
        ctx.fillStyle = aGrad;
        ctx.strokeStyle = '#091124';
        ctx.lineWidth = 2.4;
        ctx.beginPath();
        ctx.arc(0, 0, r * 0.86, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Single glowing electric cyclops visor
        ctx.fillStyle = '#091326';
        ctx.beginPath();
        if (typeof ctx.roundRect === 'function') {
          ctx.roundRect(-16, -5, 32, 10, 5);
        } else {
          ctx.rect(-16, -5, 32, 10);
        }
        ctx.fill();
        ctx.fillStyle = enraged ? '#ff5e57' : '#36f5b0';
        ctx.beginPath();
        ctx.arc(Math.sin(t * 4) * 6, 0, 4, 0, Math.PI * 2);
        ctx.fill();
      } else if (this.id === 'glacius') {
        // Frost Empress Crystal Star + Ice Crown
        const cGrad = ctx.createLinearGradient(0, -r, 0, r);
        cGrad.addColorStop(0, '#e0fcff');
        cGrad.addColorStop(0.5, '#48dbfb');
        cGrad.addColorStop(1, '#103b4a');
        ctx.fillStyle = cGrad;
        ctx.strokeStyle = '#062436';
        ctx.lineWidth = 2.4;

        ctx.beginPath();
        ctx.moveTo(0, -r - 6);
        ctx.lineTo(r * 0.85, -r * 0.25);
        ctx.lineTo(r * 0.55, r * 0.85);
        ctx.lineTo(0, r + 4);
        ctx.lineTo(-r * 0.55, r * 0.85);
        ctx.lineTo(-r * 0.85, -r * 0.25);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Regal eyes
        ctx.fillStyle = enraged ? '#ff6b9d' : '#062436';
        ctx.beginPath();
        ctx.arc(-9, -2, 3.8, 0, Math.PI * 2);
        ctx.arc(9, -2, 3.8, 0, Math.PI * 2);
        ctx.fill();
      } else {
        // Voidon Cosmic Emperor: Dark Matter Eye inside Golden Singularity Halo
        ctx.save();
        ctx.rotate(-t * 1.8);
        ctx.strokeStyle = '#ffd166';
        ctx.lineWidth = 2.5;
        ctx.setLineDash([8, 6]);
        ctx.beginPath();
        ctx.arc(0, 0, r + 9, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();

        const vGrad = ctx.createRadialGradient(0, 0, 4, 0, 0, r);
        vGrad.addColorStop(0, '#ffd1ff');
        vGrad.addColorStop(0.4, accent);
        vGrad.addColorStop(1, '#130829');
        ctx.fillStyle = vGrad;
        ctx.strokeStyle = '#080414';
        ctx.lineWidth = 2.6;
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Cosmic cat-slit pupil eye
        ctx.fillStyle = '#0a0414';
        ctx.beginPath();
        ctx.ellipse(0, 0, 14, 8, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = enraged ? '#ff4757' : '#ffd166';
        ctx.beginPath();
        ctx.ellipse(0, 0, 4, 7.5, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  JellyGame.Bosses = {
    ARCHETYPES: BOSS_ARCHETYPES,
    BossEntity,
    BossBoltProjectile,
    getMilestoneMeters,
    getBossDefForIndex
  };
})(window);
