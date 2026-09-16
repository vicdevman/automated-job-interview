'use client';

import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';

/**
 * PRD §11.4 — a hand-built animated SVG rig. No paid service, no dependency
 * beyond the animation library, full control.
 *
 * The thing that sells "alive" is the mouth: it is driven by the real amplitude
 * of the audio being spoken (sampled from an AnalyserNode on the playback node)
 * rather than by a canned loop. Everything else — blink, sway, brow drift — is
 * secondary, and all of it is dropped under prefers-reduced-motion except the
 * mouth sync, which is functional rather than decorative.
 */

export type AvatarState = 'idle' | 'speaking' | 'listening' | 'thinking';

export interface InterviewerAvatarProps {
  state: AvatarState;
  /** 0..1, sampled per frame from the TTS playback analyser. */
  amplitude: number;
  /** Any stable string. Derives the face so one interview looks consistent. */
  seed: string;
  size?: number;
}

/** Deterministic hash → the face is stable for a given session. */
function hash(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

const SKINS = ['#C98B62', '#A96B44', '#8A5433', '#E0AB80', '#6F4327'];
const HAIRS = ['#221A16', '#2E2320', '#3E2C22', '#171310'];
const SHIRTS = ['#3A4356', '#44405C', '#2F4A46', '#4A3F4E', '#35505A'];

export function InterviewerAvatar({
  state,
  amplitude,
  seed,
  size = 168,
}: InterviewerAvatarProps) {
  const reduceMotion = useReducedMotion();

  const face = useMemo(() => {
    const h = hash(seed);
    return {
      skin: SKINS[h % SKINS.length]!,
      hair: HAIRS[(h >> 3) % HAIRS.length]!,
      shirt: SHIRTS[(h >> 6) % SHIRTS.length]!,
      // Small per-seed variation so two faces are not identical.
      eyeGap: 17 + ((h >> 9) % 3),
      browLift: (h >> 12) % 3,
      hairHeight: 18 + ((h >> 15) % 6),
    };
  }, [seed]);

  // ── mouth: rAF-smoothed amplitude ────────────────────────────────────────
  const [mouthOpen, setMouthOpen] = useState(0);
  const amplitudeRef = useRef(0);
  amplitudeRef.current = state === 'speaking' ? amplitude : 0;

  useEffect(() => {
    let raf = 0;
    let current = 0;

    const tick = () => {
      const target = amplitudeRef.current;
      // Asymmetric smoothing: open fast so consonants land on the beat, close
      // slower so the mouth does not flicker between syllables.
      const rate = target > current ? 0.55 : 0.18;
      current += (target - current) * rate;
      setMouthOpen(current < 0.004 ? 0 : current);
      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  // ── blink: random 2–6s, 120ms close/open ─────────────────────────────────
  const [blinking, toggleBlink] = useReducer((b: boolean) => !b, false);

  useEffect(() => {
    if (reduceMotion) return;
    let timer: ReturnType<typeof setTimeout>;

    const schedule = () => {
      timer = setTimeout(
        () => {
          toggleBlink();
          setTimeout(() => {
            toggleBlink();
            schedule();
          }, 120);
        },
        2000 + Math.random() * 4000,
      );
    };

    schedule();
    return () => clearTimeout(timer);
  }, [reduceMotion]);

  // ── discrete state poses ─────────────────────────────────────────────────
  const pose = {
    idle: { rotate: 0, y: 0, browY: 0, pupilX: 0, pupilY: 0 },
    speaking: { rotate: 0, y: 0, browY: -0.5, pupilX: 0, pupilY: 0 },
    // Head tilts ~3°, brows raise slightly.
    listening: { rotate: 3, y: 0, browY: -2, pupilX: 0, pupilY: 0.5 },
    // Eyes glance up-left, brows furrow.
    thinking: { rotate: -2, y: -1, browY: 1.5, pupilX: -2, pupilY: -2 },
  }[state];

  const mouthHeight = blinking ? 2.5 : 2.5 + mouthOpen * 15;
  const mouthWidth = 18 - mouthOpen * 4;

  return (
    <div
      style={{ width: size, height: size }}
      role="img"
      aria-label={
        state === 'speaking'
          ? 'The interviewer is speaking'
          : state === 'listening'
            ? 'The interviewer is listening'
            : state === 'thinking'
              ? 'The interviewer is thinking'
              : 'The interviewer'
      }
    >
      <motion.svg
        viewBox="0 0 120 120"
        width={size}
        height={size}
        // Idle sway: ±2px over 4s, dropped under reduced motion.
        animate={
          reduceMotion
            ? { rotate: pose.rotate, y: pose.y }
            : { rotate: pose.rotate, y: [pose.y - 1.5, pose.y + 1.5, pose.y - 1.5] }
        }
        transition={{
          rotate: { type: 'spring', stiffness: 120, damping: 18 },
          y: reduceMotion
            ? { duration: 0.3 }
            : { duration: 4, repeat: Infinity, ease: 'easeInOut' },
        }}
      >
        <defs>
          <clipPath id={`head-${seed}`}>
            <ellipse cx="60" cy="54" rx="31" ry="35" />
          </clipPath>
        </defs>

        {/* listening ring — the one affordance that says "your turn" */}
        {state === 'listening' && (
          <motion.circle
            cx="60"
            cy="60"
            r="50"
            fill="none"
            stroke="var(--accent)"
            strokeWidth="1.5"
            initial={{ opacity: 0, scale: 0.94 }}
            animate={{ opacity: [0.35, 0.12, 0.35], scale: 1 }}
            transition={
              reduceMotion
                ? { duration: 0.3 }
                : { opacity: { duration: 2.4, repeat: Infinity, ease: 'easeInOut' } }
            }
          />
        )}

        {/* shoulders */}
        <path d="M22 120 Q22 95 60 95 Q98 95 98 120 Z" fill={face.shirt} />
        <path d="M52 95 Q60 104 68 95 L68 92 Q60 96 52 92 Z" fill={face.skin} opacity="0.9" />

        {/* neck */}
        <rect x="52" y="80" width="16" height="16" rx="6" fill={face.skin} />
        <ellipse cx="60" cy="82" rx="8" ry="3" fill="#000" opacity="0.12" />

        {/* head */}
        <ellipse cx="60" cy="54" rx="31" ry="35" fill={face.skin} />

        {/* ears */}
        <ellipse cx="29" cy="56" rx="4.5" ry="7" fill={face.skin} />
        <ellipse cx="91" cy="56" rx="4.5" ry="7" fill={face.skin} />

        {/* hair block — the DiceBear-ish geometric read */}
        <g clipPath={`url(#head-${seed})`}>
          <rect x="29" y="19" width="62" height={face.hairHeight} fill={face.hair} />
          <ellipse cx="60" cy={19 + face.hairHeight} rx="31" ry="7" fill={face.skin} />
        </g>

        {/* brows */}
        <motion.g
          animate={{ y: pose.browY }}
          transition={{ type: 'spring', stiffness: 200, damping: 20 }}
        >
          <rect
            x={60 - face.eyeGap - 7}
            y={44 - face.browLift}
            width="14"
            height="2.6"
            rx="1.3"
            fill={face.hair}
            transform={state === 'thinking' ? `rotate(6 ${60 - face.eyeGap} 45)` : undefined}
          />
          <rect
            x={60 + face.eyeGap - 7}
            y={44 - face.browLift}
            width="14"
            height="2.6"
            rx="1.3"
            fill={face.hair}
            transform={state === 'thinking' ? `rotate(-6 ${60 + face.eyeGap} 45)` : undefined}
          />
        </motion.g>

        {/* eyes */}
        <Eye cx={60 - face.eyeGap} blinking={blinking} pose={pose} />
        <Eye cx={60 + face.eyeGap} blinking={blinking} pose={pose} />

        {/* nose */}
        <path
          d="M60 55 L57 64 Q60 66 63 64 Z"
          fill="#000"
          opacity="0.14"
        />

        {/* mouth — the amplitude-driven part */}
        <g>
          <ellipse
            cx="60"
            cy="74"
            rx={mouthWidth / 2}
            ry={mouthHeight / 2}
            fill="#4A2A22"
          />
          {mouthOpen > 0.12 && (
            <ellipse cx="60" cy={74 + mouthHeight / 4} rx={mouthWidth / 3.4} ry={mouthHeight / 5} fill="#B4564F" />
          )}
          {/* A closed mouth is a line, not a dot. */}
          {mouthOpen <= 0.02 && (
            <rect x={60 - mouthWidth / 2} y="73" width={mouthWidth} height="2" rx="1" fill="#4A2A22" />
          )}
        </g>

        {/* thinking: three dots, the only place a status is drawn on the face */}
        {state === 'thinking' && !reduceMotion && (
          <g>
            {[0, 1, 2].map((i) => (
              <motion.circle
                key={i}
                cx={96 + i * 7}
                cy="26"
                r="2.2"
                fill="var(--muted)"
                animate={{ opacity: [0.2, 1, 0.2] }}
                transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.18 }}
              />
            ))}
          </g>
        )}
      </motion.svg>
    </div>
  );
}

function Eye({
  cx,
  blinking,
  pose,
}: {
  cx: number;
  blinking: boolean;
  pose: { pupilX: number; pupilY: number };
}) {
  if (blinking) {
    return <rect x={cx - 5} y="53" width="10" height="1.8" rx="0.9" fill="#2B211C" />;
  }
  return (
    <g>
      <ellipse cx={cx} cy="54" rx="5.2" ry="5.6" fill="#FFFFFF" />
      <motion.circle
        cx={cx}
        cy="54"
        r="2.7"
        fill="#2B211C"
        animate={{ x: pose.pupilX, y: pose.pupilY }}
        transition={{ type: 'spring', stiffness: 180, damping: 18 }}
      />
      <circle cx={cx + 1} cy="52.6" r="0.9" fill="#FFFFFF" opacity="0.85" />
    </g>
  );
}
