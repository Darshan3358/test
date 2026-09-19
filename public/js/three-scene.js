/**
 * FINVORA Ultra-Premium Three.js 3D FinTech Engine
 * Features:
 * 1. Hero 3D Holographic Faceted Crystalline Monolith + Gyroscopic Quantum Rings + 500-Particle Reactive Constellation + Floating 3D Financial Chips.
 * 2. Auth Page 3D Undulating Digital Matrix Wave.
 * 3. Dashboard Mini 3D Quantum Vault Orb.
 * 
 * Strict Brand Gradient:
 * #0D6C9F -> #1C88A6 -> #37A5A1 -> #57C19D -> #80D895 -> #B3EB91
 */

(function() {
  'use strict';

  if (typeof THREE === 'undefined') {
    console.warn('Three.js library is not loaded.');
    return;
  }

  // FINVORA Color Tokens
  const PALETTE = {
    c1: new THREE.Color('#0D6C9F'), // Deep Azure
    c2: new THREE.Color('#1C88A6'), // Cerulean
    c3: new THREE.Color('#37A5A1'), // Cyan-Teal
    c4: new THREE.Color('#57C19D'), // Emerald Mint
    c5: new THREE.Color('#80D895'), // Bright Mint
    c6: new THREE.Color('#B3EB91'), // Electric Lime
    darkBg: new THREE.Color('#050505'),
    cardBg: new THREE.Color('#0C1112')
  };

  const GRADIENT_ARRAY = [PALETTE.c1, PALETTE.c2, PALETTE.c3, PALETTE.c4, PALETTE.c5, PALETTE.c6];

  // Helper: Create Canvas Sprite for Floating 3D HUD Badges
  function createHudSprite(text, subtext, accentColorHex) {
    const canvas = document.createElement('canvas');
    canvas.width = 380;
    canvas.height = 120;
    const ctx = canvas.getContext('2d');

    // Rounded Box with Glass Effect
    ctx.fillStyle = 'rgba(12, 17, 18, 0.85)';
    ctx.strokeStyle = accentColorHex || '#37A5A1';
    ctx.lineWidth = 3;
    
    // Draw rounded rect
    const r = 16;
    ctx.beginPath();
    ctx.moveTo(r, 0);
    ctx.lineTo(canvas.width - r, 0);
    ctx.quadraticCurveTo(canvas.width, 0, canvas.width, r);
    ctx.lineTo(canvas.width, canvas.height - r);
    ctx.quadraticCurveTo(canvas.width, canvas.height, canvas.width - r, canvas.height);
    ctx.lineTo(r, canvas.height);
    ctx.quadraticCurveTo(0, canvas.height, 0, canvas.height - r);
    ctx.lineTo(0, r);
    ctx.quadraticCurveTo(0, 0, r, 0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Subtle Glowing Edge Line
    ctx.fillStyle = accentColorHex || '#57C19D';
    ctx.fillRect(16, 16, 6, 88);

    // Text Rendering
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 30px "Plus Jakarta Sans", sans-serif';
    ctx.fillText(text, 36, 52);

    ctx.fillStyle = accentColorHex || '#80D895';
    ctx.font = '600 20px "Outfit", sans-serif';
    ctx.fillText(subtext, 36, 88);

    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    const spriteMaterial = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      opacity: 0.95
    });
    const sprite = new THREE.Sprite(spriteMaterial);
    sprite.scale.set(6.5, 2.0, 1);
    return sprite;
  }

  // ==========================================
  // 1. HERO SECTION 3D SCENE
  // ==========================================
  function initHeroScene() {
    const canvas = document.getElementById('three-hero-canvas');
    if (!canvas) return;

    const container = canvas.parentElement;
    let width = container.clientWidth || window.innerWidth;
    let height = container.clientHeight || 560;

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x050505, 0.0018);

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    camera.position.set(0, 1.5, 28);

    const renderer = new THREE.WebGLRenderer({
      canvas: canvas,
      alpha: true,
      antialias: true,
      powerPreference: 'high-performance'
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    // Master Group for Parallax and Rotation
    const masterGroup = new THREE.Group();
    scene.add(masterGroup);

    // 1.1 Central Faceted FinTech Monolith (Physical Crystal)
    const coreGeo = new THREE.IcosahedronGeometry(5.2, 0);
    const coreMat = new THREE.MeshPhysicalMaterial({
      color: 0x1C88A6,
      emissive: 0x0D6C9F,
      emissiveIntensity: 0.35,
      roughness: 0.12,
      metalness: 0.85,
      clearcoat: 1.0,
      clearcoatRoughness: 0.1,
      transparent: true,
      opacity: 0.82
    });
    const coreMesh = new THREE.Mesh(coreGeo, coreMat);
    masterGroup.add(coreMesh);

    // 1.2 Surrounding Wireframe Hologram Matrix
    const wireGeo = new THREE.IcosahedronGeometry(7.0, 1);
    const wireMat = new THREE.MeshStandardMaterial({
      color: 0x37A5A1,
      wireframe: true,
      transparent: true,
      opacity: 0.45
    });
    const wireMesh = new THREE.Mesh(wireGeo, wireMat);
    masterGroup.add(wireMesh);

    // 1.3 Inner Radiant Power Dual-Pyramid (Octahedron)
    const innerGeo = new THREE.OctahedronGeometry(3.0, 0);
    const innerMat = new THREE.MeshStandardMaterial({
      color: 0x57C19D,
      emissive: 0x80D895,
      emissiveIntensity: 0.7,
      roughness: 0.2,
      metalness: 0.95
    });
    const innerMesh = new THREE.Mesh(innerGeo, innerMat);
    masterGroup.add(innerMesh);

    // 1.4 Three Gyroscopic Quantum Rings
    const rings = [];

    // Ring 1 - Cyan Primary Ring
    const ring1Geo = new THREE.TorusGeometry(9.2, 0.07, 16, 120);
    const ring1Mat = new THREE.MeshBasicMaterial({ color: 0x37A5A1, transparent: true, opacity: 0.8 });
    const ring1 = new THREE.Mesh(ring1Geo, ring1Mat);
    ring1.rotation.x = Math.PI / 3;
    masterGroup.add(ring1);
    rings.push({ mesh: ring1, speedX: 0.003, speedY: 0.008 });

    // Ring 2 - Mint Orbiting Ring
    const ring2Geo = new THREE.TorusGeometry(11.5, 0.06, 16, 120);
    const ring2Mat = new THREE.MeshBasicMaterial({ color: 0x57C19D, transparent: true, opacity: 0.65 });
    const ring2 = new THREE.Mesh(ring2Geo, ring2Mat);
    ring2.rotation.y = -Math.PI / 4;
    ring2.rotation.x = -Math.PI / 6;
    masterGroup.add(ring2);
    rings.push({ mesh: ring2, speedX: -0.005, speedY: 0.004 });

    // Ring 3 - Outer Thin Gold/Lime Ticker Ring
    const ring3Geo = new THREE.TorusGeometry(13.6, 0.04, 16, 140);
    const ring3Mat = new THREE.MeshBasicMaterial({ color: 0xB3EB91, transparent: true, opacity: 0.5 });
    const ring3 = new THREE.Mesh(ring3Geo, ring3Mat);
    ring3.rotation.z = Math.PI / 5;
    masterGroup.add(ring3);
    rings.push({ mesh: ring3, speedX: 0.004, speedY: -0.006 });

    // 1.5 Micro-Satellites Orbiting on Rings
    const satellites = [];
    const satGeo = new THREE.SphereGeometry(0.24, 16, 16);
    const satColors = [0x57C19D, 0x80D895, 0x1C88A6, 0xB3EB91];

    for (let i = 0; i < 4; i++) {
      const satMat = new THREE.MeshBasicMaterial({ color: satColors[i] });
      const sat = new THREE.Mesh(satGeo, satMat);
      masterGroup.add(sat);
      satellites.push({
        mesh: sat,
        radius: 9.2 + (i % 2) * 2.3,
        angle: (i * Math.PI) / 2,
        speed: 0.015 * (i % 2 === 0 ? 1 : -1),
        ringIndex: i % 3
      });
    }

    // 1.6 Floating 3D Financial HUD Chips
    const chipsGroup = new THREE.Group();
    masterGroup.add(chipsGroup);

    const chip1 = createHudSprite('+2.00%', 'DAILY ROI ACTIVE', '#80D895');
    chip1.position.set(-11, 4.5, 3);
    chipsGroup.add(chip1);

    const chip2 = createHudSprite('20-LEVEL', 'ROI-ON-ROI MATRIX', '#37A5A1');
    chip2.position.set(11, 2.5, -2);
    chipsGroup.add(chip2);

    const chip3 = createHudSprite('$100K', 'WEEKLY SALARY POOL', '#B3EB91');
    chip3.position.set(-8, -6, 2);
    chipsGroup.add(chip3);

    const chip4 = createHudSprite('AES-256', 'ATOMIC SECURE LEDGER', '#1C88A6');
    chip4.position.set(9, -5.5, 1);
    chipsGroup.add(chip4);

    // 1.7 500-Particle Dynamic Constellation
    const particleCount = 500;
    const particlePositions = new Float32Array(particleCount * 3);
    const particleBasePositions = new Float32Array(particleCount * 3);
    const particleColors = new Float32Array(particleCount * 3);

    for (let i = 0; i < particleCount; i++) {
      const radius = 8 + Math.random() * 12;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(Math.random() * 2 - 1);

      const x = radius * Math.sin(phi) * Math.cos(theta);
      const y = radius * Math.sin(phi) * Math.sin(theta);
      const z = radius * Math.cos(phi);

      particlePositions[i * 3] = x;
      particlePositions[i * 3 + 1] = y;
      particlePositions[i * 3 + 2] = z;

      particleBasePositions[i * 3] = x;
      particleBasePositions[i * 3 + 1] = y;
      particleBasePositions[i * 3 + 2] = z;

      const c = GRADIENT_ARRAY[i % GRADIENT_ARRAY.length];
      particleColors[i * 3] = c.r;
      particleColors[i * 3 + 1] = c.g;
      particleColors[i * 3 + 2] = c.b;
    }

    const particleGeo = new THREE.BufferGeometry();
    particleGeo.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3));
    particleGeo.setAttribute('color', new THREE.BufferAttribute(particleColors, 3));

    const particleMat = new THREE.PointsMaterial({
      size: 0.28,
      vertexColors: true,
      transparent: true,
      opacity: 0.85
    });

    const particleSystem = new THREE.Points(particleGeo, particleMat);
    masterGroup.add(particleSystem);

    // 1.8 Cinematic Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
    scene.add(ambientLight);

    const dirLight1 = new THREE.DirectionalLight(0x57C19D, 2.5);
    dirLight1.position.set(16, 22, 14);
    scene.add(dirLight1);

    const dirLight2 = new THREE.DirectionalLight(0x0D6C9F, 3.0);
    dirLight2.position.set(-18, -14, -8);
    scene.add(dirLight2);

    const pointLight = new THREE.PointLight(0x80D895, 2.0, 30);
    pointLight.position.set(0, 0, 0);
    scene.add(pointLight);

    // Mouse Tracking Parallax
    let mouseX = 0, mouseY = 0;
    let targetX = 0, targetY = 0;

    window.addEventListener('mousemove', (e) => {
      const halfW = window.innerWidth / 2;
      const halfH = window.innerHeight / 2;
      mouseX = (e.clientX - halfW) / halfW;
      mouseY = (e.clientY - halfH) / halfH;
    });

    // Resize Handler
    window.addEventListener('resize', () => {
      width = container.clientWidth || window.innerWidth;
      height = container.clientHeight || 560;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    });

    // Animation Loop
    const clock = new THREE.Clock();

    function renderHero() {
      requestAnimationFrame(renderHero);
      const delta = clock.getDelta();
      const elapsed = clock.getElapsedTime();

      // Smooth Parallax Lerp
      targetX += (mouseX - targetX) * 0.05;
      targetY += (mouseY - targetY) * 0.05;

      masterGroup.rotation.y = elapsed * 0.08 + targetX * 0.35;
      masterGroup.rotation.x = targetY * 0.25;

      // Inner Core Rotations
      coreMesh.rotation.y += 0.006;
      coreMesh.rotation.x += 0.003;

      wireMesh.rotation.y -= 0.004;
      wireMesh.rotation.z += 0.002;

      innerMesh.rotation.y -= 0.012;
      innerMesh.rotation.x += 0.008;

      // Gyroscopic Rings
      rings.forEach((r, idx) => {
        r.mesh.rotation.z += r.speedX;
        r.mesh.rotation.y += r.speedY;
      });

      // Orbiting Satellites
      satellites.forEach((sat) => {
        sat.angle += sat.speed;
        sat.mesh.position.x = Math.cos(sat.angle) * sat.radius;
        sat.mesh.position.z = Math.sin(sat.angle) * sat.radius;
        sat.mesh.position.y = Math.sin(sat.angle * 2) * 1.5;
      });

      // Floating Chips Sine Levitation
      chipsGroup.position.y = Math.sin(elapsed * 1.2) * 0.5;
      chip1.position.y = 4.5 + Math.sin(elapsed * 1.4) * 0.3;
      chip2.position.y = 2.5 + Math.cos(elapsed * 1.3) * 0.3;
      chip3.position.y = -6.0 + Math.sin(elapsed * 1.5) * 0.3;
      chip4.position.y = -5.5 + Math.cos(elapsed * 1.2) * 0.3;

      // Dynamic Particle Wave Distortions
      const posAttr = particleGeo.attributes.position;
      for (let i = 0; i < particleCount; i++) {
        const i3 = i * 3;
        const bx = particleBasePositions[i3];
        const by = particleBasePositions[i3 + 1];
        const bz = particleBasePositions[i3 + 2];

        // Wave displacement
        const wave = Math.sin(elapsed * 2.0 + bx * 0.2) * 0.25;
        posAttr.array[i3 + 1] = by + wave;
      }
      posAttr.needsUpdate = true;

      // Core Breathing Pulsation
      const pulse = 1.0 + Math.sin(elapsed * 2.5) * 0.04;
      coreMesh.scale.set(pulse, pulse, pulse);
      innerMesh.scale.set(pulse * 1.05, pulse * 1.05, pulse * 1.05);

      renderer.render(scene, camera);
    }

    renderHero();
  }

  // ==========================================
  // 2. AUTH SCREEN 3D MATRIX WAVE
  // ==========================================
  function initAuthScene() {
    const canvas = document.getElementById('three-auth-canvas');
    if (!canvas) return;

    const container = canvas.parentElement;
    let width = container.clientWidth || 600;
    let height = container.clientHeight || 700;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(55, width / height, 0.1, 1000);
    camera.position.set(0, 12, 22);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({
      canvas: canvas,
      alpha: true,
      antialias: true
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    // Undulating Plane Geometry
    const gridX = 40;
    const gridY = 40;
    const count = gridX * gridY;
    const planeGeo = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);

    let idx = 0;
    for (let ix = 0; ix < gridX; ix++) {
      for (let iy = 0; iy < gridY; iy++) {
        const x = (ix - gridX / 2) * 1.2;
        const z = (iy - gridY / 2) * 1.2;
        positions[idx * 3] = x;
        positions[idx * 3 + 1] = 0;
        positions[idx * 3 + 2] = z;

        const colorIndex = Math.floor((ix / gridX) * GRADIENT_ARRAY.length);
        const c = GRADIENT_ARRAY[Math.min(colorIndex, GRADIENT_ARRAY.length - 1)];
        colors[idx * 3] = c.r;
        colors[idx * 3 + 1] = c.g;
        colors[idx * 3 + 2] = c.b;

        idx++;
      }
    }

    planeGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    planeGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const pointMat = new THREE.PointsMaterial({
      size: 0.22,
      vertexColors: true,
      transparent: true,
      opacity: 0.85
    });

    const wavePoints = new THREE.Points(planeGeo, pointMat);
    scene.add(wavePoints);

    // Floating 3D FinTech Monogram In Center
    const prismGeo = new THREE.OctahedronGeometry(3.5, 0);
    const prismMat = new THREE.MeshStandardMaterial({
      color: 0x37A5A1,
      emissive: 0x1C88A6,
      emissiveIntensity: 0.4,
      roughness: 0.2,
      metalness: 0.9,
      wireframe: true
    });
    const prism = new THREE.Mesh(prismGeo, prismMat);
    prism.position.set(0, 4, 0);
    scene.add(prism);

    const light = new THREE.DirectionalLight(0x57C19D, 2.0);
    light.position.set(10, 20, 10);
    scene.add(light);

    // Resize
    window.addEventListener('resize', () => {
      width = container.clientWidth || 600;
      height = container.clientHeight || 700;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    });

    const clock = new THREE.Clock();
    function renderAuth() {
      requestAnimationFrame(renderAuth);
      const elapsed = clock.getElapsedTime();

      // Animate wave points
      const pos = planeGeo.attributes.position;
      let pIdx = 0;
      for (let ix = 0; ix < gridX; ix++) {
        for (let iy = 0; iy < gridY; iy++) {
          const u = ix * 0.25;
          const v = iy * 0.25;
          pos.array[pIdx * 3 + 1] = Math.sin(u + elapsed * 2) * 0.8 + Math.cos(v + elapsed * 1.5) * 0.8;
          pIdx++;
        }
      }
      pos.needsUpdate = true;

      prism.rotation.y = elapsed * 0.4;
      prism.rotation.x = Math.sin(elapsed * 0.5) * 0.2;
      prism.position.y = 4 + Math.sin(elapsed * 1.2) * 0.4;

      renderer.render(scene, camera);
    }
    renderAuth();
  }

  // ==========================================
  // 3. DASHBOARD QUANTUM VAULT ORB
  // ==========================================
  function initDashboardVaultScene() {
    const canvas = document.getElementById('three-vault-canvas');
    if (!canvas) return;

    const container = canvas.parentElement;
    let width = container.clientWidth || 180;
    let height = container.clientHeight || 180;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    camera.position.z = 10;

    const renderer = new THREE.WebGLRenderer({
      canvas: canvas,
      alpha: true,
      antialias: true
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    const orbGeo = new THREE.IcosahedronGeometry(2.8, 1);
    const orbMat = new THREE.MeshStandardMaterial({
      color: 0x1C88A6,
      emissive: 0x37A5A1,
      emissiveIntensity: 0.3,
      wireframe: true
    });
    const orb = new THREE.Mesh(orbGeo, orbMat);
    scene.add(orb);

    const innerGeo = new THREE.SphereGeometry(1.6, 16, 16);
    const innerMat = new THREE.MeshBasicMaterial({
      color: 0x57C19D,
      wireframe: false
    });
    const inner = new THREE.Mesh(innerGeo, innerMat);
    scene.add(inner);

    const ringGeo = new THREE.TorusGeometry(3.6, 0.05, 12, 60);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0x80D895 });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = Math.PI / 3;
    scene.add(ring);

    const clock = new THREE.Clock();
    function renderVault() {
      requestAnimationFrame(renderVault);
      const elapsed = clock.getElapsedTime();

      orb.rotation.y = elapsed * 0.35;
      orb.rotation.x = elapsed * 0.2;
      ring.rotation.z = -elapsed * 0.4;
      inner.scale.setScalar(1 + Math.sin(elapsed * 3) * 0.06);

      renderer.render(scene, camera);
    }
    renderVault();
  }

  // ==========================================
  // 4. ADMIN DASHBOARD MASTER CORE 3D SCENE
  // ==========================================
  function initAdminScene() {
    const canvas = document.getElementById('three-admin-canvas');
    if (!canvas) return;

    const container = canvas.parentElement;
    let width = container.clientWidth || 220;
    let height = container.clientHeight || 180;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    camera.position.set(0, 0, 9);

    const renderer = new THREE.WebGLRenderer({
      canvas: canvas,
      alpha: true,
      antialias: true
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    const group = new THREE.Group();
    scene.add(group);

    // Central Dodecahedron
    const coreGeo = new THREE.DodecahedronGeometry(2.0, 0);
    const coreMat = new THREE.MeshStandardMaterial({
      color: 0x1C88A6,
      emissive: 0x0D6C9F,
      emissiveIntensity: 0.45,
      roughness: 0.2,
      metalness: 0.85,
      wireframe: true
    });
    const core = new THREE.Mesh(coreGeo, coreMat);
    group.add(core);

    // Inner Solid Glow Octahedron
    const innerGeo = new THREE.OctahedronGeometry(1.2, 0);
    const innerMat = new THREE.MeshBasicMaterial({ color: 0x57C19D });
    const inner = new THREE.Mesh(innerGeo, innerMat);
    group.add(inner);

    // Dual Outer Rings
    const ring1Geo = new THREE.TorusGeometry(3.0, 0.04, 16, 80);
    const ring1Mat = new THREE.MeshBasicMaterial({ color: 0x80D895, transparent: true, opacity: 0.8 });
    const ring1 = new THREE.Mesh(ring1Geo, ring1Mat);
    ring1.rotation.x = Math.PI / 4;
    group.add(ring1);

    const ring2Geo = new THREE.TorusGeometry(3.6, 0.03, 16, 80);
    const ring2Mat = new THREE.MeshBasicMaterial({ color: 0xB3EB91, transparent: true, opacity: 0.6 });
    const ring2 = new THREE.Mesh(ring2Geo, ring2Mat);
    ring2.rotation.y = -Math.PI / 3;
    group.add(ring2);

    const clock = new THREE.Clock();
    function renderAdmin() {
      requestAnimationFrame(renderAdmin);
      const elapsed = clock.getElapsedTime();

      group.rotation.y = elapsed * 0.25;
      core.rotation.x = elapsed * 0.15;
      ring1.rotation.z = elapsed * 0.4;
      ring2.rotation.x = -elapsed * 0.3;
      inner.scale.setScalar(1 + Math.sin(elapsed * 2.5) * 0.08);

      renderer.render(scene, camera);
    }
    renderAdmin();

    window.addEventListener('resize', () => {
      width = container.clientWidth || 220;
      height = container.clientHeight || 180;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    });
  }

  // Initialize on DOM Ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      initHeroScene();
      initAuthScene();
      initDashboardVaultScene();
      initAdminScene();
    });
  } else {
    initHeroScene();
    initAuthScene();
    initDashboardVaultScene();
    initAdminScene();
  }
})();
