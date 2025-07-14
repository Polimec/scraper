import { blake2b } from '@noble/hashes/blake2';
import { encodeBase58 } from '@std/encoding';

// Obtained from `new TextEncoder().encode('SS58PRE')` - this is the Checksum prefix for the Polkadot SS58 address format.
const SS58_PREFIX = new Uint8Array([83, 83, 53, 56, 80, 82, 69]);

export function encodeAddress(decoded: Uint8Array, ss58Format = 41): string {
    if (ss58Format < 0 || ss58Format > 16383 || [46, 47].includes(ss58Format)) {
        throw new Error('Out of range ss58Format specified');
    }

    const prefix =
        ss58Format < 64
            ? new Uint8Array([ss58Format])
            : new Uint8Array([
                ((ss58Format & 0b0000_0000_1111_1100) >> 2) | 0b0100_0000,
                (ss58Format >> 8) | ((ss58Format & 0b0000_0000_0000_0011) << 6),
            ]);

    const input = new Uint8Array(prefix.length + decoded.length);
    input.set(prefix, 0);
    input.set(decoded, prefix.length);

    const hash = sshash(input);
    const checksum = hash.subarray(0, [32, 33].includes(decoded.length) ? 2 : 1);

    const result = new Uint8Array(input.length + checksum.length);
    result.set(input, 0);
    result.set(checksum, input.length);

    return encodeBase58(result);
}

export function sshash(key: Uint8Array): Uint8Array {
    const data = new Uint8Array(SS58_PREFIX.length + key.length);
    data.set(SS58_PREFIX, 0);
    data.set(key, SS58_PREFIX.length);
    return blake2b(data);
}
