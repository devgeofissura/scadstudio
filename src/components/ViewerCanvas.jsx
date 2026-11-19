import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';

export default function ViewerCanvas({ stlBytes, wireframe, showGrid, fitKey }) {
  const hostRef = useRef(null);
  const sceneState = useRef(null);
  const meshRef = useRef(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#10171b');
    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100000);
    camera.up.set(0, 0, 1);
    camera.position.set(160, -210, 155);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(host.clientWidth, host.clientHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    host.appendChild(renderer.domElement);

    scene.add(new THREE.HemisphereLight(0xd9f7ff, 0x263238, 2.1));
    const keyLight = new THREE.DirectionalLight(0xffffff, 3.0);
    keyLight.position.set(-120, -100, 180);
    scene.add(keyLight);
    const fillLight = new THREE.DirectionalLight(0x42cfe2, 1.3);
    fillLight.position.set(100, 90, 45);
    scene.add(fillLight);

    const grid = new THREE.GridHelper(240, 24, 0x32606a, 0x21353b);
    grid.rotation.x = Math.PI / 2;
    grid.position.z = -0.06;
    scene.add(grid);
    const axes = new THREE.AxesHelper(42);
    scene.add(axes);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.075;
    controls.screenSpacePanning = true;
    controls.minDistance = 0.5;
    controls.maxDistance = 100000;
    controls.target.set(0, 0, 0);
    controls.update();

    const resizeObserver = new ResizeObserver(() => {
      const width = host.clientWidth;
      const height = host.clientHeight;
      if (!width || !height) return;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    });
    resizeObserver.observe(host);

    let frameId;
    const animate = () => {
      frameId = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    sceneState.current = { scene, camera, controls, renderer, grid, axes };

    return () => {
      cancelAnimationFrame(frameId);
      resizeObserver.disconnect();
      controls.dispose();
      renderer.dispose();
      if (meshRef.current) {
        scene.remove(meshRef.current);
        meshRef.current.geometry.dispose();
        meshRef.current.material.dispose();
        meshRef.current = null;
      }
      host.removeChild(renderer.domElement);
      sceneState.current = null;
    };
  }, []);

  useEffect(() => {
    const state = sceneState.current;
    if (!state) return;
    if (!stlBytes) {
      if (meshRef.current) {
        state.scene.remove(meshRef.current);
        meshRef.current.geometry.dispose();
        meshRef.current.material.dispose();
        meshRef.current = null;
      }
      return;
    }
    try {
      const loader = new STLLoader();
      const geometry = loader.parse(stlBytes.buffer.slice(stlBytes.byteOffset, stlBytes.byteOffset + stlBytes.byteLength));
      geometry.computeVertexNormals();
      geometry.center();
      if (meshRef.current) {
        state.scene.remove(meshRef.current);
        meshRef.current.geometry.dispose();
        meshRef.current.material.dispose();
      }
      const material = new THREE.MeshStandardMaterial({
        color: '#54c9d8',
        metalness: 0.28,
        roughness: 0.36,
        side: THREE.DoubleSide,
        wireframe,
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      state.scene.add(mesh);
      meshRef.current = mesh;
      fitModel(state, mesh);
    } catch (error) {
      console.error('Falha ao ler STL gerado:', error);
    }
  }, [stlBytes]);

  useEffect(() => {
    if (meshRef.current) {
      meshRef.current.material.wireframe = wireframe;
      meshRef.current.material.needsUpdate = true;
    }
  }, [wireframe]);

  useEffect(() => {
    const state = sceneState.current;
    if (!state) return;
    state.grid.visible = showGrid;
    state.axes.visible = showGrid;
  }, [showGrid]);

  useEffect(() => {
    const state = sceneState.current;
    if (state && meshRef.current) fitModel(state, meshRef.current);
  }, [fitKey]);

  return <div className="three-host" ref={hostRef} />;
}

function fitModel({ camera, controls }, mesh) {
  const bounds = new THREE.Box3().setFromObject(mesh);
  const sphere = bounds.getBoundingSphere(new THREE.Sphere());
  const radius = Math.max(sphere.radius, 1);
  const distance = radius / Math.sin(THREE.MathUtils.degToRad(camera.fov * 0.5)) * 1.45;
  const direction = new THREE.Vector3(1.25, -1.55, 1.15).normalize();
  camera.position.copy(sphere.center).addScaledVector(direction, distance);
  camera.near = Math.max(distance / 3000, 0.01);
  camera.far = Math.max(distance * 40, 1000);
  camera.updateProjectionMatrix();
  controls.target.copy(sphere.center);
  controls.minDistance = Math.max(radius * 0.08, 0.1);
  controls.maxDistance = Math.max(radius * 40, 1000);
  controls.update();
}
