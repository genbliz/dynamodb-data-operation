export type IDynamoKeyConditionParams<T = any> = {
  $eq?: string | number;
  $gt?: string | number;
  $gte?: string | number;
  $lt?: string | number;
  $lte?: string | number;
  $between?: [string | number | Date, string | number | Date];
  $beginsWith?: string;
};

export type IDynamoQueryConditionParams<T = any> = IDynamoKeyConditionParams & {
  $in?: string[] | number[];
  $contains?: string;
  $notContains?: string;
  $notEq?: any;
  $exists?: true;
  $notExists?: true;
};

type FieldKeyExclude = "";

// type ExtractType<T> = Pick<T, Exclude<keyof T, "">>;
// export type IDynamoSearchOrParamOptions<T> = { [P in keyof T]?: T[any] };
type QueryPartialAllPre<T> = {
  [P in keyof T]: T[P] | IDynamoQueryConditionParams<T>;
};
type QueryPartialAll<T> = Pick<
  QueryPartialAllPre<T>,
  Exclude<keyof QueryPartialAllPre<T>, FieldKeyExclude>
>;
//
type QueryPartialBasicPre<T> = {
  [P in keyof T]: T[P] | IDynamoKeyConditionParams<T>;
};
type QueryPartialBasic<T> = Pick<
  QueryPartialBasicPre<T>,
  Exclude<keyof QueryPartialBasicPre<T>, FieldKeyExclude>
>;
//
// type FieldPartial<T> = { [P in keyof T]: 1 };
//

export interface IDynamoPagingResult<T> {
  lastKeyHash?: any;
  mainResult: T;
}

export type IDynamoPagingParams = {
  evaluationLimit?: number;
  pageSize?: number;
  lastKeyHash?: any;
  orderDesc?: boolean;
};

export type IQueryDefinition<T> = QueryPartialAll<Partial<T>> & {
  $or?: QueryPartialAll<Partial<T>>[];
};

export interface IDynamoQuerySecondaryParamOptions<T> {
  query: IQueryDefinition<T>;
  fields?: (keyof T)[];
  pagingParams?: IDynamoPagingParams;
}

export interface IDynamoQueryParamOptions<T, ISortKeyObjField = any> {
  query?: IQueryDefinition<T>;
  fields?: (keyof T)[];
  partitionSortKeyQuery: {
    partitionKeyEquals: string;
    sortKeyQuery?: QueryPartialBasic<Required<ISortKeyObjField>>;
  };
  pagingParams?: IDynamoPagingParams;
}

export interface ISecondaryIndexDef<T> {
  indexName: string;
  keyFieldName: keyof T;
  sortFieldName: keyof T;
  dataType: "N" | "S";
  projectionFieldsInclude?: (keyof T)[];
}

// export type ISecondaryIndexDefDictionary<T, TKeys> = {
//   [P in keyof TKeys]: ISecondaryIndexDef<T>;
// };

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
