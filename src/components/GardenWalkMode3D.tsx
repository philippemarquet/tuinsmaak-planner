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

interface PlantingOverlay3D {
  id: string;
  bedId: string;
  startSegment: number;
  segmentsUsed: number;
  color: string;
  iconUrl?: string | null;
  label?: string;
  cropType?: string;
}

// Plant profile types for different crop categories
type PlantProfile = "root" | "leafy" | "climbing" | "bush" | "fruit" | "grain" | "default";

// Determine plant profile based on crop name/type
function getPlantProfile(label?: string, cropType?: string): PlantProfile {
  const name = (label || "").toLowerCase();
  const type = (cropType || "").toLowerCase();
  
  // Root vegetables - low, leafy tops
  if (/wortel|biet|radijs|knol|ui|prei|knoflook|aardappel|pastinaak|rammenas/.test(name)) return "root";
  
  // Leafy greens - medium height, bushy
  if (/sla|spinazie|boerenkool|snijbiet|andijvie|rucola|veldsla|kool(?!rabi)|raapstelen/.test(name) || type.includes("blad")) return "leafy";
  
  // Climbing/tall plants - stakes with height
  if (/tomaat|boon|erwt|komkommer|augurk|pompoen|courgette|meloen/.test(name) || type.includes("vrucht")) return "climbing";
  
  // Bush plants - medium round shape
  if (/paprika|peper|aubergine|aardbei/.test(name)) return "bush";
  
  // Fruit/large - tall with fruits
  if (/mais|zonnebloem/.test(name) || type.includes("graan")) return "grain";
  
  return "default";
}

// Get plant characteristics based on profile
function getPlantCharacteristics(profile: PlantProfile) {
  switch (profile) {
    case "root":
      return { 
        minHeight: 0.08, 
        maxHeight: 0.18, 
        topShape: "leaves" as const, 
        stemRadius: 0.008,
        topScale: 1.2,
        color: "#2d8a2d"
      };
    case "leafy":
      return { 
        minHeight: 0.12, 
        maxHeight: 0.25, 
        topShape: "sphere" as const, 
        stemRadius: 0.006,
        topScale: 1.5,
        color: "#3cb371"
      };
    case "climbing":
      return { 
        minHeight: 0.35, 
        maxHeight: 0.65, 
        topShape: "cone" as const, 
        stemRadius: 0.015,
        topScale: 0.8,
        color: "#228B22"
      };
    case "bush":
      return { 
        minHeight: 0.20, 
        maxHeight: 0.35, 
        topShape: "sphere" as const, 
        stemRadius: 0.012,
        topScale: 1.3,
        color: "#2e8b57"
      };
    case "grain":
      return { 
        minHeight: 0.5, 
        maxHeight: 0.8, 
        topShape: "cylinder" as const, 
        stemRadius: 0.008,
        topScale: 0.4,
        color: "#6b8e23"
      };
    default:
      return { 
        minHeight: 0.15, 
        maxHeight: 0.35, 
        topShape: "sphere" as const, 
        stemRadius: 0.01,
        topScale: 1.0,
        color: "#228B22"
      };
  }
}

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
  plantings?: PlantingOverlay3D[];
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

