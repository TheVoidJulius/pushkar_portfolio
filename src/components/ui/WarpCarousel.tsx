"use client";

import { useRef, useState, useEffect } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";
import { CSS2DRenderer } from "three/examples/renderers/CSS2DRenderer";
import { TextGeometry } from "three/examples/jsm/geometries/TextGeometry";
import { FontLoader } from "three/examples/jsm/loaders/FontLoader";
import { GLTFLoader } from "three/examples/loaders/GLTFLoader";

export interface WarpCard {
  id: string;
  title: string;
  description: string;
  color: string;
}

const warpCards: WarpCard[] = [
  {
    id: "1",
    title: "Mikuro",
    description: "Liquid Chrome Companion",
    color: "from-purple-500 to-pink-500",
  },
  {
    id: "2",
    title: "Cupid",
    description: "Music Player",
    color: "from-pink-500 to-purple-500",
  },
  {
    id: "3",
    title: "Momo",
    description: "AI Assistant",
    color: "from-cyan-500 to-blue-500",
  },
];

export function WarpCarousel() {
  const [cards] = useState<WarpCard[]>(warpCards);
  const ref = useRef<THREE.Group>(new THREE.Group());
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    if (initialized) return;

    // Get HTML element to append canvas
    const htmlRef = ref.current.getHTMLRef();
    if (!htmlRef) return;

    const container = htmlRef;
    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;

    // Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0a0a);

    // Camera
    const camera = new THREE.PerspectiveCamera(70, width / height, 0.1, 1000);
    camera.position.z = 500;

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    container.appendChild(renderer.domElement);

    // Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.enablePan = false;

    // Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);

    const pointLight = new THREE.PointLight(0xffffff, 1);
    pointLight.position.set(200, 200, 200);
    scene.add(pointLight);

    // Create spheres for each card
    cards.forEach((card, index) => {
      const angle = (index / cards.length) * Math.PI * 2;
      const radius = 300;

      const geometry = new THREE.SphereGeometry(80, 32, 32);
      const material = new THREE.MeshStandardMaterial({
        color: parseInt(card.color.replace("from-", "").replace("to-", "").replace(/\[|\]/g, "").split(","")[0) || 0xffffff,
        transparent: true,
        opacity: 0.9,
      });
      const sphere = new THREE.Mesh(geometry, material);

      sphere.position.set(
        Math.cos(angle) * radius,
        Math.sin(angle) * radius,
        0
      );

      // Add label
      const labelGeometry = new TextGeometry(card.title, {
        font: new Font(),
        size: 16,
        height: 4,
        curveSegments: 12,
      });
      const labelMaterial = new THREE.MeshBasicMaterial({ color: 0x000000 });
      const label = new THREE.Mesh(labelGeometry, labelMaterial);
      label.position.set(0, -90, 0);
      sphere.add(label);

      sphere.userData = { id: card.id };
      ref.current.add(sphere);
    });

    // Ground plane
    const planeGeometry = new THREE.PlaneGeometry(1000, 1000);
    const planeMaterial = new THREE.MeshStandardMaterial({
      color: 0x1a1a1a,
      transparent: true,
      opacity: 0.8,
    });
    const plane = new THREE.Mesh(planeGeometry, planeMaterial);
    plane.rotation.x = -Math.PI / 2;
    plane.position.y = -100;
    scene.add(plane);

    // Render loop
    const tick = () => {
      controls.update();
      renderer.render(scene, camera);
      requestAnimationFrame(tick);
    };

    tick();

    // Handle resize
    const handleResize = () => {
      const width = container.clientWidth || window.innerWidth;
      const height = container.clientHeight || window.innerHeight;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    };

    window.addEventListener("resize", handleResize);

    return () => {
      renderer.dispose();
      window.removeEventListener("resize", handleResize);
    };
  }, [initialized, cards.length]);

  return null;
}