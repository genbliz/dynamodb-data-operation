import type {
  IDynamoQueryParamOptions,
  ISecondaryIndexDef,
  IFieldCondition,
  IDynamoQuerySecondayIndexOptions,
} from "../types";
import { GenericDataError } from "./../helpers/errors";
import type { DynamoDB } from "aws-sdk";
import type { DocumentClient } from "aws-sdk/clients/dynamodb";
import Joi from "@hapi/joi";
import { Marshaller } from "@aws/dynamodb-auto-marshaller";
import { getJoiValidationErrors } from "../core/base-joi-helper";
import BaseMixins from "../core/base-mixins";
import {
  coreSchemaDefinition,
  IDynamoDataCoreEntityModel,
} from "./base-schema";
import { DynamoManageTable } from "./dynamo-manage-table";

interface IDynamoOptions<T> {
  dynamoDb: () => DynamoDB;
  schemaDef: Joi.SchemaMap;
  dynamoDbClient: () => DocumentClient;
  dataKeyGenerator: () => string;
  featureIdentityValue: string;
  secondaryIndexOptions: ISecondaryIndexDef<T>[];
  baseTableName: string;
  strictRequiredFields: (keyof T)[] | string[];
}

function createTenantSchema(schemaMapDef: Joi.SchemaMap) {
  return Joi.object().keys({ ...schemaMapDef, ...coreSchemaDefinition });
}

type IModelKeys = keyof IDynamoDataCoreEntityModel;

export default abstract class DynamoDataOperation<T> extends BaseMixins {
  private readonly here_partitionKeyFieldName: IModelKeys = "id";
  private readonly here_sortKeyFieldName: IModelKeys = "featureIdentity";
  //
  private readonly here_dynamoDbClient: () => DocumentClient;
  private readonly here_dynamoDb: () => DynamoDB;
  private readonly here_dataKeyGenerator: () => string;
  private readonly here_schema: Joi.Schema;
  private readonly here_marshaller: Marshaller;
  private readonly here_tableFullName: string;
  private readonly here_strictRequiredFields: string[];
  private readonly here_featureIdentityValue: string;
  private readonly here_secondaryIndexOptions: ISecondaryIndexDef<T>[];
  //
  private here_tableManager!: DynamoManageTable<T>;

  constructor({
    dynamoDb,
    schemaDef,
    dynamoDbClient,
    secondaryIndexOptions,
    featureIdentityValue,
    baseTableName,
    strictRequiredFields,
    dataKeyGenerator,
  }: IDynamoOptions<T>) {
    super();
    this.here_dynamoDb = dynamoDb;
    this.here_dynamoDbClient = dynamoDbClient;
    this.here_dataKeyGenerator = dataKeyGenerator;
    this.here_schema = createTenantSchema(schemaDef);
    this.here_tableFullName = baseTableName;
    this.here_marshaller = new Marshaller({ onEmpty: "omit" });
    this.here_featureIdentityValue = featureIdentityValue;
    this.here_secondaryIndexOptions = secondaryIndexOptions;
    this.here_strictRequiredFields = strictRequiredFields as string[];
  }

  protected getTableManager() {
    if (!this.here_tableManager) {
      this.here_tableManager = new DynamoManageTable<T>({
        dynamoDb: this.here_dynamoDb,
        secondaryIndexOptions: this.here_secondaryIndexOptions,
        tableFullName: this.here_tableFullName,
        partitionKeyFieldName: this.here_partitionKeyFieldName,
        sortKeyFieldName: this.here_sortKeyFieldName,
      });
    }
    return this.here_tableManager;
  }

  private _dynamoDbClient(): DocumentClient {
    return this.here_dynamoDbClient();
  }

  private _dynamoDb(): DynamoDB {
    return this.here_dynamoDb();
  }

  private generateDynamoTableKey() {
    return this.here_dataKeyGenerator();
  }

  private _getLocalVariables() {
    return {
      partitionKeyFieldName: this.here_partitionKeyFieldName,
      sortKeyFieldName: this.here_sortKeyFieldName,
      //
      featureIdentityValue: this.here_featureIdentityValue,
      //
      tableFullName: this.here_tableFullName,
      secondaryIndexOptions: this.here_secondaryIndexOptions,
      strictRequiredFields: this.here_strictRequiredFields,
    } as const;
  }

