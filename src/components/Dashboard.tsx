'use client';

import { useState, useEffect, useCallback } from 'react';
import { 
    ResponsiveContainer, Tooltip,
    AreaChart, Area, XAxis, YAxis, CartesianGrid, 
    PieChart, Pie, Cell
} from 'recharts';
import { TooltipProps } from 'recharts';
import { NameType, ValueType } from 'recharts/types/component/DefaultTooltipContent';

interface TreemapNode {
    name: string;
    size?: number; 
}

interface SpendingByDay {
    day: number;
    total_amount: number;
}

interface DashboardData {
    totalSpending: number;
    spendingByDay: SpendingByDay[];
    treemapData: TreemapNode[];
    totalReceiptsProcessed: number;
    averageTransactionValue: number;
    month: string;
    period?: string;
}

type FetchStatus = 'idle' | 'loading' | 'success' | 'error';
type TimePeriod = 'this_month' | '3_months' | '6_months' | 'all';

const TIME_PERIODS: { id: TimePeriod; label: string; shortLabel: string }[] = [
  { id: 'this_month', label: 'This Month', shortLabel: 'Month' },
  { id: '3_months', label: 'Last 3 Months', shortLabel: '3M' },
  { id: '6_months', label: 'Last 6 Months', shortLabel: '6M' },
  { id: 'all', label: 'All Time', shortLabel: 'All' },
];

const PIE_COLORS = ['#101010', '#404040', '#606060', '#808080', '#9f9f9f', '#bfbfbf', '#d0d0d0', '#e0e0e0'];

