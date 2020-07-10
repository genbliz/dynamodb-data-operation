import { DynamoDB, AWSError } from "aws-sdk";
import type { IDynamoPagingResult } from "../types";
import { MyDynamoConnection } from "../test/connection";

export abstract class DynamoQueryScanProcessor {
  //
  protected async __helperDynamoQueryProcessor<T>({
    evaluationLimit,
    params,
    pageSize,
    lastKeyHash,
    orderDesc,
    hashKeyAndSortKey,
  }: {
    evaluationLimit?: number;
    params: DynamoDB.QueryInput;
    pageSize?: number;
    lastKeyHash?: any;
    orderDesc?: boolean;
    hashKeyAndSortKey: [string, string];
  }) {
    return await this.__helperDynamoQueryScanProcessor<T>({
      operation: "query",
      evaluationLimit,
      params,
      pageSize,
      lastKeyHash,
      orderDesc,
      hashKeyAndSortKey,
    });
  }

  protected async __helperDynamoScanProcessor<T>({
    evaluationLimit,
    params,
    pageSize,
    lastKeyHash,
  }: {
    evaluationLimit?: number;
    params: DynamoDB.ScanInput;
    pageSize?: number;
    lastKeyHash?: any;
  }) {
    return await this.__helperDynamoQueryScanProcessor<T>({
      operation: "scan",
      evaluationLimit,
      params,
      pageSize,
      lastKeyHash,
    });
  }

  private __helperDynamoQueryScanProcessor<T>({
    operation,
    evaluationLimit,
    params,
    pageSize,
    lastKeyHash,
    orderDesc,
    hashKeyAndSortKey,
  }: {
    operation: "query" | "scan";
    evaluationLimit?: number;
    params: DynamoDB.QueryInput | DynamoDB.ScanInput;
    pageSize?: number;
    lastKeyHash?: any;
    orderDesc?: boolean;
    hashKeyAndSortKey?: [string, string];
  }) {
    const xDefaultEvaluationLimit = 10;
    const xMinEvaluationLimit = 5;
    const xMaxEvaluationLimit = 500;

    type IResult = DynamoDB.QueryOutput | DynamoDB.ScanOutput;

    console.log({
      processorParams: {
        operation,
        pageSize,
        orderDesc,
        lastKeyHash,
        evaluationLimit,
        hashKeyAndSortKey,
      },
    });

    return new Promise<IDynamoPagingResult<T[]>>((resolve, reject) => {
      let returnedItems: any[] = [];
      let _evaluationLimit: number = 0;

      if (pageSize) {
        //
        _evaluationLimit = xDefaultEvaluationLimit;
        if (evaluationLimit) {
          _evaluationLimit = evaluationLimit;
        }

        if (_evaluationLimit < xMinEvaluationLimit) {
          _evaluationLimit = xMinEvaluationLimit;
          //
        } else if (_evaluationLimit > xMaxEvaluationLimit) {
          _evaluationLimit = xDefaultEvaluationLimit;
        }

        if (pageSize > _evaluationLimit) {
          _evaluationLimit = pageSize + 1;
          //
        } else if (pageSize === _evaluationLimit) {
          // _evaluationLimit = pageSize + 1;
        }
      }

      const queryScanUntilDone = (err: AWSError, data: IResult) => {
        if (err) {
          console.log(err, err.stack);
          if (returnedItems?.length) {
            resolve({ mainResult: returnedItems });
          } else {
            reject(err.stack);
          }
        } else {
          if (data?.Items?.length) {
            returnedItems = [...returnedItems, ...data.Items];
          }

          if (returnedItems.length && hashKeyAndSortKey?.length) {
            const dataObj = returnedItems.slice(-1)[0];
            const customLastEvaluationKey = this.__createCustomLastEvaluationKey(
              dataObj,
              hashKeyAndSortKey
            );
            console.log({ customLastEvaluationKey });
          }

          if (pageSize && returnedItems.length >= pageSize) {
            const scanResult: IDynamoPagingResult<T[]> = {
              mainResult: returnedItems,
            };
            if (data.LastEvaluatedKey) {
              const lastKeyHash = this.__encodeLastKey(data.LastEvaluatedKey);
              scanResult.lastKeyHash = lastKeyHash;
            }
            resolve(scanResult);
          } else if (data.LastEvaluatedKey) {
            const _paramsDef = { ...params };
            _paramsDef.ExclusiveStartKey = data.LastEvaluatedKey;
            if (_evaluationLimit) {
              _paramsDef.Limit = _evaluationLimit;
            }
            console.log({ operation, dynamoProcessorParams: _paramsDef });
            MyDynamoConnection.dynamoDbClientInst()[operation](
              _paramsDef,
              queryScanUntilDone
            );
          } else {
            resolve({ mainResult: returnedItems });
          }
        }
      };

      const _params = { ...params };
      if (_evaluationLimit) {
        _params.Limit = _evaluationLimit;
      }
      if (lastKeyHash) {
        const _lastEvaluatedKey = this.__decodeLastKey(lastKeyHash);
        if (_lastEvaluatedKey) {
          _params.ExclusiveStartKey = _lastEvaluatedKey;
        }
      }
      if (orderDesc === true && operation === "query") {
        _params["ScanIndexForward"] = false;
      }
      console.log({ operation, dynamoProcessorParams: _params });
      MyDynamoConnection.dynamoDbClientInst()[operation](
        _params,
        queryScanUntilDone
      );
    });
  }

  private __encodeLastKey(lastEvaluatedKey: any) {
    return Buffer.from(JSON.stringify(lastEvaluatedKey)).toString("base64");
  }

  private __createCustomLastEvaluationKey(
    dataObj: Record<string, any>,
    primaryFieldNames: string[]
  ) {
    const obj: any = {};
    primaryFieldNames.forEach((key) => {
      if (typeof dataObj[key] !== "undefined") {
        obj[key] = dataObj[key];
      }
    });
    return Object.keys(obj).length > 0 ? obj : null;
  }

  private __decodeLastKey(lastKeyHash: any) {
    let _lastEvaluatedKey: any;
    try {
      const _lastKeyHashStr = Buffer.from(lastKeyHash, "base64").toString();
      _lastEvaluatedKey = JSON.parse(_lastKeyHashStr);
    } catch (error) {
      _lastEvaluatedKey = undefined;
    }
    return _lastEvaluatedKey;
  }
}
