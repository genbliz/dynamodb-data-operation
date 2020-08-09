type TypeFallBack<T> = number extends T ? number : string extends T ? string : T;
type TypeFallBackArray<T> = number extends T ? number[] : string extends T ? string[] : T;

export type IDynamoKeyConditionParams<T = any> = {
  $eq?: TypeFallBack<T>;
  $gt?: TypeFallBack<T>;
  $gte?: TypeFallBack<T>;
  $lt?: TypeFallBack<T>;
  $lte?: TypeFallBack<T>;
  $between?: [TypeFallBack<T>, TypeFallBack<T>];
  $beginsWith?: string;
};

export type IDynamoQueryConditionParams<T = any> = IDynamoKeyConditionParams<T> & {
  $in?: TypeFallBackArray<T>;
  $contains?: string;
  $notContains?: string;
  $notEq?: TypeFallBackArray<T>;
  $exists?: true;
  $notExists?: true;
};

type QueryPartialAll<T> = {
  [P in keyof T]: T[P] | IDynamoQueryConditionParams<T[P]>;
};

type QueryKeyConditionBasic<T> = {
  [P in keyof T]: T[P] | IDynamoKeyConditionParams<T[P]>;
};

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

export interface IDynamoQueryParamOptions<T, ISortKeyObjField = any> {
  query?: IQueryDefinition<T>;
  fields?: (keyof T)[];
  partitionKeyQuery: { equals: string | number };
  sortKeyQuery?: QueryKeyConditionBasic<Required<ISortKeyObjField>>;
  pagingParams?: IDynamoPagingParams;
}

export interface IDynamoQuerySecondayIndexOptions<T, TSortKeyField = string> {
  indexName: string;
  partitionKeyQuery: { equals: string | number };
  sortKeyQuery?: IDynamoKeyConditionParams<TSortKeyField>;
  query?: IQueryDefinition<T>;
  fields?: (keyof T)[];
  pagingParams?: IDynamoPagingParams;
}

export interface ISecondaryIndexDef<T> {
  indexName: string;
  keyFieldName: keyof T;
  sortFieldName: keyof T;
  dataType: "N" | "S";
  projectionFieldsInclude?: (keyof T)[];
}

export type IFieldCondition<T> = { field: keyof T; equals: string | number }[];
