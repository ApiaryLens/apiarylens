import { useState, type FormEvent } from 'react';
import { queueCreate, type LocalResource } from '../../db.js';
import { fieldChoices, recentFieldValues } from '../../field-intelligence.js';
import { SmartTextField } from '../../components/SmartTextField.js';
import type { FormProps } from '../types.js';
import { careLabel, careTypes, type CareType } from './care-records.js';

export function CareForm({
  organizationId,
  hives,
  records,
  onNotice,
}: FormProps & { hives: LocalResource[]; records: LocalResource[] }) {
  const [kind, setKind] = useState<CareType>('miteCount');
  const [error, setError] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form).entries()) as Record<string, string>;
    const timestamp = new Date().toISOString();
    try {
      const common = { hiveId: values.hiveId };
      const payloads: Record<CareType, Record<string, unknown>> = {
        miteCount: {
          ...common,
          measuredAt: timestamp,
          method: values.method,
          sampleSize: values.sampleSize ? Number(values.sampleSize) : null,
          miteCount: Number(values.miteCount),
          resultPercent: values.sampleSize
            ? (Number(values.miteCount) / Number(values.sampleSize)) * 100
            : null,
          notes: values.notes,
        },
        healthObservation: {
          ...common,
          observedAt: timestamp,
          category: values.category,
          severity: values.severity,
          notes: values.notes,
        },
        feedingEvent: {
          ...common,
          fedAt: timestamp,
          feedType: values.feedType,
          amount: values.amount ? Number(values.amount) : null,
          unit: values.unit,
          reason: values.reason,
          notes: values.notes,
        },
        treatmentEvent: {
          ...common,
          productOrMethod: values.productOrMethod,
          applicationDate: timestamp.slice(0, 10),
          removalDate: values.removalDate || null,
          dosageOrAmount: values.dosageOrAmount,
          restrictions: values.restrictions,
          notes: values.notes,
        },
        harvest: {
          ...common,
          harvestedAt: timestamp,
          quantity: Number(values.quantity),
          unit: values.unit,
          notes: values.notes,
        },
        followUp: { ...common, description: values.description, dueDate: values.dueDate || null },
      };
      await queueCreate(organizationId, kind, payloads[kind]);
      form.reset();
      onNotice('Care record saved offline and queued for sync.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save care record');
    }
  }
  return (
    <form className="form compact" onSubmit={(event) => void submit(event)}>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <label>
        Record type
        <select value={kind} onChange={(event) => setKind(event.target.value as CareType)}>
          {careTypes.map((type) => (
            <option key={type} value={type}>
              {careLabel(type)}
            </option>
          ))}
        </select>
      </label>
      <label>
        Hive
        <select name="hiveId" required>
          {hives.map((hive) => (
            <option key={hive.id} value={hive.id}>
              {String(hive.data.name)}
            </option>
          ))}
        </select>
      </label>
      <CareFields kind={kind} records={records} />
      <label>
        Notes
        <textarea name="notes" rows={3} />
      </label>
      <button className="button primary">Save care record</button>
    </form>
  );
}

function CareFields({ kind, records }: { kind: CareType; records: LocalResource[] }) {
  if (kind === 'miteCount')
    return (
      <>
        <label>
          Method
          <select name="method">
            <option value="alcohol_wash">Alcohol wash</option>
            <option value="sugar_roll">Sugar roll</option>
            <option value="sticky_board">Sticky board</option>
            <option value="visual">Visual</option>
            <option value="other">Other</option>
          </select>
        </label>
        <label>
          Sample size
          <input name="sampleSize" type="number" min="1" />
        </label>
        <label>
          Mite count
          <input name="miteCount" type="number" min="0" required />
        </label>
      </>
    );
  if (kind === 'healthObservation')
    return (
      <>
        <SmartTextField
          label="Observation"
          name="category"
          required
          choices={fieldChoices.category}
          recent={recentFieldValues(
            records.filter((item) => item.entityType === 'healthObservation'),
            'category',
          )}
          hint="Choose a common concern or type the observation you saw. A diagnosis is not implied."
        />
        <label>
          Severity
          <select name="severity">
            <option value="unknown">Unknown</option>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
        </label>
      </>
    );
  if (kind === 'feedingEvent')
    return (
      <>
        <SmartTextField
          label="Feed type"
          name="feedType"
          required
          choices={fieldChoices.feedType}
          recent={recentFieldValues(
            records.filter((item) => item.entityType === 'feedingEvent'),
            'feedType',
          )}
        />
        <label>
          Amount
          <input name="amount" type="number" min="0" step="any" />
        </label>
        <SmartTextField
          label="Unit"
          name="unit"
          choices={fieldChoices.feedUnit}
          recent={recentFieldValues(
            records.filter((item) => item.entityType === 'feedingEvent'),
            'unit',
          )}
        />
        <SmartTextField
          label="Reason"
          name="reason"
          choices={fieldChoices.feedReason}
          recent={recentFieldValues(
            records.filter((item) => item.entityType === 'feedingEvent'),
            'reason',
          )}
        />
      </>
    );
  if (kind === 'treatmentEvent')
    return (
      <>
        <SmartTextField
          label="Product or method"
          name="productOrMethod"
          required
          choices={fieldChoices.treatment}
          recent={recentFieldValues(
            records.filter((item) => item.entityType === 'treatmentEvent'),
            'productOrMethod',
          )}
          hint="Record the exact label or method used. Follow local law and the product label."
        />
        <label>
          Removal date
          <input name="removalDate" type="date" />
        </label>
        <SmartTextField
          label="Dosage or amount"
          name="dosageOrAmount"
          choices={[]}
          recent={recentFieldValues(
            records.filter((item) => item.entityType === 'treatmentEvent'),
            'dosageOrAmount',
          )}
          hint="Enter the exact amount and unit from your treatment record."
        />
        <SmartTextField
          label="Restrictions"
          name="restrictions"
          choices={fieldChoices.restriction}
          recent={recentFieldValues(
            records.filter((item) => item.entityType === 'treatmentEvent'),
            'restrictions',
          )}
          hint="Choose a reminder or enter the exact label restriction."
        />
      </>
    );
  if (kind === 'harvest')
    return (
      <>
        <label>
          Quantity
          <input name="quantity" type="number" min="0" step="any" required />
        </label>
        <SmartTextField
          label="Unit"
          name="unit"
          required
          choices={fieldChoices.harvestUnit}
          recent={recentFieldValues(
            records.filter((item) => item.entityType === 'harvest'),
            'unit',
          )}
        />
      </>
    );
  return (
    <>
      <SmartTextField
        label="Description"
        name="description"
        required
        choices={[]}
        recent={recentFieldValues(
          records.filter((item) => item.entityType === 'followUp'),
          'description',
        )}
      />
      <label>
        Due date
        <input name="dueDate" type="date" />
      </label>
    </>
  );
}
