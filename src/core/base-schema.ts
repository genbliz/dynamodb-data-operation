import Joi from "@hapi/joi";

export interface IDynamoDataCoreEntityModel {
  id: string;
  featureIdentity: string;
}

export const coreSchemaDefinition = {
  id: Joi.string().required().min(5).max(100),
  featureIdentity: Joi.string().required().min(3).max(100),
} as const;
