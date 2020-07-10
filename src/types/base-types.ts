export interface ISecondaryIndexDef<T> {
  indexName: string;
  keyFieldName: keyof T;
  sortFieldName: keyof T;
  dataType: "N" | "S";
  projectionFieldsInclude?: (keyof T)[];
}

export type ISecondaryIndexDefDictionary<T, TKeys> = {
  [P in keyof TKeys]: ISecondaryIndexDef<T>;
};

// export interface IMyDynamoDbTransactions<TInsert, TUpdate> {
//   insert: {
//     tableFullName: string;
//     insertTransact: TInsert;
//     paramWhereOptions?: IDynamoScanParamOptions<TInsert>;
//   };
//   update: {
//     tableFullName: string;
//     updateTransact: TUpdate;
//     paramWhereOptions?: IDynamoScanParamOptions<TUpdate>;
//   };
// }
