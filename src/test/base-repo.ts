import { ISecondaryIndexDef } from "../types";
import { DynamoDataOperation } from "../core/dynamo-data-operation";
import { MyDynamoConnection } from "../test/connection";
import Joi from "@hapi/joi";

interface IBaseRepoOptions<T> {
  schemaSubDef: Joi.SchemaMap;
  featurePartitionValue: string;
  secondaryIndexOptions: ISecondaryIndexDef<T>[];
}

export abstract class BaseRepository<T> extends DynamoDataOperation<T> {
  constructor({
    schemaSubDef,
    secondaryIndexOptions,
    featurePartitionValue,
  }: IBaseRepoOptions<T>) {
    super({
      dynamoDb: () => MyDynamoConnection.dynamoDbInst(),
      dynamoDbClient: () => MyDynamoConnection.dynamoDbClientInst(),
      tableFullName: "hospiman_table_db1",
      schemaDef: { ...schemaSubDef },
      secondaryIndexOptions,
      featurePartitionValue,
      strictRequiredFields: [],
    });
  }
}
