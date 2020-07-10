export {
  IDynamoQuerySecondaryParamOptions,
  IDynamoQueryParamOptions,
  ISecondaryIndexDef,
  IFieldCondition,
} from "./types";
export { DynamoDataOperation } from "./core/dynamo-data-operation";
export { IDynamoDataCoreEntityModel } from "./core/base-schema";
export { GenericDataError } from "./helpers/errors";

export default DynamoDataOperation;
