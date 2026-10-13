import { memo, type ReactNode, useMemo } from 'react'
import type { DrawnEdge } from './connectorGeometry'
import { edgeDim } from './GraphNode'
import { highlightOf, useLineage, useLineageStore } from './lineage'

const CONNECTOR_COLOR = 'var(--theme-border)'
const HIGHLIGHT_COLOR = 'var(--theme-element)'
const PANEL_COLOR = 'var(--theme-panel-bg)'
const STROKE = 6

// A highlight measured as one unit of length draws in and out along its dashes, with no length of
// its own to keep. Played by CSS as each mounts, so nothing waits hidden for one and starting one
// never makes the page restyle there and then, as playing one from script would.
const KEYFRAMES = [
  '@keyframes dag-draw-in{from{stroke-dashoffset:1}to{stroke-dashoffset:0}}',
  '@keyframes dag-draw-out{from{stroke-dashoffset:0}to{stroke-dashoffset:1}}',
  `@keyframes dag-light{from{fill:${CONNECTOR_COLOR}}to{fill:${HIGHLIGHT_COLOR}}}`,
  `@keyframes dag-unlight{from{fill:${HIGHLIGHT_COLOR}}to{fill:${CONNECTOR_COLOR}}}`,
].join('')

/** Plays the named keyframes once `delay` seconds pass, holding the first until then and the last after. */
const play = (name: string, seconds: number, delay: number) => ({
  animation: `${name} ${seconds}s ease ${delay}s both`,
})

// A connector of the lineage shown: drawn again above the nodes it passes behind while lit, with a
// highlight that draws along it a hop after the one before it, and back out after.
const LitEdge = memo(function LitEdge({
  d,
  reversed,
  highlight,
  animT,
}: {
  d: string
  reversed: string
  highlight: string
  animT: number
}) {
  const { lit, delay, back } = highlightOf(highlight)
  return (
    <>
      {lit && <path d={d} stroke={CONNECTOR_COLOR} strokeWidth={STROKE} fill="none" />}
      <path
        d={back ? reversed : d}
        pathLength={1}
        fill="none"
        stroke={HIGHLIGHT_COLOR}
        strokeWidth={STROKE}
        strokeDasharray="1 1"
        strokeDashoffset={lit ? 0 : 1}
        style={play(lit ? 'dag-draw-in' : 'dag-draw-out', animT, delay)}
      />
    </>
  )
})

// A dot of the lineage shown, lighting a hop after the one before it and back after.
const LitDot = memo(function LitDot({
  x,
  y,
  highlight,
  animT,
}: {
  x: number
  y: number
  highlight: string
  animT: number
}) {
  const { lit, delay } = highlightOf(highlight)
  return (
    <>
      <rect x={x - 16} y={y - 16} width={32} height={32} fill={PANEL_COLOR} />
      <circle
        cx={x}
        cy={y}
        r={8}
        fill={lit ? HIGHLIGHT_COLOR : CONNECTOR_COLOR}
        style={play(lit ? 'dag-light' : 'dag-unlight', animT, delay)}
      />
    </>
  )
})

interface Port {
  job: string
  x: number
  y: number
}

// The connectors of the lineage shown, which with its dots alone of a level's follow its hover.
function LitEdges({ edges }: { edges: DrawnEdge[] }) {
  const lineage = useLineageStore()
  useLineage((l) => l.version, 0)
  if (!lineage?.showing) {
    return null
  }
  const { animT } = lineage
  const lit: ReactNode[] = []
  for (const { from, to, path } of edges) {
    const highlight = lineage.between(from, to)
    if (highlight) {
      lit.push(
        <LitEdge
          key={`${from}→${to}`}
          d={path.d}
          reversed={path.reversed}
          highlight={highlight}
          animT={animT}
        />,
      )
    }
  }
  return lit
}

// The dots of the lineage shown.
function LitDots({ ports }: { ports: Map<string, Port> }) {
  const lineage = useLineageStore()
  useLineage((l) => l.version, 0)
  if (!lineage?.showing) {
    return null
  }
  const lit: ReactNode[] = []
  for (const [key, { job, x, y }] of ports) {
    const highlight = lineage.between(job, job)
    if (highlight) {
      lit.push(<LitDot key={key} x={x} y={y} highlight={highlight} animT={lineage.animT} />)
    }
  }
  return lit
}

/**
 * A graph level's connectors in three layers: lines behind the nodes, the lineage shown above the
 * nodes outside it, and the dots above all. However many connectors there are, the lines are one
 * path and the dots two, each dimming as one; only the lineage shown draws connectors of its own,
 * and a hover re-renders only those.
 */
export const ConnectorLayers = memo(function ConnectorLayers({
  edges,
  zBase,
}: {
  edges: DrawnEdge[]
  zBase: number
}) {
  const { lines, squares, dots, ports } = useMemo(() => {
    // Every connector at a node's side meets at one dot.
    const ports = new Map<string, Port>()
    for (const { from, to, start, end } of edges) {
      ports.set(`${from}\0out`, { job: from, ...start })
      ports.set(`${to}\0in`, { job: to, ...end })
    }
    const at = [...ports.values()]
    return {
      lines: edges.map(({ path }) => path.d).join(' '),
      // A square of panel color under each dot leaves a gap at the node's edge.
      squares: at.map(({ x, y }) => `M ${x - 16} ${y - 16} h 32 v 32 h -32 Z`).join(' '),
      dots: at.map(({ x, y }) => `M ${x - 8} ${y} a 8 8 0 1 0 16 0 a 8 8 0 1 0 -16 0`).join(' '),
      ports,
    }
  }, [edges])
  // Hoisted with the level's first render, beside its nodes: added once they are laid out, a
  // stylesheet would make the page restyle every one of them again.
  const keyframes = (
    <style href="dependency-graph-highlight" precedence="default">
      {KEYFRAMES}
    </style>
  )
  // Mounted with their connectors, so React builds each layer whole before adding it to the page.
  if (edges.length === 0) {
    return keyframes
  }
  const layer = (z: number, children: ReactNode) => (
    <svg
      aria-hidden="true"
      overflow="visible"
      className="absolute pointer-events-none"
      style={{ zIndex: z + zBase }}
    >
      {children}
    </svg>
  )
  // One path dims as one, so where lines cross none shows through another.
  return (
    <>
      {keyframes}
      {layer(
        -1,
        <path
          d={lines}
          stroke={CONNECTOR_COLOR}
          strokeWidth={STROKE}
          fill="none"
          style={{ opacity: edgeDim }}
        />,
      )}
      {layer(20, <LitEdges edges={edges} />)}
      {layer(
        30,
        <>
          <path d={squares} fill={PANEL_COLOR} />
          <path d={dots} fill={CONNECTOR_COLOR} style={{ opacity: edgeDim }} />
          <LitDots ports={ports} />
        </>,
      )}
    </>
  )
})
