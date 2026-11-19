(function (global) {
  'use strict';

  const JellyGame = (global.JellyGame = global.JellyGame || {});

  JellyGame.CONSTANTS = Object.freeze({
    // Logical 9:16 canvas dimensions
    WIDTH: 450,
    HEIGHT: 800,

    // Arena geometry
    WALL_WIDTH: 36,
    FLOOR_Y: 0,
    START_PLAYER_Y: -135,
    START_CAMERA_Y: -736,

    // Player physics
    PLAYER_RADIUS: 18,
    GRAVITY: 1380,
    MIN_LAUNCH_POWER: 540,
    MAX_LAUNCH_POWER: 1280,
    MIN_OUTWARD_NORMAL: 0.28,
    CANCEL_CONE_NORMAL: -0.35,
    MIN_DRAG_PX: 14,
    MAX_DRAG_PX: 155,
    MAX_SUBSTEP_DT: 1 / 120,
    MAX_FRAME_DT: 0.05,

    // Centralized explicit hitbox configuration (fair, tight to core visuals)
    HITBOX: Object.freeze({
      PLAYER_HURT_RADIUS: 14,
      PLAYER_PICKUP_RADIUS: 22,
      PLAYER_MAGNET_RADIUS: 56,
      SPIKE_BASE_INSET_Y: 3.5,
      SPIKE_TIP_INSET_X: 3.5,
      FLAME_INSET_X: 7,
      FLAME_INSET_Y: 9,
      ARROW_LENGTH_INSET: 3,
      ARROW_HALF_HEIGHT: 4.2,
      COLLECTIBLE_RADIUS: 13,
      SHIELD_RADIUS: 15,
      CLOSE_CALL_MARGIN_PX: 11
    }),

    // Special tactile wall surfaces tuning
    SURFACES: Object.freeze({
      ICE_SLIDE_SPEED: 88,
      BOUNCE_VX: 700,
      BOUNCE_VY: -750,
      CRACK_DURATION: 1.25
    }),

    // Rising Floor (Magma Tide) mode tuning
    RISING_FLOOR: Object.freeze({
      START_OFFSET_Y: 95,
      BASE_SPEED: 68,
      MAX_SPEED: 136,
      SPEED_PER_METER: 0.48,
      MAX_LAG_DISTANCE: 540
    }),

    // Interactive Tutorial Course tuning
    TUTORIAL: Object.freeze({
      FINISH_METERS: 50,
      FINISH_Y: -2235,
      REWARD_GEMS: 15
    }),

    // Bioluminescent Jelly Color Palettes
    JELLY_COLORS: Object.freeze([
      {
        id: 'mint',
        cost: 0,
        light: '#9bffdb',
        primary: '#36f5b0',
        secondary: '#07b987',
        rim: '#047c5d',
        glow: 'rgba(54, 245, 176, 0.45)'
      },
      {
        id: 'coral',
        cost: 20,
        light: '#ffc2cc',
        primary: '#ff6b81',
        secondary: '#e63956',
        rim: '#9e1932',
        glow: 'rgba(255, 107, 129, 0.45)'
      },
      {
        id: 'azure',
        cost: 45,
        light: '#b8f2ff',
        primary: '#48dbfb',
        secondary: '#0abde3',
        rim: '#067494',
        glow: 'rgba(72, 219, 251, 0.45)'
      },
      {
        id: 'amber',
        cost: 80,
        light: '#fff3b0',
        primary: '#ffd32a',
        secondary: '#f59e0b',
        rim: '#9a5b04',
        glow: 'rgba(255, 211, 42, 0.48)'
      },
      {
        id: 'violet',
        cost: 130,
        light: '#e6c8ff',
        primary: '#c56cf0',
        secondary: '#8c4ae6',
        rim: '#54239e',
        glow: 'rgba(197, 108, 240, 0.48)'
      }
    ]),

    // Tempo / Rhythm flow tuning
    TEMPO: Object.freeze({
      WINDOW_SEC: 1.45,
      MAX_TIER: 5,
      POWER_BONUS_PER_TIER: 0.04, // Up to +16% launch power at x5
      DOUBLE_DROP_TIER: 3         // Tempo >= x3 grants +2 drops per pickup
    }),

    // Camera tracking (top 35-40% trigger for upward climb, safe bottom follow)
    CAMERA_UP_TRIGGER_RATIO: 0.38,
    CAMERA_DOWN_TRIGGER_RATIO: 0.78,
    CAMERA_LERP_UP: 8.5,
    CAMERA_LERP_DOWN: 10.0,

    // World units
    PIXELS_PER_METER: 42,

    // Procedural generation horizons
    GEN_LOOKAHEAD_PX: 1300,
    CULL_BEHIND_PX: 900,

    // Expressive handcrafted typography stacks
    FONTS: Object.freeze({
      DISPLAY: '"Fredoka", "Arial Rounded MT Bold", "Trebuchet MS", sans-serif',
      UI: '"Plus Jakarta Sans", "Fredoka", -apple-system, BlinkMacSystemFont, sans-serif'
    }),

    // Altitude-driven visual themes (colors, wall architecture & parallax sky style)
    THEMES: Object.freeze([
      {
        minMeters: 0,
        key: 'cavern',
        wallStyle: 'stone',
        bgStyle: 'cavern',
        bgTop: 0x0b1020,
        bgBottom: 0x17263f,
        parallaxFar: 0x111a2e,
        parallaxNear: 0x152238,
        rayColor: 0x36f5b0,
        wallBase: 0x1e2b42,
        wallShadow: 0x152033,
        wallInnerEdge: 0x32486e,
        wallHighlight: 0x4d6d9e,
        moteColor: 0xa6c8ff
      },
      {
        minMeters: 45,
        key: 'valley',
        wallStyle: 'stone',
        bgStyle: 'monolith',
        bgTop: 0x180f2c,
        bgBottom: 0x2b1a45,
        parallaxFar: 0x201438,
        parallaxNear: 0x261842,
        rayColor: 0xb388ff,
        wallBase: 0x291c40,
        wallShadow: 0x1c122e,
        wallInnerEdge: 0x523980,
        wallHighlight: 0x9b6dff,
        moteColor: 0xd8b8ff
      },
      {
        minMeters: 120,
        key: 'frost',
        wallStyle: 'frost',
        bgStyle: 'frost',
        bgTop: 0x081e2b,
        bgBottom: 0x103b4a,
        parallaxFar: 0x0c2838,
        parallaxNear: 0x113344,
        rayColor: 0x56f5e3,
        wallBase: 0x173847,
        wallShadow: 0x0f2630,
        wallInnerEdge: 0x2a667a,
        wallHighlight: 0x74f2ff,
        moteColor: 0xb8fff8
      },
      {
        minMeters: 250,
        key: 'foundry',
        wallStyle: 'obsidianLava',
        bgStyle: 'foundry',
        bgTop: 0x1a090d,
        bgBottom: 0x381512,
        parallaxFar: 0x240e12,
        parallaxNear: 0x301214,
        rayColor: 0xff793f,
        wallBase: 0x2b1518,
        wallShadow: 0x190b0d,
        wallInnerEdge: 0x732920,
        wallHighlight: 0xff9f43,
        moteColor: 0xffbe76
      },
      {
        minMeters: 500,
        key: 'storm',
        wallStyle: 'stormCoil',
        bgStyle: 'storm',
        bgTop: 0x091628,
        bgBottom: 0x152d4a,
        parallaxFar: 0x0e2036,
        parallaxNear: 0x132b45,
        rayColor: 0x48dbfb,
        wallBase: 0x182b42,
        wallShadow: 0x0d1929,
        wallInnerEdge: 0x2d5e8a,
        wallHighlight: 0x48dbfb,
        moteColor: 0x99ecff
      },
      {
        minMeters: 1000,
        key: 'cosmos',
        wallStyle: 'astralRune',
        bgStyle: 'cosmos',
        bgTop: 0x060612,
        bgBottom: 0x140d33,
        parallaxFar: 0x0b0920,
        parallaxNear: 0x120e30,
        rayColor: 0xa78bfa,
        wallBase: 0x181536,
        wallShadow: 0x0d0b21,
        wallInnerEdge: 0x453b8a,
        wallHighlight: 0xc56cf0,
        moteColor: 0xffffff
      }
    ]),

    // Core entity & UI colors
    COLORS: Object.freeze({
      floorSurface: '#243552',
      floorAccent: '#38f2af',

      jellyPrimary: '#36f5b0',
      jellySecondary: '#07b987',
      jellyRim: '#047c5d',
      jellyHighlight: 'rgba(255, 255, 255, 0.65)',
      jellyEye: '#0e1b2a',

      aimLine: 'rgba(255, 255, 255, 0.85)',
      aimLineGlow: 'rgba(54, 245, 176, 0.45)',
      aimCancel: 'rgba(255, 110, 120, 0.55)',

      spikeBase: '#2a3447',
      spikeFill: '#e8eef7',
      spikeTip: '#ff4d6d',
      spikeShade: '#9aa8bf',

      flameMount: '#2b2430',
      flameOuter: '#ff4d3d',
      flameMid: '#ff9b26',
      flameCore: '#fff3a1',

      turretBody: '#2b384f',
      turretBorder: '#4c6288',
      turretWarning: '#ff5e57',
      arrowShaft: '#fff1d0',
      arrowTip: '#ff4757',

      collectOuter: '#ffb703',
      collectCore: '#fff3b0',
      tempoGold: '#ffd166',
      tempoCyan: '#36f5b0'
    })
  });
})(window);
