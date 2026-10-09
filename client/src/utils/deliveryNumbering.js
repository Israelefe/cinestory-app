// Section photographs use Roman numerals to distinguish them from section numbers.
export function romanPhotoNumber(value) {
  if (!Number.isInteger(value) || value < 1) return '';
  let remaining = value;
  let label = '';
  for (const [amount, numeral] of [[1000, 'm'], [900, 'cm'], [500, 'd'], [400, 'cd'], [100, 'c'], [90, 'xc'], [50, 'l'], [40, 'xl'], [10, 'x'], [9, 'ix'], [5, 'v'], [4, 'iv'], [1, 'i']]) {
    while (remaining >= amount) { label += numeral; remaining -= amount; }
  }
  return label;
}
