import { z } from 'zod';
import { EXPORT_FORMAT_VERSION, PRODUCT_NAME } from './build.js';
import { isoDateTimeSchema, uuidSchema } from './common.js';
import { resourceFieldSchemas, resourceTypeSchema, type ResourceType } from './domain.js';

/**
 * Verified reader for the portable export archive (`/api/v1/export/full`,
 * export format 1) so a family can restore a workspace from the same file the
 * export produced (WEB-001, design v2 §1c: local-only sessions must have a
 * first-class local backup AND restore).
 *
 * The parser is runtime-neutral: it receives the already-unzipped archive
 * entries and a SHA-256 implementation, so the Node API, the Cloudflare
 * worker, and tests share one integrity contract.
 */

/** Distinguishes an archive that is not an export from one that is damaged. */
export class ExportArchiveError extends Error {
  constructor(
    readonly code: 'invalid' | 'corrupt',
    message: string,
  ) {
    super(message);
    this.name = 'ExportArchiveError';
  }
}

const manifestSchema = z.object({
  product: z.string(),
  exportFormat: z.number(),
  exportedAt: isoDateTimeSchema.optional(),
  dataSha256: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .optional(),
});

const recordMetaSchema = z.object({
  id: uuidSchema,
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

const metaKeys = new Set([
  'id',
  'organizationId',
  'version',
  'createdAt',
  'updatedAt',
  'deletedAt',
]);

/** One record read from an export archive, validated and ready to import. */
export interface ImportedRecord {
  id: string;
  createdAt: string;
  updatedAt: string;
  fields: Record<string, unknown>;
}

export interface ParsedExportArchive {
  manifest: z.infer<typeof manifestSchema>;
  records: Record<ResourceType, ImportedRecord[]>;
  /** Original image bytes present in the archive, verified, keyed by media id. */
  mediaBytes: Map<string, Uint8Array>;
  /** Ids of `ready` media records whose original bytes are not in the archive. */
  missingMediaIds: string[];
}

const MAX_IMPORT_RECORDS = 200_000;

function decodeJson(name: string, bytes: Uint8Array): unknown {
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    throw new ExportArchiveError('corrupt', `The archive's ${name} could not be read`);
  }
}

/**
 * Validate an unzipped export archive and return its importable content.
 *
 * Integrity checks, in order: the manifest identifies an ApiaryLens export of
 * a supported format; `data.json` matches the manifest's recorded SHA-256
 * when one is present; every record validates against the resource schemas;
 * and every image in the archive matches the size and SHA-256 its own record
 * declares. Any failure refuses the whole archive — a restore never applies a
 * file it could not fully verify.
 */
export async function parseExportArchive(
  files: Record<string, Uint8Array>,
  sha256Hex: (bytes: Uint8Array) => string | Promise<string>,
): Promise<ParsedExportArchive> {
  const manifestBytes = files['manifest.json'];
  if (!manifestBytes) {
    throw new ExportArchiveError('invalid', 'The file is not an ApiaryLens backup: no manifest');
  }
  const manifest = manifestSchema.safeParse(decodeJson('manifest', manifestBytes));
  if (!manifest.success || manifest.data.product !== PRODUCT_NAME) {
    throw new ExportArchiveError('invalid', 'The file is not an ApiaryLens backup archive');
  }
  if (manifest.data.exportFormat !== EXPORT_FORMAT_VERSION) {
    throw new ExportArchiveError(
      'invalid',
      `This build restores export format ${EXPORT_FORMAT_VERSION}; the file declares format ${manifest.data.exportFormat}`,
    );
  }
  const dataBytes = files['data.json'];
  if (!dataBytes) {
    throw new ExportArchiveError('corrupt', 'The backup archive is missing its data.json');
  }
  if (manifest.data.dataSha256 && (await sha256Hex(dataBytes)) !== manifest.data.dataSha256) {
    throw new ExportArchiveError(
      'corrupt',
      'The backup data does not match its recorded checksum — the file is damaged or was modified',
    );
  }
  const data = decodeJson('data.json', dataBytes);
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new ExportArchiveError('corrupt', 'The backup data has an unexpected shape');
  }
  for (const key of Object.keys(data)) {
    if (!resourceTypeSchema.safeParse(key).success) {
      throw new ExportArchiveError(
        'invalid',
        `The backup contains an unknown record type "${key}"`,
      );
    }
  }

  const records = Object.fromEntries(
    resourceTypeSchema.options.map((entityType) => [entityType, [] as ImportedRecord[]]),
  ) as Record<ResourceType, ImportedRecord[]>;
  let total = 0;
  for (const entityType of resourceTypeSchema.options) {
    const entries = (data as Record<string, unknown>)[entityType] ?? [];
    if (!Array.isArray(entries)) {
      throw new ExportArchiveError('corrupt', `The ${entityType} records have an unexpected shape`);
    }
    const seen = new Set<string>();
    for (const entry of entries) {
      total += 1;
      if (total > MAX_IMPORT_RECORDS) {
        throw new ExportArchiveError('invalid', 'The backup holds too many records to import');
      }
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
        throw new ExportArchiveError('corrupt', `A ${entityType} record has an unexpected shape`);
      }
      const meta = recordMetaSchema.safeParse(entry);
      if (!meta.success) {
        throw new ExportArchiveError('corrupt', `A ${entityType} record has invalid identity data`);
      }
      if (seen.has(meta.data.id)) {
        throw new ExportArchiveError('corrupt', `The backup repeats ${entityType} ${meta.data.id}`);
      }
      seen.add(meta.data.id);
      const rawFields = Object.fromEntries(
        Object.entries(entry as Record<string, unknown>).filter(([key]) => !metaKeys.has(key)),
      );
      const fields = resourceFieldSchemas[entityType].safeParse(rawFields);
      if (!fields.success) {
        throw new ExportArchiveError(
          'corrupt',
          `${entityType} ${meta.data.id} does not match the ApiaryLens record contract`,
        );
      }
      records[entityType].push({ ...meta.data, fields: fields.data });
    }
  }

  const mediaBytes = new Map<string, Uint8Array>();
  const missingMediaIds: string[] = [];
  for (const record of records.mediaAsset) {
    const path = Object.keys(files).find((name) => name.startsWith(`media/${record.id}/`));
    const bytes = path ? files[path] : undefined;
    if (!bytes) {
      if (record.fields.state === 'ready') missingMediaIds.push(record.id);
      continue;
    }
    if (
      bytes.byteLength !== record.fields.byteSize ||
      (await sha256Hex(bytes)) !== record.fields.sha256
    ) {
      throw new ExportArchiveError(
        'corrupt',
        `The image "${String(record.fields.fileName)}" does not match its recorded checksum — the file is damaged or was modified`,
      );
    }
    mediaBytes.set(record.id, bytes);
  }

  return { manifest: manifest.data, records, mediaBytes, missingMediaIds };
}
