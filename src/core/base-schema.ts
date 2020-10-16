import Joi from "@hapi/joi";

export interface IDynamoDataCoreEntityModel {
  id: string;
  featureEntity: string;
}

export const coreSchemaDefinition = {
  id: Joi.string().required().min(5).max(250),
  featureEntity: Joi.string().required().min(2).max(100),
} as const;
