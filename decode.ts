import { sshash } from './encode';
import { decodeBase58 } from '@std/encoding';

// Polkadot.js-less address decoding. Adapted from: https://github.com/polkadot-js/common/blob/master/packages/util-crypto/src/address/decode.ts
// This version is working without WASM and is suitable for Cloudflare Workers. Thanks to the '@noble/hashes/blake2b' package and the 'bs58' package.
export function decodeAddress(encoded: string, ignoreChecksum?: boolean, ss58Format = -1) {
  try {
    // Pre-allocate the decoded array with maximum possible size to avoid resizing
    const decoded = decodeBase58(encoded);

    const [isValid, endPos, ss58Length, ss58Decoded] = checkAddressChecksum(decoded);

    // Early return if checksum is invalid
    if (!isValid && !ignoreChecksum) {
      throw new Error('Invalid decoded address checksum');
    }

    // Only check format if explicitly specified
    if (ss58Format !== -1 && ss58Format !== ss58Decoded) {
      throw new Error(`Expected ss58Format ${ss58Format}, received ${ss58Decoded}`);
    }

    // Use subarray instead of slice for better performance
    return decoded.subarray(ss58Length, endPos);
  } catch (error) {
    throw new Error(`Decoding ${encoded}: ${(error as Error).message}`);
  }
}

export function checkAddressChecksum(decoded: Uint8Array): [boolean, number, number, number] {
  if (decoded[0] === undefined || decoded[1] === undefined) {
    throw new Error('Invalid decoded address length');
  }
  const firstByte = decoded[0];
  const ss58Length = (firstByte & 0b0100_0000) !== 0 ? 2 : 1;

  const ss58Decoded =
    ss58Length === 1
      ? firstByte
      : ((firstByte & 0b0011_1111) << 2) |
        ((decoded[1] & 0b1100_0000) >> 6) |
        ((decoded[1] & 0b0011_1111) << 8);

  // 32/33 bytes public + 2 bytes checksum + prefix
  const validLengths = [35, 36, 37];
  const isPublicKey = validLengths.includes(decoded.length);
  const length = decoded.length - (isPublicKey ? 2 : 1);

  const hash = sshash(decoded.subarray(0, length));

  const isValid =
    (firstByte & 0b1000_0000) === 0 &&
    firstByte !== 46 &&
    firstByte !== 47 &&
    (isPublicKey
      ? decoded[decoded.length - 2] === hash[0] && decoded[decoded.length - 1] === hash[1]
      : decoded[decoded.length - 1] === hash[0]);

  return [isValid, length, ss58Length, ss58Decoded];
}
