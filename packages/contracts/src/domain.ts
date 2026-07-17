import { z } from 'zod';
import {
  entityMetaSchema,
  isoDateTimeSchema,
  localDateSchema,
  nonBlankSchema,
  optionalTextSchema,
  uuidSchema,
} from './common.js';

export const apiaryFieldsSchema = z.object({
  name: nonBlankSchema.max(120),
  location: z.string().trim().max(500).optional().nullable(),
  accessNotes: optionalTextSchema,
  notes: optionalTextSchema,
  archivedAt: isoDateTimeSchema.optional().nullable(),
});
export const apiarySchema = entityMetaSchema.extend(apiaryFieldsSchema.shape);

export const hiveStatusSchema = z.enum(['active', 'inactive', 'lost', 'sold', 'archived']);
export const hiveFieldsSchema = z.object({
  apiaryId: uuidSchema,
  name: nonBlankSchema.max(120),
  status: hiveStatusSchema.default('active'),
  installDate: localDateSchema.optional().nullable(),
  origin: z.string().trim().max(500).optional().nullable(),
  notes: optionalTextSchema,
  archivedAt: isoDateTimeSchema.optional().nullable(),
});
export const hiveSchema = entityMetaSchema.extend(hiveFieldsSchema.shape);

export const queenFieldsSchema = z.object({
  hiveId: uuidSchema,
  identifier: nonBlankSchema.max(120),
  marked: z.boolean().default(false),
  markColor: z.string().trim().max(40).optional().nullable(),
  year: z.number().int().min(1900).max(2200).optional().nullable(),
  source: z.string().trim().max(500).optional().nullable(),
  introductionDate: localDateSchema.optional().nullable(),
  status: z.enum(['current', 'superseded', 'lost', 'removed', 'unknown']).default('current'),
  notes: optionalTextSchema,
});
export const queenSchema = entityMetaSchema.extend(queenFieldsSchema.shape);

export const equipmentBoxFieldsSchema = z.object({
  hiveId: uuidSchema,
  boxType: z.enum([
    'bottom_board',
    'deep',
    'medium',
    'shallow',
    'queen_excluder',
    'feeder',
    'inner_cover',
    'outer_cover',
    'other',
  ]),
  purpose: z
    .enum(['entrance', 'brood', 'honey', 'feeding', 'ventilation', 'cover', 'other'])
    .optional()
    .nullable(),
  position: z.number().int().min(1).max(20),
  frameCount: z.number().int().min(1).max(24).optional().nullable(),
  status: z.enum(['active', 'stored', 'removed']).default('active'),
  notes: optionalTextSchema,
});
export const equipmentBoxSchema = entityMetaSchema.extend(equipmentBoxFieldsSchema.shape);

export const weatherSnapshotSchema = z.object({
  temperature: z.number().min(-100).max(150).optional().nullable(),
  temperatureUnit: z.enum(['f', 'c']).default('f'),
  conditions: z.string().trim().max(120).optional().nullable(),
  humidity: z.number().min(0).max(100).optional().nullable(),
  windSpeed: z.number().min(0).max(300).optional().nullable(),
  windSpeedUnit: z.enum(['mph', 'kph']).default('mph'),
  windDirection: z
    .enum(['calm', 'n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw', 'variable'])
    .optional()
    .nullable(),
  wind: z.string().trim().max(120).optional().nullable(),
  source: z.enum(['manual', 'provider']).default('manual'),
});

export const inspectionFieldsSchema = z.object({
  hiveId: uuidSchema,
  inspectedAt: isoDateTimeSchema,
  inspectorName: nonBlankSchema.max(120),
  state: z.enum(['draft', 'complete']).default('draft'),
  notes: optionalTextSchema,
  temperament: z.enum(['calm', 'normal', 'defensive', 'not_observed']).default('not_observed'),
  populationStrength: z
    .enum(['weak', 'moderate', 'strong', 'not_observed'])
    .default('not_observed'),
  queenSeen: z.boolean().optional().nullable(),
  eggsOrLarvae: z.boolean().optional().nullable(),
  broodCondition: z.string().trim().max(500).optional().nullable(),
  stores: z.string().trim().max(500).optional().nullable(),
  followUpNotes: optionalTextSchema,
  weather: weatherSnapshotSchema.optional().nullable(),
});
export const inspectionSchema = entityMetaSchema.extend(inspectionFieldsSchema.shape);

export const miteCountFieldsSchema = z.object({
  hiveId: uuidSchema,
  inspectionId: uuidSchema.optional().nullable(),
  measuredAt: isoDateTimeSchema,
  method: z.enum(['alcohol_wash', 'sugar_roll', 'sticky_board', 'visual', 'other']),
  sampleSize: z.number().int().positive().optional().nullable(),
  miteCount: z.number().int().min(0),
  resultPercent: z.number().min(0).max(100).optional().nullable(),
  notes: optionalTextSchema,
});
export const miteCountSchema = entityMetaSchema.extend(miteCountFieldsSchema.shape);

export const healthObservationFieldsSchema = z.object({
  hiveId: uuidSchema,
  inspectionId: uuidSchema.optional().nullable(),
  observedAt: isoDateTimeSchema,
  category: nonBlankSchema.max(120),
  severity: z.enum(['low', 'medium', 'high', 'unknown']).default('unknown'),
  notes: optionalTextSchema,
  resolvedAt: isoDateTimeSchema.optional().nullable(),
});
export const healthObservationSchema = entityMetaSchema.extend(healthObservationFieldsSchema.shape);

