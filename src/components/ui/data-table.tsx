import type { ReactNode } from 'react';
import { cx } from './index';

/**
 * A table of figures: positions, orders, fills, a statement, a leaderboard.
 *
 * Numbers sit right-aligned in the mono face so a column of prices lines up on its decimal point,
 * the header sticks when the body scrolls, and on a narrow screen the table scrolls sideways inside
 * its own box rather than the page. Server-safe: no state, so it can render a statement on the
 * server and an order book in the terminal alike.
 */

export interface Column<Row> {
  key: string;
  header: ReactNode;
  cell: (row: Row, index: number) => ReactNode;
  align?: 'left' | 'right' | 'center';
  /** Right-aligned tabular figures. */
  numeric?: boolean;
  className?: string;
  headerClassName?: string;
  /** Hide below a breakpoint, for columns a phone can live without. */
  hideBelow?: 'sm' | 'md' | 'lg';
}

const HIDE = { sm: 'hidden sm:table-cell', md: 'hidden md:table-cell', lg: 'hidden lg:table-cell' } as const;

export function DataTable<Row>({
  columns,
  rows,
  rowKey,
  empty,
  density = 'compact',
  rowClassName,
  caption,
  className,
  maxHeight,
}: {
  columns: Column<Row>[];
  rows: readonly Row[];
  rowKey: (row: Row, index: number) => string;
  empty?: ReactNode;
  density?: 'compact' | 'comfortable';
  rowClassName?: (row: Row, index: number) => string | undefined;
  /** For a screen reader. */
  caption?: string;
  className?: string;
  /** Scroll the body beyond this height, header pinned. */
  maxHeight?: string;
}) {
  const pad = density === 'compact' ? 'px-3 py-2' : 'px-4 py-3';
  return (
    <div
      className={cx('overflow-auto', className)}
      style={maxHeight ? { maxHeight } : undefined}
    >
      <table className="w-full border-collapse text-sm">
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead className="bg-surface-1 sticky top-0 z-[1]">
          <tr className="border-line-faint border-b">
            {columns.map((column) => (
              <th
                key={column.key}
                scope="col"
                className={cx(
                  'eyebrow text-ink-dim whitespace-nowrap font-medium',
                  pad,
                  column.align === 'right' || column.numeric ? 'text-right' : column.align === 'center' ? 'text-center' : 'text-left',
                  column.hideBelow && HIDE[column.hideBelow],
                  column.headerClassName,
                )}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="text-ink-dim px-3 py-8 text-center text-sm">
                {empty ?? 'Nothing here yet.'}
              </td>
            </tr>
          ) : (
            rows.map((row, index) => (
              <tr
                key={rowKey(row, index)}
                className={cx('border-line-faint hover:bg-fill-1 border-b transition-colors last:border-b-0', rowClassName?.(row, index))}
              >
                {columns.map((column) => (
                  <td
                    key={column.key}
                    className={cx(
                      pad,
                      'whitespace-nowrap',
                      column.numeric && 'numeral text-right',
                      column.align === 'right' && 'text-right',
                      column.align === 'center' && 'text-center',
                      column.hideBelow && HIDE[column.hideBelow],
                      column.className,
                    )}
                  >
                    {column.cell(row, index)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
