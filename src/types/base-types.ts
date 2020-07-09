import { IDynamoScanParamOptions } from "./base-declarations";
import { IBaseSchemaDefinition } from "../core/base-model";

export interface ISecondaryIndexDef<T> {
  indexName: string;
  keyFieldName: keyof T;
  sortFieldName: keyof T;
  dataType: "N" | "S";
  projectionFieldsInclude?: (keyof T)[];
}

export interface ITableModelConfig<T> {
  tableName: string;
  primaryHashKey: keyof T;
  // primaryRangeSortKey: keyof T;
  // secondaryIndexOptions?: ISecondaryIndexDef<T>[];
  schemaDef: IBaseSchemaDefinition<T>;
}

export interface ITableModelCompositeConfig<T> {
  tableName: string;
  primaryHashKey: keyof T;
  primaryRangeSortKey: keyof T;
  schemaDef: IBaseSchemaDefinition<T>;
}

export type ISecondaryIndexDefDictionary<T, TKeys> = {
  [P in keyof TKeys]: ISecondaryIndexDef<T>;
};

export interface IMyDynamoDbTransactions<TInsert, TUpdate> {
  insert: {
    tableFullName: string;
    insertTransact: TInsert;
    paramWhereOptions?: IDynamoScanParamOptions<TInsert>;
  };
  update: {
    tableFullName: string;
    updateTransact: TUpdate;
    paramWhereOptions?: IDynamoScanParamOptions<TUpdate>;
  };
}
