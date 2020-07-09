import { GenericDataError } from "./../helpers/errors";
import { UtilService } from "../helpers/util-service";
import { DynamoDB } from "aws-sdk";
import { DocumentClient } from "aws-sdk/clients/dynamodb";
import { Marshaller } from "@aws/dynamodb-auto-marshaller";
import Joi from "@hapi/joi";
//
import { getJoiValidationErrors } from "./base-joi-helper";
import type {
  IDynamoQueryParamOptions,
  IDynamoQuerySecondaryParamOptions,
} from "../types/base-declarations";
import { MyDynamoConnection } from "../test/connection";
import DynamoHelperMixins from "./base-mixins";
import { ISecondaryIndexDef } from "../types/base-types";
import { LoggingService } from "../helpers/logging-service";

interface IBasicProps {
  id: string;
}

interface ITableConfig<T> {
  tableName: string;
  primaryHashKey: string;
  primaryRangeSortKey?: string;
  secondaryIndexOptions?: ISecondaryIndexDef<T>[];
  avoidDefaultTablePrefix?: boolean;
}

interface IDynamoOptions<T> {
  tableConfig: ITableConfig<T>;
  schemaDef: Joi.SchemaMap;
  canCreateTable: boolean;
  schemaGroup: "TENANT" | "CORE";
}

const getRandom = () =>
  [
    Math.round(Math.random() * 99999),
    Math.round(Math.random() * 88888),
    Math.round(Math.random() * 99),
  ].join("");

export abstract class AppDynamoDataOperation<T> extends DynamoHelperMixins {
  readonly #tableNamePrefix: string;
  //
  readonly #tableNamePrefixProd = "hospiman_mgt_";
  #schema: Joi.Schema;
  #marshaller: Marshaller;
  #tableFields: string[] = [];
  #tableConfig: ITableConfig<T>;
  #tableFullName: string;

  constructor({
    tableConfig,
    schemaDef,
    canCreateTable,
    schemaGroup,
  }: IDynamoOptions<T>) {
    super();
    this.#marshaller = new Marshaller({ onEmpty: "omit" });
    //
    this.#tableConfig = tableConfig;

    this.#tableNamePrefix = "table_prefix";

    const tableName = this.#tableConfig.tableName;
    const avoidDefaultTablePrefix = this.#tableConfig.avoidDefaultTablePrefix;

    this.#tableFullName =
      avoidDefaultTablePrefix === true
        ? tableName
        : `${this.#tableNamePrefix}${tableName}`;
    //
    this.#schema = BaseSchemaModelService.createCoreSchema(schemaDef);
    //
    if (canCreateTable) {
      this.allCreateTableIfNotExistsBase().catch((e) =>
        LoggingService.log({
          "@canCreateTable": e,
        })
      );
    }
  }

  private _dynamoDbClient(): DocumentClient {
    return MyDynamoConnection.dynamoDbClientInst();
  }

  private _dynamoDb(): DynamoDB {
    return MyDynamoConnection.dynamoDbInst();
  }

