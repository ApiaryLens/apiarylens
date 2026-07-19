import { useState, type FormEvent } from 'react';
import { queueCreate, queueUpdate, type LocalResource } from '../../db.js';
import {
  activeEquipmentForHive,
  adjacentEquipment,
  equipmentPurposeLabel,
  equipmentPurposeLabels,
  equipmentTypeLabel,
  equipmentTypeLabels,
  isFrameBox,
  nextEquipmentPosition,
  type EquipmentType,
} from '../../equipment-stack.js';
import { Empty } from '../../components/Empty.js';
import { GlossaryLink } from '../glossary/GlossaryLink.js';
import { stackEntries } from './hive-stack.js';

export function EquipmentStackBuilder({
  organizationId,
  hives,
  equipment,
  onNotice,
}: {
  organizationId: string;
  hives: LocalResource[];
  equipment: LocalResource[];
  onNotice: (message: string) => void;
}) {
  const [hiveId, setHiveId] = useState(hives[0]?.id ?? '');
  const [componentType, setComponentType] = useState<EquipmentType>('deep');
  const [componentPurpose, setComponentPurpose] = useState('');
  const [error, setError] = useState('');
  const active = activeEquipmentForHive(equipment, hiveId);
  const history = equipment.filter(
    (item) => item.data.hiveId === hiveId && item.data.status !== 'active',
  );

  async function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form).entries()) as Record<string, string>;
    const position = nextEquipmentPosition(equipment, hiveId);
    setError('');
    try {
      if (position > 20) throw new Error('A hive stack can contain up to 20 active components.');
      await queueCreate(organizationId, 'equipmentBox', {
        hiveId,
        boxType: componentType,
        customType: componentType === 'other' ? values.customType || null : null,
        purpose: values.purpose || null,
        customPurpose: values.purpose === 'other' ? values.customPurpose || null : null,
        position,
        frameCount: isFrameBox(componentType) ? Number(values.frameCount) : null,
        status: 'active',
        installedAt: values.installedAt || null,
        removedAt: null,
        notes: values.notes || null,
      });
      form.reset();
      setComponentType('deep');
      setComponentPurpose('');
      onNotice('Hive component added and queued for synchronization.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not add the component.');
    }
  }

  async function move(item: LocalResource, direction: -1 | 1) {
    const adjacent = adjacentEquipment(equipment, item, direction);
    if (!adjacent) return;
    const position = Number(item.data.position);
    await queueUpdate(item, { position: Number(adjacent.data.position) });
    await queueUpdate(adjacent, { position });
    onNotice('Hive stack order updated.');
  }

  return (
    <div className="equipment-builder">
      <label className="equipment-hive-select">
        Hive
        <select value={hiveId} onChange={(event) => setHiveId(event.currentTarget.value)}>
          {hives.map((hive) => (
            <option key={hive.id} value={hive.id}>
              {String(hive.data.name)}
            </option>
          ))}
        </select>
      </label>
      <p className="field-hint">Shown bottom to top, matching the physical hive.</p>
      {active.length === 0 ? (
        <Empty text="No equipment recorded for this hive." />
      ) : (
        <div className="stack-cols">
          <div
            className="schematic"
            role="img"
            aria-label={`Schematic stack of ${active.length} component${active.length === 1 ? '' : 's'}, editable in the adjacent list`}
          >
            {stackEntries(equipment, hiveId).map((entry) => (
              <div key={entry.key} className={`sbox ${entry.silhouette}`} title={entry.name}>
                {entry.boxLabel}
              </div>
            ))}
          </div>
          <ol className="equipment-stack" aria-label="Hive equipment, bottom to top">
            {active.map((item, index) => {
              const type = String(item.data.boxType) as EquipmentType;
              const typeLabel = equipmentTypeLabel(item.data);
              return (
                <li className={`equipment-component component-${type}`} key={item.key}>
                  <div>
                    <strong>{typeLabel}</strong>
                    <span>
                      {equipmentPurposeLabel(item.data)}
                      {item.data.frameCount ? ` · ${item.data.frameCount} frames` : ''}
                    </span>
                    {item.data.installedAt ? (
                      <span>Installed {String(item.data.installedAt)}</span>
                    ) : null}
                    {item.data.notes ? <span>{String(item.data.notes)}</span> : null}
                  </div>
                  <div className="record-actions" aria-label={`Actions for ${typeLabel}`}>
                    <button
                      className="text-button"
                      disabled={index === 0}
                      onClick={() => void move(item, -1)}
                      aria-label="Move toward bottom"
                    >
                      Down
                    </button>
                    <button
                      className="text-button"
                      disabled={index === active.length - 1}
                      onClick={() => void move(item, 1)}
                      aria-label="Move toward top"
                    >
                      Up
                    </button>
                    <button
                      className="text-button"
                      onClick={() =>
                        void queueUpdate(item, {
                          status: 'removed',
                          removedAt: new Date().toISOString(),
                        }).then(() =>
                          onNotice('Component removed from the active stack; history retained.'),
                        )
                      }
                    >
                      Remove
                    </button>
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      )}
      <form className="form compact equipment-form" onSubmit={(event) => void add(event)}>
        <h3>Add a component</h3>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <label>
          Component type <GlossaryLink term="brood-box" label="Hive components" />
          <select
            value={componentType}
            onChange={(event) => setComponentType(event.currentTarget.value as EquipmentType)}
          >
            {Object.entries(equipmentTypeLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        {componentType === 'other' && (
          <label>
            Custom component type
            <input name="customType" required maxLength={120} />
          </label>
        )}
        <label>
          Purpose
          <select
            name="purpose"
            value={componentPurpose}
            onChange={(event) => setComponentPurpose(event.currentTarget.value)}
          >
            <option value="">Not recorded</option>
            {Object.entries(equipmentPurposeLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        {componentPurpose === 'other' && (
          <label>
            Custom purpose
            <input name="customPurpose" required maxLength={120} />
          </label>
        )}
        {isFrameBox(componentType) && (
          <label>
            Frame count <GlossaryLink term="frame" label="Frame" />
            <input name="frameCount" type="number" min="1" max="24" defaultValue="10" required />
          </label>
        )}
        <label>
          Installed date
          <input name="installedAt" type="date" />
        </label>
        <label>
          Notes
          <textarea name="notes" rows={2} />
        </label>
        <button className="button primary">Add to top</button>
      </form>
      {history.length > 0 && (
        <details className="equipment-history">
          <summary>Removed and stored equipment ({history.length})</summary>
          <ul className="record-list">
            {history.map((item) => (
              <li key={item.key}>
                <strong>{equipmentTypeLabel(item.data)}</strong>
                <span>{equipmentPurposeLabel(item.data)}</span>
                <span>
                  {String(item.data.status)}
                  {item.data.removedAt
                    ? ` · removed ${new Date(String(item.data.removedAt)).toLocaleString()}`
                    : ''}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
