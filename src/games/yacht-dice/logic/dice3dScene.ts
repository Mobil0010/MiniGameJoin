import type {
  Material,
  Mesh,
  PerspectiveCamera,
  Quaternion,
  Raycaster,
  Scene,
  Sprite,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three'
import type { RigidBody, World } from '@dimforge/rapier3d-compat'
import type { DiceValue, Die } from '../types/yacht'

const DIE_SIZE = 1.34
const DIE_HALF = DIE_SIZE / 2
const BOARD_HALF_WIDTH = 5.25
const BOARD_HALF_DEPTH = 1.72
const FLOOR_TOP = 0
const SETTLE_DURATION_MS = 430
const FIXED_TIMESTEP = 1 / 60
const BASE_CAMERA_FOV = 31
const BASE_CAMERA_ASPECT = 45 / 14

const DESKTOP_SLOT_X = [-3.65, -1.82, 0, 1.82, 3.65]
const MOBILE_SLOT_COORDINATES: Array<[number, number]> = [
  [-1.7, -0.78],
  [0, -0.78],
  [1.7, -0.78],
  [-0.86, 0.82],
  [0.86, 0.82],
]

type ThreeModule = typeof import('three')
type RapierModule = typeof import('@dimforge/rapier3d-compat')

interface DiceRecord {
  id: number
  mesh: Mesh
  body: RigidBody
  holdOutline: Mesh
  keepLabel: Sprite
  isHeld: boolean
  value: DiceValue | null
  settleStartPosition: Vector3
  settleTargetPosition: Vector3
  settleStartRotation: Quaternion
  settleTargetRotation: Quaternion
}

export interface Dice3DScene {
  setDice: (dice: readonly Die[]) => void
  startRoll: (dice: readonly Die[]) => void
  settle: (dice: readonly Die[]) => void
  hitTest: (normalizedX: number, normalizedY: number) => number | null
  setHoveredDie: (dieId: number | null) => void
  canInteract: () => boolean
  resize: () => void
  dispose: () => void
}

interface CreateDice3DSceneOptions {
  canvas: HTMLCanvasElement
  dice: readonly Die[]
  onBusyChange: (isBusy: boolean) => void
  signal?: AbortSignal
}

let rapierModulePromise: Promise<RapierModule> | null = null

async function loadRapier() {
  if (!rapierModulePromise) {
    rapierModulePromise = import('@dimforge/rapier3d-compat').then(
      async (module) => {
        await module.init()
        return module
      },
    )
  }
  return rapierModulePromise
}

const PIP_LAYOUTS: Record<DiceValue, Array<[number, number]>> = {
  1: [[0, 0]],
  2: [
    [-1, -1],
    [1, 1],
  ],
  3: [
    [-1, -1],
    [0, 0],
    [1, 1],
  ],
  4: [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ],
  5: [
    [-1, -1],
    [1, -1],
    [0, 0],
    [-1, 1],
    [1, 1],
  ],
  6: [
    [-1, -1],
    [1, -1],
    [-1, 0],
    [1, 0],
    [-1, 1],
    [1, 1],
  ],
}

function createFaceTexture(three: ThreeModule, value: DiceValue | '?') {
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 256
  const context = canvas.getContext('2d')
  if (!context) {
    throw new Error('주사위 텍스처를 만들 수 없습니다.')
  }

  const gradient = context.createLinearGradient(0, 0, 256, 256)
  gradient.addColorStop(0, '#fffef9')
  gradient.addColorStop(0.54, '#fbfaf5')
  gradient.addColorStop(1, '#ece9df')
  context.fillStyle = gradient
  context.fillRect(0, 0, 256, 256)

  const surfaceGlow = context.createRadialGradient(76, 66, 6, 128, 128, 176)
  surfaceGlow.addColorStop(0, 'rgba(255, 255, 255, 0.42)')
  surfaceGlow.addColorStop(1, 'rgba(215, 210, 198, 0.08)')
  context.fillStyle = surfaceGlow
  context.fillRect(0, 0, 256, 256)

  if (value === '?') {
    context.fillStyle = '#9da7ba'
    context.font = '800 136px system-ui, sans-serif'
    context.textAlign = 'center'
    context.textBaseline = 'middle'
    context.fillText('?', 128, 137)
  } else {
    const distance = 67
    const radius = value === 1 ? 29 : 23
    const pipColor = value === 1 ? '#df1f2d' : '#111111'
    const pipEdgeColor = value === 1 ? '#9f101d' : '#000000'
    for (const [column, row] of PIP_LAYOUTS[value]) {
      const centerX = 128 + column * distance
      const centerY = 128 + row * distance
      const pipGradient = context.createRadialGradient(
        centerX - radius * 0.28,
        centerY - radius * 0.3,
        radius * 0.12,
        centerX,
        centerY,
        radius,
      )
      pipGradient.addColorStop(0, value === 1 ? '#ff5260' : '#444444')
      pipGradient.addColorStop(0.48, pipColor)
      pipGradient.addColorStop(1, pipEdgeColor)

      context.save()
      context.shadowColor = 'rgba(35, 28, 22, 0.32)'
      context.shadowBlur = 5
      context.shadowOffsetY = 2
      context.beginPath()
      context.arc(centerX, centerY, radius, 0, Math.PI * 2)
      context.fillStyle = pipGradient
      context.fill()
      context.restore()
    }
  }

  const texture = new three.CanvasTexture(canvas)
  texture.colorSpace = three.SRGBColorSpace
  texture.anisotropy = 4
  return texture
}

function createDiceMaterials(three: ThreeModule) {
  // BoxGeometry material order: +X, -X, +Y, -Y, +Z, -Z.
  const faceValues: DiceValue[] = [3, 4, 1, 6, 2, 5]
  const numbered = faceValues.map(
    (value) =>
      new three.MeshStandardMaterial({
        map: createFaceTexture(three, value),
        roughness: 0.48,
        metalness: 0.02,
      }),
  )
  const question = Array.from(
    { length: 6 },
    () =>
      new three.MeshStandardMaterial({
        map: createFaceTexture(three, '?'),
        roughness: 0.58,
        metalness: 0,
      }),
  )
  return { numbered, question }
}

function createKeepLabel(three: ThreeModule) {
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 96
  const context = canvas.getContext('2d')
  if (!context) {
    throw new Error('보관 표시를 만들 수 없습니다.')
  }

  context.fillStyle = '#5b4cf0'
  context.beginPath()
  context.roundRect(4, 4, 248, 88, 28)
  context.fill()
  context.fillStyle = '#ffffff'
  context.font = '800 42px system-ui, sans-serif'
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  context.fillText('KEEP', 128, 50)

  const texture = new three.CanvasTexture(canvas)
  texture.colorSpace = three.SRGBColorSpace
  const material = new three.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: false,
  })
  const sprite = new three.Sprite(material)
  sprite.scale.set(1.18, 0.44, 1)
  sprite.renderOrder = 10
  return sprite
}

