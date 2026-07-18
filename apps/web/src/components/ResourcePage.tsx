import type { LocalResource } from '../db.js';
import { Empty } from './Empty.js';
import { RecordList } from './RecordList.js';

export function ResourcePage({
  title,
  description,
  records,
  form,
  titleField = 'name',
  onEdit,
  onArchive,
}: {
  title: string;
  description: string;
  records: LocalResource[];
  form: React.ReactNode;
  titleField?: string;
  onEdit?: (record: LocalResource) => void;
  onArchive?: (record: LocalResource, archive: boolean) => void;
}) {
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
      </div>
      <div className="two-column">
        <section className="card">
          <h2>New</h2>
          {form}
        </section>
        <section className="card">
          <h2>Saved</h2>
          {records.length === 0 ? (
            <Empty text={`No ${title.toLowerCase()} yet.`} />
          ) : (
            <RecordList
              records={records}
              titleField={titleField}
              {...(onEdit ? { onEdit } : {})}
              {...(onArchive ? { onArchive } : {})}
            />
          )}
        </section>
      </div>
    </>
  );
}
