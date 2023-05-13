import q from 'loot-core/src/client/query-helpers';
import { send } from 'loot-core/src/platform/client/fetch';
import * as monthUtils from 'loot-core/src/shared/months';

import { runAll } from '../util';

export function incomeVsExpenseByDate(
  start,
  end,
  conditions = [],
  conditionsOp,
) {
  return async (spreadsheet, setData) => {
    let { filters } = await send('make-filters-from-conditions', {
      conditions: conditions.filter(cond => !cond.customName),
    });
    const conditionsOpKey = conditionsOp === 'or' ? '$or' : '$and';

    let categoryQuery = q('transactions')
      .filter({
        [conditionsOpKey]: [...filters],
      })
      .filter({
        $and: [
          ...filters,
          { date: { $transform: '$month', $gte: start } },
          { date: { $transform: '$month', $lte: end } },
        ],
        'account.offbudget': false,
        $or: [
          {
            'payee.transfer_acct.offbudget': true,
            'payee.transfer_acct': null,
          },
        ],
        'category.is_income': false,
      });
    function categories() {
      return categoryQuery
        .groupBy('category.name')
        .orderBy(['category.group.sort_order', 'category.sort_order'])
        .select(['category.group.name', 'category.name']);
    }

    function categorySpending() {
      return categoryQuery
        .groupBy([{ $month: '$date' }, 'category.name'])
        .orderBy([
          { $month: '$date' },
          'category.group.sort_order',
          'category.sort_order',
        ])
        .select([
          { date: { $month: '$date' } },
          'category.name',
          { amount: { $sum: '$amount' } },
        ]);
    }
    function budgetIncome() {
      let query = q('transactions')
        .filter({
          [conditionsOpKey]: [...filters],
        })
        .filter({
          $and: [
            ...filters,
            { date: { $transform: '$month', $gte: start } },
            { date: { $transform: '$month', $lte: end } },
          ],
          'category.is_income': true,
        });
      return query
        .groupBy([{ $month: '$date' }, 'payee.name'])
        .select([
          { date: { $month: '$date' } },
          'payee.name',
          { amount: { $sum: '$amount' } },
        ]);
    }

    let savingsQuery = q('transactions')
      .filter({
        [conditionsOpKey]: [...filters],
      })
      .filter({
        $and: [
          ...filters,
          { date: { $transform: '$month', $gte: start } },
          { date: { $transform: '$month', $lte: end } },
        ],
        'account.offbudget': true,
        'payee.transfer_acct': null,
        $or: [
          { notes: { $like: '%ontribution%' } }, // 401k contributions
          { notes: { $like: '%+%' } }, // + Units GOOG
        ],
      });
    function savingsAccounts() {
      return savingsQuery
        .groupBy('account.name')
        .orderBy('account.name')
        .select('account.name');
    }
    function savings() {
      return savingsQuery
        .groupBy([{ $month: '$date' }, 'account.name'])
        .select([
          { date: { $month: '$date' } },
          'account.name',
          { amount: { $sum: '$amount' } },
        ]);
    }

    return runAll(
      [
        categorySpending(),
        categories(),
        budgetIncome(),
        savingsAccounts(),
        savings(),
      ],
      data => {
        setData(recalculate(data, start, end));
      },
    );
  };
}

function _monthIndex(data, key) {
  const result = new Map();
  for (const i of data) {
    const date = i.date;
    const cat = i[key];
    const v = i.amount;
    if (!result.has(date)) {
      result.set(date, new Map());
    }
    result.get(date).set(cat, v);
  }
  return result;
}

function _keyByMonth(data, key) {
  const result = new Map();
  for (const i of data) {
    const date = i.date;
    const cat = i[key];
    const v = i.amount;
    if (!result.has(cat)) {
      result.set(cat, new Map());
    }
    result.get(cat).set(date, v);
  }
  return result;
}

function recalculate(data, start, end) {
  const months = monthUtils.range(start, end);
  const [expenses, categories, income, savingsAccounts, savings] = data;

  const byParent = new Map();
  categories.forEach(item => {
    const group = item['category.group.name'];
    const category = item['category.name'];
    if (!byParent.has(group)) {
      byParent.set(group, new Set());
    }
    byParent.get(group).add(category);
  });

  // lookup[date][key] = value
  const expenseLookup = _keyByMonth(expenses, 'category.name');
  const incomeLookup = _keyByMonth(income, 'payee.name');
  const savingsLookup = _keyByMonth(savings, 'account.name');

  return {
    months,
    byParent,
    expenses,
    expenseLookup,
    incomeLookup,
    savingsAccounts,
    savingsLookup,
  };
}