  private _getBaseObject({ dataId }: { dataId: string }) {
    const {
      partitionKeyFieldName,
      sortKeyFieldName,
      featureIdentityValue,
    } = this._getLocalVariables();

    const dataMust = {
      [partitionKeyFieldName]: dataId,
      [sortKeyFieldName]: featureIdentityValue,
    };
    return dataMust;
  }

  private _checkValidateMustBeAnObjectDataType(data: any) {
    if (!data || typeof data !== "object") {
      throw new GenericDataError(`Data MUST be valid object`);
    }
  }

  private _checkValidateStrictRequiredFields(onDataObj: any) {
    this._checkValidateMustBeAnObjectDataType(onDataObj);

    const { strictRequiredFields } = this._getLocalVariables();

    if (strictRequiredFields?.length) {
      for (const field of strictRequiredFields) {
        if (onDataObj[field] === null || onDataObj[field] === undefined) {
          throw new GenericDataError(`Required field NOT defined`);
        }
      }
    }
  }

  protected async allCreateOneBase({ data }: { data: T }) {
    this._checkValidateStrictRequiredFields(data);

    const { tableFullName, partitionKeyFieldName } = this._getLocalVariables();

    let dataId: string | undefined = data[partitionKeyFieldName];

    if (!dataId) {
      dataId = this.generateDynamoTableKey();
    }

    const baseData = {
      createdAtDate: new Date().toISOString(),
    } as IDynamoDataCoreEntityModel;

    const dataMust = this._getBaseObject({ dataId });
    const fullData = { ...data, ...baseData, ...dataMust };

    const {
      validatedData,
      marshalled,
    } = await this._allHelpValidateMarshallAndGetValue(fullData);

    const params: DocumentClient.PutItemInput = {
      TableName: tableFullName,
      Item: marshalled,
    };

    await this._dynamoDb().putItem(params).promise();
    const result: T = validatedData;
    return result;
  }

  private withConditionPassed({
    item,
    withCondition,
  }: {
    item: any;
    withCondition?: IFieldCondition<T>;
  }) {
    if (item && withCondition?.length) {
      const isPassed = withCondition.every(({ field, equals }) => {
        return item[field] !== undefined && item[field] === equals;
      });
      return isPassed;
    }
    return true;
  }

  protected async allGetOneByIdBase({
    dataId,
    withCondition,
  }: {
    dataId: string;
    withCondition?: IFieldCondition<T>;
  }): Promise<T | null> {
    const {
      partitionKeyFieldName,
      sortKeyFieldName,
      featureIdentityValue,
      tableFullName,
    } = this._getLocalVariables();

    this.allHelpValidateRequiredString({
      QueryGetOnePartitionKey: dataId,
      QueryGetOneSortKey: featureIdentityValue,
    });

    const params: DocumentClient.GetItemInput = {
      TableName: tableFullName,
      Key: {
        [partitionKeyFieldName]: dataId,
        [sortKeyFieldName]: featureIdentityValue,
      },
    };
    const result = await this._dynamoDbClient().get(params).promise();
    const item = result.Item as any;
    if (!item) {
      return null;
    }
    const isPassed = this.withConditionPassed({ withCondition, item });
    if (!isPassed) {
      return null;
    }
    return item;
  }

  protected async allGetOneByIdProjectBase<TExpectedVals = T>({
    dataId,
    projectionAttributes,
    withCondition,
  }: {
    dataId: string;
    projectionAttributes: (keyof TExpectedVals)[];
    withCondition?: IFieldCondition<T>;
  }) {
    this.allHelpValidateRequiredString({ Get1DataId: dataId });

    const {
      partitionKeyFieldName,
      sortKeyFieldName,
      featureIdentityValue,
      tableFullName,
    } = this._getLocalVariables();

    const params: DocumentClient.GetItemInput = {
      TableName: tableFullName,
      Key: {
        [partitionKeyFieldName]: dataId,
        [sortKeyFieldName]: featureIdentityValue,
      },
      ProjectionExpression: projectionAttributes.join(", ").trim(),
    };

    const result = await this._dynamoDbClient().get(params).promise();
    const item = result.Item as any;
    if (!item) {
      return null;
    }
    const isPassed = this.withConditionPassed({ withCondition, item });
    if (!isPassed) {
      return null;
    }
    return item;
  }

