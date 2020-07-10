import { BaseRepository } from "./base-repo";
import Joi from "@hapi/joi";

export interface IPayment {
  amount: number;
  category: string;
  invoiceId?: string;
  transactionId?: string;
  remark?: string;
}

const schemaSubDef = {
  category: Joi.string().required(),
  amount: Joi.number().min(1),
  invoiceId: Joi.string().empty("").default(null).allow(null),
  transactionId: Joi.string().empty("").default(null).allow(null),
  remark: Joi.string().empty("").default(null).allow(null),
};

const getRandom = () =>
  [
    Math.round(Math.random() * 99999),
    Math.round(Math.random() * 88),
    Math.round(Math.random() * 99),
  ].reduce((prev, cur) => prev + cur, 0);

class MyRepositoryBase extends BaseRepository<IPayment> {
  constructor() {
    super({
      schemaSubDef,
      secondaryIndexOptions: [],
      featurePartitionValue: "table_users",
    });
  }

  async create() {
    await this.allCreateOneBase({
      data: {
        amount: getRandom(),
        category: getRandom().toString(),
        invoiceId: getRandom().toString(),
        remark: getRandom().toString(),
        transactionId: getRandom().toString(),
      },
    });
  }
}

export const MyRepository = new MyRepositoryBase();

let count = 0;

function runInserts() {
  const tout = setInterval(() => {
    count++;
    console.log({ count });
    if (count >= 10) {
      clearInterval(tout);
      process.exit(0);
    } else {
      MyRepository.create().catch((e) => console.log(e));
    }
  }, 2000);
}

setTimeout(() => {
  console.log("Initializing");
  runInserts();
}, 10);

// ts-node ./src/test/repo.ts