export default function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [status, setStatus] = useState<FetchStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [selectedPeriod, setSelectedPeriod] = useState<TimePeriod>('this_month');

  const fetchData = useCallback(async (period: TimePeriod) => {
    setStatus('loading');
    setError(null);
    try {
      const response = await fetch(`/api/dashboard-data?period=${period}`);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to load data');
      }
      const result: DashboardData = await response.json();
      setData(result);
      setStatus('success');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unknown error occurred');
      setStatus('error');
      setData(null); 
    }
  }, []); 

  useEffect(() => {
    fetchData(selectedPeriod);
  }, [selectedPeriod, fetchData]);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(amount);
  };

  const formatCurrencyShort = (amount: number) => {
    if (amount >= 1000) return `${(amount / 1000).toFixed(1)}k`;
    return amount.toFixed(0);
  };

  const renderCustomAreaTooltip = ({ active, payload, label }: TooltipProps<ValueType, NameType>) => {
    if (active && payload?.length) {
      const value = typeof payload[0].value === 'number' ? payload[0].value : 0;
      return (
        <div className="glass-card px-3 py-2 text-sm">
          <p className="text-[var(--text-primary)] font-medium">Day {label}</p>
          <p className="text-mono text-[var(--accent-gold)]">{formatCurrency(value)}</p>
        </div>
      );
    }
    return null;
  };

  const renderCustomPieTooltip = ({ active, payload }: TooltipProps<ValueType, NameType>) => {
    if (active && payload?.length) {
      const data = payload[0].payload;
      return (
        <div className="glass-card px-3 py-2 text-sm">
          <p className="text-[var(--text-primary)] font-medium capitalize">{data.name.replace('_', ' ')}</p>
          <p className="text-mono text-[var(--accent-gold)]">{formatCurrency(data.size)}</p>
        </div>
      );
    }
    return null;
  };

  if (status === 'loading' || status === 'idle') {
    return (
      <div className="min-h-[calc(100vh-57px)] bg-[var(--bg-primary)] flex items-center justify-center">
        <div className="text-center">
          <svg className="w-8 h-8 mx-auto mb-4 text-[var(--accent-gold)] animate-spin" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/>
          </svg>
          <p className="text-[var(--text-secondary)]">Loading insights...</p>
        </div>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="min-h-[calc(100vh-57px)] bg-[var(--bg-primary)] p-6">
        <div className="max-w-2xl mx-auto">
          <div className="card-elevated p-8 text-center">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-xl bg-[var(--accent-rose)]/10 mb-4">
              <svg className="w-7 h-7 text-[var(--accent-rose)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <h3 className="text-display text-xl text-[var(--text-primary)] mb-2">Failed to load insights</h3>
            <p className="text-[var(--text-secondary)]">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  if (status === 'success' && data) {
    const pieData = data.treemapData.map(item => ({
      name: item.name,
      size: item.size || 0,
    })).sort((a, b) => b.size - a.size);

    const totalCategories = pieData.reduce((sum, item) => sum + item.size, 0);

    return (
      <div className="min-h-[calc(100vh-57px)] bg-[var(--bg-primary)] p-4 sm:p-6">
        <div className="max-w-5xl mx-auto space-y-5">
          {/* Header with Time Period Pills */}
          <div className="animate-fade-in">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
              <div>
                <h1 className="text-display text-2xl sm:text-3xl text-[var(--text-primary)]">Spending Insights</h1>
                <p className="text-[var(--text-muted)] text-sm mt-1">{data.month}</p>
              </div>
            </div>
            
            {/* Time Period Pills */}
            <div className="flex gap-2 overflow-x-auto pb-2 -mx-4 px-4 sm:mx-0 sm:px-0">
              {TIME_PERIODS.map((period) => (
                <button
                  key={period.id}
                  onClick={() => setSelectedPeriod(period.id)}
                  className={`shrink-0 px-3 py-1.5 text-xs font-medium transition-all uppercase tracking-wide ${
                    selectedPeriod === period.id
                      ? 'bg-[#111] text-white'
                      : 'bg-white text-[var(--text-secondary)] border border-dashed border-[var(--border-subtle)] hover:border-[#111]'
                  }`}
                >
                  <span className="sm:hidden">{period.shortLabel}</span>
                  <span className="hidden sm:inline">{period.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Key Metrics */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="card-elevated p-5 animate-fade-in-up stagger-1">
              <div className="flex items-center justify-between mb-4">
                <span className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider">MET-01</span>
                <span className="bg-[#111] text-white text-[10px] px-2 py-0.5 uppercase tracking-wide">Total</span>
              </div>
              <p className="text-mono text-2xl font-semibold text-[var(--text-primary)]">{formatCurrency(data.totalSpending)}</p>
              <p className="text-[10px] text-[var(--text-muted)] uppercase mt-2">Total Spent</p>
            </div>

            <div className="card-elevated p-5 animate-fade-in-up stagger-2">
              <div className="flex items-center justify-between mb-4">
                <span className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider">MET-02</span>
                <span className="bg-[#111] text-white text-[10px] px-2 py-0.5 uppercase tracking-wide">Count</span>
              </div>
              <p className="text-mono text-2xl font-semibold text-[var(--text-primary)]">{data.totalReceiptsProcessed}</p>
              <p className="text-[10px] text-[var(--text-muted)] uppercase mt-2">Receipts</p>
            </div>

            <div className="card-elevated p-5 animate-fade-in-up stagger-3">
              <div className="flex items-center justify-between mb-4">
                <span className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider">MET-03</span>
                <span className="bg-[#111] text-white text-[10px] px-2 py-0.5 uppercase tracking-wide">Average</span>
              </div>
              <p className="text-mono text-2xl font-semibold text-[var(--text-primary)]">{formatCurrency(data.averageTransactionValue)}</p>
              <p className="text-[10px] text-[var(--text-muted)] uppercase mt-2">Per Trip</p>
            </div>
          </div>

          {/* Category Breakdown */}
          <div className="card-elevated p-5 animate-fade-in-up stagger-4">
            <div className="flex items-center justify-between mb-5">
              <span className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider">CAT-01</span>
              <span className="bg-[#111] text-white text-[10px] px-2 py-0.5 uppercase tracking-wide">Categories</span>
            </div>
            <h3 className="text-sm font-medium text-[var(--text-primary)] uppercase tracking-wide mb-4">Spending Breakdown</h3>
            {pieData.length > 0 ? (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Pie Chart */}
                <div className="h-[280px]">
                  <ResponsiveContainer>
                    <PieChart>
                      <Pie
                        data={pieData}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={100}
                        paddingAngle={2}
                        dataKey="size"
                      >
                        {pieData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip content={renderCustomPieTooltip} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                
                {/* Category List */}
                <div className="space-y-3">
                  {pieData.slice(0, 6).map((category, index) => {
                    const percentage = totalCategories > 0 ? (category.size / totalCategories) * 100 : 0;
                    return (
                      <div key={category.name} className="animate-slide-in" style={{ animationDelay: `${index * 0.1}s` }}>
                        <div className="flex justify-between items-center mb-1">
                          <span className="text-[var(--text-primary)] font-medium capitalize">
                            {category.name.replace('_', ' ')}
                          </span>
                          <span className="text-mono text-[var(--text-secondary)]">
                            {formatCurrency(category.size)}
                          </span>
                        </div>
                        <div className="h-2 bg-[var(--bg-elevated)] rounded-full overflow-hidden">
                          <div 
                            className="h-full rounded-full transition-all duration-500"
                            style={{ 
                              width: `${percentage}%`,
                              backgroundColor: PIE_COLORS[index % PIE_COLORS.length]
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <p className="text-[var(--text-muted)] text-center py-8">No category data available</p>
            )}
          </div>

          {/* Spending Timeline */}
          <div className="card-elevated p-5 animate-fade-in-up stagger-5">
            <div className="flex items-center justify-between mb-5">
              <span className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider">TML-01</span>
              <span className="bg-[#111] text-white text-[10px] px-2 py-0.5 uppercase tracking-wide">Timeline</span>
            </div>
            <h3 className="text-sm font-medium text-[var(--text-primary)] uppercase tracking-wide mb-4">Daily Spending</h3>
            {data.spendingByDay.length > 0 ? (
              <div className="h-[300px]">
                <ResponsiveContainer>
                  <AreaChart
                    data={data.spendingByDay}
                    margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
                  >
                    <defs>
                      <linearGradient id="spendingGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--accent-gold)" stopOpacity={0.3}/>
                        <stop offset="100%" stopColor="var(--accent-gold)" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid 
                      strokeDasharray="3 3" 
                      stroke="var(--border-subtle)" 
                      vertical={false}
                    />
                    <XAxis 
                      dataKey="day" 
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: 'var(--text-muted)', fontSize: 12 }}
                      padding={{ left: 10, right: 10 }}
                    />
                    <YAxis 
                      tickFormatter={formatCurrencyShort}
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: 'var(--text-muted)', fontSize: 12 }}
                      width={50}
                    />
                    <Tooltip content={renderCustomAreaTooltip} />
                    <Area 
                      type="monotone" 
                      dataKey="total_amount" 
                      stroke="var(--accent-gold)" 
                      strokeWidth={2}
                      fill="url(#spendingGradient)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <p className="text-[var(--text-muted)] text-center py-8">No daily spending data available</p>
            )}
          </div>
        </div>
      </div>
    );
  }

  return null;
} 