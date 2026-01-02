import React, { useRef, useEffect, useMemo, Suspense } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Sky, KeyboardControls, useKeyboardControls } from "@react-three/drei";
import * as THREE from "three";
import type { GardenBed } from "../lib/types";
import { Button } from "./ui/button";
import { X, ArrowUp, ArrowDown, ArrowLeft, ArrowRight } from "lucide-react";

// Controls enum for keyboard
enum Controls {
  forward = "forward",
  backward = "backward",
  left = "left",
  right = "right",
  turnLeft = "turnLeft",
  turnRight = "turnRight",
}

const KEYBOARD_MAP = [
  { name: Controls.forward, keys: ["KeyW", "ArrowUp"] },
  { name: Controls.backward, keys: ["KeyS", "ArrowDown"] },
  { name: Controls.left, keys: ["KeyA"] },
  { name: Controls.right, keys: ["KeyD"] },
  { name: Controls.turnLeft, keys: ["KeyQ", "ArrowLeft"] },
  { name: Controls.turnRight, keys: ["KeyE", "ArrowRight"] },
];

// Constants
const EYE_HEIGHT = 1.7; // meters
const WALK_SPEED = 4; // meters per second
const TURN_SPEED = 1.5; // radians per second
const CM_TO_M = 0.01;

interface GardenWalkMode3DProps {
  beds: GardenBed[];
  objects: Array<{
    id: string;
    type: string;
    x: number;
    y: number;
    w: number;
    h: number;
  }>;
  isDayMode: boolean;
  initialPosition: { x: number; y: number }; // in cm
  initialDirection: number; // in degrees
  onExit: () => void;
}

// First-person camera controller
function FirstPersonController({
  initialPosition,
  initialDirection,
}: {
  initialPosition: { x: number; y: number };
  initialDirection: number;
}) {
  const { camera } = useThree();
  const yaw = useRef((-initialDirection * Math.PI) / 180); // Convert to radians, negate for correct direction
  const position = useRef(new THREE.Vector3(
    initialPosition.x * CM_TO_M,
    EYE_HEIGHT,
    initialPosition.y * CM_TO_M
  ));

  const [, getKeys] = useKeyboardControls<Controls>();

  useEffect(() => {
    // Set initial camera position and rotation
    camera.position.copy(position.current);
    camera.rotation.order = "YXZ";
    camera.rotation.y = yaw.current;
    camera.rotation.x = -0.2; // Slight downward look
  }, [camera]);

  useFrame((_, delta) => {
    const keys = getKeys();
    
    // Turning
    if (keys.turnLeft) yaw.current += TURN_SPEED * delta;
    if (keys.turnRight) yaw.current -= TURN_SPEED * delta;

    // Movement direction based on yaw
    const forward = new THREE.Vector3(
      -Math.sin(yaw.current),
      0,
      -Math.cos(yaw.current)
    );
    const right = new THREE.Vector3(
      Math.cos(yaw.current),
      0,
      -Math.sin(yaw.current)
    );

    // Apply movement
    const velocity = new THREE.Vector3();
    if (keys.forward) velocity.add(forward);
    if (keys.backward) velocity.sub(forward);
    if (keys.left) velocity.sub(right);
    if (keys.right) velocity.add(right);

    if (velocity.length() > 0) {
      velocity.normalize().multiplyScalar(WALK_SPEED * delta);
      position.current.add(velocity);
    }

    // Update camera
    camera.position.copy(position.current);
    camera.rotation.y = yaw.current;
  });

  return null;
}

// Ground plane
function Ground({ isDayMode }: { isDayMode: boolean }) {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
      <planeGeometry args={[100, 100]} />
      <meshStandardMaterial
        color={isDayMode ? "#4a7c3f" : "#2d4a28"}
        roughness={1}
      />
    </mesh>
  );
}