  protected async allUpdateOneDirectBase({ data }: { data: T }) {
    this._checkValidateStrictRequiredFields(data);

    const { tableFullName, partitionKeyFieldName } = this._getLocalVariables();

    const dataId: string | undefined = data[partitionKeyFieldName];

    if (!dataId) {
      throw new GenericDataError("Update data requires sort key field value");
    }

    const dataMust = this._getBaseObject({ dataId });

    const baseData = {
      lastModifiedDate: new Date().toISOString(),
    } as IDynamoDataCoreEntityModel;

    const fullData = { ...data, ...baseData, ...dataMust };
    //
    const {
      validatedData,
      marshalled,
    } = await this._allHelpValidateMarshallAndGetValue(fullData);

    const params: DocumentClient.PutItemInput = {
      TableName: tableFullName,
      Item: marshalled,
    };

    await this._dynamoDb().putItem(params).promise();
    const result: T = validatedData;
    return result;
  }

  protected async allUpdateOneByIdBase({
    dataId,
    data,
    withCondition,
  }: {
    dataId: string;
    data: T;
    withCondition?: IFieldCondition<T>;
  }) {
    this._checkValidateStrictRequiredFields(data);

    const { tableFullName, partitionKeyFieldName } = this._getLocalVariables();

    this.allHelpValidateRequiredString({ Update1DataId: dataId });

    const dataInDb = await this.allGetOneByIdBase({ dataId });

    if (!(dataInDb && dataInDb[partitionKeyFieldName])) {
      throw new GenericDataError("Data does NOT exists");
    }

    const isPassed = this.withConditionPassed({
      withCondition,
      item: dataInDb,
    });
    if (!isPassed) {
      throw new GenericDataError("Update condition failed");
    }

    const dataMust = this._getBaseObject({
      dataId: dataInDb[partitionKeyFieldName],
    });

    const fullData = { ...dataInDb, ...data, ...dataMust };

    const {
      validatedData,
      marshalled,
    } = await this._allHelpValidateMarshallAndGetValue(fullData);

    const params: DocumentClient.PutItemInput = {
      TableName: tableFullName,
      Item: marshalled,
    };

    await this._dynamoDb().putItem(params).promise();
    const result: T = validatedData;
    return result;
  }

  private async _allHelpValidateMarshallAndGetValue(data: any) {
    const { error, value } = this.here_schema.validate(data, {
      stripUnknown: true,
    });

    if (error) {
      const msg = getJoiValidationErrors(error) ?? "Validation error occured";
      throw new GenericDataError(msg);
    }
    const marshalledData = this.here_marshaller.marshallItem(value);

    return await Promise.resolve({
      validatedData: value,
      marshalled: marshalledData,
    });
  }

  //================================

  protected async allExistsByIdBase(dataId: string) {
    this.allHelpValidateRequiredString({ Exist1DataId: dataId });

    const { partitionKeyFieldName } = this._getLocalVariables();

    type IProject = {
      [n: string]: string;
    };

    const data = await this.allGetOneByIdProjectBase<IProject>({
      dataId,
      projectionAttributes: [partitionKeyFieldName],
    });
    if (data && data[partitionKeyFieldName]) {
      return true;
    }
    return false;
  }

  protected async allQueryGetManyByConditionBase(
    paramOptions: IDynamoQueryParamOptions<T>
  ) {
    paramOptions.pagingParams = undefined;
    const result = await this.allQueryGetManyByConditionPaginateBase(
      paramOptions
    );
    if (result?.mainResult?.length) {
      return result.mainResult;
    }
    return [];
  }

