import { decodeHex, encodeHex } from "@std/encoding"
import { encodeAddress } from "./encode";
import { decodeAddress } from "./decode";
import ky from "ky";
import type { Migrations, Poliresponse } from "./types";
import { LegacyClient, WsProvider } from 'dedot';
import type { PolimecMainnetApi } from "./polimec-mainnet";
import type { BlockHash } from "dedot/codecs";


// Initialise the provider to connect to the local node
const provider = new WsProvider('wss://rpc.polimec.org');

// Create the API and wait until ready
const api = await LegacyClient.new<PolimecMainnetApi>(provider);

async function getInfoFromEvent(blockHash: BlockHash) {
  // @ts-ignore
  const apiAt = await api.at(blockHash);

  const events = await apiAt.query.system.events();
  for (const event of events) {
    if (event.event.pallet === "Funding" && (event.event.palletEvent.name === "Contribution" || event.event.palletEvent.name === "Bid")) {
      // console.log(event.event.palletEvent.data);
      // @ts-ignore
      const asset = event.event.palletEvent.data.fundingAsset;
      // @ts-ignore
      const assetAmount = event.event.palletEvent.data.fundingAmount;
      // @ts-ignore
      const ctAmount = event.event.palletEvent.data.ctAmount;
      return {
        asset,
        assetAmount,
        ctAmount
      };
    }
  }
}

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
const map = new Map<string, [string, string]>();
for (const row of content) {
  const address = row.account
  const encoded = decodeHex(address.replace(/^0x/, ''));
  const base58 = encodeAddress(encoded);
  map.set(base58, [row.amount, row.vesting.toString()]);
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

  // Get account totals once
  const totalAmount = map.get(address)?.[0] || "0";
  const totalVesting = map.get(address)?.[1] || "0";

  // This is a special case where the address has no extrinsics, but since it has a migration entry, it means it is the Contribution Treasury Fee account.
  if (data.items.length === 0) {
    result.set("SPECIAL_HASH", [cleaned, address, "fee", "SPECIAL_BLOCK", "SPECIAL_HEIGHT", "SPECIAL_TIME", totalAmount, totalVesting]);
    continue;
  }
  for (const item of data.items) {
    if (item.isSuccess && item.section === "funding" && item.args.some(arg => arg.name === "projectId" && arg.value === PROJECT_ID)) {
      const onChainInfo = await getInfoFromEvent(item.indexer.blockHash);
      result.set(item.hash, [cleaned, address, item.method, item.indexer.blockHash, item.indexer.blockHeight.toString(), item.indexer.blockTime.toString(), totalAmount, totalVesting, onChainInfo?.asset!, onChainInfo?.assetAmount!, onChainInfo?.ctAmount!]);
    }
  }
  // await sleep(100); // Sleep for 50ms to avoid rate limiting
}

// Write the result Map to a csv file
const output_tge = Bun.file(`tge_${PROJECT_ID}.csv`)
const header_tge = "raw_address,polimec_address,polkadot_address,total_account_amount,total_account_vesting\n";
const csv_content_tge = Array.from(result.entries())
  .map(([hash, [cleaned, polimec, type, blockHash, blockHeight, blockTime, totalAmount, totalVesting, fasset, fasset_amount, ct]]) => `${cleaned},${polimec},${encodeAddress(decodeAddress(polimec!), 0)},${totalAmount},${totalVesting}`)
  .join("\n");
await Bun.write(output_tge, header_tge + csv_content_tge);
console.log(`CSV file created: ${output_tge.name}`);

const output_tax = Bun.file(`tax_${PROJECT_ID}.csv`)
const header_tax = "raw_address,polimec_address,polkadot_address,extrinsic_type,extrinsic_hash,blockHash,blockHeight,timestamp_in_ms,funding_asset,funding_asset_amount,ct_in_this_extrinsic\n";
const csv_content_tax = Array.from(result.entries())
  .map(([hash, [cleaned, polimec, type, blockHash, blockHeight, blockTime, totalAmount, totalVesting, fasset, fasset_amount, ct]]) => `${cleaned},${polimec},${encodeAddress(decodeAddress(polimec!), 0)},${type},${hash},${blockHash},${blockHeight},${blockTime},${fasset},${fasset_amount},${ct}`)
  .join("\n");
await Bun.write(output_tax, header_tax + csv_content_tax);
console.log(`CSV file created: ${output_tax.name}`);

process.exit(0);
