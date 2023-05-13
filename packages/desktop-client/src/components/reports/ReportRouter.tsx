import React from 'react';
import { Route, Routes } from 'react-router-dom';

import { Overview } from './Overview';
import { CashFlow } from './reports/CashFlow';
import { CustomReport } from './reports/CustomReport';
import { IncomeVsExpense } from './reports/InVOut';
import { NetWorth } from './reports/NetWorth';
import { Spending } from './reports/Spending';

export function ReportRouter() {
  return (
    <Routes>
      <Route path="/" element={<Overview />} />
      <Route path="/net-worth" element={<NetWorth />} />
      <Route path="/cash-flow" element={<CashFlow />} />
      <Route path="/category-spending" element={<CategorySpending />} />
      <Route path="/in-v-out" element={<IncomeVsExpense />} />
      <Route path="/custom" element={<CustomReport />} />
      <Route path="/spending" element={<Spending />} />
    </Routes>
  );
}
