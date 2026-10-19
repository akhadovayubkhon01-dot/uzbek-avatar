import { useEffect, useRef } from 'react'
import asilbek from '../assets/asilbek.jpg'
import dilafruz from '../assets/dilafruz.jpg'
import { readMouth } from '../lib/lipsync'

// Both portraits are 765x1024, so the overlay shares one coordinate space.
// Mouth positions are measured from each artwork in its own pixels.
const IMAGE_WIDTH = 765
const IMAGE_HEIGHT = 1024

// Wide vowels ("i", "e") stretch the opening (rxWide), rounded ones ("o", "u")
// pull it in (rxRound). ryMax caps how far it opens.
const PORTRAITS = {
  // Asilbek is painted mid-smile with his upper teeth showing (teeth occupy
  // x 364-408, y 400-410). Rather than cover them, the opening is anchored just
  // below the teeth and grows downward, which is how a real jaw moves. Capped so
  // a fully open mouth stops short of his beard.
  male: {
    src: asilbek,
    x: 386,
    y: 407,
    anchor: 'top',
    rxWide: 27,
    rxRound: 17,
    ryMax: 10.5,
  },
  // Dilafruz is painted with closed lips, so the opening is centred on the lip
  // line and parts both lips. Kept small so her lips stay visible around it.
  female: {
    src: dilafruz,
    x: 396,
    y: 402,
    anchor: 'center',
    rxWide: 20,
    rxRound: 12,
    ryMax: 6,
  },
}

const MOUTH_INTERIOR = '#3d1a14'

// Frames blend toward the target so the mouth eases instead of snapping.
const SMOOTHING = 0.35

export default function Avatar({
  speaking,
  listening,
  language = 'en',
  name = 'Asilbek',
  portrait = 'male',
}) {
  const face = PORTRAITS[portrait] ?? PORTRAITS.male

  // Read inside the animation loop, which outlives any single render.
  const faceRef = useRef(face)
  useEffect(() => {
    faceRef.current = face
  }, [face])

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

          const f = faceRef.current
          const rx = f.rxWide - roundness * (f.rxWide - f.rxRound)
          const ry = Math.max(1.5, intensity * f.ryMax * (0.8 + roundness * 0.45))
          const cy = f.anchor === 'top' ? f.y + ry : f.y

          inner.setAttribute('cx', String(f.x))
          inner.setAttribute('rx', rx.toFixed(1))
          inner.setAttribute('ry', ry.toFixed(1))
          inner.setAttribute('cy', cy.toFixed(1))
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
          <img src={face.src} alt={`${name}, your Uzbek history teacher`} className="portrait-img" />

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
                cx={face.x}
                cy={face.y}
                rx={face.rxWide}
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
