import { useEffect, useRef } from 'react'
import asilbek from '../assets/asilbek.jpg'
import { readMouth } from '../lib/lipsync'

// Drawn in the portrait's own pixel space, measured from the artwork itself.
const IMAGE_WIDTH = 765
const IMAGE_HEIGHT = 1024

// Asilbek is painted mid-smile with his upper teeth showing (teeth occupy
// x 364-408, y 400-410). Rather than cover them, the opening is anchored just
// below the teeth and grows downward, which is how a real jaw moves.
const MOUTH_X = 386
const MOUTH_TOP = 407

// Wide vowels ("i", "e") stretch the opening, rounded ones ("o", "u") pull it in.
const RX_WIDE = 27
const RX_ROUND = 17
// Capped so a fully open mouth stops short of his beard rather than merging into it.
const RY_MAX = 10.5

const MOUTH_INTERIOR = '#3d1a14'

// Frames blend toward the target so the mouth eases instead of snapping.
const SMOOTHING = 0.35

export default function Avatar({ speaking, listening, language = 'en' }) {
  const mouthRef = useRef(null)
  const innerRef = useRef(null)

  // Read inside the animation loop, which outlives any single render.
  const speakingRef = useRef(speaking)

  useEffect(() => {
    speakingRef.current = speaking
  }, [speaking])

  useEffect(() => {
    let frame = 0
    const current = { intensity: 0, roundness: 0.5 }

    const tick = () => {
      const target = speakingRef.current ? readMouth() : { intensity: 0, roundness: 0.5 }

      current.intensity += (target.intensity - current.intensity) * SMOOTHING
      current.roundness += (target.roundness - current.roundness) * SMOOTHING

      const { intensity, roundness } = current
      const group = mouthRef.current
      const inner = innerRef.current

      if (group && inner) {
        // Below this his painted smile reads better than anything drawn over it.
        if (intensity < 0.02) {
          group.style.opacity = '0'
        } else {
          group.style.opacity = '1'

          const rx = RX_WIDE - roundness * (RX_WIDE - RX_ROUND)
          const ry = Math.max(1.5, intensity * RY_MAX * (0.8 + roundness * 0.45))

          inner.setAttribute('rx', rx.toFixed(1))
          inner.setAttribute('ry', ry.toFixed(1))
          inner.setAttribute('cy', (MOUTH_TOP + ry).toFixed(1))
        }
      }

      frame = requestAnimationFrame(tick)
    }

    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [])

  const isUzbek = language === 'uz'
  const statusLabel = speaking
    ? isUzbek
      ? 'Gapiryapti'
      : 'Speaking'
    : listening
      ? isUzbek
        ? 'Tinglayapti'
        : 'Listening'
      : isUzbek
        ? 'Tayyor'
        : 'Ready'

  const statusClass = speaking ? 'speaking' : listening ? 'listening' : 'idle'

  return (
    <div className="avatar-stage avatar-stage-center" aria-label="AI teacher avatar">
      <div className={`avatar-portrait portrait-${statusClass}`}>
        <div className="portrait-card portrait-card-photo">
          <img src={asilbek} alt="Asilbek, your Uzbek history teacher" className="portrait-img" />

          <svg
            className="mouth-overlay"
            viewBox={`0 0 ${IMAGE_WIDTH} ${IMAGE_HEIGHT}`}
            aria-hidden="true"
          >
            <defs>
              {/* Softens the edge so the shape sits in the painting instead of
                  looking pasted on top of it. */}
              <filter id="mouth-feather" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="1.8" />
              </filter>
            </defs>

            <g ref={mouthRef} style={{ opacity: 0 }} filter="url(#mouth-feather)">
              <ellipse
                ref={innerRef}
                cx={MOUTH_X}
                cy={MOUTH_TOP}
                rx={RX_WIDE}
                ry="1.5"
                fill={MOUTH_INTERIOR}
              />
            </g>
          </svg>
        </div>

        <div className="avatar-badge">
          <span className={`status-pill ${statusClass}`}>{statusLabel}</span>
        </div>
      </div>
    </div>
  )
}
