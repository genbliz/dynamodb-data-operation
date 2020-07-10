import { ISecondaryIndexDef } from "../types/base-types";
import { DynamoDataOperation } from "../core/dynamo-data-operation";
import { MyDynamoConnection } from "../test/connection";
import Joi from "@hapi/joi";

interface IBaseRepoOptions<T> {
  schemaSubDef: Joi.SchemaMap;
  segmentPartitionValue: string;
  secondaryIndexOptions: ISecondaryIndexDef<T>[];
}

export abstract class BaseRepository<T> extends DynamoDataOperation<T> {
  constructor({
    schemaSubDef,
    secondaryIndexOptions,
    segmentPartitionValue,
  }: IBaseRepoOptions<T>) {
    super({
      dynamoDb: () => MyDynamoConnection.dynamoDbInst(),
      dynamoDbClient: () => MyDynamoConnection.dynamoDbClientInst(),
      tableFullName: "hospiman_table_db1",
      schemaDef: { ...schemaSubDef },
      secondaryIndexOptions,
      segmentPartitionValue,
    });
  }
}
