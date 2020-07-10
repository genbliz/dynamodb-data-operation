import type {
  IDynamoQueryParamOptions,
  IDynamoQuerySecondaryParamOptions,
  ISecondaryIndexDef,
} from "../types";
import { GenericDataError } from "./../helpers/errors";
import { UtilService } from "../helpers/util-service";
import { LoggingService } from "../helpers/logging-service";
import { DynamoDB } from "aws-sdk";
import { DocumentClient } from "aws-sdk/clients/dynamodb";
import Joi from "@hapi/joi";
import { Marshaller } from "@aws/dynamodb-auto-marshaller";
import { getJoiValidationErrors } from "../core/base-joi-helper";
import BaseMixins from "../core/base-mixins";
import {
  coreSchemaDefinition,
  IDynamoDataCoreEntityModel,
} from "./base-schema";

interface IDynamoOptions<T> {
  dynamoDb: () => DynamoDB;
  schemaDef: Joi.SchemaMap;
  dynamoDbClient: () => DocumentClient;
  featurePartitionValue: string;
  secondaryIndexOptions: ISecondaryIndexDef<T>[];
  baseTableName: string;
  strictRequiredFields: (keyof T)[] | string[];
}

function generateDynamoTableKey() {
  return UtilService.generateDynamoTableKey();
}

const getRandom = () =>
  [
    "rand",
    Math.round(Math.random() * 99999),
    Math.round(Math.random() * 88888),
    Math.round(Math.random() * 99),
  ].join("");

function createTenantSchema(schemaMapDef: Joi.SchemaMap) {
  return Joi.object().keys(schemaMapDef).keys(coreSchemaDefinition);
}

export abstract class DynamoDataOperation<T> extends BaseMixins {
  readonly #partitionKeyFieldName: keyof IDynamoDataCoreEntityModel = "featurePartition";
  readonly #sortKeyFieldName: keyof IDynamoDataCoreEntityModel = "id";
  //
  readonly #dynamoDbClient: () => DocumentClient;
  readonly #dynamoDb: () => DynamoDB;
  readonly #schema: Joi.Schema;
  readonly #marshaller: Marshaller;
  readonly #tableFullName: string;
  readonly #strictRequiredFields: string[];
  readonly #featurePartitionValue: string;
  readonly #secondaryIndexOptions: ISecondaryIndexDef<T>[];

  constructor({
    dynamoDb,
    schemaDef,
    dynamoDbClient,
    secondaryIndexOptions,
    featurePartitionValue,
    baseTableName,
    strictRequiredFields,
  }: IDynamoOptions<T>) {
    super();
    this.#dynamoDb = dynamoDb;
    this.#dynamoDbClient = dynamoDbClient;
    this.#schema = createTenantSchema(schemaDef);
    this.#tableFullName = baseTableName;
    this.#marshaller = new Marshaller({ onEmpty: "omit" });
    this.#featurePartitionValue = featurePartitionValue;
    this.#secondaryIndexOptions = secondaryIndexOptions;
    this.#strictRequiredFields = strictRequiredFields as string[];

    setTimeout(() => {
      this.allCreateTableIfNotExistsBase().catch((error) => {
        console.log(error);
      });
    }, 200);
  }

  private _dynamoDbClient(): DocumentClient {
    return this.#dynamoDbClient();
  }

  private _dynamoDb(): DynamoDB {
    return this.#dynamoDb();
  }

  private generateDynamoTableKey() {
    return generateDynamoTableKey();
  }

  private _getLocalVariables() {
    return {
      partitionKeyFieldName: this.#partitionKeyFieldName,
      sortKeyFieldName: this.#sortKeyFieldName,
      featurePartitionValue: this.#featurePartitionValue,
      tableFullName: this.#tableFullName,
      secondaryIndexOptions: this.#secondaryIndexOptions,
      strictRequiredFields: this.#strictRequiredFields,
    } as const;
  }

  private _getBaseObject({ dataId }: { dataId: string }) {
    const {
      partitionKeyFieldName,
      sortKeyFieldName,
      featurePartitionValue,
    } = this._getLocalVariables();

    const dataMust = {
      [partitionKeyFieldName]: featurePartitionValue,
      [sortKeyFieldName]: dataId,
    };
    return dataMust;
  }

