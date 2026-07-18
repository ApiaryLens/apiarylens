import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, queueDelete, queueUpdate, type LocalResource } from '../../db.js';
import { useResources } from '../../local/use-resources.js';
import { SyncBadge } from '../../components/SyncBadge.js';

export function MediaGallery({
  organizationId,
  inspections,
  onNotice,
  canWrite,
}: {
  organizationId: string;
  inspections: LocalResource[];
  onNotice: (message: string) => void;
  canWrite: boolean;
}) {
  const media = useResources(organizationId, 'mediaAsset').filter(
    (record) => !record.deletedAt && record.data.state !== 'deleted',
  );
  const inspectionNames = new Map(
    inspections.map((inspection) => [
      inspection.id,
      new Date(String(inspection.data.inspectedAt)).toLocaleString(),
    ]),
  );
  if (media.length === 0) return null;
  return (
    <section className="card media-section">
      <h2>Inspection photos</h2>
      <div className="media-grid">
        {media.map((record) => (
          <MediaTile
            key={record.key}
            record={record}
            inspectionLabel={inspectionNames.get(String(record.data.inspectionId))}
            onNotice={onNotice}
            canWrite={canWrite}
          />
        ))}
      </div>
    </section>
  );
}

function MediaTile({
  record,
  inspectionLabel,
  onNotice,
  canWrite,
}: {
  record: LocalResource;
  inspectionLabel: string | undefined;
  onNotice: (message: string) => void;
  canWrite: boolean;
}) {
  const local = useLiveQuery(() => db.media.get(record.id), [record.id]);
  const [localUrls, setLocalUrls] = useState<{ original: string; thumbnail: string }>();
  const [viewerOpen, setViewerOpen] = useState(false);
  const [zoom, setZoom] = useState(1);
  useEffect(() => {
    if (!local?.blob) return;
    const original = URL.createObjectURL(local.blob);
    const thumbnail = local.thumbnail ? URL.createObjectURL(local.thumbnail) : original;
    setLocalUrls({ original, thumbnail });
    return () => {
      URL.revokeObjectURL(original);
      if (thumbnail !== original) URL.revokeObjectURL(thumbnail);
    };
  }, [local]);
  const thumbnail = localUrls?.thumbnail ?? `/api/v1/media/${record.id}/content?variant=thumbnail`;
  const original = localUrls?.original ?? `/api/v1/media/${record.id}/content`;
  const hasLocalPhoto = Boolean(local?.blob);
  const mediaReady = String(record.data.state) === 'ready' || local?.state === 'ready';
  const mediaSyncState =
    local?.state === 'failed' ? 'failed' : !mediaReady ? 'pending' : record.syncState;
  return (
    <>
      <article className="media-card">
        {hasLocalPhoto || mediaReady ? (
          <button
            className="media-thumb-button"
            onClick={() => setViewerOpen(true)}
            aria-label="Open photo viewer"
          >
            <img
              src={thumbnail}
              alt={String(record.data.caption || `Inspection photo ${record.data.fileName}`)}
              loading="lazy"
            />
          </button>
        ) : (
          <div className="media-missing" role="img" aria-label="Photo upload pending">
            Photo upload pending
          </div>
        )}
        <div>
          <strong>{String(record.data.caption || record.data.fileName)}</strong>
          <small>
            {inspectionLabel ?? 'Inspection'} · {Math.round(Number(record.data.byteSize) / 1024)} KB
          </small>
          <SyncBadge state={mediaSyncState} />
          {!mediaReady && !hasLocalPhoto && (
            <small>
              Return to the device that captured this photo and reconnect. Upload retries
              automatically; Sync now remains available for recovery.
            </small>
          )}
          {canWrite && (
            <div className="record-actions">
              <button
                className="text-button"
                onClick={() => {
                  const caption = prompt('Photo caption', String(record.data.caption ?? ''));
                  if (caption !== null)
                    void queueUpdate(record, { caption }).then(() =>
                      onNotice('Photo caption saved offline.'),
                    );
                }}
              >
                Caption
              </button>
              {local?.state === 'failed' && (
                <button
                  className="text-button"
                  onClick={() =>
                    void db.media
                      .update(record.id, { state: 'staged', lastError: '' })
                      .then(() => onNotice('Photo queued to retry.'))
                  }
                >
                  Retry
                </button>
              )}
              <button
                className="text-button"
                onClick={() => {
                  if (
                    confirm(
                      'Remove this inspection photo? It will be deleted from synchronized devices.',
                    )
                  )
                    void queueDelete(record).then(() => onNotice('Photo removal queued for sync.'));
                }}
              >
                Remove
              </button>
            </div>
          )}
        </div>
      </article>
      {viewerOpen && (
        <div className="media-viewer" role="dialog" aria-modal="true" aria-label="Photo viewer">
          <button
            className="media-viewer-backdrop"
            aria-label="Close photo viewer"
            onClick={() => setViewerOpen(false)}
          />
          <div className="media-viewer-panel">
            <header>
              <strong>{String(record.data.caption || record.data.fileName)}</strong>
              <div className="media-viewer-controls">
                <button onClick={() => setZoom((value) => Math.max(0.5, value - 0.25))}>−</button>
                <span>{Math.round(zoom * 100)}%</span>
                <button onClick={() => setZoom((value) => Math.min(4, value + 0.25))}>+</button>
                <button onClick={() => setViewerOpen(false)}>Close</button>
              </div>
            </header>
            <div className="media-viewer-scroll">
              <img
                src={original}
                alt={String(record.data.caption || record.data.fileName)}
                style={{ transform: `scale(${zoom})` }}
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