// Garden bed as 3D box with optional plantings
function Bed3D({ 
  bed, 
  isDayMode, 
  plantings = [] 
}: { 
  bed: GardenBed; 
  isDayMode: boolean;
  plantings?: PlantingOverlay3D[];
}) {
  const width = bed.width_cm * CM_TO_M;
  const length = bed.length_cm * CM_TO_M;
  const height = 0.25; // 25cm bed height
  // In 2D canvas, location_x/y is the CENTER of the bed, so we use it directly
  const x = (bed.location_x ?? 0) * CM_TO_M;
  const z = (bed.location_y ?? 0) * CM_TO_M;

  const woodColor = isDayMode ? "#8B5A2B" : "#5c3d1e";
  const soilColor = isDayMode ? "#3d2817" : "#2a1c10";

  const segments = bed.segments || 1;
  const isHorizontal = bed.width_cm > bed.length_cm;
  const bedPlantings = plantings.filter(p => p.bedId === bed.id);

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
      
      {/* Plantings as 3D crops with type-specific rendering */}
      {bedPlantings.map((planting) => {
        const startSeg = planting.startSegment;
        const usedSegs = Math.max(1, planting.segmentsUsed);
        
        // Calculate position within bed
        const offsetX = isHorizontal 
          ? -width / 2 + (startSeg + usedSegs / 2) * (width / segments)
          : 0;
        const offsetZ = isHorizontal 
          ? 0
          : -length / 2 + (startSeg + usedSegs / 2) * (length / segments);
        
        const cropWidth = isHorizontal ? usedSegs * (width / segments) - 0.02 : width - 0.06;
        const cropLength = isHorizontal ? length - 0.06 : usedSegs * (length / segments) - 0.02;
        
        // Get plant profile based on crop type
        const profile = getPlantProfile(planting.label, planting.cropType);
        const chars = getPlantCharacteristics(profile);
        
        // Create plants with stable random positions (seeded by planting id)
        const plantCount = Math.min(15, usedSegs * 4);
        const plants = [];
        
        // Use planting id as seed for consistent random positions
        const seedNum = planting.id.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
        const seededRandom = (i: number) => {
          const x = Math.sin(seedNum * 9999 + i * 7919) * 10000;
          return x - Math.floor(x);
        };
        
        for (let i = 0; i < plantCount; i++) {
          const px = (seededRandom(i * 2) - 0.5) * cropWidth * 0.85;
          const pz = (seededRandom(i * 2 + 1) - 0.5) * cropLength * 0.85;
          const heightVar = seededRandom(i * 3);
          const plantHeight = chars.minHeight + heightVar * (chars.maxHeight - chars.minHeight);
          const scale = 0.8 + seededRandom(i * 4) * 0.4;
          plants.push({ x: px, z: pz, height: plantHeight, scale });
        }
        
        return (
          <group key={planting.id} position={[offsetX, height / 2 + 0.02, offsetZ]}>
            {/* Colored ground patch */}
            <mesh position={[0, 0, 0]} rotation={[-Math.PI / 2, 0, 0]}>
              <planeGeometry args={[cropWidth, cropLength]} />
              <meshStandardMaterial color={planting.color} transparent opacity={0.5} />
            </mesh>
            
            {/* 3D plant representations based on profile */}
            {plants.map((plant, idx) => {
              const stemColor = isDayMode ? chars.color : `hsl(120, 40%, ${parseInt(chars.color.slice(1), 16) % 20 + 10}%)`;
              const topColor = planting.color;
              const topRadius = 0.04 * chars.topScale * plant.scale;
              
              return (
                <group key={idx} position={[plant.x, 0, plant.z]}>
                  {/* Stem */}
                  <mesh position={[0, plant.height / 2, 0]} castShadow>
                    <cylinderGeometry args={[chars.stemRadius * plant.scale, chars.stemRadius * 1.3 * plant.scale, plant.height, 6]} />
                    <meshStandardMaterial color={stemColor} />
                  </mesh>
                  
                  {/* Top shape based on profile */}
                  {chars.topShape === "sphere" && (
                    <mesh position={[0, plant.height + topRadius * 0.5, 0]} castShadow>
                      <sphereGeometry args={[topRadius, 8, 8]} />
                      <meshStandardMaterial color={topColor} />
                    </mesh>
                  )}
                  
                  {chars.topShape === "cone" && (
                    <mesh position={[0, plant.height + topRadius, 0]} castShadow>
                      <coneGeometry args={[topRadius * 0.8, topRadius * 3, 8]} />
                      <meshStandardMaterial color={topColor} />
                    </mesh>
                  )}
                  
                  {chars.topShape === "cylinder" && (
                    <mesh position={[0, plant.height + topRadius, 0]} castShadow>
                      <cylinderGeometry args={[topRadius * 0.3, topRadius * 0.5, topRadius * 2, 6]} />
                      <meshStandardMaterial color={isDayMode ? "#daa520" : "#8b6914"} />
                    </mesh>
                  )}
                  
                  {chars.topShape === "leaves" && (
                    <>
                      {/* Multiple small leaves for root vegetables */}
                      {[0, 1, 2].map((li) => (
                        <mesh 
                          key={li} 
                          position={[
                            Math.cos(li * 2.1) * topRadius * 0.3, 
                            plant.height + topRadius * 0.3, 
                            Math.sin(li * 2.1) * topRadius * 0.3
                          ]} 
                          rotation={[0.3, li * 2.1, 0.2]}
                          castShadow
                        >
                          <boxGeometry args={[topRadius * 0.15, topRadius * 1.2, topRadius * 0.05]} />
                          <meshStandardMaterial color={topColor} />
                        </mesh>
                      ))}
                    </>
                  )}
                </group>
              );
            })}
          </group>
        );
      })}
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
  // x,z are already center coordinates from the parent, same as beds
  const posX = x * CM_TO_M;
  const posZ = z * CM_TO_M;

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

// Shrub object (low bushes)
function Shrub3D({
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
  const posX = x * CM_TO_M;
  const posZ = z * CM_TO_M;
  const width = w * CM_TO_M;
  const length = h * CM_TO_M;
  const leafColor = isDayMode ? "#2d5a27" : "#1a3518";
  const leafColor2 = isDayMode ? "#3d7a37" : "#264a22";

  // Create multiple small bushes to fill the area
  const bushes = [];
  const bushCount = Math.max(2, Math.floor((width * length) / 0.5));
  for (let i = 0; i < bushCount; i++) {
    const bx = (Math.random() - 0.5) * width * 0.8;
    const bz = (Math.random() - 0.5) * length * 0.8;
    const size = 0.3 + Math.random() * 0.3;
    bushes.push({ x: bx, z: bz, size, color: Math.random() > 0.5 ? leafColor : leafColor2 });
  }

  return (
    <group position={[posX, 0, posZ]}>
      {bushes.map((bush, i) => (
        <mesh key={i} position={[bush.x, bush.size * 0.5, bush.z]} castShadow>
          <sphereGeometry args={[bush.size, 8, 8]} />
          <meshStandardMaterial color={bush.color} />
        </mesh>
      ))}
    </group>
  );
}

// Woodchips object (bark mulch)
function Woodchips3D({
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
  const posX = x * CM_TO_M;
  const posZ = z * CM_TO_M;

  return (
    <mesh position={[posX, 0.02, posZ]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <planeGeometry args={[width, length]} />
      <meshStandardMaterial color={isDayMode ? "#5c3d2e" : "#3d2a1f"} roughness={1} />
    </mesh>
  );
}

// Tiles object (stone tiles)
function Tiles3D({
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
  const posX = x * CM_TO_M;
  const posZ = z * CM_TO_M;

  return (
    <mesh position={[posX, 0.025, posZ]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <planeGeometry args={[width, length]} />
      <meshStandardMaterial color={isDayMode ? "#8a8a8a" : "#5a5a5a"} roughness={0.8} />
    </mesh>
  );
}

// Path object (stone/brick path)
function Path3D({
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
  const posX = x * CM_TO_M;
  const posZ = z * CM_TO_M;

  return (
    <mesh position={[posX, 0.02, posZ]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <planeGeometry args={[width, length]} />
      <meshStandardMaterial color={isDayMode ? "#8b7355" : "#5c4d3a"} />
    </mesh>
  );
}

// Gravel object
function Gravel3D({
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
  const posX = x * CM_TO_M;
  const posZ = z * CM_TO_M;

  return (
    <mesh position={[posX, 0.01, posZ]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <planeGeometry args={[width, length]} />
      <meshStandardMaterial color={isDayMode ? "#a0988a" : "#6b645a"} roughness={1} />
    </mesh>
  );
}

// Grass patch object
function Grass3D({
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
  const posX = x * CM_TO_M;
  const posZ = z * CM_TO_M;

  return (
    <mesh position={[posX, 0.015, posZ]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <planeGeometry args={[width, length]} />
      <meshStandardMaterial color={isDayMode ? "#5a8c4a" : "#3a5c32"} />
    </mesh>
  );
}

// Scene content
function SceneContent({
  beds,
  objects,
  plantings = [],
  isDayMode,
  initialPosition,
  initialDirection,
}: Omit<GardenWalkMode3DProps, "onExit">) {
  return (
    <>
      {/* Improved Lighting Setup */}
      {/* Ambient light - soft fill light */}
      <ambientLight intensity={isDayMode ? 0.4 : 0.15} />
      
      {/* Main directional light (sun) with shadows */}
      <directionalLight
        position={isDayMode ? [15, 25, 10] : [5, 15, 5]}
        intensity={isDayMode ? 1.2 : 0.2}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-far={100}
        shadow-camera-left={-30}
        shadow-camera-right={30}
        shadow-camera-top={30}
        shadow-camera-bottom={-30}
        shadow-bias={-0.0001}
        shadow-normalBias={0.02}
        color={isDayMode ? "#fff5e6" : "#6677aa"}
      />
      
      {/* Secondary fill light from opposite side */}
      <directionalLight
        position={isDayMode ? [-10, 10, -5] : [-5, 8, -3]}
        intensity={isDayMode ? 0.3 : 0.05}
        color={isDayMode ? "#e6f0ff" : "#334466"}
      />
      
      {/* Hemisphere light for natural sky/ground color blending */}
      <hemisphereLight
        args={[
          isDayMode ? "#87ceeb" : "#1a1a3a", // sky color
          isDayMode ? "#3d5c2e" : "#1a2d18", // ground color
          isDayMode ? 0.5 : 0.2
        ]}
      />
      
      {/* Point light for subtle warmth near ground level */}
      {isDayMode && (
        <pointLight
          position={[0, 3, 0]}
          intensity={0.3}
          color="#ffeecc"
          distance={20}
          decay={2}
        />
      )}
      
      {/* Night mode moon light */}
      {!isDayMode && (
        <pointLight
          position={[20, 30, 20]}
          intensity={0.15}
          color="#aabbff"
          distance={100}
        />
      )}
      
      {isDayMode && <Sky sunPosition={[100, 50, 100]} turbidity={8} rayleigh={0.5} />}
      
      {/* Camera controller */}
      <FirstPersonController
        initialPosition={initialPosition}
        initialDirection={initialDirection}
      />

      {/* Ground */}
      <Ground isDayMode={isDayMode} />

      {/* Beds */}
      {beds.map((bed) => (
        <Bed3D key={bed.id} bed={bed} isDayMode={isDayMode} plantings={plantings} />
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
              <Shrub3D
                key={obj.id}
                x={obj.x}
                z={obj.y}
                w={obj.w}
                h={obj.h}
                isDayMode={isDayMode}
              />
            );
          case "woodchips":
            return (
              <Woodchips3D
                key={obj.id}
                x={obj.x}
                z={obj.y}
                w={obj.w}
                h={obj.h}
                isDayMode={isDayMode}
              />
            );
          case "tiles":
            return (
              <Tiles3D
                key={obj.id}
                x={obj.x}
                z={obj.y}
                w={obj.w}
                h={obj.h}
                isDayMode={isDayMode}
              />
            );
          case "path":
            return (
              <Path3D
                key={obj.id}
                x={obj.x}
                z={obj.y}
                w={obj.w}
                h={obj.h}
                isDayMode={isDayMode}
              />
            );
          case "gravel":
            return (
              <Gravel3D
                key={obj.id}
                x={obj.x}
                z={obj.y}
                w={obj.w}
                h={obj.h}
                isDayMode={isDayMode}
              />
            );
          case "grass":
            return (
              <Grass3D
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
  plantings = [],
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
              plantings={plantings}
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
