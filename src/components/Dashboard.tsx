'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
// Import Recharts components
import { 
    ResponsiveContainer, Tooltip, Legend, 
    AreaChart, Area, XAxis, YAxis, CartesianGrid, 
    Treemap
} from 'recharts';
import { TooltipProps } from 'recharts';
import { NameType, ValueType } from 'recharts/types/component/DefaultTooltipContent';

// Interfaces from backend
interface TreemapNode {
    name: string;
    size?: number; 
    children?: TreemapNode[];
}
interface SpendingByDay {
    day: number;
    total_amount: number;
}

// Update DashboardData interface to match API response
interface DashboardData {
    totalSpending: number;
    spendingByDay: SpendingByDay[];
    treemapData: TreemapNode[];
    totalReceiptsProcessed: number;
    averageTransactionValue: number;
    month: string;
}

type FetchStatus = 'idle' | 'loading' | 'success' | 'error';

// Keep MonthOption for the selector logic
interface MonthOption {
  year: number;
  month: number; // 1-12
  label: string;
}

export default function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [status, setStatus] = useState<FetchStatus>('idle');
  const [error, setError] = useState<string | null>(null);

  // --- Month Selector State and Logic (Re-added) ---
  const [currentSystemDate] = useState(new Date());
  const [selectedYear, setSelectedYear] = useState<number>(currentSystemDate.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState<number>(currentSystemDate.getMonth() + 1);

  const availableMonths = useMemo(() => {
    const year = currentSystemDate.getFullYear();
    const currentMonth = currentSystemDate.getMonth() + 1;
    const options: MonthOption[] = [];
    const monthLabels = [
        'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'
    ];
    if (currentMonth !== 2) options.push({ year: year, month: 2, label: `February ${year}` });
    if (currentMonth !== 3 && currentMonth !== 2) options.push({ year: year, month: 3, label: `March ${year}` });
    options.push({ year: year, month: currentMonth, label: `${monthLabels[currentMonth - 1]} ${year}` });
    options.sort((a, b) => a.month - b.month);
    return options;
  }, [currentSystemDate]);

  const handleMonthChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
      const [yearStr, monthStr] = event.target.value.split('-');
      setSelectedYear(parseInt(yearStr, 10));
      setSelectedMonth(parseInt(monthStr, 10));
  };
  const selectedDropdownValue = `${selectedYear}-${selectedMonth}`;
  // --- End Month Selector Logic ---

  // --- Data Fetching (Uses Selector State) ---
  const fetchData = useCallback(async (year: number, month: number) => {
    setStatus('loading');
    setError(null);
    setData(null); 
    try {
      const response = await fetch(`/api/dashboard-data?year=${year}&month=${month}`);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
      }
      const result: DashboardData = await response.json();
      setData(result);
      setStatus('success');
    } catch (err) {
      console.error("Failed to fetch dashboard data:", err);
      setError(err instanceof Error ? err.message : 'An unknown error occurred');
      setStatus('error');
      setData(null); 
    }
  }, []); 

  useEffect(() => {
    if (selectedYear && selectedMonth) {
      fetchData(selectedYear, selectedMonth);
    }
  }, [selectedYear, selectedMonth, fetchData]);
  // --- End Data Fetching ---

  // --- Formatting and Tooltips ---
  const formatCurrency = (amount: number) => {
    // Changed locale to 'de-DE' for Euro formatting
    return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(amount);
  };

  // Custom Tooltip for Area Chart
  const renderCustomAreaTooltip = ({ active, payload, label }: TooltipProps<ValueType, NameType>) => {
    if (active && payload && payload.length) {
      // Access value safely, assuming payload[0].value is the intended numeric value
      const value = typeof payload[0].value === 'number' ? payload[0].value : 0;
      return (
        <div className="bg-white p-2 border border-gray-300 rounded shadow-sm text-sm">
          <p className="font-semibold">{`Day ${label}: ${formatCurrency(value)}`}</p>
        </div>
      );
    }
    return null;
  };

  // Custom Tooltip for Treemap
  const renderCustomTreemapTooltip = ({ active, payload }: TooltipProps<ValueType, NameType>) => {
    // The payload for Treemap might be structured differently
    if (active && payload && payload.length && payload[0].payload) {
        // Assuming the structure based on your previous code
        const data = payload[0].payload as TreemapNode; // Use the existing TreemapNode type
        const size = data.size ?? 0;
        return (
            <div className="bg-white p-2 border border-gray-300 rounded shadow-sm text-sm">
                <p className="font-semibold">{`${data.name}: ${formatCurrency(size)}`}</p>
            </div>
        );
    }
    return null;
  };
  // --- End Formatting and Tooltips ---

  if (status === 'loading' || status === 'idle') {
    return (
      <div className="flex justify-center items-center p-10">
        <p className="text-gray-600 text-lg">Loading dashboard data...</p>
        {/* Add a spinner here if desired */}
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="flex justify-center items-center p-10 bg-red-50 border border-red-200 rounded-lg">
        <p className="text-red-700 text-lg">Error loading dashboard: {error}</p>
      </div>
    );
  }

  if (status === 'success' && data) {
    const areaChartData = data.spendingByDay;
    const treemapChartData = data.treemapData;

    return (
      <div className="p-6 bg-gray-50 min-h-[calc(100vh-10rem)] space-y-8">
        {/* Header and Month Selector */}
         <div className="flex justify-between items-center mb-6">
           <h2 className="text-2xl font-semibold text-gray-800">
             Financial Dashboard {data ? `(${data.month})` : ''} 
           </h2>
           <div>
             <label htmlFor="month-select" className="sr-only">Select Month</label>
             <select 
               id="month-select"
               value={selectedDropdownValue} 
               onChange={handleMonthChange}
               className="p-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
             >
               {availableMonths.map(opt => (
                 <option key={`${opt.year}-${opt.month}`} value={`${opt.year}-${opt.month}`}>
                   {opt.label}
                 </option>
               ))}
             </select>
           </div>
         </div>
        
        {/* Key Metrics Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
          <MetricCard title="Total Spending" value={formatCurrency(data.totalSpending)} />
          <MetricCard title="Receipts Processed" value={data.totalReceiptsProcessed.toString()} />
          <MetricCard title="Avg. Transaction Value" value={formatCurrency(data.averageTransactionValue)} />
        </div>

        {/* Spending Categories (Treemap) */}
        <div className="bg-white p-4 rounded-lg shadow space-y-4">
            <h3 className="text-lg font-semibold text-gray-700">Spending by Category</h3>
            {treemapChartData && treemapChartData.length > 0 ? (
                <div style={{ width: '100%', height: 400 }}> 
                    <ResponsiveContainer>
                        <Treemap
                            data={treemapChartData}
                            dataKey="size" // Key for rectangle size
                            // ratio={4/3} // Aspect ratio of cells
                            stroke="#fff" // Border color of cells
                            fill="#8884d8" // Default fill color
                            // isAnimationActive={false} // Disable animation if preferred
                        >
                            {/* Add a tooltip - Use custom or default */}
                            <Tooltip content={renderCustomTreemapTooltip}/>
                        </Treemap>
                    </ResponsiveContainer>
                </div>
            ) : (
                <p className="text-gray-500 italic">No category spending data available for this month.</p>
            )}
        </div>

        {/* Spending by Day Section (Area Chart) */}
        <div className="bg-white p-4 rounded-lg shadow space-y-4">
            <h3 className="text-lg font-semibold text-gray-700">Spending by Day</h3>
            {areaChartData.length > 0 ? (
                 // Increased height slightly for better visibility in its own row
                <div style={{ width: '100%', height: 400 }}> 
                    <ResponsiveContainer>
                        <AreaChart
                            data={areaChartData}
                            margin={{
                                top: 10, right: 30, left: 20, bottom: 0, 
                            }}
                        >
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="day" padding={{ left: 10, right: 10 }}/>
                            <YAxis tickFormatter={(value: number) => formatCurrency(value)} width={80} /> 
                            <Tooltip content={renderCustomAreaTooltip}/> 
                            <Legend />
                            <Area type="monotone" dataKey="total_amount" name="Spending" stroke="#8884d8" fill="#8884d8" />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
            ) : (
                <p className="text-gray-500 italic">No daily spending data available for this month.</p>
            )}
        </div>

      </div>
    );
  }

  return null; // Should not be reached in normal flow
}

// Simple reusable card component for metrics
interface MetricCardProps {
  title: string;
  value: string;
}

function MetricCard({ title, value }: MetricCardProps) {
  return (
    <div className="bg-white p-4 rounded-lg shadow">
      <h4 className="text-sm font-medium text-gray-500 mb-1">{title}</h4>
      <p className="text-xl font-semibold text-gray-800">{value}</p>
    </div>
  );
} 