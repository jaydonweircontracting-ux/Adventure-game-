// BUILD 1068 (0x08) — World Simulation Control Center panel. It READS
// the live coordinator + registry state (via the getData closure the view
// passes in); it reports the sim, it does not duplicate it. The panel
// refreshes once a second while open. The time controls are the
// functional core: they call setSimSpeed, which the clock timer (game
// minutes per second) and the founder timer (sub-steps per 900ms
// interval) read — the sim rate really changes, not just the label.
// Paused freezes both; at 50x/100x the clock runs 50x/100x while the
// founders run at most 10x, and the panel shows both rates.

import { useEffect, useState } from 'react';
import { SIM_SPEEDS, getSimSpeed, setSimSpeed, simSpeedLabel, type ControlCenterData, type SimSpeed } from './controlCenter';
import { formatDayClock } from './worldclock';
import { SEASON_EMOJI, seasonForDay, seasonLabel } from './climate';

const panelStyle: React.CSSProperties = {
  position: 'absolute',
  left: 12,
  right: 12,
  top: 76,
  bottom: 76,
  zIndex: 5,
  overflowY: 'auto',
  padding: '14px 16px',
  border: '1px solid #c4d1bd',
  borderRadius: 12,
  background: '#101f18f2',
  color: '#fff',
  fontSize: 14,
  lineHeight: 1.45,
};

const sectionStyle: React.CSSProperties = { marginTop: 12, borderTop: '1px solid #2c4a38', paddingTop: 8 };
const headingStyle: React.CSSProperties = { fontWeight: 700, fontSize: 15, marginBottom: 4 };
const dimStyle: React.CSSProperties = { opacity: 0.75, fontSize: 13 };

