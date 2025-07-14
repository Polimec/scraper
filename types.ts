export type Poliresponse = {
  items: Item[];
  page: number;
  pageSize: number;
  total: number;
};

export type Item = {
  indexer: Indexer;
  isSuccess: boolean;
  hash: string;
  section: string;
  method: string;
  args: Arg[];
  eventsCount: number;
  isSigned: boolean;
  signer: string;
  callsCount: number;
};

export type Indexer = {
  blockHeight: number;
  blockHash: string;
  blockTime: number;
  extrinsicIndex: number;
};

export type Arg = {
  name: string;
  type: string;
  value: any;
};

export type Migrations = Migration[]

export interface Migration {
  account: string
  vesting: string | number
  amount: string
}