export const feedingEventFieldsSchema = z.object({
  hiveId: uuidSchema,
  inspectionId: uuidSchema.optional().nullable(),
  fedAt: isoDateTimeSchema,
  feedType: nonBlankSchema.max(120),
  amount: z.number().positive().optional().nullable(),
  unit: z.string().trim().max(40).optional().nullable(),
  reason: z.string().trim().max(500).optional().nullable(),
  notes: optionalTextSchema,
});
export const feedingEventSchema = entityMetaSchema.extend(feedingEventFieldsSchema.shape);

export const treatmentEventFieldsSchema = z.object({
  hiveId: uuidSchema,
  inspectionId: uuidSchema.optional().nullable(),
  productOrMethod: nonBlankSchema.max(240),
  applicationDate: localDateSchema,
  removalDate: localDateSchema.optional().nullable(),
  dosageOrAmount: z.string().trim().max(240).optional().nullable(),
  restrictions: z.string().trim().max(1000).optional().nullable(),
  notes: optionalTextSchema,
});
export const treatmentEventSchema = entityMetaSchema.extend(treatmentEventFieldsSchema.shape);

export const harvestFieldsSchema = z.object({
  hiveId: uuidSchema,
  inspectionId: uuidSchema.optional().nullable(),
  harvestedAt: isoDateTimeSchema,
  quantity: z.number().positive(),
  unit: nonBlankSchema.max(40),
  notes: optionalTextSchema,
});
export const harvestSchema = entityMetaSchema.extend(harvestFieldsSchema.shape);

export const followUpFieldsSchema = z.object({
  hiveId: uuidSchema,
  inspectionId: uuidSchema.optional().nullable(),
  description: nonBlankSchema.max(1000),
  dueDate: localDateSchema.optional().nullable(),
  completedAt: isoDateTimeSchema.optional().nullable(),
});
export const followUpSchema = entityMetaSchema.extend(followUpFieldsSchema.shape);

export const mediaAssetFieldsSchema = z.object({
  hiveId: uuidSchema,
  inspectionId: uuidSchema.optional().nullable(),
  fileName: nonBlankSchema.max(255),
  mediaType: z.enum(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']),
  byteSize: z
    .number()
    .int()
    .positive()
    .max(25 * 1024 * 1024),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  caption: z.string().trim().max(1000).optional().nullable(),
  width: z.number().int().positive().optional().nullable(),
  height: z.number().int().positive().optional().nullable(),
  capturedAt: isoDateTimeSchema.optional().nullable(),
  state: z.enum(['staged', 'uploading', 'ready', 'failed', 'deleted']),
});
export const mediaAssetSchema = entityMetaSchema.extend(mediaAssetFieldsSchema.shape);

export const resourceTypeSchema = z.enum([
  'apiary',
  'hive',
  'queen',
  'equipmentBox',
  'inspection',
  'miteCount',
  'healthObservation',
  'feedingEvent',
  'treatmentEvent',
  'harvest',
  'followUp',
  'mediaAsset',
]);
export type ResourceType = z.infer<typeof resourceTypeSchema>;

export const resourceSchemas = {
  apiary: apiarySchema,
  hive: hiveSchema,
  queen: queenSchema,
  equipmentBox: equipmentBoxSchema,
  inspection: inspectionSchema,
  miteCount: miteCountSchema,
  healthObservation: healthObservationSchema,
  feedingEvent: feedingEventSchema,
  treatmentEvent: treatmentEventSchema,
  harvest: harvestSchema,
  followUp: followUpSchema,
  mediaAsset: mediaAssetSchema,
} as const;

export const resourceFieldSchemas = {
  apiary: apiaryFieldsSchema,
  hive: hiveFieldsSchema,
  queen: queenFieldsSchema,
  equipmentBox: equipmentBoxFieldsSchema,
  inspection: inspectionFieldsSchema,
  miteCount: miteCountFieldsSchema,
  healthObservation: healthObservationFieldsSchema,
  feedingEvent: feedingEventFieldsSchema,
  treatmentEvent: treatmentEventFieldsSchema,
  harvest: harvestFieldsSchema,
  followUp: followUpFieldsSchema,
  mediaAsset: mediaAssetFieldsSchema,
} as const;

export type Apiary = z.infer<typeof apiarySchema>;
export type Hive = z.infer<typeof hiveSchema>;
export type Queen = z.infer<typeof queenSchema>;
export type EquipmentBox = z.infer<typeof equipmentBoxSchema>;
export type Inspection = z.infer<typeof inspectionSchema>;
export type MiteCount = z.infer<typeof miteCountSchema>;
export type HealthObservation = z.infer<typeof healthObservationSchema>;
export type FeedingEvent = z.infer<typeof feedingEventSchema>;
export type TreatmentEvent = z.infer<typeof treatmentEventSchema>;
export type Harvest = z.infer<typeof harvestSchema>;
export type FollowUp = z.infer<typeof followUpSchema>;
export type MediaAsset = z.infer<typeof mediaAssetSchema>;