function slotPosition(
  three: ThreeModule,
  index: number,
  isCompactLayout: boolean,
) {
  const [x, z] = isCompactLayout
    ? (MOBILE_SLOT_COORDINATES[index] ?? [0, 0])
    : [DESKTOP_SLOT_X[index] ?? 0, 0]
  return new three.Vector3(x, FLOOR_TOP + DIE_HALF + 0.04, z)
}

function targetQuaternion(
  three: ThreeModule,
  value: DiceValue | null,
  dieId: number,
) {
  const faceRotation = new three.Quaternion()
  const axisX = new three.Vector3(1, 0, 0)
  const axisY = new three.Vector3(0, 1, 0)
  const axisZ = new three.Vector3(0, 0, 1)

  switch (value) {
    case 2:
      faceRotation.setFromAxisAngle(axisX, -Math.PI / 2)
      break
    case 3:
      faceRotation.setFromAxisAngle(axisZ, Math.PI / 2)
      break
    case 4:
      faceRotation.setFromAxisAngle(axisZ, -Math.PI / 2)
      break
    case 5:
      faceRotation.setFromAxisAngle(axisX, Math.PI / 2)
      break
    case 6:
      faceRotation.setFromAxisAngle(axisX, Math.PI)
      break
    default:
      faceRotation.identity()
  }

  const yaw = new three.Quaternion().setFromAxisAngle(
    axisY,
    ((dieId * 53) % 4) * (Math.PI / 2),
  )
  return yaw.multiply(faceRotation)
}

