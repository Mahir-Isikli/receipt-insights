import { Pool } from 'pg';
import { NextResponse, NextRequest } from 'next/server';

const pool = new Pool({
  connectionString: process.env.NEON_DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

interface CategorySpending {
  category: string | null;
  total_amount: number;
}

interface SpendingByDay {
  day: number;
  total_amount: number;
}

interface TreemapNode {
  name: string;
  size?: number;
}

interface DashboardData {
  totalSpending: number;
  spendingByDay: SpendingByDay[];
  treemapData: TreemapNode[];
  totalReceiptsProcessed: number;
  averageTransactionValue: number;
  month: string;
  period: string;
}

type TimePeriod = 'this_month' | '3_months' | '6_months' | 'all';

function getDateRangeForPeriod(period: TimePeriod): { startDate: Date | null; endDate: Date | null; label: string } {
  const now = new Date();
  switch (period) {
    case 'this_month':
      return {
        startDate: new Date(now.getFullYear(), now.getMonth(), 1),
        endDate: new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59),
        label: now.toLocaleString('default', { month: 'long', year: 'numeric' })
      };
    case '3_months':
      return {
        startDate: new Date(now.getFullYear(), now.getMonth() - 2, 1),
        endDate: new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59),
        label: 'Last 3 months'
      };
    case '6_months':
      return {
        startDate: new Date(now.getFullYear(), now.getMonth() - 5, 1),
        endDate: new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59),
        label: 'Last 6 months'
      };
    case 'all':
    default:
      return { startDate: null, endDate: null, label: 'All time' };
  }
}

export async function GET(req: NextRequest) {
  const client = await pool.connect();
  const searchParams = req.nextUrl.searchParams;
  
  // Support both old API (year/month) and new API (period)
  const period = searchParams.get('period') as TimePeriod | null;
  const yearParam = searchParams.get('year');
  const monthParam = searchParams.get('month');

  let dateFilter = '';
  let queryParams: (string | number)[] = [];
  let periodLabel = '';

  if (period) {
    // New period-based API
    const { startDate, endDate, label } = getDateRangeForPeriod(period);
    periodLabel = label;
    
    if (startDate && endDate) {
      dateFilter = `AND purchase_datetime >= $1 AND purchase_datetime <= $2`;
      queryParams = [startDate.toISOString(), endDate.toISOString()];
    }
  } else if (yearParam && monthParam) {
    // Legacy month-based API
    const targetYear = parseInt(yearParam, 10);
    const targetMonth = parseInt(monthParam, 10);
    const targetDate = new Date(targetYear, targetMonth - 1);
    periodLabel = targetDate.toLocaleString('default', { month: 'long', year: 'numeric' });
    
    dateFilter = `AND EXTRACT(MONTH FROM purchase_datetime) = $1 AND EXTRACT(YEAR FROM purchase_datetime) = $2`;
    queryParams = [targetMonth, targetYear];
  } else {
    // Default to this month
    const now = new Date();
    periodLabel = now.toLocaleString('default', { month: 'long', year: 'numeric' });
    dateFilter = `AND EXTRACT(MONTH FROM purchase_datetime) = $1 AND EXTRACT(YEAR FROM purchase_datetime) = $2`;
    queryParams = [now.getMonth() + 1, now.getFullYear()];
  }

  try {
    // Optimized: Combined query for totals
    const totalsQuery = `
      SELECT 
        COALESCE(SUM(total_amount), 0) as total_spending,
        COUNT(*) as total_receipts
      FROM receipts
      WHERE processing_status = 'COMPLETE' ${dateFilter}`;
    
    const totalsResult = await client.query(totalsQuery, queryParams);
    const totalSpending = parseFloat(totalsResult.rows[0]?.total_spending || '0');
    const totalReceiptsProcessed = parseInt(totalsResult.rows[0]?.total_receipts || '0', 10);

    // Category spending
    const categoryQuery = `
      SELECT li.category::text, SUM(li.item_cost) as total_amount
      FROM line_items li
      JOIN receipts r ON li.receipt_id = r.receipt_id
      WHERE r.processing_status = 'COMPLETE' ${dateFilter.replace(/purchase_datetime/g, 'r.purchase_datetime')}
      GROUP BY li.category
      ORDER BY total_amount DESC`;
    
    const categoryResult = await client.query<CategorySpending>(categoryQuery, queryParams);
    
    const treemapData: TreemapNode[] = categoryResult.rows
      .filter(item => item.total_amount > 0)
      .map(item => ({
        name: item.category || 'Uncategorized',
        size: parseFloat(parseFloat(String(item.total_amount)).toFixed(2))
      }));

    // Spending by day (only for single month views or recent data)
    let spendingByDay: SpendingByDay[] = [];
    
    if (period === 'this_month' || (!period && yearParam && monthParam)) {
      const dayQuery = `
        SELECT EXTRACT(DAY FROM purchase_datetime) as day, SUM(total_amount) as sum
        FROM receipts
        WHERE processing_status = 'COMPLETE' ${dateFilter}
        GROUP BY EXTRACT(DAY FROM purchase_datetime)
        ORDER BY day`;
      
      const dayResult = await client.query(dayQuery, queryParams);
      spendingByDay = dayResult.rows.map(row => ({
        day: parseInt(row.day),
        total_amount: parseFloat(parseFloat(String(row.sum || 0)).toFixed(2))
      }));
    } else if (period === '3_months' || period === '6_months') {
      // For multi-month views, group by month instead
      const monthQuery = `
        SELECT 
          TO_CHAR(purchase_datetime, 'Mon') as month_name,
          EXTRACT(MONTH FROM purchase_datetime) as month_num,
          SUM(total_amount) as sum
        FROM receipts
        WHERE processing_status = 'COMPLETE' ${dateFilter}
        GROUP BY TO_CHAR(purchase_datetime, 'Mon'), EXTRACT(MONTH FROM purchase_datetime)
        ORDER BY month_num`;
      
      const monthResult = await client.query(monthQuery, queryParams);
      spendingByDay = monthResult.rows.map(row => ({
        day: parseInt(row.month_num),
        total_amount: parseFloat(parseFloat(String(row.sum || 0)).toFixed(2))
      }));
    }

    const averageTransactionValue = totalReceiptsProcessed > 0 
      ? parseFloat((totalSpending / totalReceiptsProcessed).toFixed(2)) 
      : 0;

    const dashboardData: DashboardData = {
      totalSpending: parseFloat(totalSpending.toFixed(2)),
      treemapData,
      spendingByDay,
      totalReceiptsProcessed,
      averageTransactionValue,
      month: periodLabel,
      period: period || 'custom'
    };

    return NextResponse.json(dashboardData);

  } catch (error) {
    console.error('Error fetching dashboard data:', error);
    return NextResponse.json(
      { message: 'Failed to fetch dashboard data', error: (error as Error).message }, 
      { status: 500 }
    );
  } finally {
    client.release();
  }
}

export const dynamic = 'force-dynamic'; 