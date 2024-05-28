import * as monthUtils from './months';

test('range returns a full range', () => {
  expect(monthUtils.range('2016-10', '2018-01')).toMatchSnapshot();
});

test('range returns months without end month', () => {
  expect(monthUtils.range('2024-01-01', '2024-03-31')).toEqual([
    '2024-01',
    '2024-02',
  ]);
});

test('rangeInclusive returns months with end month', () => {
  expect(monthUtils.rangeInclusive('2024-01-01', '2024-03-31')).toEqual([
    '2024-01',
    '2024-02',
    '2024-03',
  ]);
});

test('dayRange returns days without end day', () => {
  expect(monthUtils.dayRange('2024-01-01', '2024-01-03')).toEqual([
    '2024-01-01',
    '2024-01-02',
  ]);
});

test('dayRangeInclusive returns days with end day', () => {
  expect(monthUtils.dayRangeInclusive('2024-01-01', '2024-01-03')).toEqual([
    '2024-01-01',
    '2024-01-02',
    '2024-01-03',
  ]);
});

test('_weekRange returns weeks without end week', () => {
  expect(monthUtils._weekRange('2024-01-01', '2024-01-14')).toEqual([
    '2023-12-31',
    '2024-01-07',
  ]);
});

test('weekRangeInclusive returns weeks with end week', () => {
  expect(monthUtils.weekRangeInclusive('2024-01-01', '2024-01-14')).toEqual([
    '2023-12-31',
    '2024-01-07',
    '2024-01-14',
  ]);
});

test('_yearRange returns years without end year', () => {
  expect(monthUtils._yearRange('2023-01-01', '2025-01-01')).toEqual([
    '2023',
    '2024',
  ]);
});

test('yearRangeInclusive returns years with end year', () => {
  expect(monthUtils.yearRangeInclusive('2023-01-01', '2025-01-01')).toEqual([
    '2023',
    '2024',
    '2025',
  ]);
});