// Garden bed as 3D box
function Bed3D({ bed, isDayMode }: { bed: GardenBed; isDayMode: boolean }) {
  const width = bed.width_cm * CM_TO_M;
  const length = bed.length_cm * CM_TO_M;
  const height = 0.25; // 25cm bed height
  const x = bed.location_x * CM_TO_M + width / 2;
  const z = bed.location_y * CM_TO_M + length / 2;

  const woodColor = isDayMode ? "#8B5A2B" : "#5c3d1e";
  const soilColor = isDayMode ? "#3d2817" : "#2a1c10";

  return (
    <group position={[x, height / 2, z]}>
      {/* Wooden frame */}
      <mesh castShadow receiveShadow>
        <boxGeometry args={[width, height, length]} />
        <meshStandardMaterial color={woodColor} />
      </mesh>
      {/* Soil top */}
      <mesh position={[0, height / 2 + 0.01, 0]} receiveShadow>
        <boxGeometry args={[width - 0.04, 0.02, length - 0.04]} />
        <meshStandardMaterial color={soilColor} />
      </mesh>
      {/* Bed label */}
      {/* TODO: Add 3D text for bed name */}
    </group>
  );
}

// Greenhouse object
function Greenhouse3D({
  x,
  z,
  w,
  h,
  isDayMode,
}: {
  x: number;
  z: number;
  w: number;
  h: number;
  isDayMode: boolean;
}) {
  const width = w * CM_TO_M;
  const length = h * CM_TO_M;
  const height = 2.5;
  const posX = x * CM_TO_M + width / 2;
  const posZ = z * CM_TO_M + length / 2;

  return (
    <group position={[posX, 0, posZ]}>
      {/* Frame */}
      <mesh position={[0, height / 2, 0]}>
        <boxGeometry args={[width, height, length]} />
        <meshStandardMaterial
          color={isDayMode ? "#ffffff" : "#aaaaaa"}
          transparent
          opacity={0.3}
        />
      </mesh>
      {/* Metal frame lines */}
      <lineSegments position={[0, height / 2, 0]}>
        <edgesGeometry args={[new THREE.BoxGeometry(width, height, length)]} />
        <lineBasicMaterial color="#888888" />
      </lineSegments>
    </group>
  );
}

// Tree object
function Tree3D({
  x,
  z,
  isDayMode,
  variant = "deciduous",
}: {
  x: number;
  z: number;
  isDayMode: boolean;
  variant?: "deciduous" | "pine";
}) {
  const posX = x * CM_TO_M;
  const posZ = z * CM_TO_M;
  const trunkColor = isDayMode ? "#5c4033" : "#3d2a22";
  const leafColor = variant === "pine"
    ? (isDayMode ? "#1a472a" : "#0f2d1a")
    : (isDayMode ? "#228b22" : "#145214");

  return (
    <group position={[posX, 0, posZ]}>
      {/* Trunk */}
      <mesh position={[0, 0.75, 0]} castShadow>
        <cylinderGeometry args={[0.1, 0.15, 1.5, 8]} />
        <meshStandardMaterial color={trunkColor} />
      </mesh>
      {/* Crown */}
      {variant === "pine" ? (
        <mesh position={[0, 2.5, 0]} castShadow>
          <coneGeometry args={[1, 3, 8]} />
          <meshStandardMaterial color={leafColor} />
        </mesh>
      ) : (
        <mesh position={[0, 2.5, 0]} castShadow>
          <sphereGeometry args={[1.2, 16, 16]} />
          <meshStandardMaterial color={leafColor} />
        </mesh>
      )}
    </group>
  );
}

// Pond object
function Pond3D({
  x,
  z,
  w,
  h,
  isDayMode,
}: {
  x: number;
  z: number;
  w: number;
  h: number;
  isDayMode: boolean;
}) {
  const width = w * CM_TO_M;
  const length = h * CM_TO_M;
  const posX = x * CM_TO_M + width / 2;
  const posZ = z * CM_TO_M + length / 2;

  return (
    <mesh position={[posX, 0.02, posZ]} rotation={[-Math.PI / 2, 0, 0]}>
      <circleGeometry args={[Math.max(width, length) / 2, 32]} />
      <meshStandardMaterial
        color={isDayMode ? "#4a90d9" : "#2a5080"}
        transparent
        opacity={0.8}
      />
    </mesh>
  );
}

