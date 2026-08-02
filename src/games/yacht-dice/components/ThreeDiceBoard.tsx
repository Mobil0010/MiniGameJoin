import { useEffect, useRef, useState, type PointerEvent } from 'react'
import type { Die } from '../types/yacht'
import {
  createDice3DScene,
  type Dice3DScene,
} from '../logic/dice3dScene'

interface ThreeDiceBoardProps {
  dice: readonly Die[]
  disabled: boolean
  isRolling: boolean
  onToggleHold: (dieId: number) => void
}

function ThreeDiceBoard({
  dice,
  disabled,
  isRolling,
  onToggleHold,
}: ThreeDiceBoardProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const sceneRef = useRef<Dice3DScene | null>(null)
  const latestDiceRef = useRef(dice)
  const isRollingRef = useRef(isRolling)
  const disabledRef = useRef(disabled)
  const previousRollingRef = useRef(isRolling)
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [isAnimating, setIsAnimating] = useState(isRolling)
  const [errorDetails, setErrorDetails] = useState('')
  const diceSignature = dice
    .map((die) => `${die.id}:${die.value ?? 0}:${Number(die.isHeld)}`)
    .join('|')

  useEffect(() => {
    latestDiceRef.current = dice
    isRollingRef.current = isRolling
    disabledRef.current = disabled
  }, [dice, disabled, isRolling])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) {
      return
    }

    let cancelled = false
    let resizeObserver: ResizeObserver | null = null
    let createdScene: Dice3DScene | null = null
    const abortController = new AbortController()

    const initialize = async () => {
      try {
        const scene = await createDice3DScene({
          canvas,
          dice: latestDiceRef.current,
          onBusyChange: setIsAnimating,
          signal: abortController.signal,
        })
        if (cancelled) {
          scene.dispose()
          return
        }

        createdScene = scene
        sceneRef.current = scene
        setLoadState('ready')
        resizeObserver = new ResizeObserver(() => scene.resize())
        resizeObserver.observe(canvas)

        if (isRollingRef.current) {
          scene.startRoll(latestDiceRef.current)
        } else {
          scene.setDice(latestDiceRef.current)
        }
      } catch (error) {
        console.error('3D 주사위 장면 초기화 실패', error)
        if (!cancelled) {
          setErrorDetails(
            error instanceof Error ? error.message : '알 수 없는 초기화 오류',
          )
          setLoadState('error')
          setIsAnimating(false)
        }
      }
    }

    void initialize()

    return () => {
      cancelled = true
      abortController.abort()
      resizeObserver?.disconnect()
      createdScene?.dispose()
      if (sceneRef.current === createdScene) {
        sceneRef.current = null
      }
    }
  }, [])

  useEffect(() => {
    sceneRef.current?.setDice(dice)
  }, [dice, diceSignature])

  useEffect(() => {
    const scene = sceneRef.current
    const wasRolling = previousRollingRef.current
    previousRollingRef.current = isRolling
    if (!scene) {
      return
    }

    if (isRolling && !wasRolling) {
      scene.startRoll(dice)
    } else if (!isRolling && wasRolling) {
      scene.settle(dice)
    }
  }, [dice, isRolling])

  const normalizedPointer = (event: PointerEvent<HTMLCanvasElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect()
    return {
      x: ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
      y: -((event.clientY - bounds.top) / bounds.height) * 2 + 1,
    }
  }

  const getPointedDie = (event: PointerEvent<HTMLCanvasElement>) => {
    const scene = sceneRef.current
    if (!scene || disabledRef.current || !scene.canInteract()) {
      return null
    }
    const pointer = normalizedPointer(event)
    return scene.hitTest(pointer.x, pointer.y)
  }

  return (
    <div
      className={`dice-3d-board ${isAnimating ? 'dice-3d-board-rolling' : ''}`}
      aria-busy={loadState === 'loading' || isAnimating}
    >
      <canvas
        ref={canvasRef}
        className="dice-3d-canvas"
        role="img"
        aria-label="실시간 3D 물리 연산으로 굴러가는 주사위 영역"
        onPointerMove={(event) => {
          const dieId = getPointedDie(event)
          sceneRef.current?.setHoveredDie(dieId)
          event.currentTarget.style.cursor = dieId === null ? 'default' : 'pointer'
        }}
        onPointerLeave={(event) => {
          sceneRef.current?.setHoveredDie(null)
          event.currentTarget.style.cursor = 'default'
        }}
        onPointerUp={(event) => {
          const dieId = getPointedDie(event)
          if (dieId !== null) {
            onToggleHold(dieId)
          }
        }}
      />

      {loadState === 'loading' && (
        <div className="dice-3d-status" role="status">
          3D 주사위 준비 중...
        </div>
      )}
      {loadState === 'error' && (
        <div className="dice-3d-status dice-3d-status-error" role="alert">
          <strong>3D 주사위를 불러오지 못했습니다.</strong>
          {import.meta.env.DEV && errorDetails && <small>{errorDetails}</small>}
        </div>
      )}

      <div className="dice-accessible-controls" aria-label="주사위 보관 선택">
        {dice.map((die) => (
          <button
            key={die.id}
            type="button"
            aria-label={
              die.value === null
                ? `${die.id}번째 아직 굴리지 않은 주사위`
                : `${die.id}번째 ${die.value}번 주사위${die.isHeld ? ', 보관 중' : ''}`
            }
            aria-pressed={die.isHeld}
            disabled={disabled || loadState !== 'ready' || isAnimating}
            onClick={() => onToggleHold(die.id)}
            onFocus={() => sceneRef.current?.setHoveredDie(die.id)}
            onBlur={() => sceneRef.current?.setHoveredDie(null)}
          >
            {die.value ?? '?'}
          </button>
        ))}
      </div>
    </div>
  )
}

export default ThreeDiceBoard