  private _checkValidateMustBeAnObjectDataType(data: any) {
    if (!data || typeof data !== "object") {
      throw new GenericDataError(`Data MUST be valid object`);
    }
  }

  protected async allCreateOneBase({ data }: { data: T }) {
    this._checkValidateMustBeAnObjectDataType(data);

    const {
      tableFullName,
      sortKeyFieldName,
      strictRequiredFields,
    } = this._getLocalVariables();

    let dataId: string | undefined = data[sortKeyFieldName];

    if (!dataId) {
      dataId = this.generateDynamoTableKey();
    }

    if (strictRequiredFields?.length) {
      for (const field of strictRequiredFields) {
        if (data[field] === null || data[field] === undefined) {
          throw new GenericDataError(`Required field NOT defined`);
        }
      }
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

  protected async allGetOneByIdBase({ dataId }: { dataId: string }) {
    const {
      partitionKeyFieldName,
      sortKeyFieldName,
      featurePartitionValue,
      tableFullName,
    } = this._getLocalVariables();

    this.allHelpValidateRequiredString({
      QueryGetOnePartitionKey: featurePartitionValue,
      QueryGetOneSortKey: dataId,
    });

    const params: DocumentClient.GetItemInput = {
      TableName: tableFullName,
      Key: {
        [partitionKeyFieldName]: featurePartitionValue,
        [sortKeyFieldName]: dataId,
      },
    };
    const _data = await this._dynamoDbClient().get(params).promise();
    const data: T = _data.Item as any;
    if (data) return data;
    return null;
  }

  protected async allGetOneByIdProjectBase<TExpectedVals = T>({
    dataId,
    projectionAttributes,
  }: {
    dataId: string;
    projectionAttributes: (keyof TExpectedVals)[];
  }) {
    this.allHelpValidateRequiredString({ Get1DataId: dataId });

    const {
      partitionKeyFieldName,
      sortKeyFieldName,
      featurePartitionValue,
      tableFullName,
    } = this._getLocalVariables();

    const params: DocumentClient.GetItemInput = {
      TableName: tableFullName,
      Key: {
        [partitionKeyFieldName]: featurePartitionValue,
        [sortKeyFieldName]: dataId,
      },
      ProjectionExpression: projectionAttributes.join(", ").trim(),
    };

    const _data = await this._dynamoDbClient().get(params).promise();
    const data: TExpectedVals = _data.Item as any;
    return data;
  }

  protected async allUpdateOneDirectBase({ data }: { data: T }) {
    this._checkValidateMustBeAnObjectDataType(data);

    const {
      tableFullName,
      sortKeyFieldName,
      strictRequiredFields,
    } = this._getLocalVariables();

    const dataId: string | undefined = data[sortKeyFieldName];

    if (!dataId) {
      throw new GenericDataError("Update data requires sort key field value");
    }

    if (strictRequiredFields?.length) {
      for (const field of strictRequiredFields) {
        if (data[field] === null || data[field] === undefined) {
          throw new GenericDataError(`Required field NOT defined`);
        }
      }
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
  }: {
    dataId: string;
    data: T;
  }) {
    this._checkValidateMustBeAnObjectDataType(data);

    const {
      tableFullName,
      sortKeyFieldName,
      strictRequiredFields,
    } = this._getLocalVariables();

    this.allHelpValidateRequiredString({ Update1DataId: dataId });

    const dataInDb = await this.allGetOneByIdBase({ dataId });

    if (!(dataInDb && dataInDb[sortKeyFieldName])) {
      throw new GenericDataError("Data does NOT exists");
    }

    if (strictRequiredFields?.length) {
      for (const field of strictRequiredFields) {
        if (data[field] === null || data[field] === undefined) {
          throw new GenericDataError(`Required field NOT defined`);
        }
      }
    }

    const dataMust = this._getBaseObject({
      dataId: dataInDb[sortKeyFieldName],
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
    const { error, value } = this.#schema.validate(data, {
      stripUnknown: true,
    });

    if (error) {
      LoggingService.log({ "@JoiValidate": "", error, value });
      return await Promise.reject(getJoiValidationErrors(error));
    }
    const marshalledData = this.#marshaller.marshallItem(value);
    return {
      validatedData: value,
      marshalled: marshalledData,
    };
  }

  //================================

  protected async allGetListOfTablesNamesOnlineBase() {
    const params: DynamoDB.ListTablesInput = {
      Limit: 99,
    };
    const listOfTables = await this._dynamoDb().listTables(params).promise();
    return listOfTables?.TableNames;
  }

  protected async allTableSettingUpdateTTLBase({
    attrName,
    isEnabled,
  }: {
    attrName: keyof T;
    isEnabled: boolean;
  }) {
    const { tableFullName } = this._getLocalVariables();

    const params: DynamoDB.Types.UpdateTimeToLiveInput = {
      TableName: tableFullName,
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

  protected async allGetTableInfoBase() {
    try {
      const { tableFullName } = this._getLocalVariables();

      const params: DynamoDB.DescribeTableInput = {
        TableName: tableFullName,
      };
      const result = await this._dynamoDb().describeTable(params).promise();
      if (result?.Table?.TableName === tableFullName) {
        return result.Table;
      }
      return null;
    } catch (error) {
      LoggingService.log({ "@allGetTableInfoBase": "", error: error?.message });
      return null;
    }
  }

  protected async allCheckTableExistsBase() {
    const result = await this.allGetTableInfoBase();
    if (!result) {
      return false;
    }
    if (result?.GlobalSecondaryIndexes) {
      // console.log(JSON.stringify({ tableInfo: result }, null, 2));
    }
    return true;
  }

  protected async allCreateTableIfNotExistsBase() {
    const { secondaryIndexOptions } = this._getLocalVariables();

    try {
      const existingTableInfo = await this.allGetTableInfoBase();
      console.log({ existingTableInfo });
      if (existingTableInfo) {
        if (secondaryIndexOptions?.length) {
          await this._allUpdateGlobalSecondaryIndexBase({
            secondaryIndexOptions,
            existingTableInfo,
          });
        } else if (existingTableInfo.GlobalSecondaryIndexes?.length) {
          await this._allUpdateGlobalSecondaryIndexBase({
            secondaryIndexOptions: [],
            existingTableInfo,
          });
        }
        return null;
      }
    } catch (error) {
      //
    }
    return await this.allCreateTableBase();
  }

  protected async allCreateTableBase() {
    const {
      partitionKeyFieldName,
      sortKeyFieldName,
      tableFullName,
      secondaryIndexOptions,
    } = this._getLocalVariables();

    const params: DynamoDB.CreateTableInput = {
      AttributeDefinitions: [
        {
          AttributeName: partitionKeyFieldName,
          AttributeType: "S",
        },
        {
          AttributeName: sortKeyFieldName,
          AttributeType: "S",
        },
      ],
      KeySchema: [
        {
          AttributeName: partitionKeyFieldName,
          KeyType: "HASH",
        },
        {
          AttributeName: sortKeyFieldName,
          KeyType: "RANGE",
        },
      ],
      BillingMode: "PAY_PER_REQUEST",
      TableName: tableFullName,
    };

    params.Tags = [
      {
        Key: "tablePrefix",
        Value: tableFullName,
      },
      {
        Key: `DDBTableGroupKey-${tableFullName}`,
        Value: tableFullName,
      },
    ];

    if (secondaryIndexOptions?.length) {
      const creationParams = this._getGlobalSecondaryIndexCreationParams(
        secondaryIndexOptions
      );
      if (creationParams.xAttributeDefinitions?.length) {
        const existAttrDefNames = params.AttributeDefinitions.map(
          (def) => def.AttributeName
        );
        creationParams.xAttributeDefinitions.forEach((def) => {
          const alreadyDefined = existAttrDefNames.includes(def.AttributeName);
          if (!alreadyDefined) {
            params.AttributeDefinitions.push(def);
          }
        });
      }
      params.GlobalSecondaryIndexes = [...creationParams.xGlobalSecondaryIndex];
    }

    LoggingService.log({
      "@allCreateTableBase, table: ": tableFullName,
    });

    const result = await this._dynamoDb().createTable(params).promise();

    if (result?.TableDescription) {
      LoggingService.log(
        [
          `@allCreateTableBase,`,
          `Created table: '${result?.TableDescription.TableName}'`,
          new Date().toTimeString(),
        ].join(" ")
      );
      return result.TableDescription;
    }
    return null;
  }

  protected async allDeleteGlobalSecondaryIndexBase(indexName: string) {
    const { tableFullName } = this._getLocalVariables();

    const params: DynamoDB.UpdateTableInput = {
      TableName: tableFullName,
      GlobalSecondaryIndexUpdates: [
        {
          Delete: {
            IndexName: indexName,
          },
        },
      ],
    };
    const result = await this._dynamoDb().updateTable(params).promise();
    if (result?.TableDescription) {
      return result.TableDescription;
    }
    return null;
  }

  protected async allExistsByIdBase(dataId: string) {
    this.allHelpValidateRequiredString({ Exist1DataId: dataId });

    const { sortKeyFieldName } = this._getLocalVariables();

    type IProject = {
      [n: string]: string;
    };

    const data = await this.allGetOneByIdProjectBase<IProject>({
      dataId,
      projectionAttributes: [sortKeyFieldName],
    });
    if (data && data[sortKeyFieldName]) {
      return true;
    }
    return false;
  }

  private _getGlobalSecondaryIndexCreationParams(
    secondaryIndexOptions: ISecondaryIndexDef<T>[]
  ) {
    const { tableFullName } = this._getLocalVariables();
    const params: DynamoDB.CreateTableInput = {
      KeySchema: [], //  make linter happy
      AttributeDefinitions: [],
      TableName: tableFullName,
      GlobalSecondaryIndexes: [],
    };

    const attributeDefinitionsNameList: string[] = [];

    secondaryIndexOptions.forEach((sIndex) => {
      const {
        indexName,
        keyFieldName,
        sortFieldName,
        dataType,
        projectionFieldsInclude,
      } = sIndex;
      //
      const _keyFieldName = keyFieldName as string;
      const _sortFieldName = sortFieldName as string;

      if (!attributeDefinitionsNameList.includes(_keyFieldName)) {
        attributeDefinitionsNameList.push(_keyFieldName);
        params?.AttributeDefinitions?.push({
          AttributeName: _keyFieldName,
          AttributeType: dataType,
        });
      }

      if (!attributeDefinitionsNameList.includes(_sortFieldName)) {
        attributeDefinitionsNameList.push(_sortFieldName);
        params?.AttributeDefinitions?.push({
          AttributeName: _sortFieldName,
          AttributeType: dataType,
        });
      }

      let projectionFields = (projectionFieldsInclude || []) as string[];
      let projectionType: AWS.DynamoDB.ProjectionType = "ALL";

      if (projectionFields?.length) {
        // remove frimary keys from include
        projectionFields = projectionFields.filter((field) => {
          return field !== _keyFieldName && field !== _sortFieldName;
        });
        if (projectionFields.length === 0) {
          // only keys was projceted
          projectionType = "KEYS_ONLY";
        } else {
          // only keys was projceted
          projectionType = "INCLUDE";
        }
      }

      params.GlobalSecondaryIndexes?.push({
        IndexName: indexName,
        Projection: {
          ProjectionType: projectionType,
          NonKeyAttributes:
            projectionType === "INCLUDE" ? projectionFields : undefined,
        },
        KeySchema: [
          {
            AttributeName: _keyFieldName,
            KeyType: "HASH",
          },
          {
            AttributeName: _sortFieldName,
            KeyType: "RANGE",
          },
        ],
      });
    });
    return {
      xAttributeDefinitions: params.AttributeDefinitions || [],
      xGlobalSecondaryIndex: params.GlobalSecondaryIndexes || [],
    };
  }

  private async _allUpdateGlobalSecondaryIndexBase({
    secondaryIndexOptions,
    existingTableInfo,
  }: {
    secondaryIndexOptions: ISecondaryIndexDef<T>[];
    existingTableInfo: DynamoDB.TableDescription;
  }): Promise<DynamoDB.TableDescription[] | null> {
    try {
      const existingIndexNames: string[] = [];
      const staledIndexNames: string[] = [];
      const allIndexNames: string[] = [];
      const newSecondaryIndexOptions: ISecondaryIndexDef<T>[] = [];

      const updateResults: DynamoDB.TableDescription[] = [];

      if (existingTableInfo?.GlobalSecondaryIndexes?.length) {
        existingTableInfo?.GlobalSecondaryIndexes.forEach((indexInfo) => {
          if (indexInfo.IndexName) {
            existingIndexNames.push(indexInfo.IndexName);
          }
        });
      }

      secondaryIndexOptions?.forEach((newIndexInfo) => {
        allIndexNames.push(newIndexInfo.indexName);
        const indexExists = existingIndexNames.includes(newIndexInfo.indexName);
        if (!indexExists) {
          newSecondaryIndexOptions.push(newIndexInfo);
        }
      });

      existingIndexNames.forEach((indexName) => {
        const existsInList = allIndexNames.includes(indexName);
        if (!existsInList) {
          staledIndexNames.push(indexName);
        }
      });

      if (!(newSecondaryIndexOptions.length || staledIndexNames.length)) {
        return null;
      }

      let canUpdate = false;

      const { tableFullName } = this._getLocalVariables();

      LoggingService.log({
        secondaryIndexOptions: secondaryIndexOptions.length,
        newSecondaryIndexOptions: newSecondaryIndexOptions.length,
        staledIndexNames: staledIndexNames.length,
        tableName: tableFullName,
      });

      if (newSecondaryIndexOptions.length) {
        canUpdate = true;
        let indexCount = 0;
        for (const indexOption of newSecondaryIndexOptions) {
          const params: DynamoDB.UpdateTableInput = {
            TableName: tableFullName,
            GlobalSecondaryIndexUpdates: [],
          };
          indexCount++;

          const creationParams = this._getGlobalSecondaryIndexCreationParams([
            indexOption,
          ]);

          const indexName = creationParams.xGlobalSecondaryIndex[0].IndexName;

          params.AttributeDefinitions = [
            ...creationParams.xAttributeDefinitions,
          ];

          creationParams.xGlobalSecondaryIndex.forEach((gsi) => {
            params.GlobalSecondaryIndexUpdates?.push({
              Create: {
                ...gsi,
              },
            });
          });

          const result = await this._dynamoDb().updateTable(params).promise();
          if (result?.TableDescription) {
            updateResults.push(result?.TableDescription);
          }

          LoggingService.log(
            [
              `Creating Index: '${indexName}'`,
              `on table '${tableFullName}' started:`,
              new Date().toTimeString(),
            ].join(" ")
          );

          if (indexCount !== newSecondaryIndexOptions.length) {
            const label = `Created Index '${indexName}'`;
            console.time(label);
            await UtilService.waitUntilMunites(5);
            console.timeEnd(label);
          }
        }
      }

      if (staledIndexNames.length) {
        if (canUpdate) {
          await UtilService.waitUntilMunites(4);
        }
        canUpdate = true;
        let indexCount = 0;

        for (const indexName of staledIndexNames) {
          const params: DynamoDB.UpdateTableInput = {
            TableName: tableFullName,
            GlobalSecondaryIndexUpdates: [],
          };

          indexCount++;

          params.GlobalSecondaryIndexUpdates?.push({
            Delete: {
              IndexName: indexName,
            },
          });

          const result = await this._dynamoDb().updateTable(params).promise();
          if (result?.TableDescription) {
            updateResults.push(result?.TableDescription);
          }

          LoggingService.log(
            [
              `Deleting Index: '${indexName}'`,
              `on table '${tableFullName}' started:`,
              new Date().toTimeString(),
            ].join(" ")
          );

          if (indexCount !== staledIndexNames.length) {
            const label = `Deleted Index '${indexName}'`;
            console.time(label);
            await UtilService.waitUntilMunites(1);
            console.timeEnd(label);
          }
        }
      }

      if (!canUpdate) {
        return null;
      }

      if (updateResults.length) {
        console.log({
          "@allCreateGlobalSecondaryIndexBase": "",
          updateResults,
        });
        return updateResults;
      }
      return null;
    } catch (error) {
      LoggingService.log({
        "@allCreateGlobalSecondaryIndexBase": "",
        error: error?.message,
      });
      return null;
    }
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
    if (!paramOptions?.partitionSortKeyQuery?.partitionKeyEquals) {
      throw new GenericDataError("Invalid Hash key value");
    }
    if (!sortKeyFieldName) {
      throw new GenericDataError("Bad query sort configuration");
    }

    let sortKeyQuery: any = {};

    const sortKeyQueryData = paramOptions.partitionSortKeyQuery.sortKeyQuery;
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
          [partitionKeyFieldName]:
            paramOptions.partitionSortKeyQuery.partitionKeyEquals,
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
      const filterOtherAttributes = this.__helperDynamoFilterOperation({
        queryDefs: paramOptions.query,
        projectionFields: null,
      });

      otherExpressionAttributeValues =
        filterOtherAttributes.expressionAttributeValues;
      otherExpressionAttributeNames =
        filterOtherAttributes.expressionAttributeNames;

      if (
        filterOtherAttributes?.filterExpression &&
        filterOtherAttributes?.filterExpression.length > 1
      ) {
        otherFilterExpression = filterOtherAttributes.filterExpression;
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
      params,
      hashKeyAndSortKey,
      ...paginationObjects,
    });
    return result;
  }

  protected async allBatchGetManyByHashAndSortKey({
    dataIds,
    fields,
  }: {
    dataIds: string[];
    fields?: (keyof T)[];
  }) {
    dataIds.forEach((sortKeyValue) => {
      this.allHelpValidateRequiredString({
        BatchGetSortKey: sortKeyValue,
      });
    });
    return new Promise<T[]>((resolve, reject) => {
      const {
        tableFullName,
        partitionKeyFieldName,
        sortKeyFieldName,
        featurePartitionValue,
      } = this._getLocalVariables();

      const getArray: DynamoDB.Key[] = dataIds.map((sortKeyValue) => {
        const params01 = {
          [partitionKeyFieldName]: { S: featurePartitionValue },
          [sortKeyFieldName]: { S: sortKeyValue },
        };
        return params01;
      });

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
          [tableFullName]: {
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
            const itemListRaw = data.Responses[tableFullName];
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
    const { tableFullName, secondaryIndexOptions } = this._getLocalVariables();

    if (!secondaryIndexOptions?.length) {
      throw new GenericDataError("Invalid secondary index definitions");
    }

    const secondaryIndex = secondaryIndexOptions.find(({ indexName }) => {
      return secondaryIndexName === indexName;
    });

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
      TableName: tableFullName,
      IndexName: secondaryIndexName,
      KeyConditionExpression: filterExpression,
      //
      ExpressionAttributeValues: expressionAttributeValues,
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

  protected async allDeleteByIdBase({
    dataId,
  }: {
    dataId: string;
  }): Promise<T> {
    //
    this.allHelpValidateRequiredString({ Del1SortKey: dataId });
    const {
      tableFullName,
      partitionKeyFieldName,
      sortKeyFieldName,
      featurePartitionValue,
    } = this._getLocalVariables();

    const dataExist = await this.allDeleteByIdBase({ dataId });

    if (!(dataExist && dataExist[sortKeyFieldName])) {
      throw new GenericDataError("Record does NOT exists");
    }

    const params: DocumentClient.DeleteItemInput = {
      TableName: tableFullName,
      Key: {
        [partitionKeyFieldName]: featurePartitionValue,
        [sortKeyFieldName]: dataId,
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
      featurePartitionValue,
    } = this._getLocalVariables();

    const delArray = dataIds.map((sortKeyValue) => {
      const params01: DynamoDB.WriteRequest = {
        DeleteRequest: {
          Key: {
            [partitionKeyFieldName]: { S: featurePartitionValue },
            [sortKeyFieldName]: { S: sortKeyValue },
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