export function ControlCenterPanel(props: { onClose: () => void; getData: () => ControlCenterData }) {
  const [data, setData] = useState<ControlCenterData | null>(null);
  const [speed, setSpeed] = useState<SimSpeed>(getSimSpeed());
  useEffect(() => {
    setData(props.getData());
    const id = window.setInterval(() => setData(props.getData()), 1000);
    return () => window.clearInterval(id);
    // getData is a fresh closure each render; the interval reads it
    // through the ref-like prop (the view rebuilds it from live refs).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const d = data;
  const onSpeed = (s: SimSpeed) => {
    setSimSpeed(s);
    setSpeed(s);
    setData(props.getData());
  };
  return (
    <div data-testid="control-center-panel" style={panelStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <div style={{ fontWeight: 800, fontSize: 17 }}>🎛 World Simulation Control Center</div>
        <button type="button" data-testid="control-center-close" aria-label="Close Control Center" onClick={props.onClose} style={{ padding: '8px 12px', borderRadius: 9, border: '1px solid #c4d1bd', background: '#22392d', color: '#fff', fontWeight: 700, fontSize: 15, lineHeight: 1 }}>
          ×
        </button>
      </div>
      <div style={dimStyle}>
        {d ? `Day ${d.day} · 🕐 ${formatDayClock({ minutes: d.minutes, day: d.day })} · ${SEASON_EMOJI[seasonForDay(d.day)]} ${seasonLabel(seasonForDay(d.day))}` : 'Reading the live sim…'}
      </div>

      <div data-testid="cc-time-controls" style={sectionStyle}>
        <div style={headingStyle}>⏱ Time controls</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {SIM_SPEEDS.map((s) => (
            <button
              key={s}
              type="button"
              data-testid={`sim-speed-${s}`}
              aria-label={s === 0 ? 'Pause the simulation' : `Run the simulation at ${s} times speed`}
              onClick={() => onSpeed(s)}
              style={{
                padding: '8px 12px',
                borderRadius: 9,
                border: '1px solid #c4d1bd',
                background: speed === s ? '#526d42' : '#22392d',
                color: '#fff',
                fontWeight: speed === s ? 700 : 500,
                fontSize: 14,
              }}
            >
              {s === 0 ? '⏸ Pause' : `${s}×`}
            </button>
          ))}
        </div>
        <div data-testid="cc-sim-rate" style={{ marginTop: 6 }}>
          {d ? (
            d.speed === 0 ? (
              <>Sim {simSpeedLabel(d.speed)} — the world is frozen (clock and founders stopped).</>
            ) : (
              <>
                Sim {simSpeedLabel(d.speed)} — clock {d.clockRate} game-min/s, founders ×{d.founderRate}
                {d.founderRate < d.speed ? ` (capped at ×${d.founderRate} — the founders cannot run ${d.speed} ticks per second)` : ''}.
              </>
            )
          ) : (
            '…'
          )}
        </div>
      </div>

      {d && (
        <>
          <div data-testid="cc-population" style={sectionStyle}>
            <div style={headingStyle}>👥 Population — {d.population.count}</div>
            {d.population.founders.length === 0 ? (
              <div style={dimStyle}>No settlers yet.</div>
            ) : (
              d.population.founders.map((f) => (
                <div key={f.id}>
                  {f.name} ({f.profession ?? 'Commoner'}) — {f.activity} ({f.workState})
                  {f.jobKind ? ` · job: ${f.jobKind}${f.jobTarget ? ` ${f.jobTarget}` : ''}` : ' · no job'}
                  {f.carrying > 0 ? ` · carrying ${f.carrying} wood` : ''}
                  {f.carryingGrain > 0 ? ` · carrying ${f.carryingGrain} grain` : ''} · health {f.health} · hunger {f.hunger} · energy {f.energy} · social {f.social}
                </div>
              ))
            )}
          </div>

          <div data-testid="cc-settlements" style={sectionStyle}>
            <div style={headingStyle}>🏕 Settlements + buildings</div>
            {d.settlements.map((s) => (
              <div key={s.id}>
                {s.name} — population {s.population}
                {s.buildings.length === 0 ? (
                  <div style={dimStyle}>No buildings yet.</div>
                ) : (
                  s.buildings.map((b) => (
                    <div key={b.id}>
                      {b.id}: {b.state}
                      {b.state === 'building' ? ` — ${b.progress}/6 steps, ${b.spentWood} wood spent` : ''}
                      {b.state === 'done' ? ' — finished' : ''}
                    </div>
                  ))
                )}
              </div>
            ))}
          </div>

          <div data-testid="cc-resources" style={sectionStyle}>
            <div style={headingStyle}>🪵 Resources + shortages</div>
            <div>
              Camp — wood {d.resources.campWood} · stone {d.resources.campStone} · Granary {d.resources.campFood} meals · {d.resources.campGrain} grain · {d.resources.campFlour} flour
            </div>
            <div>
              Storehouse {d.resources.storehouseLabel} — wood {d.resources.storehouseWood} · stone {d.resources.storehouseStone} · iron {d.resources.storehouseIron} · coal {d.resources.storehouseCoal} · ingots {d.resources.storehouseIngots} · tools {d.resources.storehouseTools} · timber {d.resources.storehouseTimber} · furniture {d.resources.storehouseFurniture}
            </div>
            <div>
              You — wood {d.resources.playerWood} · stone {d.resources.playerStone} · gold {d.resources.playerGold} · grain {d.resources.playerGrain}
            </div>
            <div>
              Carried — wood {d.resources.carriedWood} · grain {d.resources.carriedGrain} · stone {d.resources.carriedStone} · iron {d.resources.carriedIron} · deposits: {d.resources.depositsWood} wood, {d.resources.depositsStone} stone · total wood available {d.resources.totalWoodAvailable} · total stone available {d.resources.totalStoneAvailable}
            </div>
            {d.shortages.length > 0 ? (
              <div data-testid="cc-shortages" style={{ color: '#ffb3a7', marginTop: 4 }}>
                Shortages: {d.shortages.join(' · ')}
              </div>
            ) : (
              <div style={{ ...dimStyle, marginTop: 4 }}>No shortages.</div>
            )}
          </div>

          <div data-testid="cc-employment" style={sectionStyle}>
            <div style={headingStyle}>💼 Employment — jobs</div>
            <div>
              Open {d.employment.open} · claimed {d.employment.claimed} · completed {d.employment.completed} · failed {d.employment.failed}
            </div>
            <div style={dimStyle}>
              Chop {d.employment.chopOpen} open / {d.employment.chopClaimed} claimed · build {d.employment.buildOpen} / {d.employment.buildClaimed} · deliver {d.employment.deliverOpen} / {d.employment.deliverClaimed} · harvest {d.employment.harvestOpen} / {d.employment.harvestClaimed}
            </div>
            {d.employment.perFounder.map((p) => (
              <div key={p.name}>
                {p.name}: {p.jobKind ? `${p.jobKind}${p.jobTarget ? ` ${p.jobTarget}` : ''}` : 'no job'}
              </div>
            ))}
          </div>

          <div data-testid="cc-food" style={sectionStyle}>
            <div style={headingStyle}>🌾 Food (Granary) — production + consumption</div>
            <div>
              Granary {d.food.food} meals · {d.food.grain} grain · {d.food.flour} flour · farm: {d.food.farmPlanted} planted / {d.food.farmGrowing} growing / {d.food.farmReady} ready
            </div>
            <div>
              Average health {d.food.healthAvg}
              {d.food.weakCount > 0 ? ` · ${d.food.weakCount} weak (health under 30)` : ' · nobody weak'} · mill {d.food.millState}{d.food.millReady ? ' ready — grain becomes flour' : ''} · bakery {d.food.bakeryState}{d.food.bakeryReady ? ' ready — flour becomes meals' : ''}
            </div>
          </div>

          <div data-testid="cc-chain" style={sectionStyle}>
            <div style={headingStyle}>⛓️ Metal + timber chain — production</div>
            <div>
              Storehouse {d.chain.coal} coal · {d.chain.ingots} ingots · {d.chain.tools} tools · {d.chain.timber} timber · {d.chain.furniture} furniture
            </div>
            <div>
              smelter {d.chain.smelterState}{d.chain.smelterReady ? ' ready — ore + coal become ingots' : ''} · blacksmith {d.chain.blacksmithState}{d.chain.blacksmithReady ? ' ready — ingots become tools' : ''} · sawmill {d.chain.sawmillState}{d.chain.sawmillReady ? ' ready — wood becomes timber' : ''} · carpenter {d.chain.carpenterState}{d.chain.carpenterReady ? ' ready — timber becomes furniture' : ''} · workshop {d.chain.workshopState}
            </div>
            {d.chain.workshopStall ? (
              <div style={{ color: '#ffb3a7', marginTop: 4 }}>Stalled: {d.chain.workshopStall}</div>
            ) : null}
          </div>

          <div data-testid="cc-housing" style={sectionStyle}>
            <div style={headingStyle}>🏠 Housing — beds + inn + market stall</div>
            <div>
              Beds {d.housing.capacity - d.housing.bedsFree}/{d.housing.capacity} occupied · {d.housing.bedsFree} free{d.housing.bedsFree === 0 && d.housing.capacity > 0 ? ' — no new resident can arrive' : ''}
            </div>
            <div>
              Inn {d.housing.innState}{d.housing.innReady ? ` ready — ${d.housing.innFood} meals for travelers` : d.housing.innState === 'done' ? ' — store empty, topping up at the day boundary' : ''}
            </div>
            <div style={dimStyle}>
              Market stall (read-only — trade is Phase 5): {d.housing.stall.length === 0 ? 'nothing to trade yet' : d.housing.stall.map((l) => `${l.resource} ${l.qty} (${l.store})`).join(' · ')}
            </div>
          </div>

          <div data-testid="cc-construction" style={sectionStyle}>
            <div style={headingStyle}>🔨 Construction projects</div>
            {d.construction.sites.length === 0 ? (
              <div style={dimStyle}>No construction sites.</div>
            ) : (
              d.construction.sites.map((s) => (
                <div key={s.id}>
                  {s.id}: {s.state} — progress {s.progress}/6 · {s.spentWood} wood spent
                </div>
              ))
            )}
            {d.construction.plan ? (
              <div>📋 Plan: build {d.construction.plan.building} at ({d.construction.plan.x},{d.construction.plan.y}) — need {d.construction.plan.need.toFixed(2)} · {d.construction.plan.reasons.join('; ')}</div>
            ) : (
              <div style={dimStyle}>No plan yet — nothing startable.</div>
            )}
            {d.founding ? (
              <div>🌲 Founding: {d.founding.stage}{d.founding.centre ? ` — camp (${d.founding.centre.x},${d.founding.centre.y}) score ${d.founding.score.toFixed(2)}` : ' — no site yet'} · pile {d.founding.pileWood} wood · hut {d.founding.hutProgress}/6 · farm {d.founding.farmPlanted}/4{d.founding.reasons.length > 0 ? ` · ${d.founding.reasons.join('; ')}` : ''}{d.founding.lastLog ? ` — ${d.founding.lastLog}` : ''}</div>
            ) : (
              <div style={dimStyle}>No founding party — the founders' camp stands alone.</div>
            )}
            <div style={dimStyle}>Hut {d.construction.hutDone ? 'done' : 'not finished'} · total progress {d.construction.totalProgress} steps</div>
          </div>

          <div data-testid="cc-trade" style={sectionStyle}>
            <div style={headingStyle}>🚚 Trade routes + deliveries</div>
            <div>
              Deliveries — {d.trade.deliverOpen} open / {d.trade.deliverClaimed} claimed · {d.trade.deliveriesCompleted} jobs completed in total
            </div>
            <div style={dimStyle}>{d.trade.routes.length === 0 ? d.trade.note : `Routes: ${d.trade.routes.join(', ')}`}</div>
          </div>

          <div data-testid="cc-environment" style={sectionStyle}>
            <div style={headingStyle}>🌲 Environmental changes</div>
            <div>
              Forest {d.environment.forestDensityPct}% · {d.environment.liveTrees}/{d.environment.baselineTrees} trees · {d.environment.plantedTotal} regrown
            </div>
            <div style={dimStyle}>
              Coordinator last advanced day {d.environment.lastAdvancedDay}
              {d.environment.lastEvent ? ` · last event: ${d.environment.lastEvent}` : ' · no coordinator event yet'}
            </div>
          </div>

          <div data-testid="cc-performance" style={sectionStyle}>
            <div style={headingStyle}>⚙ Sim errors + performance</div>
            {d.performance.simErrors.length > 0 ? (
              <div style={{ color: '#ffb3a7' }}>Sim errors: {d.performance.simErrors.join(' · ')}</div>
            ) : (
              <div style={dimStyle}>No sim errors.</div>
            )}
            <div style={dimStyle}>
              World rebuilds {d.performance.rebuilds} · worst step while moving {d.performance.maxStepMsMoving.toFixed(1)}ms · last build {d.performance.lastBuildMs.toFixed(0)}ms over {d.performance.lastBuildFrames} frames
            </div>
          </div>
        </>
      )}
    </div>
  );
}
