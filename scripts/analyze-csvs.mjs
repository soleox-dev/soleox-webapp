import fs from 'fs';
import path from 'path';

const csvDir = '/Users/carlosbes/Library/CloudStorage/GoogleDrive-carlos.bes@soleox.org/My Drive/Commissions Tracker/Clients/DEMO/02_PROD/Soleox Commissions Tracker_DEMO/DO NOT TOUCH_CSV_DEMO';

function analyzeFile(filename) {
  const filePath = path.join(csvDir, filename);
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n').filter(l => l.trim().length > 0);
  console.log(`=== ${filename} === (${lines.length - 1} rows)`);
  console.log('Header:', lines[0]);
  if (lines.length > 1) {
    console.log('Row 1:', lines[1]);
  }
}

const files = [
  'Agents.csv',
  'Commission Entities.csv',
  'Commission Rules.csv',
  'Groups.csv',
  'Lead Sources.csv',
  'Transactions.csv',
  'Commissions.csv',
  'Payments.csv'
];

files.forEach(analyzeFile);