  protected async allQueryGetManyByConditionPaginateBase(
    paramOptions: IDynamoQueryParamOptions<T>
  ) {
    const {
      tableFullName,
      sortKeyFieldName,
      partitionKeyFieldName,
    } = this._getLocalVariables();
    //
    if (!paramOptions?.partitionKeyQuery?.equals === undefined) {
      throw new GenericDataError("Invalid Hash key value");
    }
    if (!sortKeyFieldName) {
      throw new GenericDataError("Bad query sort configuration");
    }

    let sortKeyQuery: any = {};

    const sortKeyQueryData = paramOptions.sortKeyQuery;
    if (sortKeyQueryData) {
      if (sortKeyQueryData[sortKeyFieldName]) {
        sortKeyQuery = {
          [sortKeyFieldName]: sortKeyQueryData[sortKeyFieldName],
        };
      } else {
        throw new GenericDataError("Invalid Sort key value");
      }
    }

    const filterHashSortKey = this.__helperDynamoFilterOperation({
      queryDefs: {
        ...sortKeyQuery,
        ...{
          [partitionKeyFieldName]: paramOptions.partitionKeyQuery.equals,
        },
      },
      projectionFields: paramOptions?.fields ?? undefined,
    });
    //
    //
    let otherFilterExpression: string | undefined = undefined;
    let otherExpressionAttributeValues: any = undefined;
    let otherExpressionAttributeNames: any = undefined;
    if (paramOptions?.query) {
      const filterOtherAttr = this.__helperDynamoFilterOperation({
        queryDefs: paramOptions.query,
        projectionFields: null,
      });

      otherExpressionAttributeValues =
        filterOtherAttr.expressionAttributeValues;
      otherExpressionAttributeNames = filterOtherAttr.expressionAttributeNames;

      if (
        filterOtherAttr?.filterExpression &&
        filterOtherAttr?.filterExpression.length > 1
      ) {
        otherFilterExpression = filterOtherAttr.filterExpression;
      }
    }

    const params: DocumentClient.QueryInput = {
      TableName: tableFullName,
      KeyConditionExpression: filterHashSortKey.filterExpression,
      ExpressionAttributeValues: {
        ...otherExpressionAttributeValues,
        ...filterHashSortKey.expressionAttributeValues,
      },
      FilterExpression: otherFilterExpression ?? undefined,
      ExpressionAttributeNames: {
        ...otherExpressionAttributeNames,
        ...filterHashSortKey.expressionAttributeNames,
      },
    };

    if (filterHashSortKey?.projectionExpressionAttr) {
      params.ProjectionExpression = filterHashSortKey.projectionExpressionAttr;
    }

    if (paramOptions?.pagingParams?.orderDesc === true) {
      params.ScanIndexForward = false;
    }

    const hashKeyAndSortKey: [string, string] = [
      partitionKeyFieldName,
      sortKeyFieldName,
    ];

    const paginationObjects = { ...paramOptions.pagingParams };
    const result = await this.__helperDynamoQueryProcessor<T>({
      dynamoDbClient: () => this._dynamoDbClient(),
      params,
      hashKeyAndSortKey,
      ...paginationObjects,
    });
    return result;
  }

