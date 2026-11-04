import React, { useState } from 'react';
import { Currency } from '../types';
import { CURRENCY_MAP, DEFAULT_MACHINES } from '../data/defaultMachines';
import { Calculator, ArrowRight } from 'lucide-react';

interface CalculatorModalProps {
  currency: Currency;
  onSelectMachine: (machineId: string) => void;
}

export const CalculatorModal: React.FC<CalculatorModalProps> = ({ currency, onSelectMachine }) => {
  const currencyInfo = CURRENCY_MAP[currency];

  const [amountUGX, setAmountUGX] = useState<number>(35000);
  const [durationDays, setDurationDays] = useState<number>(18);
  const [dailyRatePct, setDailyRatePct] = useState<number>(8);

  const dailyYieldUGX = (amountUGX * dailyRatePct) / 100;
  const totalReturnUGX = dailyYieldUGX * durationDays;
  const netProfitUGX = totalReturnUGX - amountUGX;
  const returnMultiplier = (totalReturnUGX / (amountUGX || 1)).toFixed(1);

  return (
    <div className="shining-card rounded-3xl border border-blue-950/80 p-6 sm:p-8 shadow-2xl max-w-4xl mx-auto space-y-8 animate-fade-in text-white">
      <div className="flex items-center space-x-3 pb-4 border-b border-blue-950/80">
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-900 text-white flex items-center justify-center font-bold shadow-md border border-blue-400/40">
          <Calculator className="w-6 h-6 text-white" />
        </div>
        <div>
          <h2 className="text-xl font-black text-white tracking-tight">Avor Invest Return Calculator</h2>
          <p className="text-xs text-slate-300">Project your daily earnings and total payout across custom hardware durations.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Inputs */}
        <div className="lg:col-span-7 space-y-6">
          {/* Machine Presets */}
          <div>
            <label className="block text-xs font-bold text-slate-300 mb-2">
              Select Preset Machine Series (AV1, AV2, AV3)
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {DEFAULT_MACHINES.slice(0, 4).map((mach) => (
                <button
                  key={mach.id}
                  type="button"
                  onClick={() => {
                    setAmountUGX(mach.total_cost);
                    setDurationDays(mach.duration_days);
                    setDailyRatePct(Math.round((mach.daily_yield / mach.total_cost) * 100));
                  }}
                  className={`p-2.5 rounded-2xl border text-left transition-all cursor-pointer ${
                    amountUGX === mach.total_cost
                      ? 'bg-gradient-to-r from-blue-600 to-blue-700 border-blue-400 text-white font-bold ring-2 ring-blue-500/30 shadow-md'
                      : 'bg-[#050a18] border border-blue-950/80 text-slate-300 hover:bg-[#09132e] hover:text-white'
                  }`}
                >
                  <p className="text-xs font-black font-mono">{mach.series_tag}</p>
                  <p className="text-[10px] text-slate-400">{currencyInfo.format(mach.total_cost)}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Investment Amount Slider */}
          <div className="space-y-2">
            <div className="flex justify-between text-xs font-bold text-slate-300">
              <span>Investment Principal</span>
              <span className="text-blue-400 font-black text-base font-mono">{currencyInfo.format(amountUGX)}</span>
            </div>
            <input
              type="range"
              min="5000"
              max="2000000"
              step="5000"
              value={amountUGX}
              onChange={(e) => setAmountUGX(Number(e.target.value))}
              className="w-full accent-blue-600 cursor-pointer"
            />
            <div className="flex justify-between text-[10px] text-slate-400 font-mono">
              <span>5,000 UGX</span>
              <span>100,000 UGX</span>
              <span>2,000,000 UGX</span>
            </div>
          </div>

          {/* Duration Slider */}
          <div className="space-y-2">
            <div className="flex justify-between text-xs font-bold text-slate-300">
              <span>Duration Cycle</span>
              <span className="text-white font-black text-base font-mono">{durationDays} Days</span>
            </div>
            <input
              type="range"
              min="5"
              max="30"
              step="1"
              value={durationDays}
              onChange={(e) => setDurationDays(Number(e.target.value))}
              className="w-full accent-blue-600 cursor-pointer"
            />
            <div className="flex justify-between text-[10px] text-slate-400 font-mono">
              <span>5 Days</span>
              <span>15 Days</span>
              <span>30 Days</span>
            </div>
          </div>
        </div>

        {/* Right Output Box */}
        <div className="lg:col-span-5">
          <div className="bg-gradient-to-br from-[#040814] via-[#09132e] to-[#040814] text-white p-6 rounded-3xl space-y-5 border border-blue-900/60 shadow-2xl relative overflow-hidden">
            <div className="flex items-center justify-between border-b border-blue-950/80 pb-3">
              <span className="text-xs text-slate-300 font-bold uppercase tracking-wider">Estimated Return</span>
              <span className="bg-blue-950/70 text-blue-300 border border-blue-600/40 font-black text-[10px] px-2 py-0.5 rounded font-mono">
                {returnMultiplier}x Payback
              </span>
            </div>

            <div className="space-y-3">
              <div>
                <p className="text-xs text-slate-300 font-medium">Principal Investment</p>
                <p className="text-2xl font-black text-white font-mono">
                  {currencyInfo.format(amountUGX)}
                </p>
              </div>

              <div>
                <p className="text-xs text-slate-300 font-medium">Receive After {durationDays}D Lock 💰</p>
                <p className="text-3xl font-black text-blue-400 mt-0.5 font-mono">
                  {currencyInfo.format(totalReturnUGX)}
                </p>
              </div>

              <div className="bg-[#050a18] p-3 rounded-2xl flex justify-between text-xs border border-blue-950/80">
                <span className="text-slate-300">Net Profit Yield:</span>
                <span className="text-blue-400 font-bold font-mono">+{currencyInfo.format(netProfitUGX)}</span>
              </div>
            </div>

            <div className="pt-2">
              <button
                onClick={() => onSelectMachine('mach-av1-01')}
                className="w-full bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-500 hover:to-blue-600 text-white font-black text-xs py-3.5 px-4 rounded-xl shadow-md transition-all flex items-center justify-center space-x-2 cursor-pointer border border-blue-400/40"
              >
                <span>Buy Matching Machine Now</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
