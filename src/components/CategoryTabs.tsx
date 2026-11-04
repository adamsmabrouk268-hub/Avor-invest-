import React from 'react';
import { MachineCategory } from '../types';
import { Search, LayoutList, LayoutGrid, Sparkles, Lock } from 'lucide-react';

interface CategoryTabsProps {
  selectedCategory: MachineCategory | 'ALL';
  onSelectCategory: (cat: MachineCategory | 'ALL') => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  viewMode?: 'table' | 'grid';
  onViewModeChange?: (mode: 'table' | 'grid') => void;
  hasBoughtMachine?: boolean;
  onLockedPlaneNotify?: (msg: string) => void;
}

export const CategoryTabs: React.FC<CategoryTabsProps> = ({
  selectedCategory,
  onSelectCategory,
  searchQuery,
  onSearchChange,
  viewMode = 'grid',
  onViewModeChange,
  hasBoughtMachine = false,
  onLockedPlaneNotify,
}) => {
  // Category states
  const isAv1Selected = selectedCategory === 'AV1';
  const isAv2Selected = selectedCategory === 'AV2';
  const isAllSelected = selectedCategory === 'ALL';
  const isAvClassesSelected =
    selectedCategory === 'AVCLASSES' ||
    selectedCategory.startsWith('AV_CLASS_');

  return (
    <div className="space-y-4 mb-6">
      {/* 1. Horizontal Series Filter Pills */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-1">
          {/* 1. All Series */}
          <button
            type="button"
            onClick={() => onSelectCategory('ALL')}
            className={`px-4 sm:px-5 py-2 rounded-full text-xs font-bold font-mono transition-all cursor-pointer whitespace-nowrap shrink-0 border ${
              isAllSelected
                ? 'bg-gradient-to-r from-[#0091ea] to-[#0077b6] text-white border-[#00e5ff] shadow-[0_0_16px_rgba(0,145,234,0.55)]'
                : 'bg-[#030914]/90 text-slate-300 hover:text-white border-[#00d2c4]/30 hover:border-[#00d2c4]/60'
            }`}
          >
            All series
          </button>

          {/* 2. AV1 Series */}
          <button
            type="button"
            onClick={() => onSelectCategory('AV1')}
            className={`px-4 sm:px-5 py-2 rounded-full text-xs font-bold font-mono transition-all cursor-pointer whitespace-nowrap shrink-0 border ${
              isAv1Selected
                ? 'bg-gradient-to-r from-[#0091ea] to-[#0077b6] text-white border-[#00e5ff] shadow-[0_0_16px_rgba(0,145,234,0.55)]'
                : 'bg-[#030914]/90 text-slate-300 hover:text-white border-[#00d2c4]/30 hover:border-[#00d2c4]/60'
            }`}
          >
            AV1 series
          </button>

          {/* 3. AV2 Series */}
          <button
            type="button"
            onClick={() => onSelectCategory('AV2')}
            className={`px-4 sm:px-5 py-2 rounded-full text-xs font-bold font-mono transition-all cursor-pointer whitespace-nowrap shrink-0 border ${
              isAv2Selected
                ? 'bg-gradient-to-r from-[#0091ea] to-[#0077b6] text-white border-[#00e5ff] shadow-[0_0_16px_rgba(0,145,234,0.55)]'
                : 'bg-[#030914]/90 text-slate-300 hover:text-white border-[#00d2c4]/30 hover:border-[#00d2c4]/60'
            }`}
          >
            AV2 series
          </button>

          {/* 4. AV Classes Series (Closed/Locked Plane until Admin confirms payment) */}
          <button
            type="button"
            onClick={() => {
              if (!hasBoughtMachine && onLockedPlaneNotify) {
                onLockedPlaneNotify(
                  '🔒 Closed / Locked Plane: AV Class series is locked until Admin confirms your machine payment and your machine starts running.'
                );
              }
              onSelectCategory('AVCLASSES');
            }}
            className={`px-4 sm:px-5 py-2 rounded-full text-xs font-bold font-mono transition-all cursor-pointer whitespace-nowrap shrink-0 border flex items-center gap-1.5 ${
              isAvClassesSelected
                ? 'bg-gradient-to-r from-[#0091ea] to-[#0077b6] text-white border-[#00e5ff] shadow-[0_0_16px_rgba(0,145,234,0.55)]'
                : !hasBoughtMachine
                  ? 'bg-rose-950/60 text-rose-200 border-rose-500/50 hover:border-rose-400'
                  : 'bg-[#030914]/90 text-slate-300 hover:text-white border-[#00d2c4]/30 hover:border-[#00d2c4]/60'
            }`}
          >
            {!hasBoughtMachine && <Lock className="w-3.5 h-3.5 text-rose-400" />}
            <span>AV Class series</span>
            {!hasBoughtMachine && (
              <span className="text-[9px] bg-rose-500/20 text-rose-300 px-1.5 py-0.5 rounded uppercase">
                Locked
              </span>
            )}
          </button>
        </div>

        {/* Search & View Mode Switcher */}
        <div className="flex items-center gap-3 w-full xl:w-auto">
          <div className="relative flex-1 xl:w-64">
            <Search className="w-4 h-4 text-blue-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search AV1, AV2, or AV classes..."
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              className="pl-9 pr-3 py-2 bg-[#040817] border border-blue-900/60 rounded-xl text-xs text-white placeholder-slate-400 outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400 w-full shadow-inner"
            />
          </div>

          {onViewModeChange && (
            <div className="flex items-center bg-[#040817] border border-blue-900/60 rounded-xl p-1 shrink-0 shadow-inner">
              <button
                type="button"
                onClick={() => onViewModeChange('grid')}
                title="Grid Card View"
                className={`p-1.5 rounded-lg transition-all cursor-pointer ${
                  viewMode === 'grid'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <LayoutGrid className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => onViewModeChange('table')}
                title="Table Form View"
                className={`p-1.5 rounded-lg transition-all cursor-pointer ${
                  viewMode === 'table'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <LayoutList className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Sub-Category Tabs A-I when AV Class Series is selected */}
      {isAvClassesSelected && (
        <div className="flex flex-wrap items-center gap-1.5 p-2 bg-[#04091a]/90 rounded-xl border border-cyan-800/40 shadow-xl overflow-x-auto animate-fade-in">
          <span className="text-xs font-mono font-bold text-cyan-300 px-2 shrink-0 flex items-center gap-1">
            <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
            <span>AV Class:</span>
          </span>
          <button
            type="button"
            onClick={() => onSelectCategory('AVCLASSES')}
            className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
              selectedCategory === 'AVCLASSES'
                ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-black shadow-xs'
                : 'bg-[#061226] text-cyan-200 hover:text-white hover:bg-cyan-950/60'
            }`}
          >
            All Classes (A–I)
          </button>
          {[
            { id: 'AV_CLASS_A', label: 'A class' },
            { id: 'AV_CLASS_B', label: 'B class' },
            { id: 'AV_CLASS_C', label: 'C class' },
            { id: 'AV_CLASS_D', label: 'D class' },
            { id: 'AV_CLASS_E', label: 'E class' },
            { id: 'AV_CLASS_F', label: 'F class' },
            { id: 'AV_CLASS_G', label: 'G class' },
            { id: 'AV_CLASS_H', label: 'H class' },
            { id: 'AV_CLASS_I', label: 'I class' },
          ].map((cls) => (
            <button
              key={cls.id}
              type="button"
              onClick={() => onSelectCategory(cls.id as MachineCategory)}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                selectedCategory === cls.id
                  ? 'bg-cyan-400 text-black font-black shadow-md'
                  : 'bg-[#061226] text-slate-300 hover:text-white hover:bg-cyan-950/50'
              }`}
            >
              {cls.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