  protected async allBatchGetManyByIdsBase({
    dataIds,
    fields,
    withCondition,
  }: {
    dataIds: string[];
    fields?: (keyof T)[];
    withCondition?: IFieldCondition<T>;
  }) {
    dataIds.forEach((dataId) => {
      this.allHelpValidateRequiredString({
        BatchGetDataId: dataId,
      });
    });

    const getRandom = () =>
      [
        "rand",
        Math.round(Math.random() * 99999),
        Math.round(Math.random() * 88888),
        Math.round(Math.random() * 99),
      ].join("");

    return new Promise<T[]>((resolve, reject) => {
      const {
        tableFullName,
        partitionKeyFieldName,
        sortKeyFieldName,
        featureIdentityValue,
      } = this._getLocalVariables();

      const getArray: DynamoDB.Key[] = dataIds.map((dataId) => {
        const params01 = {
          [partitionKeyFieldName]: { S: dataId },
          [sortKeyFieldName]: { S: featureIdentityValue },
        };
        return params01;
      });

      let projectionExpression: string | undefined = undefined;
      let expressionAttributeNames:
        | DynamoDB.ExpressionAttributeNameMap
        | undefined = undefined;

      if (fields?.length) {
        const _fields: any[] = [...fields];
        if (fields?.length && withCondition?.length) {
          /** Add excluded  */
          withCondition.forEach((condition) => {
            if (!fields.includes(condition.field)) {
              _fields.push(condition.field);
            }
          });
        }
        expressionAttributeNames = {};
        _fields.forEach((fieldName) => {
          if (typeof fieldName === "string") {
            if (expressionAttributeNames) {
              const attrKeyHash = `#attrKey${getRandom()}k`.toLowerCase();
              expressionAttributeNames[attrKeyHash] = fieldName;
            }
          }
        });
        if (Object.keys(expressionAttributeNames)?.length) {
          projectionExpression = Object.keys(expressionAttributeNames).join(
            ","
          );
        } else {
          projectionExpression = undefined;
          expressionAttributeNames = undefined;
        }
      }

      const params: DynamoDB.BatchGetItemInput = {
        RequestItems: {
          [tableFullName]: {
            Keys: [...getArray],
            ConsistentRead: true,
            ProjectionExpression: projectionExpression,
            ExpressionAttributeNames: expressionAttributeNames,
          },
        },
      };

      let returnedItems: any[] = [];

      const resolveItemResults = (resultItems: any[]) => {
        if (resultItems?.length && withCondition?.length) {
          return resultItems.filter((item) => {
            return withCondition.every((condition) => {
              return item[condition.field] === condition.equals;
            });
          });
        }
        return resultItems;
      };

      const batchGetUntilDone = (
        err: AWS.AWSError,
        data: DynamoDB.BatchGetItemOutput
      ) => {
        if (err) {
          if (returnedItems?.length) {
            resolve(resolveItemResults(returnedItems));
          } else {
            reject(err.stack);
          }
        } else {
          if (data?.Responses) {
            const itemListRaw = data.Responses[tableFullName];
            const itemList = itemListRaw.map((item) => {
              return this.here_marshaller.unmarshallItem(item);
            });
            returnedItems = [...returnedItems, ...itemList];
          }
          if (data?.UnprocessedKeys) {
            const _params: DynamoDB.BatchGetItemInput = {
              RequestItems: data.UnprocessedKeys,
            };
            console.log({ dynamoBatchGetParams: _params });
            this._dynamoDb().batchGetItem(_params, batchGetUntilDone);
          } else {
            resolve(resolveItemResults(returnedItems));
          }
        }
      };
      this._dynamoDb().batchGetItem(params, batchGetUntilDone);
    });
  }

  protected async allQuerySecondaryIndexBase<TData = T>(
    paramOption: IDynamoQuerySecondayIndexOptions<TData>
  ) {
    paramOption.pagingParams = undefined;
    const result = await this.allQuerySecondaryIndexPaginateBase<TData>(
      paramOption
    );
    if (result?.mainResult) {
      return result.mainResult;
    }
    return [];
  }

