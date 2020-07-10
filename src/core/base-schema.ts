import Joi from "@hapi/joi";
import { dateISOValidation } from "./base-joi-helper";

export interface ICoreEntityBaseModel {
  id: string;
  partitionSegment: string;
  //
  // tags?: string[];
  //
  lastModifierUserId?: string;
  lastModifiedDate?: string;
  //
  creatorUserId?: string;
  createdAtDate?: string;
  //
  deleterUserId?: string;
  isDeleted?: boolean;
}

export const coreSchemaDefinition = {
  id: Joi.string().required().min(3).max(80),
  partitionSegment: Joi.string().required().min(3).max(80),
  //
  lastModifierUserId: Joi.string().allow(null).empty("").default(null),
  lastModifiedDate: dateISOValidation(),
  //
  creatorUserId: Joi.string().allow(null).empty("").default(null),
  createdAtDate: dateISOValidation({ isRequired: true }),
  //
  deleterUserId: Joi.string().allow(null).empty("").default(null),
  isDeleted: Joi.boolean().default(false),
} as const;
