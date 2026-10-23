import { BenchResult } from './Benchmark';

interface Props {
  running: string | null;
  result: BenchResult | null;
}

const BenchResults: React.FC<Props> = ({ running, result }) => (
  <div className="absolute bottom-4 right-4 z-20 max-w-[min(92vw,720px)] max-h-[70vh] overflow-auto bg-black/85 text-white text-xs font-mono p-3 rounded-lg border border-white/10 select-text">
    {!result && <div>Benchmark running{running ? `: ${running}` : ''}. Do not touch the window.</div>}
    {result && (
      <>
        <div className="text-yellow-400 mb-2">
          BENCHMARK DONE ({result.mode}) on {result.env.renderer}, {result.env.viewport} at {result.env.devicePixelRatio}x
        </div>
        <table className="w-full text-left">
          <thead>
            <tr className="text-gray-400">
              <th>leg</th><th>s</th><th>fps</th><th>p50</th><th>p95</th><th>p99</th><th>max</th><th>&gt;50ms</th><th>calls</th><th>tris</th><th>geo</th>
            </tr>
          </thead>
          <tbody>
            {[...result.legs, { ...result.overall, name: 'overall', seconds: 0, drawCallsMax: 0, trianglesMax: 0, geometries: 0 }].map((l) => (
              <tr key={l.name}>
                <td>{l.name}</td><td>{l.seconds || ''}</td><td>{l.avgFps}</td><td>{l.p50}</td><td>{l.p95}</td><td>{l.p99}</td>
                <td>{l.max}</td><td>{l.hitches}</td><td>{l.drawCallsMax || ''}</td><td>{l.trianglesMax || ''}</td><td>{l.geometries || ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {result.soak && result.soak.length > 0 && (
          <table className="w-full text-left mt-3">
            <thead>
              <tr className="text-gray-400">
                <th>soak t</th><th>geo</th><th>tris</th><th>calls</th><th>heap MB</th>
                {Object.keys(result.soak[0].stats ?? {}).map((k) => <th key={k}>{k}</th>)}
              </tr>
            </thead>
            <tbody>
              {result.soak.map((s) => (
                <tr key={s.t}>
                  <td>{s.t}</td><td>{s.geometries}</td><td>{s.triangles}</td><td>{s.drawCalls}</td><td>{s.heapMB ?? ''}</td>
                  {Object.values(s.stats ?? {}).map((v, i) => <td key={i}>{v}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div className="text-gray-400 mt-2">Frame times in ms. Full JSON: window.__BENCH_RESULT__ or the console line BENCH_RESULT.</div>
      </>
    )}
  </div>
);

export default BenchResults;
