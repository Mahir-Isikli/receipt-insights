import { Pool } from 'pg';
import { NextResponse, NextRequest } from 'next/server';

// Initialize Neon PG client
const pool = new Pool({
  connectionString: process.env.NEON_DATABASE_URL,
  ssl: {
    rejectUnauthorized: false, // Required for Neon connection
  },
});

// Define the structure for category spending
interface CategorySpending {
    category: string | null; // Category can be null if not set
    total_amount: number;
}

// Interface for spending by day data point
interface SpendingByDay {
    day: number;
    total_amount: number;
}

// Define structure for Treemap nodes
interface TreemapNode {
    name: string;
    size?: number; // Size for leaf nodes
    children?: TreemapNode[]; // Children for parent nodes
}

// Define the structure for the overall dashboard data
interface DashboardData {
    totalSpending: number;
    spendingByDay: SpendingByDay[];
    treemapData: TreemapNode[];
    totalReceiptsProcessed: number;
    averageTransactionValue: number;
    month: string;
}

export async function GET(req: NextRequest) {
  const client = await pool.connect();

  // Get year and month from query parameters
  const searchParams = req.nextUrl.searchParams;
  const yearParam = searchParams.get('year');
  const monthParam = searchParams.get('month');

  let targetYear: number;
  let targetMonth: number;

  // Validate and parse parameters, or default to current date
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1; // getMonth is 0-indexed

  targetYear = yearParam ? parseInt(yearParam, 10) : currentYear;
  targetMonth = monthParam ? parseInt(monthParam, 10) : currentMonth;

  // Basic validation (could be more robust)
  if (isNaN(targetYear) || isNaN(targetMonth) || targetMonth < 1 || targetMonth > 12) {
    targetYear = currentYear;
    targetMonth = currentMonth;
  }

  // Determine the month string for the response based on target date
  const targetDate = new Date(targetYear, targetMonth - 1); // Month is 0-indexed for Date constructor
  const monthString = targetDate.toLocaleString('default', { month: 'long', year: 'numeric' });

  try {
    // --- Queries for Target Month --- Use Parameters ---
    const queryParams = [targetMonth, targetYear];

    // 1. Total Spending
    const totalSpendingResult = await client.query<{ sum: number | null }>(
      `SELECT SUM(total_amount)
       FROM receipts
       WHERE processing_status = 'COMPLETE'
         AND EXTRACT(MONTH FROM purchase_datetime) = $1
         AND EXTRACT(YEAR FROM purchase_datetime) = $2;`,
       queryParams // Pass parameters
    );
    const totalSpending = totalSpendingResult.rows[0]?.sum ?? 0;

    // 2. Spending by Category (using line_items)
    const spendingByCategoryResult = await client.query<CategorySpending>(
      `SELECT
         li.category::text,  -- Cast enum to text for JSON serialization
         SUM(li.item_cost) as total_amount
       FROM line_items li
       JOIN receipts r ON li.receipt_id = r.receipt_id
       WHERE r.processing_status = 'COMPLETE'
         AND EXTRACT(MONTH FROM r.purchase_datetime) = $1
         AND EXTRACT(YEAR FROM r.purchase_datetime) = $2
       GROUP BY li.category;`,
      queryParams // Pass parameters
    );
    const spendingByCategory = spendingByCategoryResult.rows;
     // Handle cases where category might be NULL in the database
     spendingByCategory.forEach(item => {
        if (item.category === null) {
            item.category = 'Uncategorized'; 
        }
     });

    // 3. Total Receipts Processed
    const totalReceiptsResult = await client.query<{ count: string }>( // Count returns string
      `SELECT COUNT(*)
       FROM receipts
       WHERE processing_status = 'COMPLETE'
         AND EXTRACT(MONTH FROM purchase_datetime) = $1
         AND EXTRACT(YEAR FROM purchase_datetime) = $2;`,
      queryParams // Pass parameters
    );
    // Parse count string to integer
    const totalReceiptsProcessed = parseInt(totalReceiptsResult.rows[0]?.count ?? '0', 10);

    // 4. Spending by Day (using receipts total_amount)
    const spendingByDayResult = await client.query<{ day: number; sum: number | null }>(
      `SELECT
         EXTRACT(DAY FROM purchase_datetime) as day,
         SUM(total_amount) as sum
       FROM receipts
       WHERE processing_status = 'COMPLETE'
         AND EXTRACT(MONTH FROM purchase_datetime) = $1
         AND EXTRACT(YEAR FROM purchase_datetime) = $2
       GROUP BY EXTRACT(DAY FROM purchase_datetime)
       ORDER BY day;`,
      queryParams
    );
    // Process results, converting sum to number and handling nulls
    const spendingByDay: SpendingByDay[] = spendingByDayResult.rows.map(row => ({
        day: row.day,
        total_amount: parseFloat(String(row.sum ?? 0)) // Convert potential string/null to number
    }));

    // --- Process Data for Treemap Chart ---
    const treemapChildren: TreemapNode[] = spendingByCategory
        .map(item => {
            const size = parseFloat(String(item.total_amount)); // Ensure size is number
            return {
                name: item.category || 'Uncategorized',
                size: size > 0 ? size : undefined // Treemap expects positive size; omit if zero/negative
            };
        })
        .filter(item => item.size !== undefined); // Filter out items with no size

    // Structure for Recharts Treemap often requires a single root object in the array
    // If treemapChildren is empty, provide a default structure or handle in frontend
    const treemapData: TreemapNode[] = treemapChildren.length > 0 
        ? treemapChildren 
        : []; // Or potentially: [{ name: "No Categories", size: 1 }] to show something

    // Convert totalSpending to a number *before* calculating average and formatting
    const totalSpendingNumber = parseFloat(String(totalSpending));

    // 5. Average Transaction Value
    const averageTransactionValue = totalReceiptsProcessed > 0
                                      ? totalSpendingNumber / totalReceiptsProcessed // Use the number version
                                      : 0;

    // --- Construct Response ---
    const dashboardData: DashboardData = {
        totalSpending: parseFloat(totalSpendingNumber.toFixed(2)),
        treemapData: treemapData.map(node => ({ // Ensure size formatting
            ...node,
            size: node.size ? parseFloat(node.size.toFixed(2)) : undefined
        })),
        spendingByDay: spendingByDay.map(item => ({ 
            ...item,
            total_amount: parseFloat(item.total_amount.toFixed(2))
        })),
        totalReceiptsProcessed: totalReceiptsProcessed,
        averageTransactionValue: parseFloat(averageTransactionValue.toFixed(2)),
        month: monthString,
    };

    return NextResponse.json(dashboardData);

  } catch (error) {
    console.error('Error fetching dashboard data:', error);
    // Consider more specific error handling based on error type
    return NextResponse.json({ message: 'Failed to fetch dashboard data', error: (error as Error).message }, { status: 500 });
  } finally {
    client.release(); // Release the client back to the pool
  }
}

// Ensure route segment is dynamic
export const dynamic = 'force-dynamic'; 