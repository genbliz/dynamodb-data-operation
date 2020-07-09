import { BaseRepository } from "./base-repo";
import Joi from "@hapi/joi";

export interface IPayment {
  dateOfPayment: string;
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
  // dateOfPayment: dateISOValidation({ isRequired: true }),
  remark: Joi.string().empty("").default(null).allow(null),
};

export class MyRepository extends BaseRepository<IPayment> {
  constructor() {
    super({
      schemaSubDef,
      secondaryIndexOptions: [],
      segmentPartitionValue: "table_payments",
    });
  }
}
