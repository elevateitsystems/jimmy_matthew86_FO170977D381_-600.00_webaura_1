import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import { parseContainer } from './backend';
import { containerExportRow } from './container-export';

test('Excel round trip separates rail and customer destinations and preserves the API date and other columns', () => {
  const item = parseContainer({
    containerNumber: 'CAAU2252335', status: 'ON_WATER', onOperationsList: false,
    mbl: 'Test MBL', size: '20', portTerminal: 'Prince Rupert',
    eta: '2026-11-13T03:00:00.000Z', etaAtDestination: '2026-11-13T03:00:00.000Z',
    etaAtTerminal: '2026-11-03T17:00:00.000Z', keyDate: '2026-11-13T03:00:00.000Z',
    keyDateText: 'Nov 12, 2026', keyDateLabel: 'ETA', keyDateTimeZone: 'America/Chicago',
    daysLabel: '11 days away', daysUntil: 11, finalDestinationName: 'Memphis', destination: 'Hubbard, OH',
    carrier: 'Staff-entered carrier', appointmentAt: '2026-11-15', notes: 'Staff note',
  });
  const row = containerExportRow(item);
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet([row]), 'Containers');
  const restored = XLSX.read(XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }), { type: 'buffer' });
  const sheet = restored.Sheets.Containers;
  const [headers] = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1 });
  const [exported] = XLSX.utils.sheet_to_json<Record<string, string>>(sheet);
  assert.deepEqual(headers, ['Container', 'MBL', 'Size', 'Port · terminal', 'Status', 'Key date', 'Days', 'Rail destination', 'Customer delivery', 'Carrier', 'Appointment', 'Delivered', 'Notes']);
  assert.equal(exported['Key date'], 'ETA: Nov 12, 2026');
  assert.equal(exported.Days, item.daysText);
  assert.equal(exported['Rail destination'], 'Memphis');
  assert.equal(exported['Customer delivery'], 'Hubbard, OH');
  assert.equal(exported.Carrier, 'Staff-entered carrier');
  assert.equal(exported.Appointment, 'Nov 15, 2026');
  assert.equal(exported.Delivered, '—');
  assert.equal(exported.Notes, 'Staff note');
  assert.equal(exported.Container, item.container);
});

test('Excel missing destination values remain independent and never fall back to the port or each other', () => {
  for (const [finalDestinationName, destination, expectedRail, expectedCustomer] of [
    [null, 'Customer warehouse', '', 'Customer warehouse'],
    ['Rail city', null, 'Rail city', ''],
    [null, null, '', ''],
  ]) {
    const item = parseContainer({ containerNumber: 'TEST1234567', status: 'NOT_COLLECTED', portTerminal: 'Ocean port', finalDestinationName, destination });
    const row = containerExportRow(item);
    assert.equal(row['Rail destination'], expectedRail);
    assert.equal(row['Customer delivery'], expectedCustomer);
    assert.equal('Final destination' in row, false);
    assert.equal(row['Port · terminal'], 'Ocean port');
  }
});

test('Excel shows an empty date when display text is missing, even with a raw port timestamp', () => {
  for (const keyDateText of [undefined, null, '']) {
    const item = parseContainer({ containerNumber: 'TEST1234567', status: 'ON_WATER', onOperationsList: false, etaAtTerminal: '2026-11-03T17:00:00.000Z', keyDate: '2026-11-13T03:00:00.000Z', keyDateLabel: 'ETA', keyDateText });
    assert.equal(containerExportRow(item)['Key date'], 'ETA: —');
  }
});

test('Excel retains other status labels and staff delivery dates', () => {
  const item = parseContainer({ containerNumber: 'TEST1234567', status: 'DEHIRED', onOperationsList: true, keyDateLabel: 'Empty returned', keyDateText: 'Oct 31, 2026', daysLabel: '1 day since return', appointmentAt: '2026-11-02', deliveredAt: '2026-11-03' });
  const row = containerExportRow(item);
  assert.equal(row['Key date'], 'Empty returned: Oct 31, 2026');
  assert.equal(row.Days, '1 day since return');
  assert.equal(row.Appointment, 'Nov 2, 2026');
  assert.equal(row.Delivered, 'Nov 3, 2026');
});
