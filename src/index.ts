export {
  IDynamoQuerySecondayIndexOptions,
  IDynamoQueryParamOptions,
  ISecondaryIndexDef,
  IFieldCondition,
  IDynamoKeyConditionParams,
  IDynamoPagingParams,
  IDynamoQueryConditionParams,
  IDynamoPagingResult,
  IQueryDefinition,
} from "./types";
export { IDynamoDataCoreEntityModel } from "./core/base-schema";
export { GenericDataError } from "./helpers/errors";
import DynamoDataOp from "./core/dynamo-data-operation";

export const DynamoDataOperation = DynamoDataOp;
export default DynamoDataOp;