// Scene content
function SceneContent({
  beds,
  objects,
  isDayMode,
  initialPosition,
  initialDirection,
}: Omit<GardenWalkMode3DProps, "onExit">) {
  return (
    <>
      {/* Lighting */}
      <ambientLight intensity={isDayMode ? 0.6 : 0.2} />
      <directionalLight
        position={[10, 20, 10]}
        intensity={isDayMode ? 1 : 0.3}
        castShadow
        shadow-mapSize={[2048, 2048]}
      />
      {isDayMode && <Sky sunPosition={[100, 50, 100]} />}
      
      {/* Camera controller */}
      <FirstPersonController
        initialPosition={initialPosition}
        initialDirection={initialDirection}
      />

      {/* Ground */}
      <Ground isDayMode={isDayMode} />

      {/* Beds */}
      {beds.map((bed) => (
        <Bed3D key={bed.id} bed={bed} isDayMode={isDayMode} />
      ))}

      {/* Objects */}
      {objects.map((obj) => {
        switch (obj.type) {
          case "greenhouse":
            return (
              <Greenhouse3D
                key={obj.id}
                x={obj.x}
                z={obj.y}
                w={obj.w}
                h={obj.h}
                isDayMode={isDayMode}
              />
            );
          case "tree":
            return (
              <Tree3D
                key={obj.id}
                x={obj.x + obj.w / 2}
                z={obj.y + obj.h / 2}
                isDayMode={isDayMode}
                variant="deciduous"
              />
            );
          case "shrub":
            return (
              <Tree3D
                key={obj.id}
                x={obj.x + obj.w / 2}
                z={obj.y + obj.h / 2}
                isDayMode={isDayMode}
                variant="pine"
              />
            );
          case "pond":
            return (
              <Pond3D
                key={obj.id}
                x={obj.x}
                z={obj.y}
                w={obj.w}
                h={obj.h}
                isDayMode={isDayMode}
              />
            );
          default:
            return null;
        }
      })}
    </>
  );
}

// Main component
export function GardenWalkMode3D({
  beds,
  objects,
  isDayMode,
  initialPosition,
  initialDirection,
  onExit,
}: GardenWalkMode3DProps) {
  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onExit();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onExit]);

  return (
    <div className="absolute inset-0 z-50 bg-black">
      <KeyboardControls map={KEYBOARD_MAP}>
        <Canvas
          shadows
          camera={{
            fov: 75,
            near: 0.1,
            far: 1000,
          }}
          style={{ background: isDayMode ? "#87CEEB" : "#0a0a20" }}
        >
          <Suspense fallback={null}>
            <SceneContent
              beds={beds}
              objects={objects}
              isDayMode={isDayMode}
              initialPosition={initialPosition}
              initialDirection={initialDirection}
            />
          </Suspense>
        </Canvas>
      </KeyboardControls>

      {/* Exit button */}
      <Button
        variant="secondary"
        size="sm"
        className="absolute top-4 right-4 gap-2"
        onClick={onExit}
      >
        <X className="w-4 h-4" />
        Sluiten (Esc)
      </Button>

      {/* Controls hint */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-background/80 backdrop-blur-sm rounded-lg px-4 py-3 text-sm text-muted-foreground">
        <div className="flex items-center gap-6">
          <div className="flex flex-col items-center gap-1">
            <div className="flex gap-1">
              <kbd className="px-2 py-1 bg-muted rounded text-xs">W</kbd>
            </div>
            <div className="flex gap-1">
              <kbd className="px-2 py-1 bg-muted rounded text-xs">A</kbd>
              <kbd className="px-2 py-1 bg-muted rounded text-xs">S</kbd>
              <kbd className="px-2 py-1 bg-muted rounded text-xs">D</kbd>
            </div>
            <span className="text-xs mt-1">Lopen</span>
          </div>
          <div className="flex flex-col items-center gap-1">
            <div className="flex gap-1">
              <kbd className="px-2 py-1 bg-muted rounded text-xs">Q</kbd>
              <kbd className="px-2 py-1 bg-muted rounded text-xs">E</kbd>
            </div>
            <span className="text-xs mt-1">Draaien</span>
          </div>
          <div className="flex flex-col items-center gap-1">
            <kbd className="px-2 py-1 bg-muted rounded text-xs">Esc</kbd>
            <span className="text-xs mt-1">Sluiten</span>
          </div>
        </div>
      </div>
    </div>
  );
}