  protected allTableFullNameBase() {
    return Promise.resolve(this.#tableFullName);
  }

  protected abstract async allCreateTableIfNotExists(): Promise<DynamoDB.TableDescription | null>;

  protected async allGetListOfTablesNamesOnlineBase() {
    const params: DynamoDB.ListTablesInput = {
      Limit: 99,
    };
    const listOfTables = await this._dynamoDb().listTables(params).promise();
    return listOfTables?.TableNames;
  }

  protected allGetTableFieldNamesBase() {
    return [...this.#tableFields];
  }

  protected async allTableSettingUpdateTTLBase({
    attrName,
    isEnabled,
  }: {
    attrName: keyof T;
    isEnabled: boolean;
  }) {
    const params: DynamoDB.Types.UpdateTimeToLiveInput = {
      TableName: this.#tableFullName,
      TimeToLiveSpecification: {
        AttributeName: attrName as string,
        Enabled: isEnabled,
      },
    };
    const result = await this._dynamoDb().updateTimeToLive(params).promise();
    if (result?.TimeToLiveSpecification) {
      return result.TimeToLiveSpecification;
    }
    return null;
  }

  protected async allQueryBySecondaryIndexBase<T>({
    keyQueryEquals: { keyFieldName, value },
    secondaryIndexName,
    orderDesc,
    sortKeyQueryOptions,
  }: {
    keyQueryEquals: { keyFieldName: keyof T; value: string | number };
    secondaryIndexName: string;
    orderDesc?: boolean;
    sortKeyQueryOptions?: IDynamoQuerySecondaryParamOptions<T>;
  }) {
    const result = await this.allQueryBySecondaryIndexPaginateBase<T>({
      keyQueryEquals: { keyFieldName, value },
      secondaryIndexName,
      orderDesc,
      sortKeyQueryOptions,
    });
    if (result?.mainResult) {
      return result.mainResult;
    }
    return [];
  }

  protected async allQueryBySecondaryIndexPaginateBase<T>({
    keyQueryEquals: { keyFieldName, value },
    secondaryIndexName,
    orderDesc,
    sortKeyQueryOptions,
  }: {
    keyQueryEquals: { keyFieldName: keyof T; value: string | number };
    secondaryIndexName: string;
    orderDesc?: boolean;
    sortKeyQueryOptions?: IDynamoQuerySecondaryParamOptions<T>;
  }) {
    if (!this.#tableConfig?.secondaryIndexOptions?.length) {
      throw new GenericDataError("Invalid secondary index definitions");
    }

    const secondaryIndex = this.#tableConfig.secondaryIndexOptions.find(
      ({ indexName }) => {
        return secondaryIndexName === indexName;
      }
    );

    if (!secondaryIndex) {
      throw new GenericDataError("Invalid secondary index name");
    }

    const hasField =
      (secondaryIndex.keyFieldName as string) === (keyFieldName as string);

    if (!hasField) {
      throw new GenericDataError("Invalid secondary index field definitions");
    }

    const paramOptions: IDynamoQuerySecondaryParamOptions<any> = {
      query: {
        ...(sortKeyQueryOptions?.query ?? {}),
        ...{ [keyFieldName]: value },
      },
      fields: sortKeyQueryOptions?.fields,
    };

    const {
      expressionAttributeValues,
      filterExpression,
      projectionExpressionAttr,
      expressionAttributeNames,
    } = this.__helperDynamoFilterOperation({
      queryDefs: paramOptions.query,
      projectionFields: paramOptions.fields,
    });

    const params: DocumentClient.QueryInput = {
      TableName: this.#tableFullName,
      IndexName: secondaryIndexName,
      KeyConditionExpression: filterExpression,
      //
      ExpressionAttributeValues: expressionAttributeValues,
      // FilterExpression: filterExpression,
      ExpressionAttributeNames: expressionAttributeNames,
    };

    if (orderDesc === true) {
      params.ScanIndexForward = false;
    }

    if (projectionExpressionAttr) {
      params.ProjectionExpression = projectionExpressionAttr;
    }

    const hashKeyName = secondaryIndex.keyFieldName as string;
    const sortKeyName = secondaryIndex.sortFieldName as string;

    const hashKeyAndSortKey: [string, string] = [hashKeyName, sortKeyName];

    const pagingParams = { ...paramOptions.pagingParams };

    const result = await this.__helperDynamoQueryProcessor<T>({
      params,
      orderDesc,
      hashKeyAndSortKey,
      ...pagingParams,
    });
    return result;
  }

  protected async allQueryExistsByConditionBase(
    paramOptions: IDynamoQueryParamOptions<T>
  ): Promise<boolean> {
    const result = await this.allQueryGetOneByConditionBase(paramOptions);
    if (result) {
      return true;
    }
    return false;
  }

  protected async allQueryGetOneByConditionBase<TExpectedVals = T>(
    paramOptions: IDynamoQueryParamOptions<T>
  ): Promise<TExpectedVals | null> {
    paramOptions.pagingParams = { pageSize: 1 };
    const result = await this.allQueryGetManyByConditionPaginateBase(
      paramOptions
    );
    if (result?.mainResult?.length) {
      const resultData: TExpectedVals = result.mainResult[0] as any;
      return resultData;
    }
    return null;
  }

  private _allErrorThrowNewErrorIfTableDoesNotHave_id_asOnlyHashPrimaryKey() {
    if (this.#tableConfig.primaryHashKey !== "id") {
      throw new GenericDataError(
        `Invalid search by primary key. Must have 'id' as primary.`
      );
    }
    if (this.#tableConfig.primaryRangeSortKey) {
      throw new GenericDataError(
        `Invalid search by primary key. Accepts only 'id' as primary.`
      );
    }
  }

  private _allErrorThrowNewErrorIfTableDoesNotHave_HashKey_and_sortKey_asPrimaryKey() {
    if (
      !(
        this.#tableConfig.primaryHashKey &&
        this.#tableConfig.primaryRangeSortKey
      )
    ) {
      throw new GenericDataError(
        "Invalid search by primary key. Accepts hash and sort only."
      );
    }
  }

  protected async allBatchGetManyByHashAndSortKey({
    hashSortKeys,
    fields,
  }: {
    hashSortKeys: {
      hashKeyValue: string;
      sortKeyValue: string;
    }[];
    fields?: (keyof T)[];
  }) {
    this._allErrorThrowNewErrorIfTableDoesNotHave_HashKey_and_sortKey_asPrimaryKey();
    //
    hashSortKeys.forEach(({ hashKeyValue, sortKeyValue }) => {
      this.allHelpValidateRequiredString({
        BatchGetHashKey: hashKeyValue,
        BatchGetSortKey: sortKeyValue,
      });
    });

    return new Promise<T[]>((resolve, reject) => {
      const hashKeyName = this.#tableConfig.primaryHashKey;
      const sortKeyName = this.#tableConfig.primaryRangeSortKey || "";

      const getArray: DynamoDB.Key[] = hashSortKeys.map(
        ({ hashKeyValue, sortKeyValue }) => {
          const params01 = {
            [hashKeyName]: { S: hashKeyValue },
            [sortKeyName]: { S: sortKeyValue },
          };
          return params01;
        }
      );

      const fullTableName = this.#tableFullName;

      let projectionExpression: string | undefined = undefined;
      let expressionAttributeNames:
        | DynamoDB.ExpressionAttributeNameMap
        | undefined = undefined;

      if (fields?.length) {
        const _fields: any[] = [...fields];
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
          [fullTableName]: {
            Keys: [...getArray],
            ConsistentRead: true,
            ProjectionExpression: projectionExpression,
            ExpressionAttributeNames: expressionAttributeNames,
          },
        },
      };

      let returnedItems: any[] = [];

      const batchGetUntilDone = (
        err: AWS.AWSError,
        data: DynamoDB.BatchGetItemOutput
      ) => {
        if (err) {
          if (returnedItems?.length) {
            resolve(returnedItems);
          } else {
            reject(err.stack);
          }
        } else {
          if (data?.Responses) {
            const itemListRaw = data.Responses[fullTableName];
            const itemList = itemListRaw.map((item) => {
              return this.#marshaller.unmarshallItem(item);
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
            resolve(returnedItems);
          }
        }
      };
      this._dynamoDb().batchGetItem(params, batchGetUntilDone);
    });
  }

  protected async allDeleteManyDangerouselyByHashAndSortKey({
    hashSortKeys,
  }: {
    hashSortKeys: {
      hashKeyValue: string;
      sortKeyValue: string;
    }[];
  }): Promise<boolean> {
    this._allErrorThrowNewErrorIfTableDoesNotHave_HashKey_and_sortKey_asPrimaryKey();

    hashSortKeys.forEach(({ hashKeyValue, sortKeyValue }) => {
      this.allHelpValidateRequiredString({
        DelHashKey: hashKeyValue,
        DelSortKey: sortKeyValue,
      });
    });

    const hashKeyName = this.#tableConfig.primaryHashKey;
    const sortKeyName = this.#tableConfig.primaryRangeSortKey || "";

    const delArray = hashSortKeys.map(({ hashKeyValue, sortKeyValue }) => {
      const params01: DynamoDB.WriteRequest = {
        DeleteRequest: {
          Key: {
            [hashKeyName]: { S: hashKeyValue },
            [sortKeyName]: { S: sortKeyValue },
          },
        },
      };
      return params01;
    });

    const fullTableName = this.#tableFullName;

    const params: DynamoDB.BatchWriteItemInput = {
      RequestItems: {
        [fullTableName]: delArray,
      },
    };

    await this._dynamoDb().batchWriteItem(params).promise();
    return true;
  }

  protected async allDeleteManyDangerouselyByIds(
    dataIds: string[]
  ): Promise<boolean> {
    this._allErrorThrowNewErrorIfTableDoesNotHave_id_asOnlyHashPrimaryKey();

    const delArray = dataIds.map((dataId) => {
      const params01: DynamoDB.WriteRequest = {
        DeleteRequest: {
          Key: {
            id: { S: dataId },
          },
        },
      };
      return params01;
    });

    const fullTableName = this.#tableFullName;

    const params: DynamoDB.BatchWriteItemInput = {
      RequestItems: {
        [fullTableName]: delArray,
      },
    };

    await this._dynamoDb().batchWriteItem(params).promise();
    return true;
  }

  protected async allDeleteByHashAndSortKeyBase({
    hashKeyValue,
    sortKeyValue,
  }: {
    hashKeyValue: string;
    sortKeyValue: string;
  }): Promise<T> {
    this._allErrorThrowNewErrorIfTableDoesNotHave_HashKey_and_sortKey_asPrimaryKey();

    this.allHelpValidateRequiredString({
      Del1HashKey: hashKeyValue,
      Del1SortKey: sortKeyValue,
    });

    const hashKeyName = this.#tableConfig.primaryHashKey;
    const sortKeyName = this.#tableConfig.primaryRangeSortKey || "";

    const dataExist = (await this.allQueryGetOneByHashAndSortBase({
      hashKeyValue,
      sortKeyValue,
    })) as IBasicProps & T;

    if (!(dataExist && dataExist.id)) {
      throw new GenericDataError("Record does NOT exists");
    }

    const params: DocumentClient.DeleteItemInput = {
      TableName: this.#tableFullName,
      Key: {
        [hashKeyName]: hashKeyValue,
        [sortKeyName]: sortKeyValue,
      },
    };

    await this._dynamoDbClient().delete(params).promise();
    return dataExist;
  }
}
