/**
 * Noted Bujo - License Key Validation (v3.0)
 * 8 strict rules for key generation and validation.
 */

function validateLicenseKey(key) {
  if (typeof key !== 'string') return false;

  var normalized = key.toUpperCase().trim();

  // Rule 1: Prefix & Structure - must start with NTD- and have 4 blocks
  if (!/^NTD-[A-Z0-9]+-[A-Z0-9]+-[A-Z0-9]+$/.test(normalized)) return false;

  var blocks = normalized.split('-');
  // blocks: ['NTD', block2, block3, block4]

  // Rule 2: Exact length - exactly 18 characters
  if (normalized.length !== 18) return false;

  // Rule 3: Global Z-lock - no 'Z' anywhere
  if (normalized.indexOf('Z') !== -1) return false;

  var block2 = blocks[1];
  var block3 = blocks[2];
  var block4 = blocks[3];

  // Rule 4: Block 2 - must be valid hexadecimal (0-9, A-F)
  if (!/^[0-9A-F]+$/.test(block2)) return false;

  // Rule 5: Block 2 - Modulo-11 checksum
  var sum = 0;
  for (var i = 0; i < block2.length; i++) {
    var c = block2[i];
    if (c >= '0' && c <= '9') {
      sum += parseInt(c, 10);
    } else {
      sum += (c.charCodeAt(0) - 65 + 10); // A=10, B=11, ...
    }
  }
  if (sum % 11 !== 3) return false;

  // Rule 6: Block 3 - must contain at least one digit
  if (!/[0-9]/.test(block3)) return false;

  // Rule 7: Block 3 - third character (index 2) must be a vowel
  var vowels = ['A', 'E', 'I', 'O', 'U'];
  if (block3.length < 3) return false;
  if (vowels.indexOf(block3[2]) === -1) return false;

  // Rule 8: Block 4 - mathematical coupling & suffix
  var onesDigit = sum % 10;
  var expectedFirst = String(onesDigit);
  if (block4[0] !== expectedFirst) return false;
  if (!block4.endsWith('00')) return false;

  return true;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { validateLicenseKey };
}
