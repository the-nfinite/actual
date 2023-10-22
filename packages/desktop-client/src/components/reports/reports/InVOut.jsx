import React, { useState, useEffect, useMemo } from 'react';

import * as d from 'date-fns';

import { send } from 'loot-core/src/platform/client/fetch';
import * as monthUtils from 'loot-core/src/shared/months';

import { useFilters } from '../../../hooks/useFilters';
import { styles } from '../../../style';
import { View } from '../../common/View';

import { IncomeVsExpenseTable } from '../graphs/IncomeVsExpenseTable';
import { incomeVsExpenseByDate } from '../graphs/invex-spreadsheet';
import { Header } from '../Header';
import { useReport } from '../useReport';

export function IncomeVsExpense() {
  const {
    filters,
    conditionsOp,
    onApply: onApplyFilter,
    onDelete: onDeleteFilter,
    onUpdate: onUpdateFilter,
    onCondOpChange,
  } = useFilters();

  const [allMonths, setAllMonths] = useState(null);
  const [start, setStart] = useState(
    monthUtils.subMonths(monthUtils.currentMonth(), 30),
  );
  const [end, setEnd] = useState(monthUtils.currentDay());

  const params = useMemo(
    () => incomeVsExpenseByDate(start, end, filters, conditionsOp),
    [start, end, filters, conditionsOp],
  );
  const data = useReport('in-v-out', params);

  useEffect(() => {
    async function run() {
      const trans = await send('get-earliest-transaction');
      const earliestMonth = trans
        ? monthUtils.monthFromDate(d.parseISO(trans.date))
        : monthUtils.currentMonth();

      const allMonths = monthUtils
        .rangeInclusive(earliestMonth, monthUtils.currentMonth())
        .map(month => ({
          name: month,
          pretty: monthUtils.format(month, 'MMMM, yyyy'),
        }))
        .reverse();

      setAllMonths(allMonths);
    }
    run();
  }, []);

  function onChangeDates(start, end) {
    let endDay = end + '-31';
    if (endDay > monthUtils.currentDay()) {
      endDay = monthUtils.currentDay();
    }

    setStart(start + '-01');
    setEnd(endDay);
  }

  if (!allMonths || !data) {
    return null;
  }

  return (
    <View style={[styles.page, { minWidth: 650, overflow: 'hidden' }]}>
      <Header
        title="Income vs. Expense"
        allMonths={allMonths}
        start={monthUtils.getMonth(start)}
        end={monthUtils.getMonth(end)}
        onChangeDates={onChangeDates}
        onApply={onApplyFilter}
        filters={filters}
        onUpdateFilter={onUpdateFilter}
        onDeleteFilter={onDeleteFilter}
        conditionsOp={conditionsOp}
        onCondOpChange={onCondOpChange}
      />
      <View
        style={{
          paddingLeft: 20,
          paddingRight: 20,
          overflow: 'auto',
        }}
      >
        <IncomeVsExpenseTable start={start} end={end} graphData={data} />
      </View>
    </View>
  );
}

export default IncomeVsExpense;
