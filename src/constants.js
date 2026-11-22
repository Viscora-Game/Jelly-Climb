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

    // Altitude biome atmosphere physics & weather scaling
    ATMOSPHERE: Object.freeze({
      HIGH_ALT_SLIP_START_M: 1550,
      HIGH_ALT_SLIP_FULL_M: 3500,
      HIGH_ALT_EXTRA_SLIP: 12,
      AIM_SLIP_MULTIPLIER: 0.45
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

    // Altitude-driven cartoon biome themes aligned 1:1 with the 8-Boss Vertical World Ladder
    THEMES: Object.freeze([
      {
        minMeters: 0,
        key: 'cavern',
        wallStyle: 'stone',
        bgStyle: 'canopy',
        weather: 'spores',
        wallSlip: 0,
        gravityScale: 1.0,
        bgTop: 0x1f52bd,
        bgBottom: 0x6ac2ff,
        parallaxFar: 0x356fd1,
        parallaxNear: 0x4580db,
        rayColor: 0xfff6bf,
        wallBase: 0x62436e,
        wallShadow: 0x442b52,
        wallInnerEdge: 0x8d6799,
        wallHighlight: 0x9ce830,
        moteColor: 0xfff8c9
      },
      {
        minMeters: 115,
        key: 'valley',
        wallStyle: 'stone',
        bgStyle: 'monolith',
        weather: 'spores',
        wallSlip: 0,
        gravityScale: 1.0,
        bgTop: 0x281754,
        bgBottom: 0x4b2980,
        parallaxFar: 0x351e6b,
        parallaxNear: 0x42267a,
        rayColor: 0xffd185,
        wallBase: 0x573a7a,
        wallShadow: 0x3c2559,
        wallInnerEdge: 0x855eb0,
        wallHighlight: 0xc29eff,
        moteColor: 0xffe6a6
      },
      {
        minMeters: 250,
        key: 'slime',
        wallStyle: 'slimeOoze',
        bgStyle: 'slime',
        weather: 'bubbles',
        wallSlip: 0,
        gravityScale: 1.0,
        bgTop: 0x0b3b36,
        bgBottom: 0x166b52,
        parallaxFar: 0x105246,
        parallaxNear: 0x18634e,
        rayColor: 0x9bffc2,
        wallBase: 0x1f5e4c,
        wallShadow: 0x123b31,
        wallInnerEdge: 0x38b87d,
        wallHighlight: 0x7effa8,
        moteColor: 0x9effc4
      },
      {
        minMeters: 500,
        key: 'desert',
        wallStyle: 'sandstone',
        bgStyle: 'desert',
        weather: 'sand',
        wallSlip: 0,
        gravityScale: 1.0,
        bgTop: 0x873226,
        bgBottom: 0xeb9244,
        parallaxFar: 0xad4c2a,
        parallaxNear: 0xc7632e,
        rayColor: 0xfff0b3,
        wallBase: 0xb86d35,
        wallShadow: 0x804521,
        wallInnerEdge: 0xe39e4b,
        wallHighlight: 0xffe48f,
        moteColor: 0xffe7a3
      },
      {
        minMeters: 800,
        key: 'foundry',
        wallStyle: 'obsidianLava',
        bgStyle: 'foundry',
        weather: 'embers',
        wallSlip: 0,
        gravityScale: 1.0,
        bgTop: 0x33121e,
        bgBottom: 0x611e22,
        parallaxFar: 0x451722,
        parallaxNear: 0x541c24,
        rayColor: 0xffbe55,
        wallBase: 0x4f2429,
        wallShadow: 0x331418,
        wallInnerEdge: 0x8f3c33,
        wallHighlight: 0xffa447,
        moteColor: 0xffdb78
      },
      {
        minMeters: 1150,
        key: 'frost',
        wallStyle: 'frost',
        bgStyle: 'frost',
        weather: 'snow',
        wallSlip: 18,
        gravityScale: 1.0,
        bgTop: 0x113e6b,
        bgBottom: 0x216e8f,
        parallaxFar: 0x16517a,
        parallaxNear: 0x1d628c,
        rayColor: 0xc4f8ff,
        wallBase: 0x2b6e91,
        wallShadow: 0x1a4b69,
        wallInnerEdge: 0x54b1d4,
        wallHighlight: 0xbcf7ff,
        moteColor: 0xffffff
      },
      {
        minMeters: 1550,
        key: 'storm',
        wallStyle: 'stormCoil',
        bgStyle: 'storm',
        weather: 'rain',
        wallSlip: 24,
        gravityScale: 1.0,
        bgTop: 0x132752,
        bgBottom: 0x23477d,
        parallaxFar: 0x183466,
        parallaxNear: 0x204178,
        rayColor: 0x8ae9ff,
        wallBase: 0x2d486e,
        wallShadow: 0x1d3150,
        wallInnerEdge: 0x4e79a8,
        wallHighlight: 0x7de6ff,
        moteColor: 0xd4f6ff
      },
      {
        minMeters: 2000,
        key: 'cosmos',
        wallStyle: 'astralRune',
        bgStyle: 'cosmos',
        weather: 'stars',
        wallSlip: 12,
        gravityScale: 0.92,
        bgTop: 0x130b36,
        bgBottom: 0x2a1863,
        parallaxFar: 0x1d114c,
        parallaxNear: 0x26175e,
        rayColor: 0xf0a6ff,
        wallBase: 0x31236b,
        wallShadow: 0x1f154a,
        wallInnerEdge: 0x644eb8,
        wallHighlight: 0xf4a2ff,
        moteColor: 0xfff8d6
      },
      {
        minMeters: 2500,
        key: 'heaven',
        wallStyle: 'celestialMarble',
        bgStyle: 'heaven',
        weather: 'feathers',
        wallSlip: 0,
        gravityScale: 0.9,
        bgTop: 0x2e5cc4,
        bgBottom: 0xd99e66,
        parallaxFar: 0x6f9ce3,
        parallaxNear: 0xbdd5f5,
        rayColor: 0xfff6bd,
        wallBase: 0xebe3d5,
        wallShadow: 0xc2b098,
        wallInnerEdge: 0xffd147,
        wallHighlight: 0xfff7c2,
        moteColor: 0xfff6bd
      }
    ]),

    // Core cartoon entity & UI colors
    COLORS: Object.freeze({
      ink: '#1b1136',
      floorSurface: '#62436e',
      floorAccent: '#8ce827',

      jellyPrimary: '#36f5b0',
      jellySecondary: '#07b987',
      jellyRim: '#1b1136',
      jellyHighlight: 'rgba(255, 255, 255, 0.85)',
      jellyEye: '#1b1136',

      aimLine: '#fff8e6',
      aimLineGlow: 'rgba(54, 245, 176, 0.5)',
      aimCancel: '#ff5e73',

      spikeBase: '#48345c',
      spikeFill: '#f5f0e8',
      spikeTip: '#ff4d6d',
      spikeShade: '#b7a9c9',

      flameMount: '#422c4a',
      flameOuter: '#ff4d3d',
      flameMid: '#ff9b26',
      flameCore: '#fff6a8',

      turretBody: '#48376b',
      turretBorder: '#1b1136',
      turretWarning: '#ff5e57',
      arrowShaft: '#fff1d0',
      arrowTip: '#ff4757',

      collectOuter: '#ff9f1c',
      collectCore: '#fff9c4',
      tempoGold: '#ffd147',
      tempoCyan: '#4bf2b5'
    })
  });

  JellyGame.VIEW_PAD_Y = 0;
  JellyGame.isScreenYVisible = function (sy, margin = 40) {
    const pad = JellyGame.VIEW_PAD_Y || 0;
    return sy >= -margin - pad && sy <= JellyGame.CONSTANTS.HEIGHT + margin + pad;
  };
})(window);