  protected async allQuerySecondaryIndexPaginateBase<TData = T>(
    paramOption: IDynamoQuerySecondayIndexOptions<TData>
  ) {
    const { tableFullName, secondaryIndexOptions } = this._getLocalVariables();

    if (!secondaryIndexOptions?.length) {
      throw new GenericDataError("Invalid secondary index definitions");
    }

    const {
      indexName,
      partitionKeyQuery,
      sortKeyQuery,
      fields,
      pagingParams,
      query,
    } = paramOption;

    const secondaryIndex = secondaryIndexOptions.find((item) => {
      return item.indexName === indexName;
    });

    if (!secondaryIndex) {
      throw new GenericDataError("Secondary index not named/defined");
    }

    const partitionKeyFieldName = secondaryIndex.keyFieldName as string;
    const sortKeyFieldName = secondaryIndex.sortFieldName as string;

    const partitionSortKeyQuery = sortKeyQuery
      ? {
          ...{ [sortKeyFieldName]: sortKeyQuery },
          ...{ [partitionKeyFieldName]: partitionKeyQuery.equals },
        }
      : { [partitionKeyFieldName]: partitionKeyQuery.equals };

    const {
      expressionAttributeValues,
      filterExpression,
      projectionExpressionAttr,
      expressionAttributeNames,
    } = this.__helperDynamoFilterOperation({
      queryDefs: partitionSortKeyQuery,
      projectionFields: fields ?? undefined,
    });

    let otherFilterExpression: string | undefined = undefined;
    let otherExpressionAttributeValues: any = undefined;
    let otherExpressionAttributeNames: any = undefined;
    if (query) {
      const otherAttr = this.__helperDynamoFilterOperation({
        queryDefs: query,
        projectionFields: null,
      });

      otherExpressionAttributeValues = otherAttr.expressionAttributeValues;
      otherExpressionAttributeNames = otherAttr.expressionAttributeNames;

      if (
        otherAttr?.filterExpression?.length &&
        otherAttr?.filterExpression.length > 1
      ) {
        otherFilterExpression = otherAttr.filterExpression;
      }
    }

    const params: DocumentClient.QueryInput = {
      TableName: tableFullName,
      IndexName: indexName,
      KeyConditionExpression: filterExpression,
      ExpressionAttributeValues: {
        ...otherExpressionAttributeValues,
        ...expressionAttributeValues,
      },
      FilterExpression: otherFilterExpression ?? undefined,
      ExpressionAttributeNames: {
        ...otherExpressionAttributeNames,
        ...expressionAttributeNames,
      },
    };

    const orderDesc = pagingParams?.orderDesc === true;

    if (orderDesc) {
      params.ScanIndexForward = false;
    }

    if (projectionExpressionAttr) {
      params.ProjectionExpression = projectionExpressionAttr;
    }

    const hashKeyAndSortKey: [string, string] = [
      partitionKeyFieldName,
      sortKeyFieldName,
    ];

    const result = await this.__helperDynamoQueryProcessor<T>({
      dynamoDbClient: () => this._dynamoDbClient(),
      params,
      orderDesc,
      hashKeyAndSortKey,
      ...pagingParams,
    });
    return result;
  }

  protected async allDeleteByIdBase({
    dataId,
    withCondition,
  }: {
    dataId: string;
    withCondition?: IFieldCondition<T>;
  }): Promise<T> {
    //
    this.allHelpValidateRequiredString({ Del1SortKey: dataId });
    const {
      tableFullName,
      partitionKeyFieldName,
      sortKeyFieldName,
      featureIdentityValue,
    } = this._getLocalVariables();

    const dataExist = await this.allGetOneByIdBase({ dataId, withCondition });

    if (!(dataExist && dataExist[partitionKeyFieldName])) {
      throw new GenericDataError("Record does NOT exists");
    }

    const params: DocumentClient.DeleteItemInput = {
      TableName: tableFullName,
      Key: {
        [partitionKeyFieldName]: dataId,
        [sortKeyFieldName]: featureIdentityValue,
      },
    };

    await this._dynamoDbClient().delete(params).promise();
    return dataExist;
  }

  protected async allDeleteManyDangerouselyByIds({
    dataIds,
  }: {
    dataIds: string[];
  }): Promise<boolean> {
    //
    dataIds.forEach((sortKeyValue) => {
      this.allHelpValidateRequiredString({
        DelSortKey: sortKeyValue,
      });
    });

    const {
      tableFullName,
      partitionKeyFieldName,
      sortKeyFieldName,
      featureIdentityValue,
    } = this._getLocalVariables();

    const delArray = dataIds.map((dataId) => {
      const params01: DynamoDB.WriteRequest = {
        DeleteRequest: {
          Key: {
            [partitionKeyFieldName]: { S: dataId },
            [sortKeyFieldName]: { S: featureIdentityValue },
          },
        },
      };
      return params01;
    });

    const params: DynamoDB.BatchWriteItemInput = {
      RequestItems: {
        [tableFullName]: delArray,
      },
    };

    await this._dynamoDb().batchWriteItem(params).promise();
    return true;
  }
}
