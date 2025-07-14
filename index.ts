import { decodeHex, encodeHex } from "@std/encoding"
import { encodeAddress } from "./encode";
import { sleep } from "bun";
import { decodeAddress } from "./decode";
import ky from "ky";
import type { Migrations, Poliresponse } from "./types";

const PROJECT_ID = "3";
const POLIMEC_URL = `https://api.polimec.org/v1/api/market/migration/${PROJECT_ID}`;
const EXPLORER_URL = "https://polimec-api.statescan.io/accounts/{ADDR}/extrinsics?page=0&page_size=512"

/* Retrieving the migrations from the Polimec API
// The array contains all the contribution tokens issued to the accounts
// who participated in the funding round. If they did multiple contributions,
// or they received some evaluator rewards, they will have one signle entry
// with the total amount of tokens they received, and the vesting period.
*/
const res = await ky.get(POLIMEC_URL);
if (!res.ok) {
  throw new Error(`Failed to fetch migrations: ${res.statusText}`);
}
const content = await res.json<Migrations>();

/* The Statescan API expects the address to be in base58 format,
// so we need to convert the hex address to base58.
// The key of the Map will be the base58 address,
// and the value will be an array containing the amount of tokens,
// the vesting period, and a boolean indicating if the address has been checked.
*/
const map = new Map<string, [string, string, boolean]>();
for (const row of content) {
  const address = row.account
  const encoded = decodeHex(address.replace(/^0x/, ''));
  const base58 = encodeAddress(encoded);
  map.set(base58, [row.amount, row.vesting.toString(), false]);
}


const result = new Map<string, string[]>();

for (const address of map.keys()) {
  const res = await ky.get(EXPLORER_URL.replace("{ADDR}", address));
  if (!res.ok) {
    console.error(`Failed to fetch extrinsics for address ${address}: ${res.statusText}`);
    continue;
  }
  const data = await res.json<Poliresponse>();
  const decoded = decodeAddress(address)
  const encoded = encodeHex(decoded);
  const cleaned = `0x${encoded}`;
  console.log(`Checking address ${address} - It signed and sent a total of ${data.items.length} extrinsics.`);
  // This is a special case where the address has no extrinsics, but since it has a migration entry, it means it is the Contribution Treasury Fee account.
  if (data.items.length === 0) {
    const amount = map.get(address)?.[0] || "0";
    const vesting = map.get(address)?.[1] || "0";
    result.set("SPECIAL_HASH", [cleaned, address, "fee", "SPECIAL_BLOCK", "SPECIAL_HEIGHT", "SPECIAL_TIME", amount, vesting]);
    continue;
  }
  for (const item of data.items) {
    if (item.isSuccess && item.section === "funding" && item.args.some(arg => arg.name === "projectId" && arg.value === PROJECT_ID)) {
      const amount = map.get(address)?.[0] || "0";
      const vesting = map.get(address)?.[1] || "0";
      const alreadyChecked = map.get(address)?.[2] || false;
      if (alreadyChecked) {
        result.set(item.hash, [cleaned, address, item.method, item.indexer.blockHash, item.indexer.blockHeight.toString(), item.indexer.blockTime.toString()]);
      } else {
        result.set(item.hash, [cleaned, address, item.method, item.indexer.blockHash, item.indexer.blockHeight.toString(), item.indexer.blockTime.toString(), amount, vesting]);
        map.set(address, [amount, vesting, true]); // Mark as checked
      }
    }
  }
  await sleep(50); // Sleep for 50ms to avoid rate limiting
}

// Write the result Map to a csv file
const output = Bun.file(`tge_${PROJECT_ID}.csv`)
const header = "raw_address,polimec_address,extrinsic_type,extrinsic_hash,blockHash,blockHeight,timestamp_in_ms,token_amount,vesting\n";
const csvContent = Array.from(result.entries())
  .map(([hash, [cleaned, polimec, type, blockHash, blockHeight, blockTime, amount, vesting]]) => `${cleaned},${polimec},${type},${hash},${blockHash},${blockHeight},${blockTime},${amount || "already checked"},${vesting || "already checked"}`)
  .join("\n");
await Bun.write(output, header + csvContent);
