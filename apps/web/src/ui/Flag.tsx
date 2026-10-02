import {
  FLAG_HEIGHT,
  FLAG_WIDTH,
  describeFlag,
  flagShapes,
  type FlagSpec,
  type Shape,
} from '../logic/flags.ts'

export interface FlagProps {
  flag: FlagSpec
  // Any CSS length. The height follows at three to two. Left out, it is 3rem unless a
  // stylesheet says otherwise.
  width?: string
  // Set it where the flag stands alone. Next to the nation's name it is decoration and stays silent.
  label?: string
  className?: string
}

function draw(shape: Shape, colour: string, key: number) {
  if (shape.type === 'rect') {
    return <rect key={key} x={shape.x} y={shape.y} width={shape.w} height={shape.h} fill={colour} />
  }
  if (shape.type === 'circle')
    return <circle key={key} cx={shape.cx} cy={shape.cy} r={shape.r} fill={colour} />
  return <polygon key={key} points={shape.points} fill={colour} />
}

export function Flag({ flag, width, label, className }: FlagProps) {
  const named = label !== undefined
  return (
    <svg
      className={['flag', className].filter(Boolean).join(' ')}
      viewBox={`0 0 ${FLAG_WIDTH} ${FLAG_HEIGHT}`}
      style={width === undefined ? undefined : { width }}
      role={named ? 'img' : undefined}
      aria-label={named ? `${label} (${describeFlag(flag).toLowerCase()})` : undefined}
      aria-hidden={named ? undefined : true}
      focusable="false"
      preserveAspectRatio="none"
    >
      {flagShapes(flag).map(({ shape, colour }, i) => draw(shape, colour, i))}
    </svg>
  )
}