function setMeshTransformFromBody(record: DiceRecord) {
  const translation = record.body.translation()
  const rotation = record.body.rotation()
  record.mesh.position.set(translation.x, translation.y, translation.z)
  record.mesh.quaternion.set(rotation.x, rotation.y, rotation.z, rotation.w)
}

function disposeMaterial(material: Material) {
  const materialWithMap = material as Material & { map?: { dispose: () => void } }
  materialWithMap.map?.dispose()
  material.dispose()
}

export async function createDice3DScene({
  canvas,
  dice,
  onBusyChange,
  signal,
}: CreateDice3DSceneOptions): Promise<Dice3DScene> {
  const [three, rapier, roundedBoxModule] = await Promise.all([
    import('three'),
    loadRapier(),
    import('three/examples/jsm/geometries/RoundedBoxGeometry.js'),
  ])

  if (signal?.aborted) {
    throw new DOMException('3D 주사위 초기화가 취소되었습니다.', 'AbortError')
  }

  let isCompactLayout = window.matchMedia('(max-width: 760px)').matches

  const renderer: WebGLRenderer = new three.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
    powerPreference: 'high-performance',
  })
  renderer.setClearColor(0xedf1f7, 1)
  renderer.outputColorSpace = three.SRGBColorSpace
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = three.PCFSoftShadowMap

  const scene: Scene = new three.Scene()
  scene.fog = new three.Fog(0xedf1f7, 11.5, 20)

  const camera: PerspectiveCamera = new three.PerspectiveCamera(
    BASE_CAMERA_FOV,
    BASE_CAMERA_ASPECT,
    0.1,
    40,
  )
  const rollingCameraPosition = new three.Vector3(0, 7.5, 8.2)
  const overviewCameraPosition = new three.Vector3(0, 6.6, 0.01)
  const cameraTarget = new three.Vector3(0, 0.15, 0)
  const createCameraRotation = (position: Vector3, up: Vector3) => {
    const targetCamera = new three.PerspectiveCamera()
    targetCamera.position.copy(position)
    targetCamera.up.copy(up)
    targetCamera.lookAt(cameraTarget)
    return targetCamera.quaternion.clone()
  }
  const rollingCameraRotation = createCameraRotation(
    rollingCameraPosition,
    new three.Vector3(0, 1, 0),
  )
  const overviewCameraRotation = createCameraRotation(
    overviewCameraPosition,
    new three.Vector3(0, 0, -1),
  )
  camera.position.copy(overviewCameraPosition)
  camera.quaternion.copy(overviewCameraRotation)

  scene.add(new three.HemisphereLight(0xffffff, 0x8590aa, 2.35))
  const keyLight = new three.DirectionalLight(0xffffff, 3.1)
  keyLight.position.set(-4.5, 8.5, 5.5)
  keyLight.castShadow = true
  keyLight.shadow.mapSize.set(1024, 1024)
  keyLight.shadow.camera.left = -7
  keyLight.shadow.camera.right = 7
  keyLight.shadow.camera.top = 5
  keyLight.shadow.camera.bottom = -5
  scene.add(keyLight)

  const trayGeometry = new roundedBoxModule.RoundedBoxGeometry(11.1, 0.3, 3.7, 5, 0.22)
  const trayMaterial = new three.MeshStandardMaterial({
    color: 0x68452e,
    roughness: 0.84,
    metalness: 0.02,
  })
  const tray = new three.Mesh(trayGeometry, trayMaterial)
  tray.position.y = -0.17
  tray.receiveShadow = true
  scene.add(tray)

  const innerTrayGeometry = new three.PlaneGeometry(10.45, 3.08)
  const innerTrayMaterial = new three.MeshStandardMaterial({
    color: 0x9b6b43,
    roughness: 0.94,
    metalness: 0,
  })
  const innerTray = new three.Mesh(innerTrayGeometry, innerTrayMaterial)
  innerTray.rotation.x = -Math.PI / 2
  innerTray.position.y = 0.005
  innerTray.receiveShadow = true
  scene.add(innerTray)

  const world: World = new rapier.World({ x: 0, y: -18, z: 0 })
  const floorBody = world.createRigidBody(
    rapier.RigidBodyDesc.fixed().setTranslation(0, -0.16, 0),
  )
  world.createCollider(
    rapier.ColliderDesc.cuboid(BOARD_HALF_WIDTH, 0.16, BOARD_HALF_DEPTH)
      .setFriction(0.82)
      .setRestitution(0.42),
    floorBody,
  )

  const wallDefinitions = [
    { x: -BOARD_HALF_WIDTH - 0.08, z: 0, halfX: 0.1, halfZ: BOARD_HALF_DEPTH },
    { x: BOARD_HALF_WIDTH + 0.08, z: 0, halfX: 0.1, halfZ: BOARD_HALF_DEPTH },
    { x: 0, z: -BOARD_HALF_DEPTH - 0.08, halfX: BOARD_HALF_WIDTH, halfZ: 0.1 },
    { x: 0, z: BOARD_HALF_DEPTH + 0.08, halfX: BOARD_HALF_WIDTH, halfZ: 0.1 },
  ]
  for (const wall of wallDefinitions) {
    const body = world.createRigidBody(
      rapier.RigidBodyDesc.fixed().setTranslation(wall.x, 1.05, wall.z),
    )
    world.createCollider(
      rapier.ColliderDesc.cuboid(wall.halfX, 1.2, wall.halfZ)
        .setFriction(0.55)
        .setRestitution(0.6),
      body,
    )
  }

  const materials = createDiceMaterials(three)
  const dieGeometry = new roundedBoxModule.RoundedBoxGeometry(
    DIE_SIZE,
    DIE_SIZE,
    DIE_SIZE,
    5,
    0.17,
  )
  const outlineMaterial = new three.MeshBasicMaterial({
    color: 0x5b4cf0,
    side: three.BackSide,
  })

  const records: DiceRecord[] = dice.map((die, index) => {
    const position = slotPosition(three, index, isCompactLayout)
    const rotation = targetQuaternion(three, die.value, die.id)
    const body = world.createRigidBody(
      rapier.RigidBodyDesc.fixed()
        .setTranslation(position.x, position.y, position.z)
        .setRotation({ x: rotation.x, y: rotation.y, z: rotation.z, w: rotation.w })
        .setLinearDamping(0.32)
        .setAngularDamping(0.27)
        .setCcdEnabled(true),
    )
    world.createCollider(
      rapier.ColliderDesc.roundCuboid(
        DIE_HALF - 0.085,
        DIE_HALF - 0.085,
        DIE_HALF - 0.085,
        0.085,
      )
        .setDensity(1.1)
        .setFriction(0.7)
        .setRestitution(0.52),
      body,
    )

    const mesh = new three.Mesh(
      dieGeometry,
      die.value === null ? materials.question : materials.numbered,
    )
    mesh.position.copy(position)
    mesh.quaternion.copy(rotation)
    mesh.castShadow = true
    mesh.receiveShadow = true
    mesh.userData.dieId = die.id
    scene.add(mesh)

    const holdOutline = new three.Mesh(dieGeometry, outlineMaterial)
    holdOutline.scale.setScalar(1.07)
    holdOutline.visible = die.isHeld
    holdOutline.renderOrder = 1
    mesh.add(holdOutline)

    const keepLabel = createKeepLabel(three)
    keepLabel.position.set(
      position.x,
      0.16,
      position.z + (isCompactLayout ? 0.78 : 1.08),
    )
    keepLabel.visible = die.isHeld
    scene.add(keepLabel)

    return {
      id: die.id,
      mesh,
      body,
      holdOutline,
      keepLabel,
      isHeld: die.isHeld,
      value: die.value,
      settleStartPosition: position.clone(),
      settleTargetPosition: position.clone(),
      settleStartRotation: rotation.clone(),
      settleTargetRotation: rotation.clone(),
    }
  })

  const raycaster: Raycaster = new three.Raycaster()
  const pointer: Vector2 = new three.Vector2()
  let phase: 'idle' | 'rolling' | 'settling' = 'idle'
  let animationFrame: number | null = null
  let previousFrame = performance.now()
  let physicsAccumulator = 0
  let settleStartedAt = 0
  let hoveredDieId: number | null = null
  let disposed = false
  const cameraSettleStartPosition = camera.position.clone()
  const cameraSettleStartRotation = camera.quaternion.clone()

  const render = () => renderer.render(scene, camera)

  const updateIndicators = () => {
    for (const record of records) {
      const isHovered = record.id === hoveredDieId && phase === 'idle'
      const scale = isHovered ? 1.055 : 1
      record.mesh.scale.setScalar(scale)
      record.holdOutline.visible = record.isHeld
      record.keepLabel.visible = record.isHeld && phase !== 'rolling'
      record.keepLabel.position.set(
        record.mesh.position.x,
        0.16,
        record.mesh.position.z + (isCompactLayout ? 0.78 : 1.08),
      )
    }
  }

  const finishSettlement = () => {
    phase = 'idle'
    camera.position.copy(overviewCameraPosition)
    camera.quaternion.copy(overviewCameraRotation)
    for (const record of records) {
      record.mesh.position.copy(record.settleTargetPosition)
      record.mesh.quaternion.copy(record.settleTargetRotation)
      record.body.setBodyType(rapier.RigidBodyType.Fixed, false)
      record.body.setTranslation(record.settleTargetPosition, false)
      record.body.setRotation(record.settleTargetRotation, false)
    }
    updateIndicators()
    render()
    onBusyChange(false)
  }

  const animate = (timestamp: number) => {
    if (disposed) {
      return
    }

    const deltaSeconds = Math.min((timestamp - previousFrame) / 1000, 0.05)
    previousFrame = timestamp

    if (phase === 'rolling') {
      physicsAccumulator += deltaSeconds
      while (physicsAccumulator >= FIXED_TIMESTEP) {
        world.timestep = FIXED_TIMESTEP
        world.step()
        physicsAccumulator -= FIXED_TIMESTEP
      }
      for (const record of records) {
        setMeshTransformFromBody(record)
      }
    } else if (phase === 'settling') {
      const progress = Math.min((timestamp - settleStartedAt) / SETTLE_DURATION_MS, 1)
      const eased = 1 - Math.pow(1 - progress, 3)
      for (const record of records) {
        record.mesh.position.lerpVectors(
          record.settleStartPosition,
          record.settleTargetPosition,
          eased,
        )
        record.mesh.quaternion.slerpQuaternions(
          record.settleStartRotation,
          record.settleTargetRotation,
          eased,
        )
      }
      camera.position.lerpVectors(
        cameraSettleStartPosition,
        overviewCameraPosition,
        eased,
      )
      camera.quaternion.slerpQuaternions(
        cameraSettleStartRotation,
        overviewCameraRotation,
        eased,
      )
      if (progress >= 1) {
        finishSettlement()
      }
    }

    updateIndicators()
    render()
    if (phase !== 'idle') {
      animationFrame = window.requestAnimationFrame(animate)
    } else {
      animationFrame = null
    }
  }

  const startAnimationLoop = () => {
    if (animationFrame !== null) {
      return
    }
    previousFrame = performance.now()
    animationFrame = window.requestAnimationFrame(animate)
  }

  const setDice = (nextDice: readonly Die[]) => {
    for (const [index, record] of records.entries()) {
      const die = nextDice.find((candidate) => candidate.id === record.id)
      if (!die) {
        continue
      }
      record.isHeld = die.isHeld
      record.value = die.value
      record.mesh.material = die.value === null ? materials.question : materials.numbered

      if (phase === 'idle') {
        const position = slotPosition(three, index, isCompactLayout)
        record.mesh.position.copy(position)
        record.body.setBodyType(rapier.RigidBodyType.Fixed, false)
        record.body.setTranslation(position, false)
      }
    }
    updateIndicators()
    if (phase === 'idle') {
      render()
    }
  }

  const startRoll = (nextDice: readonly Die[]) => {
    setDice(nextDice)
    phase = 'rolling'
    camera.position.copy(rollingCameraPosition)
    camera.quaternion.copy(rollingCameraRotation)
    hoveredDieId = null
    physicsAccumulator = 0
    onBusyChange(true)

    for (const [index, record] of records.entries()) {
      const position = slotPosition(three, index, isCompactLayout)
      if (record.isHeld) {
        record.body.setBodyType(rapier.RigidBodyType.Fixed, true)
        record.body.setTranslation(position, true)
        continue
      }

      record.mesh.material = materials.numbered
      const randomRotation = new three.Quaternion(
        Math.random() - 0.5,
        Math.random() - 0.5,
        Math.random() - 0.5,
        Math.random() - 0.5,
      ).normalize()
      record.body.setBodyType(rapier.RigidBodyType.Dynamic, true)
      record.body.setTranslation(
        {
          x: (index - 2) * 1.22 + (Math.random() - 0.5) * 0.3,
          y: 2.05 + Math.random() * 0.75,
          z: (Math.random() - 0.5) * 0.95,
        },
        true,
      )
      record.body.setRotation(randomRotation, true)
      record.body.setLinvel(
        {
          x: (Math.random() - 0.5) * 6.4,
          y: 2.1 + Math.random() * 2.4,
          z: (Math.random() - 0.5) * 5.6,
        },
        true,
      )
      record.body.setAngvel(
        {
          x: (Math.random() - 0.5) * 17,
          y: (Math.random() - 0.5) * 17,
          z: (Math.random() - 0.5) * 17,
        },
        true,
      )
    }
    updateIndicators()
    startAnimationLoop()
  }

  const settle = (nextDice: readonly Die[]) => {
    setDice(nextDice)
    phase = 'settling'
    settleStartedAt = performance.now()
    cameraSettleStartPosition.copy(camera.position)
    cameraSettleStartRotation.copy(camera.quaternion)
    onBusyChange(true)

    for (const [index, record] of records.entries()) {
      record.settleStartPosition.copy(record.mesh.position)
      record.settleStartRotation.copy(record.mesh.quaternion)
      record.settleTargetPosition.copy(
        slotPosition(three, index, isCompactLayout),
      )
      record.settleTargetRotation.copy(targetQuaternion(three, record.value, record.id))
      record.body.setBodyType(rapier.RigidBodyType.Fixed, false)
    }
    startAnimationLoop()
  }

  const resize = () => {
    const bounds = canvas.getBoundingClientRect()
    if (bounds.width <= 0 || bounds.height <= 0) {
      return
    }
    const isCompact = window.matchMedia('(max-width: 760px)').matches
    if (isCompactLayout !== isCompact) {
      isCompactLayout = isCompact
      if (phase === 'idle') {
        for (const [index, record] of records.entries()) {
          const position = slotPosition(three, index, isCompactLayout)
          record.mesh.position.copy(position)
          record.body.setTranslation(position, false)
        }
        updateIndicators()
      }
    }
    const nextAspect = bounds.width / bounds.height
    const layoutCameraFov = isCompact ? 44 : BASE_CAMERA_FOV
    const layoutCameraAspect = isCompact ? 4 / 3 : BASE_CAMERA_ASPECT
    const baseHalfFov = three.MathUtils.degToRad(layoutCameraFov / 2)
    const fittedVerticalFov = three.MathUtils.radToDeg(
      2 *
        Math.atan(
          (Math.tan(baseHalfFov) * layoutCameraAspect) / nextAspect,
        ),
    )
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isCompact ? 1.45 : 1.85))
    renderer.setSize(bounds.width, bounds.height, false)
    camera.aspect = nextAspect
    camera.fov = Math.max(layoutCameraFov, fittedVerticalFov)
    camera.updateProjectionMatrix()
    render()
  }

  const hitTest = (normalizedX: number, normalizedY: number) => {
    if (phase !== 'idle') {
      return null
    }
    pointer.set(normalizedX, normalizedY)
    raycaster.setFromCamera(pointer, camera)
    const intersections = raycaster.intersectObjects(records.map((record) => record.mesh), false)
    const hit = intersections[0]?.object
    return typeof hit?.userData.dieId === 'number' ? hit.userData.dieId : null
  }

  const setHoveredDie = (dieId: number | null) => {
    hoveredDieId = dieId
    updateIndicators()
    if (phase === 'idle') {
      render()
    }
  }

  resize()
  updateIndicators()
  render()

  return {
    setDice,
    startRoll,
    settle,
    hitTest,
    setHoveredDie,
    canInteract: () => phase === 'idle',
    resize,
    dispose: () => {
      disposed = true
      if (animationFrame !== null) {
        window.cancelAnimationFrame(animationFrame)
      }
      scene.traverse((object) => {
        const mesh = object as Mesh
        mesh.geometry?.dispose()
        if (Array.isArray(mesh.material)) {
          for (const material of mesh.material) {
            disposeMaterial(material)
          }
        } else if (mesh.material) {
          disposeMaterial(mesh.material)
        }
      })
      world.free()
      renderer.dispose()
    },
  }
}
