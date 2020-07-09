import { ISecondaryIndexDef } from "../types/base-types";
import { DataOperation } from "../core/dynamo-data-operation";
import { MyDynamoConnection } from "src/test/connection";
import Joi from "@hapi/joi";

interface IBaseRepoOptions<T> {
  schemaSubDef: Joi.SchemaMap;
  segmentPartitionValue: string;
  secondaryIndexOptions: ISecondaryIndexDef<T>[];
}

const coreTenantSchemaDefinition = {
  id: Joi.string().required(),
  tenantId: Joi.string().required(),
  //
  lastModifierUserId: Joi.string().allow(null).empty("").default(null),
  // lastModifiedDate: dateISOValidation(),
  //
  creatorUserId: Joi.string().allow(null).empty("").default(null),
  // createdAtDate: dateISOValidation({ isRequired: true }),
  //
  deleterUserId: Joi.string().allow(null).empty("").default(null),
  isDeleted: Joi.boolean().default(false),
};

function createTenantSchema(schemaMapDef: Joi.SchemaMap) {
  const _schema = Joi.object()
    .keys(coreTenantSchemaDefinition)
    .keys(schemaMapDef);
  return _schema;
}

export abstract class BaseRepository<T> extends DataOperation<T> {
  constructor({
    schemaSubDef,
    secondaryIndexOptions,
    segmentPartitionValue,
  }: IBaseRepoOptions<T>) {
    super({
      dynamoDb: () => MyDynamoConnection.dynamoDbInst(),
      dynamoDbClient: () => MyDynamoConnection.dynamoDbClientInst(),
      tableFullName: "hospiman_table_db1",
      schema: createTenantSchema(schemaSubDef),
      secondaryIndexOptions,
      segmentPartitionValue,
    });
  }
}
