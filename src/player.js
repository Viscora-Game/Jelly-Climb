(function (global) {
  'use strict';

  const JellyGame = (global.JellyGame = global.JellyGame || {});
  const C = JellyGame.CONSTANTS;

  function clamp(val, min, max) {
    return val < min ? min : val > max ? max : val;
  }

  /**
   * Cute jelly blob player with circle physics + volume-preserving squash & stretch.
   */
  class Player {
    constructor() {
      this.radius = C.PLAYER_RADIUS;
      this.gravity = C.GRAVITY;
      this.equippedAccessory = 'none';
      this.equippedColor = 'mint';
      this.tempoTier = 1;
      this.reset();
    }

    getColorPalette() {
      if (C.JELLY_COLORS) {
        for (let i = 0; i < C.JELLY_COLORS.length; i++) {
          if (C.JELLY_COLORS[i].id === this.equippedColor) {
            return C.JELLY_COLORS[i];
          }
        }
        return C.JELLY_COLORS[0];
      }
      return {
        light: '#9bffdb',
        primary: C.COLORS.jellyPrimary,
        secondary: C.COLORS.jellySecondary,
        rim: C.COLORS.jellyRim,
        glow: 'rgba(54, 245, 176, 0.4)'
      };
    }

    getHurtHitbox() {
      return {
        type: 'circle',
        x: this.positionX,
        y: this.positionY,
        r: C.HITBOX.PLAYER_HURT_RADIUS
      };
    }

    getPickupHitbox() {
      return {
        type: 'circle',
        x: this.positionX,
        y: this.positionY,
        r: C.HITBOX.PLAYER_PICKUP_RADIUS
      };
    }

    reset() {
      this.positionX = C.WALL_WIDTH + this.radius;
      this.positionY = C.START_PLAYER_Y;
      this.velocityX = 0;
      this.velocityY = 0;

      // Attachment state: -1 left wall, 1 right wall, 0 airborne/floor
      this.wallAttached = -1;
      this.floorAttached = false;
      this.anchorY = this.positionY;

      // Slingshot state
      this.launchPower = 0;
      this.dragStrength = 0;
      this.isAiming = false;
      this.aimValid = false;
      this.aimDirX = 1;
      this.aimDirY = -1;

      // Squash & stretch animation state
      this.stretchAmount = 0;
      this.wobbleTime = 10;
      this.wobbleAmp = 0;
      this.idleTime = 0;
      this.blinkTimer = 2.4;
      this.isBlinking = false;

      // Flight motion trail
      this.trail = [];
      this.trailTimer = 0;

      // Health (1 Heart normal climb, 3 Hearts inside Boss arenas), Shield & recovery frames
      this.maxHp = 1;
      this.hp = 1;
      this.hasShield = false;
      this.invulnTimer = 0;

      // Alive flag
      this.alive = true;
    }

    isAttached() {
      return this.wallAttached !== 0 || this.floorAttached;
    }

    beginAim() {
      if (!this.isAttached() || !this.alive) return;
      this.isAiming = true;
      this.aimValid = false;
      this.dragStrength = 0;
      this.launchPower = 0;
    }

    updateAim(pullDx, pullDy, tempoTier = 1) {
      if (!this.isAttached() || !this.alive) {
        this.isAiming = false;
        this.aimValid = false;
        return;
      }

      this.tempoTier = tempoTier;

      this.isAiming = true;
      const rawDist = Math.hypot(pullDx, pullDy);

      if (rawDist < C.MIN_DRAG_PX) {
        this.aimValid = false;
        this.dragStrength = 0;
        this.launchPower = 0;
        return;
      }

      const rawDirX = -pullDx / rawDist;
      const rawDirY = -pullDy / rawDist;

      let dirX = rawDirX;
      let dirY = rawDirY;
      let valid = true;

      if (this.wallAttached !== 0) {
        const normalX = -this.wallAttached; // +1 for left wall, -1 for right wall
        let outward = rawDirX * normalX;

        if (outward < C.CANCEL_CONE_NORMAL) {
          valid = false;
        } else {
          outward = Math.max(outward, C.MIN_OUTWARD_NORMAL);
          const signY = Math.abs(rawDirY) < 1e-4 ? -1 : Math.sign(rawDirY);
          dirX = outward * normalX;
          dirY = signY * Math.sqrt(Math.max(0, 1 - outward * outward));
        }
      } else if (this.floorAttached) {
        let upward = -rawDirY;
        if (upward < C.CANCEL_CONE_NORMAL) {
          valid = false;
        } else {
          upward = Math.max(upward, 0.35);
          const horiz = Math.sqrt(Math.max(0, 1 - upward * upward));
          const signX = Math.abs(rawDirX) < 1e-4 ? 0 : Math.sign(rawDirX);
          dirX = signX * horiz;
          dirY = -upward;
          const len = Math.hypot(dirX, dirY) || 1;
          dirX /= len;
          dirY /= len;
        }
      }

      this.aimValid = valid;
      if (!valid) {
        this.dragStrength = 0;
        this.launchPower = 0;
        return;
      }

      this.dragStrength = clamp(
        (rawDist - C.MIN_DRAG_PX) / (C.MAX_DRAG_PX - C.MIN_DRAG_PX),
        0,
        1
      );
      const tempoBoost = 1 + Math.max(0, tempoTier - 1) * C.TEMPO.POWER_BONUS_PER_TIER;
      this.launchPower =
        (C.MIN_LAUNCH_POWER +
          this.dragStrength * (C.MAX_LAUNCH_POWER - C.MIN_LAUNCH_POWER)) *
        tempoBoost;
      this.aimDirX = dirX;
      this.aimDirY = dirY;
    }

    cancelAim() {
      this.isAiming = false;
      this.aimValid = false;
      this.dragStrength = 0;
      this.launchPower = 0;
    }

    /**
     * Releases the stretched jelly, returning launch info if fired.
     */
    releaseLaunch() {
      if (!this.isAttached() || !this.alive || !this.isAiming || !this.aimValid) {
        this.cancelAim();
        return null;
      }

      const dirX = this.aimDirX;
      const dirY = this.aimDirY;
      const strength = this.dragStrength;
      const power = this.launchPower;

      this.velocityX = dirX * power;
      this.velocityY = dirY * power;

      // Push slightly clear of floor when launching upward from floor
      if (this.floorAttached) {
        this.positionY = C.FLOOR_Y - this.radius - 1;
      }

      this.wallAttached = 0;
      this.floorAttached = false;
      this.isAiming = false;
      this.aimValid = false;
      this.dragStrength = 0;
      this.stretchAmount = 0.25 + strength * 0.25;
      this.wobbleAmp = 0.14;
      this.wobbleTime = 0;
      this.trail.length = 0;

      return { dirX, dirY, strength, power };
    }

    attachToWall(side, impactSpeed) {
      this.wallAttached = side;
      this.floorAttached = false;
      this.positionX =
        side < 0 ? C.WALL_WIDTH + this.radius : C.WIDTH - C.WALL_WIDTH - this.radius;
      this.anchorY = this.positionY;
      this.velocityX = 0;
      this.velocityY = 0;
      this.stretchAmount = 0;
      this.wobbleAmp = clamp(impactSpeed / 1050, 0.18, 0.42);
      this.wobbleTime = 0;
      this.trail.length = 0;
    }

    attachToFloor(impactSpeed) {
      this.wallAttached = 0;
      this.floorAttached = true;
      this.positionY = C.FLOOR_Y - this.radius;
      this.anchorY = this.positionY;
      this.velocityX = 0;
      this.velocityY = 0;
      this.stretchAmount = 0;
      this.wobbleAmp = clamp(impactSpeed / 1050, 0.16, 0.36);
      this.wobbleTime = 0;
      this.trail.length = 0;
    }

    /**
     * Advances physics by one small substep dt.
     * Returns an attachment event object if the player just landed on a wall/floor.
     */
    stepPhysics(dt) {
      if (!this.alive || this.isAttached()) return null;

      this.velocityY += this.gravity * dt;
      this.positionX += this.velocityX * dt;
      this.positionY += this.velocityY * dt;

      const leftBound = C.WALL_WIDTH + this.radius;
      const rightBound = C.WIDTH - C.WALL_WIDTH - this.radius;
      const floorBound = C.FLOOR_Y - this.radius;

      // Left wall contact (only when moving left so we never re-stick on launch)
      if (this.positionX <= leftBound && this.velocityX < 0) {
        const impactSpeed = Math.hypot(this.velocityX, this.velocityY);
        this.attachToWall(-1, impactSpeed);
        return { type: 'wall', side: -1, normalX: 1, impactSpeed };
      }

      // Right wall contact (only when moving right)
      if (this.positionX >= rightBound && this.velocityX > 0) {
        const impactSpeed = Math.hypot(this.velocityX, this.velocityY);
        this.attachToWall(1, impactSpeed);
        return { type: 'wall', side: 1, normalX: -1, impactSpeed };
      }

      // Starting cushion floor safety contact
      if (this.positionY >= floorBound && this.velocityY > 0) {
        const impactSpeed = Math.hypot(this.velocityX, this.velocityY);
        this.positionX = clamp(this.positionX, leftBound, rightBound);
        this.attachToFloor(impactSpeed);
        return { type: 'floor', side: 0, normalX: 0, impactSpeed };
      }

      return null;
    }

    updateVisuals(dt) {
      if (!this.alive) return;

      this.idleTime += dt;
      this.wobbleTime += dt;
      if (this.invulnTimer > 0) {
        this.invulnTimer = Math.max(0, this.invulnTimer - dt);
      }

      // Cute eye blink cadence
      this.blinkTimer -= dt;
      if (this.blinkTimer <= 0) {
        if (this.isBlinking) {
          this.isBlinking = false;
          this.blinkTimer = 2.0 + Math.random() * 2.8;
        } else {
          this.isBlinking = true;
          this.blinkTimer = 0.11;
        }
      }

      if (this.isAttached()) {
        const targetStretch = this.isAiming && this.aimValid ? this.dragStrength * 0.52 : 0;
        this.stretchAmount += (targetStretch - this.stretchAmount) * Math.min(1, dt * 18);
      } else {
        const speed = Math.hypot(this.velocityX, this.velocityY);
        const targetStretch = clamp(speed / 1350, 0, 0.44);
        this.stretchAmount += (targetStretch - this.stretchAmount) * Math.min(1, dt * 14);

        this.trailTimer += dt;
        if (this.trailTimer >= 0.018) {
          this.trailTimer = 0;
          this.trail.push({ x: this.positionX, y: this.positionY });
          if (this.trail.length > 7) {
            this.trail.shift();
          }
        }
      }
    }

    draw(ctx, cameraY, checkLandingState) {
      if (!this.alive) return;

      const pal = this.getColorPalette();
      const screenX = this.positionX;
      const screenY = this.positionY - cameraY;

      // Draw trajectory preview underneath the stretched jelly while aiming
      if (this.isAttached() && this.isAiming && this.aimValid) {
        this._drawTrajectory(ctx, cameraY, checkLandingState, pal);
      }

      // Draw soft flight trail
      if (!this.isAttached() && this.trail.length > 1) {
        for (let i = 0; i < this.trail.length; i++) {
          const pt = this.trail[i];
          const t = (i + 1) / (this.trail.length + 1);
          ctx.save();
          ctx.globalAlpha = t * 0.24;
          ctx.fillStyle = pal.primary;
          ctx.beginPath();
          ctx.arc(pt.x, pt.y - cameraY, this.radius * (0.38 + t * 0.45), 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
      }

      if (this.isAttached()) {
        this._drawAttachedJelly(ctx, screenX, screenY);
      } else {
        this._drawFlyingJelly(ctx, screenX, screenY);
      }
    }

    _drawTrajectory(ctx, cameraY, checkLandingState, pal) {
      const stepDt = 0.036;
      const steps = 16;
      let simX = this.positionX;
      let simY = this.positionY;
      let simVx = this.aimDirX * this.launchPower;
      let simVy = this.aimDirY * this.launchPower;

      const leftWall = C.WALL_WIDTH + this.radius;
      const rightWall = C.WIDTH - C.WALL_WIDTH - this.radius;

      ctx.save();
      for (let i = 1; i <= steps; i++) {
        simVy += this.gravity * stepDt;
        simX += simVx * stepDt;
        simY += simVy * stepDt;

        // Check mid-air direct sniper lock onto active Boss core!
        const midStatus = checkLandingState ? checkLandingState(simX, simY, 0) : 'safe';
        if (midStatus === 'bossHit') {
          const sy = simY - cameraY;
          const pulse = 1 + Math.sin(this.idleTime * 11) * 0.16;
          ctx.globalAlpha = 0.96;
          ctx.strokeStyle = '#ffd166';
          ctx.lineWidth = 2.6;
          ctx.beginPath();
          ctx.arc(simX, sy, 11 * pulse, 0, Math.PI * 2);
          ctx.stroke();

          ctx.fillStyle = '#ffd166';
          ctx.beginPath();
          ctx.arc(simX, sy, 4, 0, Math.PI * 2);
          ctx.fill();
          break;
        }

        // Stop preview right at opposite wall contact and render surgical Landing Reticle!
        if (simX <= leftWall || simX >= rightWall || simY >= C.FLOOR_Y - this.radius) {
          const hitWallSide = simX <= leftWall ? -1 : simX >= rightWall ? 1 : 0;
          simX = clamp(simX, leftWall, rightWall);
          const sy = simY - cameraY;

          const status = checkLandingState
            ? checkLandingState(simX, simY, hitWallSide)
            : 'safe';
          const retColor =
            status === 'danger'
              ? '#ff4757'
              : status === 'bounce'
              ? '#ff79c6'
              : pal.primary;

          const pulse = 1 + Math.sin(this.idleTime * 9) * 0.14;
          ctx.globalAlpha = 0.92;
          ctx.strokeStyle = retColor;
          ctx.lineWidth = 2.2;
          ctx.beginPath();
          ctx.arc(simX, sy, 8.5 * pulse, 0, Math.PI * 2);
          ctx.stroke();

          ctx.fillStyle = retColor;
          ctx.beginPath();
          ctx.arc(simX, sy, 3.6, 0, Math.PI * 2);
          ctx.fill();

          if (status === 'danger') {
            ctx.font = `700 11px ${C.FONTS ? C.FONTS.DISPLAY : 'sans-serif'}`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = '#ff4757';
            ctx.fillText('!', simX + (hitWallSide < 0 ? 15 : -15), sy);
          }
          break;
        }

        const t = i / steps;
        const alpha = (1 - t * 0.78) * 0.82;
        const dotR = 4.6 * (1 - t * 0.55);

        ctx.globalAlpha = alpha;
        ctx.fillStyle = i <= 4 ? pal.primary : C.COLORS.aimLine;
        ctx.beginPath();
        ctx.arc(simX, simY - cameraY, dotR, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    _drawAttachedJelly(ctx, screenX, screenY) {
      const r = this.radius;

      // Sticky anchor on wall or floor edge
      let anchorX = screenX;
      let anchorY = screenY;
      if (this.wallAttached < 0) {
        anchorX = C.WALL_WIDTH;
      } else if (this.wallAttached > 0) {
        anchorX = C.WIDTH - C.WALL_WIDTH;
      } else if (this.floorAttached) {
        anchorX = screenX;
        anchorY = screenY + r;
      }

      // Spring-damped wall impact squash/jiggle
      const wobble =
        this.wobbleAmp * Math.cos(this.wobbleTime * 26) * Math.exp(-this.wobbleTime * 9.5);
      const idleBreath = Math.sin(this.idleTime * 3.8) * 0.028;

      if (this.isAiming && this.aimValid) {
        // Pull body slightly back opposite to launch vector while keeping sticky anchor
        const pullDirX = -this.aimDirX;
        const pullDirY = -this.aimDirY;
        const pullDist = this.dragStrength * 19;

        let bodyX = screenX + pullDirX * pullDist;
        let bodyY = screenY + pullDirY * pullDist;

        // Keep center outside solid walls/floor while letting vertical stretch feel dramatic
        if (this.wallAttached < 0) {
          bodyX = Math.max(C.WALL_WIDTH + r * 0.72, bodyX);
        } else if (this.wallAttached > 0) {
          bodyX = Math.min(C.WIDTH - C.WALL_WIDTH - r * 0.72, bodyX);
        } else if (this.floorAttached) {
          bodyY = Math.min(anchorY - r * 0.72, bodyY);
        }

        // Draw gooey sticky bridge from wall suction pad to stretched jelly body
        this._drawGooBridge(ctx, anchorX, anchorY, bodyX, bodyY, r, this.dragStrength);

        const stretchAngle = Math.atan2(this.aimDirY, this.aimDirX);
        const scaleAlong = 1 + this.stretchAmount;
        const scalePerp = 1 / Math.sqrt(scaleAlong);

        ctx.save();
        ctx.translate(bodyX, bodyY);
        ctx.rotate(stretchAngle);
        ctx.scale(scaleAlong, scalePerp);
        this._drawJellyBody(ctx, r, this.aimDirX, this.aimDirY, stretchAngle, this.dragStrength);
        ctx.restore();
        return;
      }

      // Cancel / invalid pull gentle squeeze indicator
      if (this.isAiming && !this.aimValid) {
        ctx.save();
        ctx.translate(screenX, screenY);
        const pulse = 1 + Math.sin(this.idleTime * 14) * 0.04;
        ctx.scale(pulse, 1 / pulse);
        this._drawJellyBody(ctx, r, this.wallAttached < 0 ? 1 : -1, 0, 0, 0);
        ctx.restore();
        return;
      }

      // Idle / post-impact wobbling jelly pivoted at wall/floor contact edge
      ctx.save();
      if (this.wallAttached !== 0) {
        const normalX = -this.wallAttached;
        const scalePerpToWall = clamp(1 - wobble + idleBreath, 0.58, 1.38);
        const scaleAlongWall = 1 / scalePerpToWall;

        ctx.translate(anchorX, screenY);
        ctx.scale(scalePerpToWall, scaleAlongWall);
        ctx.translate(normalX * r, 0);
        this._drawJellyBody(ctx, r, normalX, -0.18, 0, 0);
      } else {
        // Floor attached
        const scaleY = clamp(1 - wobble + idleBreath, 0.62, 1.35);
        const scaleX = 1 / scaleY;
        ctx.translate(screenX, anchorY);
        ctx.scale(scaleX, scaleY);
        ctx.translate(0, -r);
        this._drawJellyBody(ctx, r, 0, -1, 0, 0);
      }
      ctx.restore();
    }

    _drawGooBridge(ctx, ax, ay, bx, by, r, strength) {
      const dx = bx - ax;
      const dy = by - ay;
      const dist = Math.hypot(dx, dy);
      if (dist < 2) return;

      let nx = -dy / dist;
      let ny = dx / dist;
      const padRadius = r * (0.78 - strength * 0.16);
      const neckRadius = r * (0.68 - strength * 0.18);
      const midX = (ax + bx) * 0.5;
      const midY = (ay + by) * 0.5;

      const pal = this.getColorPalette();
      ctx.save();
      ctx.fillStyle = pal.secondary;
      ctx.beginPath();
      if (this.wallAttached !== 0) {
        // Keep B1 as upper side (smaller Y) and B2 as lower side to avoid bow-tie crossing
        if (ny > 0) {
          nx = -nx;
          ny = -ny;
        }
        ctx.moveTo(ax, ay - padRadius);
        ctx.quadraticCurveTo(midX, midY - neckRadius * 0.25, bx + nx * neckRadius, by + ny * neckRadius);
        ctx.lineTo(bx - nx * neckRadius, by - ny * neckRadius);
        ctx.quadraticCurveTo(midX, midY + neckRadius * 0.25, ax, ay + padRadius);
      } else {
        // Keep B1 as left side (smaller X) and B2 as right side
        if (nx > 0) {
          nx = -nx;
          ny = -ny;
        }
        ctx.moveTo(ax - padRadius, ay);
        ctx.quadraticCurveTo(midX - neckRadius * 0.25, midY, bx + nx * neckRadius, by + ny * neckRadius);
        ctx.lineTo(bx - nx * neckRadius, by - ny * neckRadius);
        ctx.quadraticCurveTo(midX + neckRadius * 0.25, midY, ax + padRadius, ay);
      }
      ctx.closePath();
      ctx.fill();

      // Smooth sticky suction pad flush on wall/floor
      ctx.fillStyle = pal.primary;
      ctx.beginPath();
      if (this.wallAttached !== 0) {
        const startAng = this.wallAttached < 0 ? -Math.PI * 0.5 : Math.PI * 0.5;
        ctx.arc(ax, ay, padRadius * 0.62, startAng, startAng + Math.PI);
      } else {
        ctx.arc(ax, ay, padRadius * 0.62, Math.PI, Math.PI * 2);
      }
      ctx.fill();
      ctx.restore();
    }

    _drawFlyingJelly(ctx, screenX, screenY) {
      const r = this.radius;
      const speed = Math.hypot(this.velocityX, this.velocityY);
      const angle = speed > 10 ? Math.atan2(this.velocityY, this.velocityX) : 0;
      const wobble =
        this.wobbleAmp * Math.cos(this.wobbleTime * 22) * Math.exp(-this.wobbleTime * 8);

      const scaleAlong = clamp(1 + this.stretchAmount + wobble * 0.4, 0.72, 1.52);
      const scalePerp = 1 / Math.sqrt(scaleAlong);

      const lookX = speed > 20 ? this.velocityX / speed : 0;
      const lookY = speed > 20 ? this.velocityY / speed : -1;

      ctx.save();
      ctx.translate(screenX, screenY);
      ctx.rotate(angle);
      ctx.scale(scaleAlong, scalePerp);
      this._drawJellyBody(ctx, r, lookX, lookY, angle, 0);
      ctx.restore();
    }

    _drawJellyBody(ctx, r, lookX, lookY, bodyRotation, strain) {
      const pal = this.getColorPalette();
      const speedRatio = this.isAttached()
        ? 0
        : clamp(Math.hypot(this.velocityX, this.velocityY) / 1200, 0, 1);

      // Draw back-slot accessories (cape, wings, jetpack) cleanly behind jelly sphere
      if (JellyGame.Accessories && this.equippedAccessory && this.equippedAccessory !== 'none') {
        ctx.save();
        ctx.rotate(-bodyRotation);
        JellyGame.Accessories.drawAccessory(
          ctx,
          this.equippedAccessory,
          r,
          lookX,
          lookY,
          this.idleTime,
          speedRatio,
          'back'
        );
        ctx.restore();
      }

      // Soft outer glow
      ctx.save();
      ctx.shadowColor =
        this.tempoTier >= 3 ? 'rgba(255, 209, 102, 0.55)' : pal.glow;
      ctx.shadowBlur = this.tempoTier >= 3 ? 18 : 14;

      // Radial glossy jelly fill
      const grad = ctx.createRadialGradient(-r * 0.28, -r * 0.3, r * 0.15, 0, 0, r * 1.05);
      grad.addColorStop(0, pal.light);
      grad.addColorStop(0.42, pal.primary);
      grad.addColorStop(1, pal.secondary);

      ctx.fillStyle = grad;
      ctx.strokeStyle = pal.rim;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.stroke();
      ctx.restore();

      // Protective Bubble Shield aura or temporary recovery i-frames ring
      if (this.hasShield) {
        ctx.save();
        const shR = r + 5.5;
        ctx.fillStyle = 'rgba(72, 219, 251, 0.18)';
        ctx.strokeStyle = 'rgba(130, 245, 255, 0.85)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, shR, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        ctx.strokeStyle = 'rgba(255, 255, 255, 0.75)';
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.arc(0, 0, shR - 2.5, -2.2, -1.1);
        ctx.stroke();
        ctx.restore();
      } else if (this.invulnTimer > 0 && Math.floor(this.invulnTimer * 16) % 2 === 0) {
        ctx.save();
        ctx.strokeStyle = 'rgba(255, 107, 129, 0.82)';
        ctx.lineWidth = 2.4;
        ctx.beginPath();
        ctx.arc(0, 0, r + 4.5, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

      // Glossy specular shine
      ctx.save();
      ctx.fillStyle = C.COLORS.jellyHighlight;
      ctx.beginPath();
      ctx.ellipse(-r * 0.34, -r * 0.36, r * 0.26, r * 0.15, -0.55, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(-r * 0.56, -r * 0.12, r * 0.08, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // Un-rotate slightly for upright expressive eyes in local look space
      ctx.save();
      ctx.rotate(-bodyRotation);

      const eyeOffsetX = clamp(lookX * 3.8, -4.5, 4.5);
      const eyeOffsetY = clamp(lookY * 3.4, -4.0, 4.0);
      const eyeSpread = 5.6;

      if (this.isBlinking) {
        ctx.strokeStyle = C.COLORS.jellyEye;
        ctx.lineWidth = 2.1;
        ctx.lineCap = 'round';
        for (const side of [-1, 1]) {
          const ex = eyeOffsetX + side * eyeSpread;
          ctx.beginPath();
          ctx.moveTo(ex - 2.6, eyeOffsetY);
          ctx.lineTo(ex + 2.6, eyeOffsetY);
          ctx.stroke();
        }
      } else if (strain > 0.65) {
        // Cute determined squinted eyes when pulled tight!
        ctx.strokeStyle = C.COLORS.jellyEye;
        ctx.lineWidth = 2.2;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(eyeOffsetX - eyeSpread - 2.5, eyeOffsetY - 2);
        ctx.lineTo(eyeOffsetX - eyeSpread + 2.2, eyeOffsetY);
        ctx.lineTo(eyeOffsetX - eyeSpread - 2.5, eyeOffsetY + 2);
        ctx.moveTo(eyeOffsetX + eyeSpread + 2.5, eyeOffsetY - 2);
        ctx.lineTo(eyeOffsetX + eyeSpread - 2.2, eyeOffsetY);
        ctx.lineTo(eyeOffsetX + eyeSpread + 2.5, eyeOffsetY + 2);
        ctx.stroke();
      } else {
        for (const side of [-1, 1]) {
          const ex = eyeOffsetX + side * eyeSpread;
          const ey = eyeOffsetY;
          ctx.fillStyle = C.COLORS.jellyEye;
          ctx.beginPath();
          ctx.arc(ex, ey, 2.75, 0, Math.PI * 2);
          ctx.fill();

          // Eye sparkle
          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.arc(ex - 0.8, ey - 0.9, 1.0, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Tiny cute smile
      ctx.strokeStyle = C.COLORS.jellyEye;
      ctx.lineWidth = 1.6;
      ctx.lineCap = 'round';
      ctx.beginPath();
      if (strain > 0.55) {
        // Focused little 'o' mouth when charging big shot
        ctx.arc(eyeOffsetX, eyeOffsetY + 5.2, 1.7, 0, Math.PI * 2);
      } else {
        ctx.arc(eyeOffsetX, eyeOffsetY + 4.0, 2.4, 0.2, Math.PI - 0.2);
      }
      ctx.stroke();

      // Render equipped front accessories (face eyewear + headwear) cleanly in upright space
      if (JellyGame.Accessories && this.equippedAccessory && this.equippedAccessory !== 'none') {
        JellyGame.Accessories.drawAccessory(
          ctx,
          this.equippedAccessory,
          r,
          lookX,
          lookY,
          this.idleTime,
          speedRatio,
          'front'
        );
      }

      ctx.restore();
    }
  }

  JellyGame.Player = Player;
})(window);
