import { ISecondaryIndexDef } from "../types";
import DynamoDataOpr from "../core/dynamo-data-operation";
import { MyDynamoConnection } from "../test/connection";
import Joi from "@hapi/joi";

interface IBaseRepoOptions<T> {
  schemaSubDef: Joi.SchemaMap;
  featurePartitionValue: string;
  secondaryIndexOptions: ISecondaryIndexDef<T>[];
}

export abstract class BaseRepository<T> extends DynamoDataOpr<T> {
  constructor({
    schemaSubDef,
    secondaryIndexOptions,
    featurePartitionValue,
  }: IBaseRepoOptions<T>) {
    super({
      dynamoDb: () => MyDynamoConnection.dynamoDbInst(),
      dynamoDbClient: () => MyDynamoConnection.dynamoDbClientInst(),
      baseTableName: "hospiman_table_db1",
      schemaDef: { ...schemaSubDef },
      secondaryIndexOptions,
      featureIdentityValue: featurePartitionValue,
      strictRequiredFields: [],
      dataKeyGenerator: () => Date.now().toString(),
    });
  }
}
