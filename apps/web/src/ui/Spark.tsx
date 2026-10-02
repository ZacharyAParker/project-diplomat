import { sparkPoints, trendWords } from '../logic/nation.ts'

const WIDTH = 72
const HEIGHT = 18

export interface SparkProps {
  // Oldest first, ending with the value as it stands.
  values: readonly number[]
}

// A trend line the size of a word. The same thing is said in words beside it, so the
// drawing is hidden from screen readers.
export function Spark({ values }: SparkProps) {
  const words = trendWords(values)
  if (values.length < 3) return <span className="spark spark--none small soft">{words}</span>
  const last = sparkPoints(values, WIDTH, HEIGHT).split(' ').pop()!.split(',')
  return (
    <span className="spark">
      <svg
        className="spark__line"
        viewBox={`-2 -2 ${WIDTH + 4} ${HEIGHT + 4}`}
        width={WIDTH + 4}
        height={HEIGHT + 4}
        aria-hidden="true"
        focusable="false"
      >
        <polyline
          points={sparkPoints(values, WIDTH, HEIGHT)}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
        <circle cx={last[0]} cy={last[1]} r="2" fill="currentColor" />
      </svg>
      <span className="spark__words small soft">{words}</span>
    </span>
  )
}
